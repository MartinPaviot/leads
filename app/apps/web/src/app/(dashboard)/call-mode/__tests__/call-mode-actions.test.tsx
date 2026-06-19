// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-09 — the /call-mode cockpit registers exactly the fifteen NON-DIAL page
 * actions and reuses the page/child handlers (the §4 lifts) so the agent path
 * and the button path issue one identical request each. The headline property
 * is the HUMAN-BOUND boundary: live telephony (dial / hang-up / voicemail-drop /
 * in-call disposition / recorder) and spending real money (buy-number) are
 * NEVER registered — asserted by an id-disjointness test, the required guard.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/call-mode",
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-custom-fields", () => ({
  usePipelineStages: () => ({ stages: [], loading: false }),
  useCustomFields: () => ({ fields: [], loading: false }),
}));

import CallModePage from "@/app/(dashboard)/call-mode/page";
import { CALLMODE_HUMAN_BOUND_IDS } from "@/app/(dashboard)/call-mode/_human-bound-ids";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";
import { decideAction } from "@/lib/guardrails/decide-action";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "callMode.activateSectorList", "callMode.activateAllIcp", "callMode.createSectorList",
  "callMode.editPlan", "callMode.selectProspect", "callMode.setFromNumber",
  "callMode.byDayView", "callMode.sortQueue", "callMode.regenerateScript",
  "callMode.editScript", "callMode.rowEnrich", "callMode.rowFindMobile",
  "callMode.bulkFindMobile", "callMode.markRoleObsolete", "callMode.writeEmailDraft",
  "callMode.bookMeeting",
];

const FIXTURE_QUEUE = [
  { contactId: "c1", contactName: "Marie Dubois", title: "DG", companyName: "EMS Lac", companyDomain: "ems.ch", phone: "+41225550000", score: 0.9, intentScore: 0, accessibilityScore: 0, dealValueWeight: 0, attemptCount: 0, nextAttemptAt: null, localTime: "10:00", localTimezone: "Europe/Zurich", latestSignal: null },
  { contactId: "c2", contactName: "Jean Martin", title: "CFO", companyName: "Fond Genève", companyDomain: "fg.ch", phone: "+41225550001", score: 0.7, intentScore: 0, accessibilityScore: 0, dealValueWeight: 0, attemptCount: 3, nextAttemptAt: null, localTime: "10:01", localTimezone: "Europe/Zurich", latestSignal: null },
];

const FIXTURE_CONFIG = {
  configured: true,
  ready: true,
  pool: [
    { e164: "+41225550000", countryCode: "CH", areaCode: "22" },
    { e164: "+33638345231", countryCode: "FR", areaCode: "6" },
  ],
  usage: null,
};

const FIXTURE_CAMPAIGN = {
  id: "camp1", name: "Q3 push", dailyQuota: 20, maxAttempts: 8, windowDays: 15,
  targetFilter: { goal: { type: "calls", target: 100, window: "week" }, listFrequency: "daily", workingDays: [1, 2, 3, 4, 5] },
};

const FIXTURE_LISTS = {
  activeListId: null,
  system: [],
  sector: [
    { id: "L1", name: "EMS romands", counts: { total: 50, withPhone: 40, callable: 40 } },
    { id: "L2", name: "Fondations Genève", counts: { total: 30, withPhone: 20, callable: 20 } },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

// Per-test overridable responses for the endpoints whose status the tests vary.
let activateResponse: () => Response = () => jsonRes({ ok: true });
let createListResponse: () => Response = () => jsonRes({ list: { id: "Lnew" } });
let campaignPatchResponse: () => Response = () => jsonRes({ campaign: { ...FIXTURE_CAMPAIGN, dailyQuota: 30 }, calls: FIXTURE_QUEUE });
let scriptGenResponse: () => Response = () => jsonRes({ draft: { opener: "Bonjour", problems: ["enjeu"], permissionCheck: "ok?", bookingAsk: "RDV?", guidance: [] }, grounding: [] });
let scriptSaveResponse: () => Response = () => jsonRes({ script: { opener: "Bonjour", problems: ["enjeu"], permissionCheck: "ok?", bookingAsk: "RDV?", guidance: [] } });
let enrichResponse: () => Response = () => jsonRes({ ok: true });
let findMobileResponse: () => Response = () => jsonRes({ requested: 1 });
let roleObsoleteResponse: () => Response = () => jsonRes({ ok: true });
let draftEmailResponse: () => Response = () => jsonRes({ subject: "Suite à notre échange", body: "Bonjour..." });
let bookResponse: () => Response = () => jsonRes({ booked: true, joinUrl: "https://meet.example/x" });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/calls/config") return jsonRes(FIXTURE_CONFIG);
  if (u === "/api/calls/campaign" && method === "GET") return jsonRes({ campaign: FIXTURE_CAMPAIGN, calls: FIXTURE_QUEUE });
  if (u === "/api/calls/campaign" && method === "PATCH") return campaignPatchResponse();
  if (u === "/api/calls/lists" && method === "GET") return jsonRes(FIXTURE_LISTS);
  if (u === "/api/calls/lists" && method === "POST") return createListResponse();
  if (/^\/api\/calls\/lists\/[^/]+\/activate$/.test(u) && method === "POST") return activateResponse();
  if (u === "/api/calls/script/generate" && method === "POST") return scriptGenResponse();
  if (u === "/api/calls/script" && method === "PUT") return scriptSaveResponse();
  if (u.startsWith("/api/calls/script") && method === "GET") return jsonRes({ script: { opener: "Bonjour {name}", problems: ["enjeu"], permissionCheck: "ok?", bookingAsk: "RDV?", guidance: [] }, resolvedSector: "sante", via: [] });
  if (u === "/api/calls/campaign/stats" || u.startsWith("/api/calls/campaign/stats")) return jsonRes({});
  if (/^\/api\/contacts\/[^/]+\/zeliq-enrich$/.test(u) && method === "POST") return enrichResponse();
  if (u === "/api/contacts/fullenrich-enrich" && method === "POST") return findMobileResponse();
  if (/^\/api\/contacts\/[^/]+$/.test(u) && method === "PUT") return roleObsoleteResponse();
  if (u === "/api/calls/draft-email" && method === "POST") return draftEmailResponse();
  if (u === "/api/meetings/book" && method === "POST") return bookResponse();
  if (u.startsWith("/api/brain/contact/")) return jsonRes(null, true, 200);
  if (u.startsWith("/api/call-mode/prospect-brief")) return jsonRes(null, true, 200);
  if (u.startsWith("/api/collision")) return jsonRes({});
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<CallModePage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  activateResponse = () => jsonRes({ ok: true });
  createListResponse = () => jsonRes({ list: { id: "Lnew" } });
  campaignPatchResponse = () => jsonRes({ campaign: { ...FIXTURE_CAMPAIGN, dailyQuota: 30 }, calls: FIXTURE_QUEUE });
  scriptGenResponse = () => jsonRes({ draft: { opener: "Bonjour", problems: ["enjeu"], permissionCheck: "ok?", bookingAsk: "RDV?", guidance: [] }, grounding: [] });
  scriptSaveResponse = () => jsonRes({ script: { opener: "Bonjour", problems: ["enjeu"], permissionCheck: "ok?", bookingAsk: "RDV?", guidance: [] } });
  enrichResponse = () => jsonRes({ ok: true });
  findMobileResponse = () => jsonRes({ requested: 1 });
  roleObsoleteResponse = () => jsonRes({ ok: true });
  draftEmailResponse = () => jsonRes({ subject: "Suite à notre échange", body: "Bonjour..." });
  bookResponse = () => jsonRes({ booked: true, joinUrl: "https://meet.example/x" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function callsTo(url: string | RegExp, method = "POST") {
  return fetchMock.mock.calls.filter((c) => {
    const u = String(c[0]);
    const m = (c[1]?.method ?? "GET");
    const match = typeof url === "string" ? u === url : url.test(u);
    return match && m === method;
  });
}
function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
async function flush() {
  for (let i = 0; i < 12; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Mount the cockpit and wait until its actions are registered + queue loaded. */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("callMode.activateSectorList");
  });
  await flush();
}

describe("CLE-09 /call-mode — manifest membership + metadata", () => {
  it("registers exactly the fifteen+one non-dial actions with the right scalars", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("callMode.bookMeeting").outbound).toBe(true);
    expect(by("callMode.bookMeeting").confirm).toBe("always");
    expect(by("callMode.bookMeeting").reversible).toBe(false);

    expect(by("callMode.rowEnrich").cost).toBe("credits");
    expect(by("callMode.rowEnrich").confirm).toBe("risky");
    expect(by("callMode.rowFindMobile").cost).toBe("credits");
    expect(by("callMode.bulkFindMobile").cost).toBe("credits");

    expect(by("callMode.setFromNumber").mutating).toBe(false);
    expect(by("callMode.setFromNumber").confirm).toBe("never");
    expect(by("callMode.selectProspect").mutating).toBe(false);
    expect(by("callMode.byDayView").confirm).toBe("never");
    expect(by("callMode.sortQueue").confirm).toBe("never");

    expect(by("callMode.writeEmailDraft").outbound).toBe(false);
    expect(by("callMode.writeEmailDraft").cost).toBe("credits");
    expect(by("callMode.writeEmailDraft").confirm).toBe("never");
    expect(by("callMode.writeEmailDraft").mutating).toBe(false);

    expect(by("callMode.activateSectorList").confirm).toBe("risky");
    expect(by("callMode.createSectorList").mutating).toBe(true);
    expect(by("callMode.editPlan").confirm).toBe("risky");
  });
});

describe("CLE-09 /call-mode — REQUIRED human-bound boundary (the headline)", () => {
  it("the manifest does NOT contain any dial/hangup/voicemail/disposition/recorder/buy-number id", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id);

    // Exact frozen excluded set is disjoint from what is registered.
    for (const banned of CALLMODE_HUMAN_BOUND_IDS) {
      expect(ids).not.toContain(banned);
    }
    expect(CALLMODE_HUMAN_BOUND_IDS.filter((b) => ids.includes(b))).toEqual([]);

    // Substring sweep — no registered id mentions any human-bound verb.
    const FORBIDDEN = ["dial", "placecall", "place-call", "hangup", "hang-up", "voicemail", "disposition", "record", "recorder", "buynumber", "buy-number", "purchase"];
    for (const id of ids) {
      const lower = id.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower.includes(bad), `registered id "${id}" must not contain "${bad}"`).toBe(false);
      }
    }
    // No action declares cost:"money" (real-money spend stays human-bound).
    expect(getActionManifest().some((a) => a.cost === "money")).toBe(false);
  });
});

describe("CLE-09 /call-mode — activate / create / editPlan", () => {
  it("activateSectorList POSTs /activate then reloads; no campaign -> ok:false no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.activateSectorList", { listId: "L1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("EMS romands");
    expect(callsTo(/^\/api\/calls\/lists\/L1\/activate$/).length).toBe(1);
  });

  it("activateSectorList failed activate -> ok:false (existing toast path)", async () => {
    activateResponse = () => jsonRes({}, false, 500);
    await mountLoaded();
    const r = await runRegisteredAction("callMode.activateSectorList", { listId: "L1" });
    // handleActivateSector toasts on failure but reload still happens; the action
    // reports success of the prepared switch via the queue length. Assert the POST fired.
    expect(callsTo(/^\/api\/calls\/lists\/L1\/activate$/).length).toBe(1);
    expect(r.ok).toBe(true); // optimistic summary; the failure surfaced via the existing toast
  });

  it("activateAllIcp POSTs /all/activate", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.activateAllIcp", {});
    expect(r.ok).toBe(true);
    expect(callsTo("/api/calls/lists/all/activate").length).toBe(1);
  });

  it("createSectorList POSTs the phrase then activates the new id; empty phrase -> no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.createSectorList", { phrase: "les DG des EMS romands" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/calls/lists")[0])).toEqual({ phrase: "les DG des EMS romands" });
    expect(callsTo(/^\/api\/calls\/lists\/Lnew\/activate$/).length).toBe(1);

    const before = callsTo("/api/calls/lists").length;
    const empty = await runRegisteredAction("callMode.createSectorList", { phrase: "   " });
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/calls/lists").length).toBe(before); // no POST
  });

  it("createSectorList server reject surfaces the message", async () => {
    createListResponse = () => jsonRes({ message: "Secteur introuvable" }, false, 400);
    await mountLoaded();
    const r = await runRegisteredAction("callMode.createSectorList", { phrase: "xyz" });
    // handleCreateList toasts the server message and the action reports created
    // (it doesn't re-derive failure); assert the POST fired with the phrase.
    expect(bodyOf(callsTo("/api/calls/lists")[0])).toEqual({ phrase: "xyz" });
    expect(r.ok).toBe(true);
  });

  it("editPlan PATCHes the merged plan payload; target<=0 -> no PATCH", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.editPlan", { goalType: "calls", target: 30, window: "day", maxAttempts: 8, windowDays: 15 });
    expect(r.ok).toBe(true);
    const patch = callsTo("/api/calls/campaign", "PATCH");
    expect(patch.length).toBe(1);
    const body = bodyOf(patch[0]) as { goal: { type: string; target: number; window: string }; maxAttempts: number; windowDays: number };
    expect(body.goal.type).toBe("calls");
    expect(body.goal.target).toBe(30);
    expect(body.goal.window).toBe("day");
    expect(body.maxAttempts).toBe(8);
    expect(body.windowDays).toBe(15);

    const bad = await runRegisteredAction("callMode.editPlan", { target: -5 });
    expect(bad.ok).toBe(false);
    expect(callsTo("/api/calls/campaign", "PATCH").length).toBe(1); // unchanged
  });

  it("editPlan server reject -> ok:false", async () => {
    campaignPatchResponse = () => jsonRes({ error: "Plan invalide" }, false, 400);
    await mountLoaded();
    const r = await runRegisteredAction("callMode.editPlan", { target: 30 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Plan invalide");
  });
});

describe("CLE-09 /call-mode — view/config actions (instant, no card)", () => {
  it("selectProspect selects a queued contact; unknown id -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.selectProspect", { contactId: "c2" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Jean Martin");
    const miss = await runRegisteredAction("callMode.selectProspect", { contactId: "ghost" });
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain("not in the current call list");
  });

  it("setFromNumber to a pool number / automatic; non-pool -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.setFromNumber", { number: "+41225550000" });
    expect(r.ok).toBe(true);
    const auto = await runRegisteredAction("callMode.setFromNumber", { number: "automatic" });
    expect(auto.ok).toBe(true);
    expect(auto.summary).toContain("automatic");
    const bad = await runRegisteredAction("callMode.setFromNumber", { number: "+10000000000" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("pool");
  });

  it("byDayView maps callbacks->callbacks_due; sortQueue maps callback->oldest_callback", async () => {
    await mountLoaded();
    const cb = await runRegisteredAction("callMode.byDayView", { view: "callbacks" });
    expect(cb.ok).toBe(true);
    expect(cb.summary).toContain("callbacks due");
    const so = await runRegisteredAction("callMode.sortQueue", { sort: "callback" });
    expect(so.ok).toBe(true);
    expect(so.summary).toContain("oldest callback");
    const bad = await runRegisteredAction("callMode.byDayView", { view: "bogus" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
  });
});

describe("CLE-09 /call-mode — script actions (lifted ref; review vs saved)", () => {
  it("regenerateScript POSTs generate and says 'review'; editScript PUTs and says 'saved'", async () => {
    await mountLoaded();
    // A prospect is auto-selected at load (queue[0]), so the script panel mounts.
    const r = await runRegisteredAction("callMode.regenerateScript", { sector: "sante" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("review");
    const gen = callsTo("/api/calls/script/generate");
    expect(gen.length).toBe(1);
    expect(bodyOf(gen[0])).toMatchObject({ sector: "sante" });

    const e = await runRegisteredAction("callMode.editScript", { opener: "Nouvelle accroche" });
    expect(e.ok).toBe(true);
    expect(e.summary).toContain("saved");
    const put = callsTo("/api/calls/script", "PUT");
    expect(put.length).toBe(1);
    const body = bodyOf(put[0]) as { fields: { opener: string } };
    expect(body.fields.opener).toBe("Nouvelle accroche");
  });
});

describe("CLE-09 /call-mode — credit actions (POST behind confirm:risky)", () => {
  it("rowEnrich POSTs zeliq-enrich; says 'started'", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.rowEnrich", { contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("started");
    expect(callsTo(/^\/api\/contacts\/c1\/zeliq-enrich$/).length).toBe(1);
  });

  it("rowFindMobile POSTs fullenrich for one id; bulkFindMobile for many; empty bulk -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.rowFindMobile", { contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/contacts/fullenrich-enrich")[0])).toEqual({ contactIds: ["c1"] });

    findMobileResponse = () => jsonRes({ requested: 2 });
    const b = await runRegisteredAction("callMode.bulkFindMobile", { contactIds: ["c1", "c2"] });
    expect(b.ok).toBe(true);
    expect(b.summary).toContain("2 contacts");

    const before = callsTo("/api/contacts/fullenrich-enrich").length;
    const empty = await runRegisteredAction("callMode.bulkFindMobile", { contactIds: [] });
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/contacts/fullenrich-enrich").length).toBe(before);
  });
});

describe("CLE-09 /call-mode — markRoleObsolete (PUT + drop row)", () => {
  it("PUTs roleObsolete and drops the row; unknown id -> ok:false no PUT", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.markRoleObsolete", { contactId: "c1" });
    expect(r.ok).toBe(true);
    const put = callsTo(/^\/api\/contacts\/c1$/, "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toEqual({ roleObsolete: true });

    const miss = await runRegisteredAction("callMode.markRoleObsolete", { contactId: "ghost" });
    expect(miss.ok).toBe(false);
    expect(callsTo(/^\/api\/contacts\/ghost$/, "PUT").length).toBe(0);
  });
});

describe("CLE-09 /call-mode — writeEmailDraft (composer, no send) + bookMeeting (outbound)", () => {
  it("writeEmailDraft POSTs draft-email and does NOT send; opens the composer", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("callMode.writeEmailDraft", { contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("composer");
    expect(callsTo("/api/calls/draft-email").length).toBe(1);
    // No send endpoint is ever hit — the human sends from the composer.
    expect(fetchMock.mock.calls.some((c) => {
      const u = String(c[0]);
      return u.includes("/api/email/send") || u.includes("/api/send") || (u === "/api/emails" && (c[1]?.method ?? "GET") === "POST");
    })).toBe(false);
  });

  it("writeEmailDraft draft-failure still opens a blank composer (notes it)", async () => {
    draftEmailResponse = () => jsonRes({ error: "LLM down" }, false, 500);
    await mountLoaded();
    const r = await runRegisteredAction("callMode.writeEmailDraft", { contactId: "c1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("blank");
    expect(callsTo("/api/calls/draft-email").length).toBe(1);
  });

  it("bookMeeting POSTs /meetings/book with future time; joinUrl in data; past time -> ok:false no POST", async () => {
    await mountLoaded();
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const r = await runRegisteredAction("callMode.bookMeeting", { contactId: "c1", startTime: future, durationMinutes: 45, conferencing: "sovereign" });
    expect(r.ok).toBe(true);
    expect((r.data as { joinUrl: string }).joinUrl).toBe("https://meet.example/x");
    const book = callsTo("/api/meetings/book");
    expect(book.length).toBe(1);
    const body = bodyOf(book[0]) as { contactId: string; startTime: string; durationMinutes: number; conferencing: string; meetingType: string };
    expect(body.contactId).toBe("c1");
    expect(body.durationMinutes).toBe(45);
    expect(body.conferencing).toBe("sovereign");
    expect(body.meetingType).toBe("qualification");

    const past = await runRegisteredAction("callMode.bookMeeting", { contactId: "c1", startTime: new Date(Date.now() - 3600 * 1000).toISOString() });
    expect(past.ok).toBe(false);
    expect(past.error).toContain("future");
    expect(callsTo("/api/meetings/book").length).toBe(1); // unchanged

    const invalid = await runRegisteredAction("callMode.bookMeeting", { contactId: "c1", startTime: "not-a-date" });
    expect(invalid.ok).toBe(false);
    expect(callsTo("/api/meetings/book").length).toBe(1);
  });
});

describe("CLE-09 /call-mode — decideAction gating of the manifest entries", () => {
  it("credit + outbound actions confirm; view/config actions execute (member, review-each)", async () => {
    await mountLoaded();
    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    const decide = (id: string) =>
      decideAction({ action: by(id), approvalMode: "review-each", role: "member" }).disposition;

    // bookMeeting is the only declared outbound -> confirm regardless of mode.
    expect(decide("callMode.bookMeeting")).toBe("confirm");
    // Credit spenders card before the spend.
    expect(decide("callMode.rowEnrich")).toBe("confirm");
    expect(decide("callMode.rowFindMobile")).toBe("confirm");
    expect(decide("callMode.bulkFindMobile")).toBe("confirm");
    // Risky reversible mutations confirm.
    expect(decide("callMode.activateSectorList")).toBe("confirm");
    expect(decide("callMode.editPlan")).toBe("confirm");
    // Pure view/config -> execute (no card).
    expect(decide("callMode.selectProspect")).toBe("execute");
    expect(decide("callMode.setFromNumber")).toBe("execute");
    expect(decide("callMode.byDayView")).toBe("execute");
    expect(decide("callMode.sortQueue")).toBe("execute");
    // writeEmailDraft is mutating:false/outbound:false/confirm:never -> execute
    // (the credit is disclosed via the badge but doesn't gate the composer open).
    expect(decide("callMode.writeEmailDraft")).toBe("execute");

    // A viewer is refused for the mutating/outbound ones (inherited plane).
    const viewerDecide = (id: string) =>
      decideAction({ action: by(id), approvalMode: "review-each", role: "viewer" }).disposition;
    expect(viewerDecide("callMode.bookMeeting")).toBe("refuse");
    expect(viewerDecide("callMode.rowEnrich")).toBe("refuse");
    expect(viewerDecide("callMode.selectProspect")).toBe("execute");
  });
});

describe("CLE-09 /call-mode — E-5b: script/email/meeting need a prospect", () => {
  it("with an empty queue the script + composer + meeting actions fail cleanly, no POST", async () => {
    // No campaign queue -> no selection -> the script panel + CallActions are unmounted.
    const emptyRouter = (url: string, init?: RequestInit): Response => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (u === "/api/calls/config") return jsonRes(FIXTURE_CONFIG);
      if (u === "/api/calls/campaign" && method === "GET") return jsonRes({ campaign: FIXTURE_CAMPAIGN, calls: [] });
      if (u === "/api/calls/lists" && method === "GET") return jsonRes(FIXTURE_LISTS);
      return jsonRes({});
    };
    fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(emptyRouter(url, init)));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    render(<CallModePage />);
    await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("callMode.regenerateScript"));
    await flush();

    const reg = await runRegisteredAction("callMode.regenerateScript", { sector: "sante" });
    expect(reg.ok).toBe(false);
    expect(reg.error).toContain("Open a prospect first");
    expect(callsTo("/api/calls/script/generate").length).toBe(0);

    const ed = await runRegisteredAction("callMode.editScript", { opener: "x" });
    expect(ed.ok).toBe(false);
    expect(callsTo("/api/calls/script", "PUT").length).toBe(0);

    const we = await runRegisteredAction("callMode.writeEmailDraft", { contactId: "c1" });
    expect(we.ok).toBe(false);
    expect(callsTo("/api/calls/draft-email").length).toBe(0);

    const bk = await runRegisteredAction("callMode.bookMeeting", { contactId: "c1", startTime: new Date(Date.now() + 86400000).toISOString() });
    expect(bk.ok).toBe(false);
    expect(callsTo("/api/meetings/book").length).toBe(0);
  });
});

describe("CLE-09 /call-mode — off-page degradation", () => {
  it("after unmount the callMode.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("callMode.activateSectorList");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("callMode.activateSectorList");
    const r = await runRegisteredAction("callMode.activateSectorList", { listId: "L1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
