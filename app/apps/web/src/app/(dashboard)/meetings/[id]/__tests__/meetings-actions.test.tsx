// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /meetings/[id] detail page registers exactly the seven non-capture
 * page actions and reuses the page handlers (the §4 lifts) so the agent path and
 * the button path issue one identical request each. Producing a transcript (the
 * in-browser recorder + the native file-upload dialog) is HUMAN-BOUND and never
 * registered — asserted by the disjointness boundary test. This file proves the
 * registered actions issue the right requests and gate correctly.
 */

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "M" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/meetings/M",
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

import MeetingDetailPage from "@/app/(dashboard)/meetings/[id]/page";
import { MEETINGS_EXCLUDED_IDS } from "@/app/(dashboard)/meetings/[id]/_excluded-ids";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "meetings.editNotesSection",
  "meetings.sendFollowUp",
  "meetings.shareSlack",
  "meetings.generatePrep",
  "meetings.postCallConfirm",
  "meetings.approveIntel",
  "meetings.dismissIntel",
];

// A meeting fixture with notes + a pending intel proposal on each CRM record,
// so the page renders past the early returns and the intel guards pass.
const FIXTURE: Record<string, unknown> = {
  meeting: {
    id: "M",
    title: "Discovery — Acme",
    date: new Date(Date.now() - 86400000).toISOString(), // past -> notes branch
    endTime: new Date(Date.now() - 86400000 + 1800000).toISOString(),
    attendees: [{ email: "buyer@acme.com", displayName: "Buyer", contactId: "ct1" }],
    location: null,
    meetingLink: null,
    calendarSource: "google",
    recordingUrl: null,
    recordingStatus: null,
  },
  hasTranscript: true,
  transcriptSource: "recall_bot",
  notes: {
    summary: "Good call.",
    keyPoints: ["point one"],
    actionItems: [],
    decisions: ["decided x"],
    participants: [],
    buyingSignals: {
      budget: null, timeline: null, currentStack: [], painPoints: [],
      objections: [], nextSteps: [], competitors: [], teamSize: null,
    },
    sentiment: "positive",
  },
  followUpDraft: { subject: "Thanks", body: "Great speaking." },
  followUpSentAt: null,
  tasks: [],
  matchedContacts: [],
  crm: {
    deal: { id: "deal1", properties: { pendingMeddic: { metrics: "x" } } },
    company: { id: "co1", properties: { pendingCallIntel: { triggers: ["x"] } } },
    contact: { id: "ct1", properties: { pendingCallProfile: { role: "buyer" } } },
  },
  coaching: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

let notesGetResponse: () => Response = () => jsonRes(FIXTURE);
let patchResponse: () => Response = () => jsonRes({ ok: true });
let sendFollowUpResponse: () => Response = () => jsonRes({ recipients: ["buyer@acme.com"] });
let shareSlackResponse: () => Response = () => jsonRes({ ok: true });
let prepResponse: () => Response = () => jsonRes({ prep: "Briefing..." });
let postCallResponse: () => Response = () => jsonRes({ ok: true });
let reviewResponse: () => Response = () => jsonRes({ ok: true });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/meetings/M/notes" && method === "GET") return notesGetResponse();
  if (u === "/api/meetings/M/notes" && method === "PATCH") return patchResponse();
  if (u === "/api/meetings/M/notes/send-follow-up" && method === "POST") return sendFollowUpResponse();
  if (u === "/api/meetings/M/share-slack" && method === "POST") return shareSlackResponse();
  if (u === "/api/meetings/prep" && method === "POST") return prepResponse();
  if (u === "/api/meetings/M/post-call" && method === "POST") return postCallResponse();
  if (u === "/api/call-intel/review" && method === "POST") return reviewResponse();
  // Child component fetches (transcript chunks, live extraction) — benign.
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  // navigator.clipboard is referenced by the Copy button (not exercised here).
  vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });
  render(<MeetingDetailPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  notesGetResponse = () => jsonRes(FIXTURE);
  patchResponse = () => jsonRes({ ok: true });
  sendFollowUpResponse = () => jsonRes({ recipients: ["buyer@acme.com"] });
  shareSlackResponse = () => jsonRes({ ok: true });
  prepResponse = () => jsonRes({ prep: "Briefing..." });
  postCallResponse = () => jsonRes({ ok: true });
  reviewResponse = () => jsonRes({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function callsTo(url: string | RegExp, method = "POST") {
  return fetchMock.mock.calls.filter((c) => {
    const u = String(c[0]);
    const m = c[1]?.method ?? "GET";
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

/** Mount the page and wait until its actions are registered + meeting loaded. */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("meetings.editNotesSection");
  });
  await flush();
}

describe("CLE-14 /meetings/[id] — manifest membership + metadata", () => {
  it("registers exactly the seven non-capture actions", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());
  });

  it("the manifest contains none of the human-bound capture ids", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id);
    for (const banned of MEETINGS_EXCLUDED_IDS) {
      expect(ids).not.toContain(banned);
    }
    expect(MEETINGS_EXCLUDED_IDS.filter((b) => ids.includes(b))).toEqual([]);
  });

  it("outbound + confirm metadata is correct", async () => {
    await mountLoaded();
    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("meetings.sendFollowUp").outbound).toBe(true);
    expect(by("meetings.sendFollowUp").confirm).toBe("always");
    expect(by("meetings.sendFollowUp").reversible).toBe(false);

    expect(by("meetings.shareSlack").outbound).toBe(true);
    expect(by("meetings.shareSlack").confirm).toBe("always");
    expect(by("meetings.shareSlack").reversible).toBe(false);

    expect(by("meetings.editNotesSection").confirm).toBe("risky");
    expect(by("meetings.editNotesSection").mutating).toBe(true);
    expect(by("meetings.generatePrep").confirm).toBe("risky");
    expect(by("meetings.postCallConfirm").confirm).toBe("risky");
    expect(by("meetings.approveIntel").confirm).toBe("risky");
    expect(by("meetings.dismissIntel").confirm).toBe("risky");

    // None spends real money or credits.
    expect(m.some((a) => a.cost === "money" || a.cost === "credits")).toBe(false);
  });
});

describe("CLE-14 /meetings/[id] — editNotesSection (single PATCH copy)", () => {
  it("summary -> PATCH structuredNotes.summary", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "summary", value: "New summary" });
    expect(r.ok).toBe(true);
    const patch = callsTo("/api/meetings/M/notes", "PATCH");
    expect(patch.length).toBe(1);
    const body = bodyOf(patch[0]) as { structuredNotes: { summary: string } };
    expect(body.structuredNotes.summary).toBe("New summary");
  });

  it("keyPoints -> PATCH structuredNotes.keyPoints (cleaned array)", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "keyPoints", value: ["a", "  ", "b"] });
    expect(r.ok).toBe(true);
    const patch = callsTo("/api/meetings/M/notes", "PATCH");
    expect(patch.length).toBe(1);
    const body = bodyOf(patch[0]) as { structuredNotes: { keyPoints: string[] } };
    expect(body.structuredNotes.keyPoints).toEqual(["a", "b"]);
  });

  it("decisions -> PATCH structuredNotes.decisions", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "decisions", value: ["go ahead"] });
    expect(r.ok).toBe(true);
    const body = bodyOf(callsTo("/api/meetings/M/notes", "PATCH")[0]) as { structuredNotes: { decisions: string[] } };
    expect(body.structuredNotes.decisions).toEqual(["go ahead"]);
  });

  it("followUp -> PATCH followUpEmailDraft {subject, body}", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", {
      meetingId: "M", section: "followUp", value: { subject: "S", body: "B" },
    });
    expect(r.ok).toBe(true);
    const body = bodyOf(callsTo("/api/meetings/M/notes", "PATCH")[0]) as { followUpEmailDraft: { subject: string; body: string } };
    expect(body.followUpEmailDraft).toEqual({ subject: "S", body: "B" });
  });

  it("wrong section shape -> ok:false, no PATCH", async () => {
    await mountLoaded();
    // summary given an array
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "summary", value: ["x"] });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/meetings/M/notes", "PATCH").length).toBe(0);
    // followUp missing body
    const r2 = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "followUp", value: { subject: "only" } });
    expect(r2.ok).toBe(false);
    expect(callsTo("/api/meetings/M/notes", "PATCH").length).toBe(0);
  });

  it("E-1: wrong meetingId -> ok:false, no PATCH", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "OTHER", section: "summary", value: "x" });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/meetings/M/notes", "PATCH").length).toBe(0);
  });

  it("PATCH server reject -> ok:false with the error", async () => {
    patchResponse = () => jsonRes({ error: "Notes locked" }, false, 409);
    await mountLoaded();
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "summary", value: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Notes locked");
  });
});

describe("CLE-14 /meetings/[id] — outbound sends", () => {
  it("sendFollowUp -> POST send-follow-up, reports recipients", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.sendFollowUp", { meetingId: "M" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("1 recipient");
    expect(callsTo("/api/meetings/M/notes/send-follow-up").length).toBe(1);
  });

  it("sendFollowUp wrong meetingId -> ok:false, no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.sendFollowUp", { meetingId: "OTHER" });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/meetings/M/notes/send-follow-up").length).toBe(0);
  });

  it("shareSlack -> POST share-slack", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.shareSlack", { meetingId: "M" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Slack");
    expect(callsTo("/api/meetings/M/share-slack").length).toBe(1);
  });

  it("shareSlack server reject -> ok:false", async () => {
    shareSlackResponse = () => jsonRes({ error: "No webhook" }, false, 400);
    await mountLoaded();
    const r = await runRegisteredAction("meetings.shareSlack", { meetingId: "M" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No webhook");
  });
});

describe("CLE-14 /meetings/[id] — generatePrep + postCallConfirm", () => {
  it("generatePrep -> POST /api/meetings/prep", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.generatePrep", { meetingId: "M" });
    expect(r.ok).toBe(true);
    expect(callsTo("/api/meetings/prep").length).toBe(1);
  });

  it("postCallConfirm -> POST /api/meetings/M/post-call", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.postCallConfirm", { meetingId: "M" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("CRM updated");
    expect(callsTo("/api/meetings/M/post-call").length).toBe(1);
  });

  it("postCallConfirm server reject -> ok:false", async () => {
    postCallResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    const r = await runRegisteredAction("meetings.postCallConfirm", { meetingId: "M" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });
});

describe("CLE-14 /meetings/[id] — intel approve/dismiss (second REST caller)", () => {
  it("approveIntel (deal) -> POST /call-intel/review with action:approve", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.approveIntel", { meetingId: "M", entityType: "deal", entityId: "deal1" });
    expect(r.ok).toBe(true);
    const calls = callsTo("/api/call-intel/review");
    expect(calls.length).toBe(1);
    expect(bodyOf(calls[0])).toEqual({ entityType: "deal", entityId: "deal1", action: "approve" });
  });

  it("dismissIntel (contact) -> POST /call-intel/review with action:dismiss", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.dismissIntel", { meetingId: "M", entityType: "contact", entityId: "ct1" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/call-intel/review")[0])).toEqual({ entityType: "contact", entityId: "ct1", action: "dismiss" });
  });

  it("E-9: no pending proposal of that type -> ok:false, no POST", async () => {
    // Re-mount with a fixture that has NO pending intel on the deal.
    notesGetResponse = () => jsonRes({
      ...FIXTURE,
      crm: { deal: { id: "deal1", properties: {} }, company: null, contact: null },
    });
    await mountLoaded();
    const r = await runRegisteredAction("meetings.approveIntel", { meetingId: "M", entityType: "deal", entityId: "deal1" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("pending");
    expect(callsTo("/api/call-intel/review").length).toBe(0);
  });

  it("approveIntel wrong meetingId -> ok:false, no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("meetings.approveIntel", { meetingId: "OTHER", entityType: "deal", entityId: "deal1" });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/call-intel/review").length).toBe(0);
  });
});

describe("CLE-14 /meetings/[id] — off-page degradation", () => {
  it("after unmount the meetings.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("meetings.editNotesSection");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("meetings.editNotesSection");
    const r = await runRegisteredAction("meetings.editNotesSection", { meetingId: "M", section: "summary", value: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
