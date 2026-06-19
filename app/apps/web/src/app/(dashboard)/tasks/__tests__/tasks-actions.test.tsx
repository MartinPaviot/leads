// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-14 — the /tasks page registers exactly its five page actions and reuses
 * the page's OWN extracted handlers (createTask / setTaskStatus / setTaskPriority
 * and the filter/sort setters), so the agent path and the button path issue one
 * identical request each. Assert manifest membership + metadata, each run's
 * network body, the empty-title / unknown-id guards (no POST), and off-page
 * degradation.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/tasks",
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

import TasksPage from "@/app/(dashboard)/tasks/page";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "tasks.addTask", "tasks.toggleComplete", "tasks.cyclePriority",
  "tasks.setFilter", "tasks.setSort",
];

const FIXTURE_TASKS = [
  { id: "t1", title: "Call Marie", description: null, dueDate: null, status: "pending", priority: "medium", entityType: null, entityId: null },
  { id: "t2", title: "Send proposal", description: null, dueDate: null, status: "completed", priority: "high", entityType: null, entityId: null },
];

let fetchMock: ReturnType<typeof vi.fn>;

// Per-test overridable responses for the endpoints whose status the tests vary.
let createResponse: () => Response = () => jsonRes({ task: { id: "tNew" } }, true, 201);
let patchResponse: () => Response = () => jsonRes({ ok: true });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/tasks" && method === "GET") return jsonRes({ tasks: FIXTURE_TASKS });
  if (u === "/api/tasks" && method === "POST") return createResponse();
  if (/^\/api\/tasks\/[^/]+$/.test(u) && method === "PATCH") return patchResponse();
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<TasksPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  createResponse = () => jsonRes({ task: { id: "tNew" } }, true, 201);
  patchResponse = () => jsonRes({ ok: true });
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

/** Mount the page and wait until its actions are registered + tasks loaded. */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("tasks.addTask");
  });
  await flush();
}

describe("CLE-14 /tasks — manifest membership + metadata", () => {
  it("registers exactly the five task actions with the right scalars", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("tasks.addTask").confirm).toBe("risky");
    expect(by("tasks.addTask").mutating).toBe(true);
    expect(by("tasks.addTask").reversible).toBe(true);
    expect(by("tasks.addTask").cost).toBe("free");
    expect(by("tasks.addTask").outbound).toBe(false);

    expect(by("tasks.toggleComplete").confirm).toBe("risky");
    expect(by("tasks.toggleComplete").mutating).toBe(true);
    expect(by("tasks.cyclePriority").confirm).toBe("risky");
    expect(by("tasks.cyclePriority").mutating).toBe(true);

    expect(by("tasks.setFilter").confirm).toBe("never");
    expect(by("tasks.setFilter").mutating).toBe(false);
    expect(by("tasks.setSort").confirm).toBe("never");
    expect(by("tasks.setSort").mutating).toBe(false);

    // No action declares cost:"money" or outbound.
    expect(m.some((a) => a.cost === "money")).toBe(false);
    expect(m.some((a) => a.outbound)).toBe(false);
  });
});

describe("CLE-14 /tasks — addTask (POST behind confirm:risky)", () => {
  it("POSTs title + priority then reloads; empty title -> ok:false NO POST", async () => {
    await mountLoaded();
    const before = callsTo("/api/tasks").length;
    const r = await runRegisteredAction("tasks.addTask", { title: "  Ring Jean  ", priority: "high" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Ring Jean");
    const posts = callsTo("/api/tasks");
    expect(posts.length).toBe(before + 1);
    expect(bodyOf(posts[posts.length - 1])).toEqual({ title: "Ring Jean", priority: "high" });

    const empty = await runRegisteredAction("tasks.addTask", { title: "   " });
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/tasks").length).toBe(before + 1); // no extra POST
  });

  it("defaults priority to medium when omitted", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("tasks.addTask", { title: "Plain" });
    expect(r.ok).toBe(true);
    const posts = callsTo("/api/tasks");
    expect(bodyOf(posts[posts.length - 1])).toEqual({ title: "Plain", priority: "medium" });
  });

  it("server reject -> ok:false", async () => {
    createResponse = () => jsonRes({ error: "boom" }, false, 500);
    await mountLoaded();
    const r = await runRegisteredAction("tasks.addTask", { title: "x" });
    expect(r.ok).toBe(false);
    expect(callsTo("/api/tasks").length).toBe(1); // POST still fired once
  });
});

describe("CLE-14 /tasks — toggleComplete (E-1 lookup + PATCH status)", () => {
  it("toggles a pending task to completed; explicit completed flag honoured", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("tasks.toggleComplete", { taskId: "t1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("done");
    const patch = callsTo(/^\/api\/tasks\/t1$/, "PATCH");
    expect(patch.length).toBe(1);
    expect(bodyOf(patch[0])).toEqual({ status: "completed" });

    const reopen = await runRegisteredAction("tasks.toggleComplete", { taskId: "t2", completed: false });
    expect(reopen.ok).toBe(true);
    expect(reopen.summary).toContain("Reopened");
    const p2 = callsTo(/^\/api\/tasks\/t2$/, "PATCH");
    expect(bodyOf(p2[0])).toEqual({ status: "pending" });
  });

  it("E-1: unknown task id -> ok:false, NO network", async () => {
    await mountLoaded();
    const before = fetchMock.mock.calls.length;
    const r = await runRegisteredAction("tasks.toggleComplete", { taskId: "ghost" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not in the current list");
    expect(fetchMock.mock.calls.length).toBe(before); // no PATCH
  });
});

describe("CLE-14 /tasks — cyclePriority (E-1 lookup + PATCH priority)", () => {
  it("cycles medium -> high and PATCHes; unknown id -> ok:false no PATCH", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("tasks.cyclePriority", { taskId: "t1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("high");
    const patch = callsTo(/^\/api\/tasks\/t1$/, "PATCH");
    expect(patch.length).toBe(1);
    expect(bodyOf(patch[0])).toEqual({ priority: "high" });

    const before = callsTo(/^\/api\/tasks\//, "PATCH").length;
    const miss = await runRegisteredAction("tasks.cyclePriority", { taskId: "ghost" });
    expect(miss.ok).toBe(false);
    expect(callsTo(/^\/api\/tasks\//, "PATCH").length).toBe(before);
  });
});

describe("CLE-14 /tasks — filter / sort (instant, no network)", () => {
  it("setFilter and setSort succeed without any fetch", async () => {
    await mountLoaded();
    const before = fetchMock.mock.calls.length;
    const f = await runRegisteredAction("tasks.setFilter", { filter: "overdue" });
    expect(f.ok).toBe(true);
    expect(f.summary).toContain("overdue");
    const s = await runRegisteredAction("tasks.setSort", { sort: "due_date" });
    expect(s.ok).toBe(true);
    expect(s.summary).toContain("due_date");
    expect(fetchMock.mock.calls.length).toBe(before); // pure view changes

    const bad = await runRegisteredAction("tasks.setFilter", { filter: "bogus" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
  });
});

describe("CLE-14 /tasks — off-page degradation", () => {
  it("after unmount the tasks.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("tasks.addTask");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("tasks.addTask");
    const r = await runRegisteredAction("tasks.addTask", { title: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
