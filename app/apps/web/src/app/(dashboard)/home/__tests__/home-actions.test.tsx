// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /home page registers exactly three page actions and reuses the
 * children's OWN handlers (parity by construction): the <UpNextView> reply
 * composer + row navigation (lifted via an imperative handle) and the
 * "not a lead" verdict (a page-level second caller posting the SAME request the
 * Hot inbounds widget's X button posts). The agent path and the button path are
 * one identical network copy.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
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

import DashboardPage from "@/app/(dashboard)/home/page";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = ["home.replyNeedsYou", "home.openItem", "home.notALead"];

// Up-next feed: a reply todo (opens composer), a non-reply todo with an href
// (navigates), and an actualite with an href (navigates).
const FIXTURE_UP_NEXT = {
  greeting: "Good morning",
  firstName: "Martin",
  kpis: [],
  actualites: [
    { id: "a1", kind: "reply", title: "Reply from Marie", detail: null, at: null, href: "/contacts/c9" },
    { id: "a-nohref", kind: "open", title: "Email opened", detail: null, at: null, href: null },
  ],
  todos: [
    { id: "t1", kind: "reply", tone: "reply", title: "Marie Dubois", subtitle: "Pricing question", why: "Awaiting your reply", stakes: null, entityId: null, contactId: "c1", conversationKey: "k1", toAddress: "marie@ems.ch", href: null },
    { id: "t2", kind: "deal_risk", tone: "risk", title: "Acme deal at risk", subtitle: null, why: "No activity 14d", stakes: null, entityId: "d2", contactId: null, conversationKey: null, toAddress: null, href: "/opportunities/d2" },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
let leadFeedbackResponse: () => Response = () => jsonRes({ ok: true });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/home/up-next") return jsonRes(FIXTURE_UP_NEXT);
  if (u === "/api/home/hydrate") return jsonRes({ onboarding: { needsOnboarding: false } });
  if (u === "/api/onboarding/status") return jsonRes({ needsOnboarding: false });
  if (u.startsWith("/api/dashboard/hot-inbounds")) return jsonRes({ items: [] });
  if (u.startsWith("/api/dashboard/hot-visitors")) return jsonRes({ items: [] });
  if (/^\/api\/contacts\/[^/]+\/lead-feedback$/.test(u) && method === "POST") return leadFeedbackResponse();
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<DashboardPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  leadFeedbackResponse = () => jsonRes({ ok: true });
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

/** Mount and wait until the actions are registered AND the up-next feed loaded
 *  (so the imperative handle is populated with todos/actualites). */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("home.replyNeedsYou");
  });
  // Wait for the feed fetch so the imperative handle sees the fixture.
  await waitFor(() => {
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/home/up-next")).toBe(true);
  });
  await flush();
}

describe("CLE-14 /home — manifest membership + metadata", () => {
  it("registers exactly the three home actions with the right scalars", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("home.replyNeedsYou").mutating).toBe(false);
    expect(by("home.replyNeedsYou").confirm).toBe("never");

    expect(by("home.openItem").mutating).toBe(false);
    expect(by("home.openItem").confirm).toBe("never");

    expect(by("home.notALead").mutating).toBe(true);
    expect(by("home.notALead").reversible).toBe(true);
    expect(by("home.notALead").confirm).toBe("risky");

    // No action is outbound or spends money.
    expect(m.some((a) => a.outbound)).toBe(false);
    expect(m.some((a) => a.cost === "money")).toBe(false);
  });
});

describe("CLE-14 /home — replyNeedsYou (opens the composer)", () => {
  it("a reply todo -> ok:true with the subject; non-reply / unknown -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("home.replyNeedsYou", { todoId: "t1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Pricing question");

    const notReply = await runRegisteredAction("home.replyNeedsYou", { todoId: "t2" });
    expect(notReply.ok).toBe(false);

    const ghost = await runRegisteredAction("home.replyNeedsYou", { todoId: "nope" });
    expect(ghost.ok).toBe(false);
  });
});

describe("CLE-14 /home — openItem (router.push the row href)", () => {
  it("a todo with an href navigates; an actualite navigates; unknown / no-href -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("home.openItem", { id: "t2", kind: "todo" });
    expect(r.ok).toBe(true);
    expect(routerPush).toHaveBeenCalledWith("/opportunities/d2");

    routerPush.mockClear();
    const a = await runRegisteredAction("home.openItem", { id: "a1", kind: "actualite" });
    expect(a.ok).toBe(true);
    expect(routerPush).toHaveBeenCalledWith("/contacts/c9");

    routerPush.mockClear();
    const ghost = await runRegisteredAction("home.openItem", { id: "zzz", kind: "todo" });
    expect(ghost.ok).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();

    const noHref = await runRegisteredAction("home.openItem", { id: "a-nohref", kind: "actualite" });
    expect(noHref.ok).toBe(false);
  });
});

describe("CLE-14 /home — notALead (second REST caller, widget-independent)", () => {
  it("POSTs /api/contacts/:id/lead-feedback {isLead:false}; server reject -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("home.notALead", { contactId: "c1" });
    expect(r.ok).toBe(true);
    const posts = callsTo(/^\/api\/contacts\/c1\/lead-feedback$/);
    expect(posts.length).toBe(1);
    expect(bodyOf(posts[0])).toEqual({ isLead: false });

    leadFeedbackResponse = () => jsonRes({ error: "nope" }, false, 500);
    const bad = await runRegisteredAction("home.notALead", { contactId: "c2" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("feedback");
  });
});

describe("CLE-14 /home — off-page degradation", () => {
  it("after unmount the home.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("home.replyNeedsYou");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("home.replyNeedsYou");
    const r = await runRegisteredAction("home.replyNeedsYou", { todoId: "t1" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
