// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /knowledge page registers exactly its four page actions and reuses
 * the page's OWN extracted result-returning helpers (createEntry / saveEntryFields
 * / deleteEntryResult) plus the search setter. The throwing UI handlers still wrap
 * those same helpers, so the agent path and the button/child path issue one
 * identical request each. Assert manifest membership + metadata (deleteEntry is
 * confirm:"always" + reversible:false), each run's network URL+body, and off-page
 * degradation.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/knowledge",
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

import KnowledgePage from "@/app/(dashboard)/knowledge/page";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "knowledge.addEntry", "knowledge.saveEntry", "knowledge.deleteEntry", "knowledge.search",
];

const FIXTURE_ENTRIES = [
  { id: "k1", title: "ICP", content: "mid-market", scope: "workspace", category: "icp", isEditable: true, isStale: false, createdAt: null, updatedAt: null },
  { id: "k2", title: "Objections", content: "price", scope: "user", category: "objections", isEditable: true, isStale: false, createdAt: null, updatedAt: null },
];

let fetchMock: ReturnType<typeof vi.fn>;

// Per-test overridable responses for the endpoints whose status the tests vary.
let postResponse: () => Response = () => jsonRes({ entry: { id: "kNew" } }, true, 201);
let putResponse: () => Response = () => jsonRes({ ok: true });
let deleteResponse: () => Response = () => jsonRes({ ok: true });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/settings/knowledge" && method === "GET") return jsonRes({ knowledge: FIXTURE_ENTRIES });
  if (u === "/api/settings/knowledge" && method === "POST") return postResponse();
  if (u === "/api/settings/knowledge" && method === "PUT") return putResponse();
  if (u.startsWith("/api/settings/knowledge?") && method === "DELETE") return deleteResponse();
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<KnowledgePage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  postResponse = () => jsonRes({ entry: { id: "kNew" } }, true, 201);
  putResponse = () => jsonRes({ ok: true });
  deleteResponse = () => jsonRes({ ok: true });
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

/** Mount the page and wait until its actions are registered + entries loaded. */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("knowledge.addEntry");
  });
  await flush();
}

describe("CLE-14 /knowledge — manifest membership + metadata", () => {
  it("registers exactly the four knowledge actions with the right scalars", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("knowledge.addEntry").confirm).toBe("risky");
    expect(by("knowledge.addEntry").mutating).toBe(true);
    expect(by("knowledge.addEntry").reversible).toBe(true);

    expect(by("knowledge.saveEntry").confirm).toBe("risky");
    expect(by("knowledge.saveEntry").mutating).toBe(true);

    expect(by("knowledge.deleteEntry").confirm).toBe("always");
    expect(by("knowledge.deleteEntry").reversible).toBe(false);
    expect(by("knowledge.deleteEntry").mutating).toBe(true);

    expect(by("knowledge.search").confirm).toBe("never");
    expect(by("knowledge.search").mutating).toBe(false);

    expect(m.some((a) => a.cost === "money")).toBe(false);
    expect(m.some((a) => a.outbound)).toBe(false);
  });
});

describe("CLE-14 /knowledge — addEntry (POST + defaults)", () => {
  it("POSTs trimmed title with default scope/category", async () => {
    await mountLoaded();
    const before = callsTo("/api/settings/knowledge").length;
    const r = await runRegisteredAction("knowledge.addEntry", { title: "  Pricing  ", content: "tiers" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Pricing");
    const posts = callsTo("/api/settings/knowledge");
    expect(posts.length).toBe(before + 1);
    expect(bodyOf(posts[posts.length - 1])).toEqual({
      title: "Pricing", content: "tiers", scope: "workspace", category: "general",
    });
  });

  it("honours explicit scope/category; server reject -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("knowledge.addEntry", { title: "X", content: "y", scope: "user", category: "product" });
    expect(r.ok).toBe(true);
    const posts = callsTo("/api/settings/knowledge");
    expect(bodyOf(posts[posts.length - 1])).toEqual({ title: "X", content: "y", scope: "user", category: "product" });

    postResponse = () => jsonRes({ error: "dup" }, false, 409);
    const bad = await runRegisteredAction("knowledge.addEntry", { title: "Z", content: "z" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("dup");
  });
});

describe("CLE-14 /knowledge — saveEntry (PUT id + fields)", () => {
  it("PUTs the id with only the supplied fields", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("knowledge.saveEntry", { id: "k1", title: "ICP v2", category: "icp" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Saved");
    const put = callsTo("/api/settings/knowledge", "PUT");
    expect(put.length).toBe(1);
    expect(bodyOf(put[0])).toEqual({ id: "k1", title: "ICP v2", category: "icp" });
  });

  it("server reject -> ok:false", async () => {
    putResponse = () => jsonRes({}, false, 500);
    await mountLoaded();
    const r = await runRegisteredAction("knowledge.saveEntry", { id: "k1", content: "new" });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/settings/knowledge", "PUT").length).toBe(1);
  });
});

describe("CLE-14 /knowledge — deleteEntry (DELETE id, confirm:always)", () => {
  it("DELETEs the id query param; server reject -> ok:false", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("knowledge.deleteEntry", { id: "k2" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Deleted");
    expect(callsTo(/^\/api\/settings\/knowledge\?id=k2$/, "DELETE").length).toBe(1);

    deleteResponse = () => jsonRes({}, false, 500);
    const bad = await runRegisteredAction("knowledge.deleteEntry", { id: "k1" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("delete");
  });
});

describe("CLE-14 /knowledge — search (instant, no network)", () => {
  it("sets the query; empty query says cleared; no fetch", async () => {
    await mountLoaded();
    const before = fetchMock.mock.calls.length;
    const r = await runRegisteredAction("knowledge.search", { query: "objection" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("objection");
    const cleared = await runRegisteredAction("knowledge.search", { query: "   " });
    expect(cleared.ok).toBe(true);
    expect(cleared.summary).toContain("Cleared");
    expect(fetchMock.mock.calls.length).toBe(before); // pure view change
  });
});

describe("CLE-14 /knowledge — off-page degradation", () => {
  it("after unmount the knowledge.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("knowledge.addEntry");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("knowledge.addEntry");
    const r = await runRegisteredAction("knowledge.addEntry", { title: "x", content: "y" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
