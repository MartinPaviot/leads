// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Suspense } from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /sequences cluster (LIST + DETAIL + REVIEW) registers three
 * DISJOINT sets of page actions and reuses the page's OWN handlers/extractions so
 * the agent path and the button path issue one identical request each (AC-NODUP).
 *
 * The headline boundary: the wizard's send-bearing handlers (approveAll /
 * launchCampaign) are NEVER registered (see sequences-actions.boundary.test.ts).
 * Here we assert per-route manifest membership, action metadata (outbound /
 * confirm / reversible), the exact fetch URL+body each run issues, that the
 * read-only actions (reviewEdit) fire NO send-bearing POST, and off-page
 * degradation.
 */

const routerPush = vi.fn();
let searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "S" }),
  useSearchParams: () => searchParamsMock,
  usePathname: () => "/sequences",
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
// CLE-07/09 safe-render trick: the review page's preview/list children fetch
// their own context bundle and crash on a minimal fixture (they read
// context.recentInteractions). We test the PAGE's registered actions + the
// network bodies its handlers issue, not the children's rendering — so stub them
// to render nothing. The page still owns `drafts`/`selectedDraftId` and the
// handlers/extractions, which is all the actions touch.
vi.mock("@/components/sequence-draft-preview", () => ({
  SequenceDraftPreview: () => null,
}));
vi.mock("@/components/sequence-draft-list", () => ({
  SequenceDraftList: () => null,
}));
vi.mock("@/components/sequence-draft-reject-modal", () => ({
  SequenceDraftRejectModal: () => null,
}));

import SequencesListPage from "@/app/(dashboard)/sequences/page";
import SequenceDetailPage from "@/app/(dashboard)/sequences/[id]/page";
import ReviewQueuePage from "@/app/(dashboard)/sequences/review/page";
import {
  getActionManifest,
  runRegisteredAction,
  __resetPageActionsForTest,
} from "@/lib/chat/page-actions/registry";
import { decideAction } from "@/lib/guardrails/decide-action";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

/* ── id sets per route (also the disjointness checks) ── */
const LIST_IDS = ["sequences.createCampaign", "sequences.startProposed", "sequences.rejectProposed"];
const DETAIL_IDS = [
  "sequences.pause", "sequences.resume", "sequences.editStep", "sequences.deleteStep",
  "sequences.enrollPause", "sequences.enrollResume", "sequences.enrollStop", "sequences.launch",
];
const REVIEW_IDS = [
  "sequences.reviewBulkApprove", "sequences.reviewApprove", "sequences.reviewReject", "sequences.reviewEdit",
];

/* ── fixtures ── */
const FIXTURE_SEQUENCES = [
  { id: "seq-draft", name: "Q3 proposed", description: null, status: "draft", stepCount: 3, enrolledCount: 10, createdAt: new Date().toISOString() },
  { id: "seq-live", name: "Live push", description: null, status: "active", stepCount: 2, enrolledCount: 5, createdAt: new Date().toISOString() },
];

const FIXTURE_DETAIL = {
  sequence: { id: "S", name: "Open sequence", description: null, status: "active", campaignConfig: { status: "ready", stats: {} } },
  steps: [
    { id: "step-1", stepNumber: 1, subjectTemplate: "Hello", bodyTemplate: "Body one", delayDays: 0 },
    { id: "step-2", stepNumber: 2, subjectTemplate: "Follow up", bodyTemplate: "Body two", delayDays: 3 },
  ],
  enrollments: [
    { id: "enr-1", contactId: "c1", contactName: "Marie", contactEmail: "marie@ex.com", status: "active", currentStep: 1, enrolledAt: new Date().toISOString() },
    { id: "enr-2", contactId: "c2", contactName: "Jean", contactEmail: "jean@ex.com", status: "paused", currentStep: 1, enrolledAt: new Date().toISOString() },
  ],
};

function draftItem(id: string, version = 1) {
  return {
    id, sequenceId: "S", stepId: "step-1", enrollmentId: "enr-1", contactId: "c1",
    subject: "Quick question", bodyText: "Hi…", triggerReason: "intent", status: "pending_approval",
    generatedAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, reviewReason: null,
    scheduledSendAt: null, version,
  };
}
const FIXTURE_DRAFTS = { drafts: [draftItem("d1", 1), draftItem("d2", 2)], nextCursor: null };

/* ── per-test overridable endpoint responses ── */
let listResponse: () => Response;
let detailResponse: () => Response;
let draftsResponse: () => Response;
let bulkApproveResponse: () => Response;
let approveResponse: () => Response;
let rejectResponse: () => Response;

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  // List page
  if (u === "/api/sequences" && method === "GET") return listResponse();
  if (u === "/api/sending-mode") return jsonRes({ testMode: false, allowlist: [] });
  // Review page — match BEFORE the generic /api/sequences/:id GET, whose [^/]+
  // would otherwise swallow "drafts?status=..." (no slash in a query string).
  if (u.startsWith("/api/sequences/drafts?")) return draftsResponse();
  if (u === "/api/sequences/drafts/bulk-approve" && method === "POST") return bulkApproveResponse();
  if (/^\/api\/sequences\/drafts\/[^/?]+\/approve$/.test(u) && method === "POST") return approveResponse();
  if (/^\/api\/sequences\/drafts\/[^/?]+\/reject$/.test(u) && method === "POST") return rejectResponse();
  if (u.startsWith("/api/sequences/drafts/")) return jsonRes(null, true, 200); // preview context bundle / misc
  // List + detail status PUT
  if (/^\/api\/sequences\/[^/?]+$/.test(u) && method === "PUT") return jsonRes({ ok: true });
  // Detail page GET
  if (/^\/api\/sequences\/[^/?]+$/.test(u) && method === "GET") return detailResponse();
  if (/^\/api\/sequences\/[^/?]+\/analytics$/.test(u)) return jsonRes({ sequenceId: "S", enrollment: {}, emails: { totalOpened: 0, totalClicked: 0 }, rates: { openRate: 0, clickRate: 0, bounceRate: 0, replyRate: 0 } });
  if (/^\/api\/campaigns\/[^/?]+\/status$/.test(u)) return jsonRes({ status: "ready", stats: {}, emailStats: {} });
  if (/^\/api\/sequences\/[^/?]+\/steps\/[^/?]+$/.test(u) && method === "PATCH") return jsonRes({ ok: true });
  if (/^\/api\/sequences\/[^/?]+\/steps\/[^/?]+$/.test(u) && method === "DELETE") return jsonRes({ ok: true });
  if (/^\/api\/sequences\/[^/?]+\/enroll$/.test(u) && method === "PUT") return jsonRes({ ok: true });
  if (/^\/api\/campaigns\/[^/?]+\/launch$/.test(u) && method === "POST") return jsonRes({ ok: true });
  return jsonRes({});
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  searchParamsMock = new URLSearchParams();
  listResponse = () => jsonRes({ sequences: FIXTURE_SEQUENCES });
  detailResponse = () => jsonRes(FIXTURE_DETAIL);
  draftsResponse = () => jsonRes(FIXTURE_DRAFTS);
  bulkApproveResponse = () => jsonRes({ approved: ["d1", "d2"] });
  approveResponse = () => jsonRes({ ok: true });
  rejectResponse = () => jsonRes({ ok: true });
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

async function mountList() {
  stubFetch();
  await act(async () => { render(<SequencesListPage />); });
  await flush();
  await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.createCampaign"));
  await flush();
}
async function mountDetail() {
  stubFetch();
  // The detail page unwraps `params` with React's `use()` (a Promise), so it
  // suspends until the promise resolves — render it inside a Suspense boundary
  // and flush microtasks under act so React re-renders past the suspension.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <SequenceDetailPage params={Promise.resolve({ id: "S" })} />
      </Suspense>,
    );
  });
  await flush();
  await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.pause"));
  await flush();
}
async function mountReview() {
  stubFetch();
  await act(async () => { render(<ReviewQueuePage />); });
  await flush();
  await waitFor(() => expect(getActionManifest().map((a) => a.id)).toContain("sequences.reviewBulkApprove"));
  // Wait for the initial drafts fetch to fire, then flush the json->setDrafts
  // microtasks under act so draftsRef updates before the run()s read it.
  await waitFor(() => expect(callsTo(/^\/api\/sequences\/drafts\?/, "GET").length).toBeGreaterThan(0));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await flush();
}

/* ════════════════════ LIST ════════════════════ */
describe("CLE-14 /sequences LIST — manifest + runs", () => {
  it("registers exactly the three list actions with the right scalars", async () => {
    await mountList();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...LIST_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    expect(by("sequences.createCampaign").mutating).toBe(false);
    expect(by("sequences.createCampaign").confirm).toBe("never");
    expect(by("sequences.startProposed").outbound).toBe(true);
    expect(by("sequences.startProposed").confirm).toBe("always");
    expect(by("sequences.rejectProposed").confirm).toBe("risky");
    expect(by("sequences.rejectProposed").outbound).toBe(false);
  });

  it("createCampaign opens the wizard (no fetch); startProposed/rejectProposed PUT status", async () => {
    await mountList();
    const before = fetchMock.mock.calls.length;
    const c = await runRegisteredAction("sequences.createCampaign", {});
    expect(c.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(before); // opening the wizard hits no endpoint

    const s = await runRegisteredAction("sequences.startProposed", { sequenceId: "seq-draft" });
    expect(s.ok).toBe(true);
    const put = callsTo(/^\/api\/sequences\/seq-draft$/, "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toEqual({ status: "active" });

    const r = await runRegisteredAction("sequences.rejectProposed", { sequenceId: "seq-draft" });
    expect(r.ok).toBe(true);
    const putReject = callsTo(/^\/api\/sequences\/seq-draft$/, "PUT").map(bodyOf);
    expect(putReject).toContainEqual({ status: "archived" });

    // unknown id -> ok:false, no extra PUT
    const miss = await runRegisteredAction("sequences.startProposed", { sequenceId: "ghost" });
    expect(miss.ok).toBe(false);
    expect(callsTo(/^\/api\/sequences\/ghost$/, "PUT").length).toBe(0);
  });
});

/* ════════════════════ DETAIL ════════════════════ */
describe("CLE-14 /sequences DETAIL — manifest + runs + id guard", () => {
  it("registers exactly the eight detail actions with the right scalars", async () => {
    await mountDetail();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...DETAIL_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    expect(by("sequences.pause").confirm).toBe("risky");
    expect(by("sequences.pause").outbound).toBe(false);
    expect(by("sequences.resume").outbound).toBe(true);
    expect(by("sequences.resume").confirm).toBe("always");
    expect(by("sequences.deleteStep").confirm).toBe("always");
    expect(by("sequences.deleteStep").reversible).toBe(false);
    expect(by("sequences.enrollResume").outbound).toBe(true);
    expect(by("sequences.enrollResume").confirm).toBe("always");
    expect(by("sequences.launch").outbound).toBe(true);
    expect(by("sequences.launch").confirm).toBe("always");
    expect(by("sequences.launch").reversible).toBe(false);
  });

  it("pause/resume PUT status; editStep PATCH; deleteStep DELETE; launch POST", async () => {
    await mountDetail();
    const p = await runRegisteredAction("sequences.pause", { sequenceId: "S" });
    expect(p.ok).toBe(true);
    expect(bodyOf(callsTo(/^\/api\/sequences\/S$/, "PUT")[0])).toEqual({ status: "paused" });

    await runRegisteredAction("sequences.resume", { sequenceId: "S" });
    expect(callsTo(/^\/api\/sequences\/S$/, "PUT").map(bodyOf)).toContainEqual({ status: "active" });

    const e = await runRegisteredAction("sequences.editStep", { sequenceId: "S", stepId: "step-1", subjectTemplate: "New subject", delayDays: 2 });
    expect(e.ok).toBe(true);
    const patch = callsTo(/^\/api\/sequences\/S\/steps\/step-1$/, "PATCH");
    expect(patch.length).toBe(1);
    expect(bodyOf(patch[0])).toEqual({ subjectTemplate: "New subject", delayDays: 2 });

    const d = await runRegisteredAction("sequences.deleteStep", { sequenceId: "S", stepId: "step-2" });
    expect(d.ok).toBe(true);
    expect(callsTo(/^\/api\/sequences\/S\/steps\/step-2$/, "DELETE").length).toBe(1);

    const l = await runRegisteredAction("sequences.launch", { sequenceId: "S" });
    expect(l.ok).toBe(true);
    expect(callsTo(/^\/api\/campaigns\/S\/launch$/, "POST").length).toBe(1);
  });

  it("the three enroll actions collapse onto the single /enroll PUT", async () => {
    await mountDetail();
    await runRegisteredAction("sequences.enrollPause", { sequenceId: "S", enrollmentId: "enr-1" });
    await runRegisteredAction("sequences.enrollResume", { sequenceId: "S", enrollmentId: "enr-2" });
    await runRegisteredAction("sequences.enrollStop", { sequenceId: "S", enrollmentId: "enr-1" });
    const enroll = callsTo(/^\/api\/sequences\/S\/enroll$/, "PUT").map(bodyOf);
    expect(enroll).toContainEqual({ enrollmentId: "enr-1", status: "paused" });
    expect(enroll).toContainEqual({ enrollmentId: "enr-2", status: "active" });
    expect(enroll).toContainEqual({ enrollmentId: "enr-1", status: "completed" });
  });

  it("id guard: a sequenceId that is not the open one fails with no PUT", async () => {
    await mountDetail();
    const r = await runRegisteredAction("sequences.pause", { sequenceId: "OTHER" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not the one open here");
    expect(callsTo(/^\/api\/sequences\/OTHER$/, "PUT").length).toBe(0);
    // unknown step / enrollment fail cleanly too
    const badStep = await runRegisteredAction("sequences.editStep", { sequenceId: "S", stepId: "ghost", subjectTemplate: "x" });
    expect(badStep.ok).toBe(false);
    const badEnr = await runRegisteredAction("sequences.enrollPause", { sequenceId: "S", enrollmentId: "ghost" });
    expect(badEnr.ok).toBe(false);
  });
});

/* ════════════════════ REVIEW ════════════════════ */
describe("CLE-14 /sequences REVIEW — manifest + runs + E-10 (no send on edit)", () => {
  it("registers exactly the four review actions with the right scalars", async () => {
    await mountReview();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REVIEW_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    expect(by("sequences.reviewBulkApprove").outbound).toBe(true);
    expect(by("sequences.reviewBulkApprove").confirm).toBe("always");
    expect(by("sequences.reviewApprove").outbound).toBe(true);
    expect(by("sequences.reviewApprove").confirm).toBe("always");
    expect(by("sequences.reviewReject").confirm).toBe("risky");
    expect(by("sequences.reviewReject").outbound).toBe(false);
    expect(by("sequences.reviewEdit").mutating).toBe(false);
    expect(by("sequences.reviewEdit").confirm).toBe("never");
  });

  it("reviewApprove POSTs version; reviewReject POSTs reason+version (distinct drafts)", async () => {
    await mountReview();
    // Run approve on d1 and reject on d2 — independent drafts, so removing one
    // doesn't affect the lookup of the other.
    const a = await runRegisteredAction("sequences.reviewApprove", { draftId: "d1", version: 1 });
    expect(a.ok).toBe(true);
    const approve = callsTo(/^\/api\/sequences\/drafts\/d1\/approve$/);
    expect(approve.length).toBe(1);
    expect(bodyOf(approve[0])).toEqual({ version: 1 });

    const r = await runRegisteredAction("sequences.reviewReject", { draftId: "d2", version: 2, reason: "off-tone", pauseEnrollment: true });
    expect(r.ok).toBe(true);
    const reject = callsTo(/^\/api\/sequences\/drafts\/d2\/reject$/);
    expect(reject.length).toBe(1);
    expect(bodyOf(reject[0])).toEqual({ reason: "off-tone", pauseEnrollment: true, version: 2 });
  });

  it("reviewBulkApprove POSTs the id array; summary reports the count", async () => {
    await mountReview();
    const b = await runRegisteredAction("sequences.reviewBulkApprove", { ids: ["d1", "d2"] });
    expect(b.ok).toBe(true);
    expect(b.summary).toContain("2 drafts");
    expect(bodyOf(callsTo("/api/sequences/drafts/bulk-approve")[0])).toEqual({ ids: ["d1", "d2"] });
  });

  it("reviewApprove coerces a string version to a number for the endpoint", async () => {
    await mountReview();
    const a = await runRegisteredAction("sequences.reviewApprove", { draftId: "d1", version: "1" });
    expect(a.ok).toBe(true);
    expect(bodyOf(callsTo(/^\/api\/sequences\/drafts\/d1\/approve$/)[0])).toEqual({ version: 1 });
  });

  it("reviewEdit selects the draft and fires NO send-bearing POST (E-10)", async () => {
    await mountReview();
    const sendsBefore = fetchMock.mock.calls.filter((c) => {
      const u = String(c[0]);
      return /approve$|reject$|bulk-approve$|launch$/.test(u) && (c[1]?.method ?? "GET") === "POST";
    }).length;
    const e = await runRegisteredAction("sequences.reviewEdit", { draftId: "d1" });
    expect(e.ok).toBe(true);
    const sendsAfter = fetchMock.mock.calls.filter((c) => {
      const u = String(c[0]);
      return /approve$|reject$|bulk-approve$|launch$/.test(u) && (c[1]?.method ?? "GET") === "POST";
    }).length;
    expect(sendsAfter).toBe(sendsBefore);

    const miss = await runRegisteredAction("sequences.reviewEdit", { draftId: "ghost" });
    expect(miss.ok).toBe(false);
  });

  it("bulkApprove atomic rollback (409) surfaces ok:false", async () => {
    bulkApproveResponse = () => jsonRes({ failures: [{ id: "d1", reason: "stale" }] }, false, 409);
    await mountReview();
    const b = await runRegisteredAction("sequences.reviewBulkApprove", { ids: ["d1", "d2"] });
    expect(b.ok).toBe(false);
    expect(callsTo("/api/sequences/drafts/bulk-approve").length).toBe(1);
  });
});

/* ════════════════════ gating + off-page ════════════════════ */
describe("CLE-14 /sequences — decideAction gating", () => {
  it("outbound actions confirm; view actions execute; viewer refused for mutations", async () => {
    await mountDetail();
    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    const decide = (id: string) => decideAction({ action: by(id), approvalMode: "review-each", role: "member" }).disposition;
    expect(decide("sequences.resume")).toBe("confirm");
    expect(decide("sequences.launch")).toBe("confirm");
    expect(decide("sequences.deleteStep")).toBe("confirm");

    const viewerDecide = (id: string) => decideAction({ action: by(id), approvalMode: "review-each", role: "viewer" }).disposition;
    expect(viewerDecide("sequences.launch")).toBe("refuse");
    expect(viewerDecide("sequences.pause")).toBe("refuse");
  });
});

describe("CLE-14 /sequences — off-page degradation (registry clears on unmount)", () => {
  it("LIST ids absent after a DETAIL mount; DETAIL ids absent after unmount", async () => {
    await mountList();
    expect(getActionManifest().map((a) => a.id)).toEqual(expect.arrayContaining(LIST_IDS));
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("sequences.createCampaign");

    await mountDetail();
    const ids = getActionManifest().map((a) => a.id);
    // The three routes are disjoint — a mounted detail page never exposes list/review ids.
    for (const id of [...LIST_IDS, ...REVIEW_IDS]) expect(ids).not.toContain(id);

    cleanup();
    await flush();
    const r = await runRegisteredAction("sequences.pause", { sequenceId: "S" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
