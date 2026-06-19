// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-15 — the /opportunities list page activates the highlight feature: it
 * registers an entity locator for the "opportunities" scope (so the chat can
 * pulse a deal row/card), and moveStage opts the moved deal into a post-run
 * highlight via data.highlight. Purely additive to CLE-06.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "d1" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/opportunities",
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

import OpportunitiesPage from "@/app/(dashboard)/opportunities/page";
import {
  runRegisteredAction,
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

const fixtureDeal = {
  id: "d1", name: "Acme", stage: "lead", value: 1000,
  companyId: null, companyDomain: null, contactId: null, ownerId: null, summary: null,
  expectedCloseDate: null, properties: null, companyName: null,
  ownerFirstName: null, ownerLastName: null, createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

const analytics = {
  totalDeals: 1, activeDeals: 1, totalPipelineValue: 1000, wonValue: 0, wonCount: 0,
  lostCount: 0, winRate: 0, avgDealValue: 1000, avgVelocityDays: 0,
  valueByStage: {}, funnel: [], riskSummary: { high: 0, medium: 0, low: 0, none: 0 },
};

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function route(url: string, init?: RequestInit): Response | Promise<Response> {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/opportunities") && method === "GET") return jsonRes({ deals: [fixtureDeal] });
  if (u === "/api/pipeline/analytics") return jsonRes(analytics);
  if (u.startsWith("/api/deals/") && method === "PUT") return jsonRes({ ok: true });
  if (u.startsWith("/api/forecast")) return jsonRes({ scenarios: [], topDeals: [], riskFactors: [], simulationCount: 0, computedAt: "" });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  __resetEntityLocatorsForTest();
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(route(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  render(<OpportunitiesPage />);
  await waitFor(() => expect(screen.getByText("Acme")).toBeTruthy());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CLE-15 /opportunities — entity locator", () => {
  it("registers an 'opportunities' locator that resolves a mounted deal to its row element", () => {
    const el = locateEntity({ entityId: "d1", scope: "opportunities" });
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-cle-entity")).toBe("d1");
  });

  it("resolves null for a deal that is not on the page (never throws)", () => {
    expect(locateEntity({ entityId: "ghost", scope: "opportunities" })).toBeNull();
  });
});

describe("CLE-15 /opportunities — moveStage result highlight", () => {
  // The close-reason branches return ok synchronously after the PUT (they do not
  // re-read the optimistic-render mirror), so they are the deterministic place to
  // assert the highlight payload in jsdom.
  it("a Won move with a reason carries data.highlight for the deal (field 'stage')", async () => {
    let r!: Awaited<ReturnType<typeof runRegisteredAction>>;
    await act(async () => {
      r = await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "won", closeReason: { reason: "product_fit" } });
    });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string; scope: string; field?: string } }).highlight).toMatchObject({
      entityId: "d1", scope: "opportunities", field: "stage",
    });
  });

  it("a Lost move with a reason carries data.highlight for the deal", async () => {
    let r!: Awaited<ReturnType<typeof runRegisteredAction>>;
    await act(async () => {
      r = await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "lost", closeReason: { reason: "price" } });
    });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string } }).highlight.entityId).toBe("d1");
  });
});
