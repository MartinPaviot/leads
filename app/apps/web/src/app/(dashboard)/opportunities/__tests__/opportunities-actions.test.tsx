// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

/**
 * CLE-06 — the registered /opportunities page actions, exercised against the
 * REAL mounted page through the live registry. Network is asserted via a routed
 * fetch spy (deterministic); the close-reason gate via the run's own return.
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
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

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

function route(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/opportunities") && u.includes("/restore")) return jsonRes({ restored: 1 });
  if (u.startsWith("/api/opportunities") && method === "GET") return jsonRes({ deals: [fixtureDeal] });
  if (u.startsWith("/api/opportunities") && method === "POST") return jsonRes({ id: "new" });
  if (u.match(/\/api\/opportunities\/[^/]+$/) && method === "DELETE") return jsonRes({ cascaded: {} });
  if (u === "/api/opportunities/related-counts") return jsonRes({ counts: {} });
  if (u === "/api/pipeline/analytics") return jsonRes(analytics);
  if (u.startsWith("/api/deals/") && method === "PUT") return jsonRes({ ok: true });
  if (u === "/api/deals/analyze") return jsonRes({ ok: true });
  if (u.startsWith("/api/forecast")) return jsonRes({ scenarios: [], topDeals: [], riskFactors: [], simulationCount: 0, computedAt: "" });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(route(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  render(<OpportunitiesPage />);
  await waitFor(() => expect(screen.getByText("Acme")).toBeTruthy());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function putBody() {
  const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/deals/d1" && c[1]?.method === "PUT");
  return call ? JSON.parse(call[1].body as string) : null;
}

describe("CLE-06 /opportunities — manifest + metadata", () => {
  it("registers the list actions with correct policy metadata; autoProgress is NOT here", () => {
    const m = getActionManifest();
    const ids = m.map((a) => a.id);
    for (const id of [
      "opportunities.moveStage", "opportunities.createDeal", "opportunities.applyFilter",
      "opportunities.setView", "opportunities.delete", "opportunities.restore", "opportunities.analyzePipeline",
    ]) expect(ids).toContain(id);
    expect(ids).not.toContain("opportunities.autoProgress"); // detail-only

    const by = (id: string) => m.find((a) => a.id === id)!;
    expect(by("opportunities.delete").confirm).toBe("always");
    expect(by("opportunities.applyFilter").confirm).toBe("never");
    expect(by("opportunities.applyFilter").mutating).toBe(false);
    expect(by("opportunities.moveStage").confirm).toBe("risky");
    expect(by("opportunities.moveStage").reversible).toBe(true);
    expect(by("opportunities.analyzePipeline").mutating).toBe(true);
  });
});

describe("CLE-06 /opportunities — run behaviour (reuses the page handlers)", () => {
  it("moveStage (non-closing) PUTs the new stage", async () => {
    await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "demo" });
    expect(putBody()).toMatchObject({ stage: "demo" });
  });

  it("REQUIRED — moveStage to Won without a reason opens the gate and does NOT commit", async () => {
    const r = await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "won" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("close_reason_required"); // not a silent success
    expect(putBody()).toBeNull(); // no PUT issued; the dialog was opened for the human
  });

  it("moveStage to Won WITH a reason commits with the close reason", async () => {
    await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "won", closeReason: { reason: "product_fit" } });
    expect(putBody()).toMatchObject({ stage: "won", closeReason: { reason: "product_fit", note: null } });
  });

  it("moveStage Won with reason=other but no note is rejected", async () => {
    const r = await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "won", closeReason: { reason: "other" } });
    expect(r.ok).toBe(false);
    expect(putBody()).toBeNull();
  });

  it("createDeal POSTs the mapped body (accountId -> companyId, default stage lead)", async () => {
    await runRegisteredAction("opportunities.createDeal", { name: "Beta", accountId: "acc1" });
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/opportunities" && c[1]?.method === "POST");
    expect(JSON.parse(call![1].body as string)).toMatchObject({ name: "Beta", companyId: "acc1", stage: "lead" });
  });

  it("delete DELETEs with the cascade list", async () => {
    await runRegisteredAction("opportunities.delete", { dealId: "d1", cascade: ["notes"] });
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/opportunities/d1" && c[1]?.method === "DELETE");
    expect(JSON.parse(call![1].body as string)).toEqual({ cascade: ["notes"] });
  });

  it("restore POSTs the id to /restore", async () => {
    await runRegisteredAction("opportunities.restore", { dealId: "d1" });
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/opportunities/restore");
    expect(JSON.parse(call![1].body as string)).toEqual({ ids: ["d1"] });
  });

  it("analyzePipeline defaults to the loaded deal ids", async () => {
    await runRegisteredAction("opportunities.analyzePipeline", {});
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/deals/analyze");
    expect(JSON.parse(call![1].body as string)).toEqual({ dealIds: ["d1"] });
  });

  it("applyFilter is read-only and reports the resulting count", async () => {
    const r = await runRegisteredAction("opportunities.applyFilter", { stage: "lead" });
    expect(r.ok).toBe(true);
    expect((r.data as { count: number }).count).toBe(1); // the fixture deal is in lead
    const r0 = await runRegisteredAction("opportunities.applyFilter", { stage: "won" });
    expect((r0.data as { count: number }).count).toBe(0);
    expect(r0.summary).toContain("No deals match");
  });

  it("setView switches layout and returns ok", async () => {
    expect((await runRegisteredAction("opportunities.setView", { view: "table" })).summary).toContain("table");
  });

  it("edge guards: unknown deal, unknown stage, same-stage", async () => {
    expect((await runRegisteredAction("opportunities.moveStage", { dealId: "ghost", stage: "demo" })).error).toContain("not in the current view");
    expect((await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "zzz" })).error).toContain("Unknown stage");
    const same = await runRegisteredAction("opportunities.moveStage", { dealId: "d1", stage: "lead" });
    expect(same.ok).toBe(true);
    expect(same.summary).toContain("already in lead");
  });
});
