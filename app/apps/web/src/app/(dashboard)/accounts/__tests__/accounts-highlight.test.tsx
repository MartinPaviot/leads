// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

/**
 * CLE-15 — the /accounts list page activates the highlight feature: it registers
 * an entity locator for the "accounts" scope, and the single-row enrich / score
 * / exclude actions opt the affected account into a post-run highlight via
 * data.highlight. Purely additive to CLE-07.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/accounts",
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
const tamStart = vi.fn();
const enrichStart = vi.fn();
vi.mock("@/hooks/use-tam-stream", () => ({
  useTamStream: () => ({
    rows: new Map(), rowOrder: [], terminated: null, isRunning: false,
    progress: {}, strategies: [], summary: null, errors: [],
    start: tamStart, cancel: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-enrich-stream", () => ({
  useEnrichStream: () => ({
    cells: new Map(), isRunning: false, processed: 0, total: 0,
    terminated: null, summary: null, start: enrichStart,
  }),
}));

import AccountsPage from "@/app/(dashboard)/accounts/page";
import {
  runRegisteredAction,
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

const acc = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: "Acme " + id, domain: id + ".com",
  industry: "Software", size: "50-100", revenue: "$10M", description: "desc",
  score: 80, scoreReasons: [], properties: { source: "tam" }, lastInteraction: null, ...over,
});

const FIXTURE = [acc("a1"), acc("a2")];

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function route(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/accounts?") && u.includes("idsOnly=true")) return jsonRes({ ids: ["a1", "a2"], total: 2 });
  if (u.startsWith("/api/accounts?") && method === "GET")
    return jsonRes({ accounts: FIXTURE, pagination: { page: 1, pageSize: 200, total: 2, totalPages: 1, hasMore: false } });
  if (u === "/api/icps") return jsonRes({ icps: [] });
  if (u === "/api/custom-signals") return jsonRes({ signals: [] });
  if (u.startsWith("/api/tam/proposals")) return jsonRes({ counts: { pending: 0 } });
  if (u.startsWith("/api/warm-paths")) return jsonRes({ pathsByCompany: {} });
  if (u === "/api/score") return jsonRes({ ok: true });
  if (u === "/api/accounts/exclude") return jsonRes({ ok: true });
  if (u === "/api/accounts/related-counts") return jsonRes({ counts: {} });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  __resetEntityLocatorsForTest();
  tamStart.mockClear();
  enrichStart.mockClear();
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(route(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<AccountsPage />);
  await waitFor(() => expect(screen.getAllByText(/Acme a1/).length).toBeGreaterThan(0));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CLE-15 /accounts — entity locator", () => {
  it("registers an 'accounts' locator that resolves a mounted account to its row element", () => {
    const el = locateEntity({ entityId: "a1", scope: "accounts" });
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-cle-entity")).toBe("a1");
  });

  it("resolves null for an account not on the page (never throws)", () => {
    expect(locateEntity({ entityId: "ghost", scope: "accounts" })).toBeNull();
  });
});

describe("CLE-15 /accounts — single-row result highlights", () => {
  it("enrichAccount carries data.highlight for the enriched account", async () => {
    const r = await runRegisteredAction("accounts.enrichAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string; scope: string } }).highlight).toMatchObject({ entityId: "a1", scope: "accounts" });
  });

  it("scoreAccount carries data.highlight (field 'score') for the scored account", async () => {
    const r = await runRegisteredAction("accounts.scoreAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string; field?: string } }).highlight).toMatchObject({ entityId: "a1", field: "score" });
  });

  it("excludeAccount carries data.highlight for the excluded account", async () => {
    const r = await runRegisteredAction("accounts.excludeAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string } }).highlight.entityId).toBe("a1");
  });
});
