// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act, screen, fireEvent } from "@testing-library/react";

/**
 * CLE-14 — the /inbox page registers its eleven page actions and reuses the
 * page + child-pane handlers (the §lift) so the agent path and the button path
 * issue one identical request each. Reply / draft / book / stop run the SAME
 * prepare-not-execute flows the pane buttons run; the human still sends from the
 * composer (no agent-send action). Off the page (or with the relevant child
 * unmounted) the actions degrade cleanly.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/inbox",
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
// One STABLE toast fn — useToast() must return a stable object across renders,
// else `loadLane` (dep: toast) is recreated every render and its effect loops.
const { toastApi } = vi.hoisted(() => ({ toastApi: { toast: () => {} } }));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => toastApi,
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-custom-fields", () => ({
  usePipelineStages: () => ({ stages: [], loading: false }),
  useCustomFields: () => ({ fields: [], loading: false }),
}));

import InboxPage from "@/app/(dashboard)/inbox/page";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "inbox.triageDone", "inbox.snooze", "inbox.reopen", "inbox.selectConversation",
  "inbox.setLane", "inbox.switchMailbox", "inbox.reply", "inbox.consumeDraft",
  "inbox.bookMeeting", "inbox.stopSequence", "inbox.setOutboundFilter",
];

const CONV_KEY = "conv-1";

function listItem(over: Record<string, unknown> = {}) {
  return {
    key: CONV_KEY,
    lane: "attention",
    priority: 1,
    subject: "Following up on the demo",
    contactId: "ct-1",
    displayName: "Marie Dubois",
    fromAddress: "marie@ems.ch",
    snippet: "Thanks for the call",
    reason: "Replied to your sequence",
    reasonSource: "reply",
    slaHoursOverdue: null,
    importanceTier: 1,
    importanceFactors: [],
    labels: [],
    handledNote: null,
    lastInboundAt: "2026-06-17T10:00:00.000Z",
    lastMessageAt: "2026-06-17T10:00:00.000Z",
    messageCount: 2,
    hasIntelligence: false,
    mailboxId: "mb-1",
    mailboxAddress: "me@acme.com",
    mailboxLabel: "Work",
    ...over,
  };
}

const FIXTURE_LIST = {
  conversations: [listItem()],
  counts: { attention: 1, snoozed: 0, done: 0, handled: 0, outbound: 0 },
  pagination: { total: 1 },
  mailboxConnected: true,
  mailboxes: [],
  selectedMailbox: null,
};

// Detail with a contact (so bookMeeting works) and an enrollment (so
// stopSequence has something to stop).
const FIXTURE_DETAIL = {
  conversation: {
    ...listItem(),
    messages: [
      { id: "m1", direction: "inbound", from: "marie@ems.ch", to: "me@acme.com", subject: "Following up on the demo", body: "Thanks for the call, can we talk pricing?", at: "2026-06-17T10:00:00.000Z", status: null, stepNumber: null },
    ],
    intelligence: null,
  },
  contact: { id: "ct-1", name: "Marie Dubois", email: "marie@ems.ch" },
  enrollment: { id: "enr-1", sequenceId: "seq-9", sequenceName: "Q3 push", status: "active" },
  preparedDraft: null,
  nextAction: null,
  lastInteraction: null,
  actionItems: [],
  entities: { amounts: [], dates: [], phones: [] },
};

let fetchMock: ReturnType<typeof vi.fn>;

let listResponse: () => Response = () => jsonRes(FIXTURE_LIST);
let detailResponse: () => Response = () => jsonRes(FIXTURE_DETAIL);
let triageResponse: () => Response = () => jsonRes({ ok: true });
let suggestReplyResponse: () => Response = () =>
  jsonRes({ replies: [{ tone: "brief", subject: "Re: Following up on the demo", body: "Happy to walk you through pricing." }] });
let enrollResponse: () => Response = () => jsonRes({ ok: true });
let composeReplyResponse: () => Response = () => jsonRes({ subject: "Re: Following up on the demo", text: "Just floating this back up — keen to hear your thoughts." });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/inbox/conversations/detail")) return detailResponse();
  if (u.startsWith("/api/inbox/conversations")) return listResponse();
  if (u === "/api/inbox/compose/reply" && method === "POST") return composeReplyResponse();
  if (u === "/api/inbox/triage" && method === "POST") return triageResponse();
  if (u === "/api/emails/suggest-reply" && method === "POST") return suggestReplyResponse();
  if (/^\/api\/sequences\/[^/]+\/enroll$/.test(u) && method === "PUT") return enrollResponse();
  if (u.startsWith("/api/inbox")) return jsonRes({ emails: [], counts: { total: 0, replied: 0, awaiting: 0, bounced: 0 }, pagination: { total: 0 } });
  if (u.startsWith("/api/collision")) return jsonRes({});
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  // matchMedia is touched by some shared UI on mount; stub it so render never throws.
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  render(<InboxPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  listResponse = () => jsonRes(FIXTURE_LIST);
  detailResponse = () => jsonRes(FIXTURE_DETAIL);
  triageResponse = () => jsonRes({ ok: true });
  suggestReplyResponse = () =>
    jsonRes({ replies: [{ tone: "brief", subject: "Re: Following up on the demo", body: "Happy to walk you through pricing." }] });
  enrollResponse = () => jsonRes({ ok: true });
  composeReplyResponse = () => jsonRes({ subject: "Re: Following up on the demo", text: "Just floating this back up — keen to hear your thoughts." });
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

/** Mount the inbox and wait until its actions are registered, then flush the
 *  pending fetches so the list loads. The inbox no longer auto-selects the first
 *  row (Upstream full-width-list-first), so we OPEN the conversation explicitly
 *  (click its row) — that mounts the pane + loads its detail (populating paneApiRef). */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("inbox.triageDone");
  });
  await flush();
  await act(async () => {
    const row = document.querySelector("[data-conversation-key]") as HTMLElement | null;
    if (row) fireEvent.click(row);
  });
  await flush();
}

describe("CLE-14 /inbox — manifest membership + metadata", () => {
  it("registers exactly the eleven inbox actions", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());
  });

  it("declares the right scalars per action", async () => {
    await mountLoaded();
    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("inbox.triageDone").confirm).toBe("risky");
    expect(by("inbox.triageDone").mutating).toBe(true);
    expect(by("inbox.triageDone").reversible).toBe(true);
    expect(by("inbox.snooze").confirm).toBe("risky");
    expect(by("inbox.reopen").confirm).toBe("risky");

    expect(by("inbox.selectConversation").mutating).toBe(false);
    expect(by("inbox.selectConversation").confirm).toBe("never");
    expect(by("inbox.setLane").mutating).toBe(false);
    expect(by("inbox.setLane").confirm).toBe("never");
    expect(by("inbox.switchMailbox").confirm).toBe("never");

    // Reply/draft/book/stop are NOT outbound — the human sends via the composer.
    expect(by("inbox.reply").outbound).toBe(false);
    expect(by("inbox.reply").cost).toBe("credits");
    expect(by("inbox.reply").confirm).toBe("never");
    expect(by("inbox.reply").mutating).toBe(false);
    expect(by("inbox.consumeDraft").outbound).toBe(false);
    expect(by("inbox.consumeDraft").cost).toBe("free");
    expect(by("inbox.bookMeeting").outbound).toBe(false);
    expect(by("inbox.bookMeeting").confirm).toBe("never");

    expect(by("inbox.stopSequence").mutating).toBe(true);
    expect(by("inbox.stopSequence").confirm).toBe("risky");

    expect(by("inbox.setOutboundFilter").confirm).toBe("never");
    expect(by("inbox.setOutboundFilter").reversible).toBe(true);

    // No inbox action triggers an external send (no agent-send path).
    expect(getActionManifest().some((a) => a.outbound)).toBe(false);
  });
});

describe("CLE-14 /inbox — triage actions (POST /api/inbox/triage)", () => {
  it("triageDone POSTs action 'done'", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.triageDone", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    const posts = callsTo("/api/inbox/triage");
    expect(posts.length).toBe(1);
    expect(bodyOf(posts[0])).toMatchObject({ conversationKey: CONV_KEY, action: "done" });
  });

  it("reopen POSTs action 'reopen'", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.reopen", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/inbox/triage")[0])).toMatchObject({ action: "reopen" });
  });

  it("snooze with a future time POSTs action 'snooze'; a past/now time -> ok:false NO POST", async () => {
    await mountLoaded();
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const r = await runRegisteredAction("inbox.snooze", { conversationKey: CONV_KEY, until: future });
    await flush();
    expect(r.ok).toBe(true);
    const posts = callsTo("/api/inbox/triage");
    expect(posts.length).toBe(1);
    expect(bodyOf(posts[0])).toMatchObject({ action: "snooze" });

    const past = await runRegisteredAction("inbox.snooze", { conversationKey: CONV_KEY, until: new Date(Date.now() - 3600 * 1000).toISOString() });
    expect(past.ok).toBe(false);
    expect(past.error).toContain("future");
    expect(callsTo("/api/inbox/triage").length).toBe(1); // unchanged

    const bad = await runRegisteredAction("inbox.snooze", { conversationKey: CONV_KEY, until: "not-a-date" });
    expect(bad.ok).toBe(false);
    expect(callsTo("/api/inbox/triage").length).toBe(1); // unchanged
  });
});

describe("CLE-14 /inbox — selection / lane / mailbox (instant, no network)", () => {
  it("selectConversation selects a listed thread; unknown key -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.selectConversation", { conversationKey: CONV_KEY });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Marie Dubois");

    const miss = await runRegisteredAction("inbox.selectConversation", { conversationKey: "ghost" });
    expect(miss.ok).toBe(false);
    expect(miss.error).toContain("not in the current list");
  });

  it("setLane switches the tab; switchMailbox accepts an id or null", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.setLane", { lane: "done" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("done");

    const mb = await runRegisteredAction("inbox.switchMailbox", { mailboxId: "mb-1" });
    expect(mb.ok).toBe(true);
    const all = await runRegisteredAction("inbox.switchMailbox", { mailboxId: null });
    expect(all.ok).toBe(true);

    const bad = await runRegisteredAction("inbox.setLane", { lane: "bogus" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
  });
});

describe("CLE-14 /inbox — reply opens the composer, NEVER sends", () => {
  it("reply opens the composer (suggest-reply) and fires NO triage/send", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.reply", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("composer");
    // The reply was drafted via suggest-reply (no prepared draft in the fixture).
    expect(callsTo("/api/emails/suggest-reply").length).toBe(1);
    // Crucially: nothing was sent or triaged by drafting a reply.
    expect(callsTo("/api/inbox/triage").length).toBe(0);
    expect(fetchMock.mock.calls.some((c) => {
      const u = String(c[0]);
      const m = c[1]?.method ?? "GET";
      return u.includes("/api/email/send") || u.includes("/api/send") || (u === "/api/emails" && m === "POST");
    })).toBe(false);
  });

  it("consumeDraft uses the prepared draft when present (no suggest-reply call)", async () => {
    detailResponse = () =>
      jsonRes({ ...FIXTURE_DETAIL, preparedDraft: { id: "dr-1", subject: "Re: demo", body: "Prepared body." } });
    await mountLoaded();
    const r = await runRegisteredAction("inbox.consumeDraft", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("draft");
    expect(callsTo("/api/emails/suggest-reply").length).toBe(0);
    expect(callsTo("/api/inbox/triage").length).toBe(0);
  });
});

describe("CLE-14 /inbox — bookMeeting + stopSequence (lifted pane handlers)", () => {
  it("bookMeeting opens the scheduler (no booking POST until the human confirms)", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.bookMeeting", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("scheduler");
    // Opening the scheduler must not book anything on its own.
    expect(callsTo("/api/meetings/book").length).toBe(0);
  });

  it("stopSequence PUTs enroll {enrollmentId,status:'completed'} on the enrollment's sequence", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("inbox.stopSequence", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(true);
    const put = callsTo(/^\/api\/sequences\/seq-9\/enroll$/, "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toMatchObject({ enrollmentId: "enr-1", status: "completed" });
  });

  it("stopSequence with no enrollment -> ok:false, NO PUT", async () => {
    detailResponse = () => jsonRes({ ...FIXTURE_DETAIL, enrollment: null });
    await mountLoaded();
    const r = await runRegisteredAction("inbox.stopSequence", { conversationKey: CONV_KEY });
    await flush();
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No active sequence");
    expect(callsTo(/^\/api\/sequences\/[^/]+\/enroll$/, "PUT").length).toBe(0);
  });
});

describe("F3 /inbox — pane error vs missing (B5)", () => {
  it("a failed detail fetch shows the pane error + Retry, not 'no longer available'", async () => {
    detailResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    expect(await screen.findByText("Impossible de charger cette conversation.")).toBeTruthy();
    expect(screen.getByText("Réessayer")).toBeTruthy();
    expect(screen.queryByText("Cette conversation n'est plus disponible.")).toBeNull();
  });

  it("a resolved-but-absent detail shows 'no longer available' (missing, not error)", async () => {
    detailResponse = () => jsonRes(null);
    await mountLoaded();
    expect(await screen.findByText("Cette conversation n'est plus disponible.")).toBeTruthy();
    expect(screen.queryByText("Impossible de charger cette conversation.")).toBeNull();
  });

  it("pane Retry re-fetches and recovers the thread", async () => {
    detailResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    const retry = await screen.findByText("Réessayer");
    detailResponse = () => jsonRes(FIXTURE_DETAIL);
    fireEvent.click(retry);
    await flush();
    expect(screen.queryByText("Impossible de charger cette conversation.")).toBeNull();
    expect(screen.getByText(/can we talk pricing/)).toBeTruthy(); // thread body rendered
  });
});

describe("F3 /inbox — list error state (B3)", () => {
  it("a failed list load shows the error EmptyState + Retry, not a misleading empty lane", async () => {
    listResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    expect(await screen.findByText("Impossible de charger ce dossier")).toBeTruthy();
    expect(screen.getByText("Réessayer")).toBeTruthy();
    // The lane's resting empty copy must NOT be what the user sees on a failure.
    expect(screen.queryByText("Rien ne requiert votre attention")).toBeNull();
  });

  it("Retry re-requests and recovers on success", async () => {
    listResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    const retry = await screen.findByText("Réessayer");
    listResponse = () => jsonRes(FIXTURE_LIST); // the next load succeeds
    fireEvent.click(retry);
    await flush();
    expect(screen.queryByText("Impossible de charger ce dossier")).toBeNull();
    expect(screen.getAllByText("Marie Dubois").length).toBeGreaterThan(0); // rows are back
  });
});

describe("B7 /inbox — Generate nudge affordance (B3.2)", () => {
  const dueFollowup = { dueAt: Date.parse("2026-06-15T09:00:00.000Z"), stage: 1, overdue: true, daysUntilDue: 0, businessDaysOverdue: 3 };

  it("shows Generate nudge on a due awaiting-their-reply thread and POSTs mode:nudge (never sends)", async () => {
    detailResponse = () =>
      jsonRes({ ...FIXTURE_DETAIL, conversation: { ...FIXTURE_DETAIL.conversation, followup: dueFollowup } });
    await mountLoaded();
    // Generate nudge now lives in the "⋮ More" overflow (Upstream-clean toolbar).
    fireEvent.click(await screen.findByText("Plus"));
    const btn = await screen.findByText("Générer une relance");
    fireEvent.click(btn);
    await flush();
    // Robust against any auto-draft (which POSTs without a mode): count only nudge posts.
    const nudgePosts = callsTo("/api/inbox/compose/reply").filter((c) => bodyOf(c).mode === "nudge");
    expect(nudgePosts.length).toBe(1);
    expect(bodyOf(nudgePosts[0])).toMatchObject({ key: CONV_KEY, mode: "nudge" });
    // Drafting a nudge sends/triages nothing.
    expect(callsTo("/api/inbox/triage").length).toBe(0);
  });

  it("hides Generate nudge when the thread has no due follow-up", async () => {
    await mountLoaded(); // default detail carries no followup
    expect(screen.queryByText("Générer une relance")).toBeNull();
  });
});

describe("CLE-14 /inbox — outbound filter (child mounts on the outbound tab)", () => {
  it("off the outbound lane the filter action degrades cleanly; on it, it applies", async () => {
    await mountLoaded();
    // The OutboundTable is unmounted on the attention lane -> friendly refusal.
    const off = await runRegisteredAction("inbox.setOutboundFilter", { filter: "replied" });
    expect(off.ok).toBe(false);
    expect(off.error).toContain("outbound lane");

    // Switch to the outbound lane; the OutboundTable mounts and registers its handle.
    await runRegisteredAction("inbox.setLane", { lane: "outbound" });
    await flush();
    const on = await runRegisteredAction("inbox.setOutboundFilter", { filter: "replied" });
    expect(on.ok).toBe(true);
    expect(on.summary).toContain("replied");
  });
});

describe("CLE-14 /inbox — off-page degradation", () => {
  it("after unmount the inbox.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("inbox.triageDone");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("inbox.triageDone");
    const r = await runRegisteredAction("inbox.triageDone", { conversationKey: CONV_KEY });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});

describe("/inbox — stays fresh while open (sync-on-open)", () => {
  it("force-pulls new mail (POST /api/email/sync) when the inbox opens", async () => {
    await mountLoaded();
    // The open inbox triggers an ingest-only force sync so IMAP/custom mailboxes
    // (no push) stay fresh like a classic mail client, instead of waiting for the cron.
    expect(callsTo("/api/email/sync", "POST").length).toBeGreaterThanOrEqual(1);
  });
});
