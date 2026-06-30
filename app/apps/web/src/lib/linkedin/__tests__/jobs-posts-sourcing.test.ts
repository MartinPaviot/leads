import { describe, it, expect, vi, beforeEach } from "vitest";

// db.update(...).set(...).where(...) resolves; capture the property patches.
const setPatches: unknown[] = [];
vi.mock("@/db", () => ({
  db: {
    update: () => ({ set: (v: unknown) => { setPatches.push(v); return { where: () => Promise.resolve() }; } }),
  },
}));
vi.mock("@/db/schema", () => ({ companies: { id: "id", properties: "properties" }, contacts: { id: "id", tenantId: "tenant_id", properties: "properties" } }));
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => a, eq: (a: unknown, b: unknown) => [a, b], sql: (s: unknown, ...v: unknown[]) => ({ s, v }) }));

const upsertAccount = vi.fn();
const upsertContact = vi.fn();
vi.mock("@/db/canonical/upsert", () => ({
  upsertAccount: (...a: unknown[]) => upsertAccount(...a),
  upsertContact: (...a: unknown[]) => upsertContact(...a),
}));

const searchLinkedIn = vi.fn();
vi.mock("@/lib/providers/unipile/http", () => ({ searchLinkedIn: (...a: unknown[]) => searchLinkedIn(...a) }));

const enrichAccountFromLinkedIn = vi.fn();
vi.mock("@/lib/providers/unipile/enrichment", () => ({ enrichAccountFromLinkedIn: (...a: unknown[]) => enrichAccountFromLinkedIn(...a) }));

const recordCompanySignal = vi.fn();
vi.mock("@/lib/signals/record-signal", () => ({ recordCompanySignal: (...a: unknown[]) => recordCompanySignal(...a) }));

const sourceEngagersFromPost = vi.fn();
// engagerToContact stays real (pure); only the engager-sourcing is mocked.
vi.mock("../post-sourcing", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, sourceEngagersFromPost: (...a: unknown[]) => sourceEngagersFromPost(...a) };
});

import { sourceHiringSignals, sourcePostAuthors } from "../jobs-posts-sourcing";

const CFG = { dsn: "https://x.unipile.com:1", apiKey: "k" } as never;
const onePage = (items: unknown[]) => ({ items, cursor: null, total: items.length });

beforeEach(() => {
  vi.clearAllMocks();
  setPatches.length = 0;
  upsertAccount.mockImplementation(async (_t: unknown, a: { name: string }) => ({ id: `acc-${a.name}` }));
  upsertContact.mockImplementation(async (_t: unknown, c: { linkedinUrl: string }) => ({ id: `c-${c.linkedinUrl}` }));
});

describe("sourceHiringSignals", () => {
  it("dedups companies across the run and groups their open roles into one signal write", async () => {
    searchLinkedIn.mockResolvedValueOnce(
      onePage([
        { title: "VP of Sales", location: "Remote", posted_at: "2026-06-22", url: "u1", company: { id: "99", name: "Ethos" } },
        { title: "Head of RevOps", location: "NYC", posted_at: "2026-06-20", url: "u2", company: { id: "99", name: "Ethos" } },
        { title: "AE", location: "SF", posted_at: "2026-06-19", url: "u3", company: { id: "42", name: "Acme" } },
        { title: "Recruiter (no company)", location: "X" }, // skipped — no company
      ]),
    );
    const r = await sourceHiringSignals({ cfg: CFG, tenantId: "t1", unipileAccountId: "acc-1", body: { api: "classic", category: "jobs" }, maxResults: 50 });
    expect(r.jobsScanned).toBe(4);
    expect(r.skippedNoCompany).toBe(1);
    expect(r.accountsUpserted).toBe(2); // Ethos + Acme (deduped)
    expect(r.signalsRecorded).toBe(3); // 2 Ethos roles + 1 Acme
    // upsertAccount called once per unique company
    expect(upsertAccount.mock.calls.map((c) => c[1].name).sort()).toEqual(["Acme", "Ethos"]);
    // The single Ethos signal write carries BOTH its open roles (grouped).
    const ethosWrite = setPatches.find((p) => JSON.stringify(p).includes("VP of Sales"));
    expect(JSON.stringify(ethosWrite)).toContain("Head of RevOps");
    // Each hiring company also records a canonical 'hiring' signal for SCORING.
    expect(recordCompanySignal).toHaveBeenCalledTimes(2);
    expect(recordCompanySignal.mock.calls.map((c) => [c[1], c[2].type])).toEqual(
      expect.arrayContaining([["acc-Ethos", "hiring"], ["acc-Acme", "hiring"]]),
    );
    // Ethos has 2 roles → medium; detectedAt = the freshest posting (06-22, not the run date).
    const ethosSignal = recordCompanySignal.mock.calls.find((c) => c[1] === "acc-Ethos")![2];
    expect(ethosSignal).toMatchObject({ strength: "medium", source: "unipile" });
    expect(ethosSignal.detectedAt.startsWith("2026-06-22")).toBe(true);
  });

  it("records a 'hiring_surge' (high strength) when a company has >=5 open roles", async () => {
    searchLinkedIn.mockResolvedValueOnce(
      onePage(Array.from({ length: 6 }, (_, i) => ({ title: `Role ${i}`, posted_at: "2026-06-25", company: { id: "99", name: "Ethos" } }))),
    );
    await sourceHiringSignals({ cfg: CFG, tenantId: "t1", unipileAccountId: "acc-1", body: { api: "classic", category: "jobs" } });
    expect(recordCompanySignal.mock.calls[0][2]).toMatchObject({ type: "hiring_surge", strength: "high" });
  });

  it("hydrates the company profile when hydrateAccounts is on", async () => {
    searchLinkedIn.mockResolvedValueOnce(onePage([{ title: "VP Sales", company: { id: "99", name: "Ethos" } }]));
    enrichAccountFromLinkedIn.mockResolvedValue({ fields: { domain: "ethos.com", industry: "Insurance", size: "51-200" } });
    await sourceHiringSignals({ cfg: CFG, tenantId: "t1", unipileAccountId: "acc-1", body: { api: "classic", category: "jobs" }, hydrateAccounts: true });
    expect(enrichAccountFromLinkedIn).toHaveBeenCalledWith(CFG, "acc-1", "99");
    expect(upsertAccount.mock.calls[0][1]).toMatchObject({ domain: "ethos.com", industry: "Insurance", size: "51-200" });
  });
});

describe("sourcePostAuthors", () => {
  it("sources person authors as contacts, skips company authors", async () => {
    searchLinkedIn.mockResolvedValueOnce(
      onePage([
        { social_id: "urn:1", text: "post a", author: { public_identifier: "navin", name: "Navin Mirania", is_company: false, headline: "AI consultant" } },
        { social_id: "urn:2", text: "post b", author: { public_identifier: "acme-co", name: "Acme", is_company: true } },
      ]),
    );
    const r = await sourcePostAuthors({ cfg: CFG, tenantId: "t1", unipileAccountId: "acc-1", body: { api: "classic", category: "posts", keywords: "ai" } });
    expect(r.postsScanned).toBe(2);
    expect(r.authorsUpserted).toBe(1); // Navin only
    expect(r.skipped).toBe(1); // company author
    expect(upsertContact.mock.calls[0][1]).toMatchObject({ firstName: "Navin", lastName: "Mirania", title: "AI consultant" });
  });

  it("sources engagers too when includeEngagers is set", async () => {
    searchLinkedIn.mockResolvedValueOnce(
      onePage([{ social_id: "urn:1", author: { public_identifier: "navin", name: "Navin M", is_company: false } }]),
    );
    sourceEngagersFromPost.mockResolvedValue({ contactsUpserted: 7, reactionsScanned: 10, commentsScanned: 0, skippedNoIdentity: 0 });
    const r = await sourcePostAuthors({ cfg: CFG, tenantId: "t1", unipileAccountId: "acc-1", body: { api: "classic", category: "posts", keywords: "ai" }, includeEngagers: true });
    expect(sourceEngagersFromPost).toHaveBeenCalledWith(CFG, { tenantId: "t1", unipileAccountId: "acc-1" }, "urn:1", expect.any(Object));
    expect(r.engagersSourced).toBe(7);
  });
});
