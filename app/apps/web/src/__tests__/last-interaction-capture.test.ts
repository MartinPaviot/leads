import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
let selectQueue: Array<Array<Record<string, unknown>>> = [];
const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const sent: Array<{ name: string }> = [];
const recordCapturedActivity = vi.fn(async (_arg: unknown) => ({ applied: true, activityId: "act-1" }));
let creationMode = "selective";

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectQueue.shift() ?? [],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push({ table, values });
          return [{ id: `new-${inserts.length}`, companyId: (values.companyId as string) ?? null }];
        },
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  activities: { tenantId: "a.tenant_id", channel: "a.channel", metadata: "a.metadata" },
  contacts: { __t: "contacts", id: "c.id", tenantId: "c.tenant_id", email: "c.email", deletedAt: "c.deleted_at", companyId: "c.company_id" },
  companies: { __t: "companies", id: "co.id", tenantId: "co.tenant_id", domain: "co.domain", deletedAt: "co.deleted_at" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
  sql: Object.assign((strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings: [...strings], vals }), {
    raw: (s: string) => ({ raw: s }),
    join: (parts: unknown[]) => parts,
  }),
}));

vi.mock("@/lib/capture/approval", () => ({
  recordCapturedActivity: (arg: unknown) => recordCapturedActivity(arg),
  getCaptureApprovalMode: () => "auto",
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: async () => ({ companyDomain: "pilae.ch", contactCreationMode: creationMode }),
  buildIgnoredDomains: () => new Set(["gmail.com", "pilae.ch"]),
  shouldAutoCreateContact: (mode: string | undefined, direction: "inbound" | "outbound") => {
    if (mode === "disabled") return false;
    if (mode === "always") return true;
    return direction === "outbound";
  },
}));

vi.mock("@/lib/ai/embeddings", () => ({ embedEntity: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/context-graph", () => ({ ingestEpisode: vi.fn(async () => {}) }));
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(async (evt: { name: string }) => { sent.push(evt); }) },
}));

import { captureInboundEmail, normalizeSyncDate } from "@/lib/capture/email-capture";
import {
  INTERACTION_ACTIVITY_TYPES,
  INTERACTION_TYPES_SQL_LIST,
  lastInteractionUnionSql,
} from "@/lib/accounts/last-interaction";

beforeEach(() => {
  selectQueue = [];
  inserts.length = 0;
  sent.length = 0;
  recordCapturedActivity.mockClear();
  creationMode = "selective";
});

const baseInput = {
  tenantId: "t1",
  fromHeader: "Anna Keller <anna@romandco.ch>",
  subject: "Re: votre solution",
  text: "Bonjour, intéressée par une démo.",
  messageId: "msg-1",
};

describe("captureInboundEmail — attribution matrix", () => {
  it("known sender -> contact-attached, nothing created", async () => {
    selectQueue = [
      [], // dedup: no duplicate
      [{ id: "ct-9", companyId: "co-9" }], // contact by sender email
    ];
    const r = await captureInboundEmail(baseInput);
    expect(r.captured).toBe(true);
    expect(r.contactId).toBe("ct-9");
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0);
    const activity = recordCapturedActivity.mock.calls[0][0] as { activity: { entityType: string; entityId: string } };
    expect(activity.activity.entityType).toBe("contact");
    expect(activity.activity.entityId).toBe("ct-9");
  });

  it("CRM-graph rule: unknown sender at a company ALREADY in the CRM -> contact auto-created even in selective mode", async () => {
    selectQueue = [
      [], // dedup
      [], // no contact by sender
      [{ id: "co-77" }], // company matched by domain
    ];
    const r = await captureInboundEmail(baseInput);
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(true);
    expect(r.companyId).toBe("co-77");
    expect(inserts).toHaveLength(1); // the contact, NOT a company
    expect(inserts[0].values.companyId).toBe("co-77");
    expect(inserts[0].values.email).toBe("anna@romandco.ch");
    expect(sent.some((e) => e.name === "contact/created")).toBe(true);
  });

  it("unknown HUMAN at an unknown business domain -> UNATTRIBUTED capture (no contact/company auto-created)", async () => {
    // A stranger emailing you is VISIBLE in the inbox but never auto-promoted to
    // a CRM contact/account: nothing is created, the activity is "unassigned".
    selectQueue = [
      [], // dedup
      [], // no contact
      [], // no company by domain
    ];
    const r = await captureInboundEmail(baseInput);
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0); // NO company, NO contact
    expect(sent.some((e) => e.name === "company/created")).toBe(false);
    expect(sent.some((e) => e.name === "contact/created")).toBe(false);
    const activity = recordCapturedActivity.mock.calls[0][0] as { activity: { entityType: string; entityId: string } };
    expect(activity.activity.entityType).toBe("unassigned");
    expect(activity.activity.entityId).toBe("");
  });

  it("unknown MACHINE sender -> UNATTRIBUTED capture (visible, no contact spam)", async () => {
    selectQueue = [
      [], // dedup
      [], // no contact
      [], // no company by domain
    ];
    const r = await captureInboundEmail({
      ...baseInput,
      fromHeader: "Weekly Digest <noreply@unknownco.io>",
      subject: "Your weekly digest",
      text: "Here are this week's updates.",
    });
    expect(r.captured).toBe(true);
    expect(inserts).toHaveLength(0);
    const activity = recordCapturedActivity.mock.calls[0][0] as { activity: { entityType: string } };
    expect(activity.activity.entityType).toBe("unassigned");
  });

  it("disabled mode: known company domain -> company-attached, contact NOT created", async () => {
    creationMode = "disabled";
    selectQueue = [
      [], // dedup
      [], // no contact
      [{ id: "co-77" }], // company matched
    ];
    const r = await captureInboundEmail(baseInput);
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0);
    const activity = recordCapturedActivity.mock.calls[0][0] as { activity: { entityType: string; entityId: string } };
    expect(activity.activity.entityType).toBe("company");
    expect(activity.activity.entityId).toBe("co-77");
  });

  it("freemail HUMAN sender -> UNATTRIBUTED capture (never a contact or 'Gmail' account)", async () => {
    selectQueue = [
      [], // dedup
      [], // no contact
      // no company select runs for an ignored/free-mail domain
    ];
    const r = await captureInboundEmail({ ...baseInput, fromHeader: "Bob <bob@gmail.com>" });
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0); // no contact, no company
    expect(sent.some((e) => e.name === "company/created")).toBe(false);
    expect(sent.some((e) => e.name === "contact/created")).toBe(false);
    const activity = recordCapturedActivity.mock.calls[0][0] as { activity: { entityType: string } };
    expect(activity.activity.entityType).toBe("unassigned");
  });

  it("duplicate messageId -> skipped (covers legacy gmailMessageId dedup key)", async () => {
    selectQueue = [[{ id: "act-old" }]];
    const r = await captureInboundEmail(baseInput);
    expect(r.captured).toBe(false);
    expect(r.reason).toBe("duplicate");
    expect(recordCapturedActivity).not.toHaveBeenCalled();
  });

  it("normalizes a step-serialized ISO-string occurredAt", async () => {
    selectQueue = [
      [],
      [{ id: "ct-9", companyId: null }],
    ];
    await captureInboundEmail({ ...baseInput, occurredAt: "2026-06-10T08:30:00.000Z" });
    const arg = recordCapturedActivity.mock.calls[0][0] as { activity: { occurredAt: Date } };
    expect(arg.activity.occurredAt).toBeInstanceOf(Date);
    expect(arg.activity.occurredAt.toISOString()).toBe("2026-06-10T08:30:00.000Z");
  });

  it("machine sender (noreply@) at a known company → company-attached, no contact created, no contact/created", async () => {
    selectQueue = [
      [], // dedup
      [], // no contact by sender email
      [{ id: "co-77" }], // company matched by domain
    ];
    // Without the machine-sent gate this would auto-create a contact (known
    // company + selective mode = CRM-graph rule). The gate must block it.
    const r = await captureInboundEmail({
      ...baseInput,
      fromHeader: "Romand Co Billing <noreply@romandco.ch>",
      subject: "Votre facture",
      text: "Merci pour votre paiement.",
    });
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0); // no fabricated "Noreply" person
    expect(sent.some((e) => e.name === "contact/created")).toBe(false);
    const activity = recordCapturedActivity.mock.calls[0][0] as {
      activity: { entityType: string; entityId: string; metadata: Record<string, unknown> };
    };
    expect(activity.activity.entityType).toBe("company");
    expect(activity.activity.entityId).toBe("co-77");
    const lc = activity.activity.metadata.leadClassification as {
      isMachineSent: boolean;
      senderType: string;
    };
    expect(lc.isMachineSent).toBe(true);
    expect(lc.senderType).toBe("automated_transactional");
  });

  it("List-Unsubscribe header: human-looking sender treated as machine, no contact created", async () => {
    selectQueue = [
      [], // dedup
      [], // no contact by sender
      [{ id: "co-77" }], // company matched by domain
    ];
    const r = await captureInboundEmail({
      ...baseInput,
      fromHeader: "Jane Doe <jane@startup.com>",
      subject: "Product news",
      text: "Latest updates from us.",
      headers: { "List-Unsubscribe": "<https://startup.com/u/abc>" },
    });
    expect(r.captured).toBe(true);
    expect(r.contactCreated).toBe(false);
    expect(inserts).toHaveLength(0);
    expect(sent.some((e) => e.name === "contact/created")).toBe(false);
    const activity = recordCapturedActivity.mock.calls[0][0] as {
      activity: { entityType: string; metadata: Record<string, unknown> };
    };
    expect(activity.activity.entityType).toBe("company");
    const lc = activity.activity.metadata.leadClassification as {
      isMachineSent: boolean;
      isBulk: boolean;
      senderType: string;
    };
    expect(lc.isMachineSent).toBe(true);
    expect(lc.isBulk).toBe(true);
    expect(lc.senderType).toBe("automated_marketing");
  });
});

describe("normalizeSyncDate", () => {
  it("passes Dates through and parses ISO strings", () => {
    const d = new Date("2026-01-02T03:04:05Z");
    expect(normalizeSyncDate(d)).toBe(d);
    expect(normalizeSyncDate("2026-01-02T03:04:05Z").getTime()).toBe(d.getTime());
  });
  it("falls back to now for missing or garbage input", () => {
    const before = Date.now();
    expect(normalizeSyncDate(undefined).getTime()).toBeGreaterThanOrEqual(before);
    expect(normalizeSyncDate("not a date").getTime()).toBeGreaterThanOrEqual(before);
    expect(Number.isNaN(normalizeSyncDate(null).getTime())).toBe(false);
  });
});

describe("last-interaction SQL shape", () => {
  it("counts only real exchanges — bookkeeping and deal events are excluded", () => {
    expect(INTERACTION_ACTIVITY_TYPES).toContain("email_received");
    expect(INTERACTION_ACTIVITY_TYPES).toContain("email_sent");
    expect(INTERACTION_ACTIVITY_TYPES).toContain("call_completed");
    expect(INTERACTION_ACTIVITY_TYPES).toContain("meeting_completed");
    const forbidden = ["system_event", "deal_won", "deal_created", "note_created", "enrichment_updated", "score_changed", "email_opened"];
    for (const t of forbidden) expect(INTERACTION_ACTIVITY_TYPES as readonly string[]).not.toContain(t);
    for (const t of INTERACTION_ACTIVITY_TYPES) expect(INTERACTION_TYPES_SQL_LIST).toContain(`'${t}'`);
  });

  it("unions contact-, company- and deal-attached interactions with deleted_at guards", () => {
    const tpl = lastInteractionUnionSql({ idsParam: "__IDS__", tenantParam: "__TENANT__" });
    expect(tpl).toContain("a.entity_type = 'contact'");
    expect(tpl).toContain("a.entity_type = 'company'");
    expect(tpl).toContain("a.entity_type = 'deal'");
    expect(tpl).toContain("c.deleted_at IS NULL");
    expect(tpl).toContain("d.deleted_at IS NULL");
    // Soft-deleted activities (delete-cascade) must never resurface.
    expect((tpl.match(/a\.deleted_at IS NULL/g) ?? []).length).toBe(3);
    expect((tpl.match(/activity_type IN/g) ?? []).length).toBe(3);
    expect(tpl).toContain("DISTINCT ON (u.company_id)");
    expect((tpl.match(/__TENANT__/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((tpl.match(/__IDS__/g) ?? []).length).toBe(3);
  });
});
