// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-15 — the /opportunities/[id] detail page header carries data-cle-entity so
 * openRecord's navigate.highlight can pulse the record on landing, and it
 * registers an "opportunities" locator that resolves the open deal id to that
 * header. Purely additive to CLE-06.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "d1" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/opportunities/d1",
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import DealDetailPage from "@/app/(dashboard)/opportunities/[id]/page";
import {
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

const deal = {
  id: "d1", name: "Acme Deal", stage: "lead", value: 1000, projectAmount: null, platformArr: null,
  summary: null, expectedCloseDate: null, properties: null, companyName: "Acme", companyId: "c1",
  ownerId: null, ownerName: null,
};

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function router(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/opportunities/d1/auto-progress" && method === "POST") return jsonRes({ suggestion: null, currentStage: "lead" });
  if (u === "/api/opportunities/d1/timeline") return jsonRes({ narrative: [] });
  if (u === "/api/opportunities/d1/health") return jsonRes(null);
  if (u === "/api/opportunities/d1") return jsonRes({ deal, timeline: [] });
  if (u === "/api/deals/d1/score") return jsonRes({ probability: 0.5, topFactors: [], modelSource: "stage", trainedAt: null, sampleSize: 0 });
  if (u === "/api/deals/d1") return jsonRes({ deal: { ...deal, contactId: null } });
  if (u.startsWith("/api/deals/at-risk")) return jsonRes({ predictions: [] });
  return jsonRes({});
}

function mountDetail() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  render(<DealDetailPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  __resetEntityLocatorsForTest();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("CLE-15 /opportunities/[id] — header anchor + locator", () => {
  it("the header carries data-cle-entity and the 'opportunities' locator resolves params.id to it", async () => {
    mountDetail();
    await flush();
    await waitFor(() => {
      const el = locateEntity({ entityId: "d1", scope: "opportunities" });
      expect(el).toBeTruthy();
      expect(el!.getAttribute("data-cle-entity")).toBe("d1");
    });
  });

  it("resolves null for a deal id that is not the open record (never throws)", async () => {
    mountDetail();
    await flush();
    expect(locateEntity({ entityId: "other", scope: "opportunities" })).toBeNull();
  });
});
