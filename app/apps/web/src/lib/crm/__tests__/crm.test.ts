import { describe, it, expect, vi } from "vitest";
import {
  mapManagedFields,
  syncToCrm,
  notifySlack,
  formatHotLeadMessage,
  handleHotLead,
  upsertKey,
  CrmRateLimitError,
  type CrmEntity,
  type CrmFieldMapping,
  type HubSpotClient,
  type SyncDeps,
  type HotLead,
  type SlackClient,
} from "../index";

const mapping: CrmFieldMapping = {
  managed: ["name", "domain", "lifecycleStage"],
  map: { name: "company_name", domain: "website", lifecycleStage: "lifecyclestage" },
};

const entity = (over: Partial<CrmEntity> = {}): CrmEntity => ({
  type: "account",
  identity: "acme.com",
  fields: { name: "Acme", domain: "acme.com", ownerNotes: "DO NOT TOUCH" },
  ...over,
});

const passMeter: SyncDeps["meter"] = (_op, fn) => fn();

describe("mapManagedFields — AC3 do-not-clobber", () => {
  it("writes only managed fields, mapped to CRM property names", () => {
    expect(mapManagedFields({ name: "Acme", domain: "acme.com", ownerNotes: "secret" }, mapping)).toEqual({
      company_name: "Acme",
      website: "acme.com",
    });
  });
  it("never includes an unmanaged (CRM-owned) field", () => {
    const out = mapManagedFields({ name: "Acme", ownerNotes: "secret", customCrmField: 1 }, mapping);
    expect(out).not.toHaveProperty("ownerNotes");
    expect(out).not.toHaveProperty("customCrmField");
  });
  it("skips managed fields that are absent", () => {
    expect(mapManagedFields({ name: "Acme" }, mapping)).toEqual({ company_name: "Acme" });
  });
});

describe("syncToCrm — AC1 idempotent upsert", () => {
  it("upserts by external id / identity (key = externalId when present, else identity)", () => {
    expect(upsertKey(entity())).toBe("acme.com");
    expect(upsertKey(entity({ externalId: "hs-123" }))).toBe("hs-123");
  });

  it("re-syncing the same entity updates, never duplicates (same key both times)", async () => {
    const keys: string[] = [];
    const client: HubSpotClient = { upsert: vi.fn(async (_t, key) => { keys.push(key); return { id: "hs-1", created: keys.length === 1 }; }) };
    const deps: SyncDeps = { client, mapping, meter: passMeter, tenantId: "t1" };
    const first = await syncToCrm(entity(), deps);
    const second = await syncToCrm(entity(), deps);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false); // update, not a new record
    expect(keys).toEqual(["acme.com", "acme.com"]); // same upsert key → no duplicate
  });

  it("only managed properties reach the client", async () => {
    const client: HubSpotClient = { upsert: vi.fn(async () => ({ id: "hs-1", created: true })) };
    await syncToCrm(entity(), { client, mapping, meter: passMeter, tenantId: "t1" });
    expect(client.upsert).toHaveBeenCalledWith("account", "acme.com", { company_name: "Acme", website: "acme.com" });
  });
});

describe("syncToCrm — AC4 rate-limit retry + AC5 meter/log", () => {
  it("retries idempotently on a rate-limit error then succeeds", async () => {
    let calls = 0;
    const client: HubSpotClient = {
      upsert: async () => { calls++; if (calls < 3) throw new CrmRateLimitError(); return { id: "hs-1", created: true }; },
    };
    const result = await syncToCrm(entity(), { client, mapping, meter: passMeter, tenantId: "t1", maxRetries: 3 });
    expect(result.attempts).toBe(3);
    expect(result.created).toBe(true);
  });

  it("gives up after maxRetries and rethrows", async () => {
    const client: HubSpotClient = { upsert: async () => { throw new CrmRateLimitError(); } };
    await expect(syncToCrm(entity(), { client, mapping, meter: passMeter, tenantId: "t1", maxRetries: 2 })).rejects.toBeInstanceOf(CrmRateLimitError);
  });

  it("meters the upsert and logs the result", async () => {
    const client: HubSpotClient = { upsert: async () => ({ id: "hs-1", created: true }) };
    const ops: string[] = [];
    const logs: unknown[] = [];
    await syncToCrm(entity(), {
      client, mapping, tenantId: "t1",
      meter: (op, fn) => { ops.push(op.kind); return fn(); },
      logSync: (r) => logs.push(r),
    });
    expect(ops).toEqual(["crm.upsert"]);
    expect(logs).toHaveLength(1);
  });
});

function slackDeps() {
  const seen = new Set<string>();
  const slack: SlackClient = { postMessage: vi.fn(async () => ({ ts: "1.2" })) };
  return { slack, channel: "#hot-leads", idempotency: { has: async (id: string) => seen.has(id), add: async (id: string) => void seen.add(id) } };
}

const lead: HotLead = { id: "hl-1", contactId: "c1", contactName: "Jane", company: "Acme", replyText: "Yes let's talk", sentiment: "positive", link: "https://app/contacts/c1" };

describe("notifySlack — AC2 hot-lead post", () => {
  it("formats context + link", () => {
    const msg = formatHotLeadMessage(lead);
    expect(msg).toContain("Jane @ Acme");
    expect(msg).toContain("https://app/contacts/c1");
    expect(msg).toContain("Yes let's talk");
  });

  it("posts once and dedupes a repeat hot-lead id", async () => {
    const d = slackDeps();
    const first = await notifySlack(lead, d);
    const second = await notifySlack(lead, d);
    expect(first).toMatchObject({ posted: true });
    expect(second).toMatchObject({ posted: false, deduped: true });
    expect(d.slack.postMessage).toHaveBeenCalledOnce();
  });
});

describe("handleHotLead — AC2 Slack + deal stage", () => {
  it("posts to Slack and advances the CRM deal stage when configured", async () => {
    const d = slackDeps();
    const client: HubSpotClient = { upsert: vi.fn(), updateDealStage: vi.fn(async () => {}) };
    const res = await handleHotLead(lead, { ...d, client, dealExternalId: "deal-9", hotStage: "qualified" });
    expect(res.slack.posted).toBe(true);
    expect(res.dealUpdated).toBe(true);
    expect(client.updateDealStage).toHaveBeenCalledWith("deal-9", "qualified");
  });

  it("posts to Slack without a deal update when no deal is configured", async () => {
    const d = slackDeps();
    const client: HubSpotClient = { upsert: vi.fn(), updateDealStage: vi.fn() };
    const res = await handleHotLead(lead, { ...d, client });
    expect(res.dealUpdated).toBe(false);
    expect(client.updateDealStage).not.toHaveBeenCalled();
  });
});
