import { describe, it, expect } from "vitest";
import {
  InMemorySuppressionStore,
  addSuppression,
  isSuppressed,
  suppressed,
  suppressionFromOptOut,
  suppressionFromBounce,
  domainOfEmail,
  normalizeDomain,
  GLOBAL_SCOPE,
  type SuppressionEntry,
} from "../index";

const entry = (over: Partial<SuppressionEntry>): SuppressionEntry => ({
  scope: over.scope ?? GLOBAL_SCOPE,
  level: over.level ?? "address",
  value: over.value ?? "jane@acme.com",
  type: over.type ?? "manual_dnc",
  permanent: over.permanent ?? true,
  createdAt: over.createdAt ?? 1_000,
  ...over,
});

describe("normalization", () => {
  it("normalizes domains and extracts the domain from an email", () => {
    expect(normalizeDomain("HTTPS://WWW.Acme.com/path")).toBe("acme.com");
    expect(domainOfEmail("Jane.Doe@Acme.com")).toBe("acme.com");
  });
});

describe("addSuppression — AC1/AC4/AC5 store + idempotency", () => {
  it("adds an address-level entry and normalizes the value", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ value: "JANE@ACME.COM" }));
    expect(isSuppressed({ email: "jane@acme.com" }, store)).not.toBeNull();
    expect(store.size).toBe(1);
  });

  it("is idempotent on (scope, level, value) — re-adding does not duplicate", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ createdAt: 2000 }));
    addSuppression(store, entry({ createdAt: 5000 }));
    expect(store.size).toBe(1);
  });

  it("merges to the stronger entry: permanent wins and earliest createdAt is kept", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ type: "hard_bounce", permanent: false, expiresAt: 9999, createdAt: 5000 }));
    const merged = addSuppression(store, entry({ type: "opt_out", permanent: true, createdAt: 3000 }));
    expect(merged.permanent).toBe(true);
    expect(merged.expiresAt).toBeUndefined(); // permanent clears cool-off
    expect(merged.createdAt).toBe(3000);
  });

  it("rejects an empty value", () => {
    expect(() => addSuppression(new InMemorySuppressionStore(), entry({ value: "" }))).toThrow();
  });
});

describe("isSuppressed — AC2/AC4 address + domain, scopes", () => {
  it("address-level suppression blocks that exact address", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ value: "jane@acme.com", level: "address" }));
    expect(suppressed({ email: "jane@acme.com" }, store)).toBe(true);
    expect(suppressed({ email: "john@acme.com" }, store)).toBe(false); // different address, no domain entry
  });

  it("domain-level suppression blocks every address on the domain", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ value: "competitor.com", level: "domain", type: "competitor" }));
    expect(suppressed({ email: "anyone@competitor.com" }, store)).toBe(true);
    expect(suppressed({ domain: "competitor.com" }, store)).toBe(true);
  });

  it("a workspace-scoped entry does not leak to other workspaces; global applies to all", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ scope: "ws1", value: "jane@acme.com" }));
    addSuppression(store, entry({ scope: GLOBAL_SCOPE, value: "global@x.com" }));
    expect(suppressed({ email: "jane@acme.com", tenantId: "ws1" }, store)).toBe(true);
    expect(suppressed({ email: "jane@acme.com", tenantId: "ws2" }, store)).toBe(false);
    expect(suppressed({ email: "global@x.com", tenantId: "ws2" }, store)).toBe(true); // global hits everyone
  });

  it("returns the matched entry for logging", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ value: "jane@acme.com", type: "manual_dnc", reason: "asked us to stop" }));
    const hit = isSuppressed({ email: "jane@acme.com" }, store);
    expect(hit?.entry.type).toBe("manual_dnc");
    expect(hit?.matchedKey).toContain("address");
  });

  it("a clean target is not suppressed", () => {
    expect(isSuppressed({ email: "fresh@lead.com" }, new InMemorySuppressionStore())).toBeNull();
  });
});

describe("ingestion — AC3 opt-out permanent, bounce per policy", () => {
  it("opt-out → permanent address suppression", () => {
    const e = suppressionFromOptOut({ email: "Jane@Acme.com", tenantId: "ws1", reason: "unsubscribed" });
    expect(e).toMatchObject({ type: "opt_out", level: "address", value: "jane@acme.com", permanent: true, scope: "ws1" });
    expect(e.expiresAt).toBeUndefined();
  });

  it("hard bounce → permanent by default", () => {
    expect(suppressionFromBounce({ email: "x@y.com" }).permanent).toBe(true);
  });

  it("hard bounce with a cool-off policy → expires, and stops suppressing after expiry", () => {
    const store = new InMemorySuppressionStore();
    const e = suppressionFromBounce({ email: "x@y.com", tenantId: "ws1" }, { permanent: false, coolOffMs: 1000 }, 5_000);
    expect(e.expiresAt).toBe(6_000);
    addSuppression(store, e);
    expect(suppressed({ email: "x@y.com", tenantId: "ws1" }, store, 5_500)).toBe(true); // within cool-off
    expect(suppressed({ email: "x@y.com", tenantId: "ws1" }, store, 7_000)).toBe(false); // cooled off
  });

  it("an opt-out is permanent even after a long time", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, suppressionFromOptOut({ email: "x@y.com", tenantId: "ws1" }, 0));
    expect(suppressed({ email: "x@y.com", tenantId: "ws1" }, store, 10 ** 13)).toBe(true);
  });
});

describe("spec 35 — account scope + complaint type", () => {
  it("suppresses by account key (identity_key), independent of email/domain", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ scope: "ws1", level: "account", value: "fr:552100554", type: "manual_dnc" }));
    expect(suppressed({ accountKey: "fr:552100554", tenantId: "ws1" }, store)).toBe(true);
    expect(suppressed({ accountKey: "fr:000", tenantId: "ws1" }, store)).toBe(false);
  });

  it("an account-scope hit blocks a contact with an otherwise-clean email", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ scope: "ws1", level: "account", value: "acct1", type: "existing_customer" }));
    expect(suppressed({ email: "clean@x.com", accountKey: "acct1", tenantId: "ws1" }, store)).toBe(true);
    expect(suppressed({ email: "clean@x.com", accountKey: "acct2", tenantId: "ws1" }, store)).toBe(false);
  });

  it("complaint is a valid permanent suppression type", () => {
    const store = new InMemorySuppressionStore();
    addSuppression(store, entry({ scope: "ws1", level: "address", value: "c@d.com", type: "complaint" }));
    expect(isSuppressed({ email: "c@d.com", tenantId: "ws1" }, store)?.entry.type).toBe("complaint");
  });
});
