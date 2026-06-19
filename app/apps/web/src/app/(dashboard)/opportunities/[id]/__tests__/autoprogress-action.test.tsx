// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/** CLE-06 — the /opportunities/[id] detail page registers exactly the
 *  autoProgress action and reuses the page's apply-suggestion handler. */

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
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

const deal = {
  id: "d1", name: "Acme Deal", stage: "lead", value: 1000, projectAmount: null, platformArr: null,
  summary: null, expectedCloseDate: null, properties: null, companyName: "Acme", companyId: "c1",
  ownerId: null, ownerName: null,
};

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}
function errRes() {
  return { ok: false, status: 500, json: async () => ({}), text: async () => "{}" } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

// The /auto-progress endpoint is POST for BOTH compute (body {}) and apply
// (body {apply:true}); the page reads the suggestion from the compute call.
// `dealOk:false` keeps the page on its safe "Deal not found" render (the full
// detail tree needs far more fixtures than this action test cares about), while
// fetchIntel still populates the suggestion ref the action reads.
function makeRouter(
  suggestion: { next: string; reason: string; confidence: string } | null,
  dealOk = true,
) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u === "/api/opportunities/d1/auto-progress" && method === "POST") {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return body.apply ? jsonRes({ ok: true }) : jsonRes({ suggestion, currentStage: "lead" });
    }
    if (u === "/api/opportunities/d1") return dealOk ? jsonRes({ deal }) : errRes();
    if (u === "/api/deals/d1") return jsonRes({ deal: { ...deal, contactId: null } });
    return jsonRes({});
  };
}

/** auto-progress POSTs whose body actually applies the suggestion (not compute). */
function applyPosts() {
  return fetchMock.mock.calls.filter(
    (c) =>
      String(c[0]) === "/api/opportunities/d1/auto-progress" &&
      c[1]?.method === "POST" &&
      JSON.parse((c[1].body as string) || "{}").apply === true,
  );
}

function mountDetail(suggestion: { next: string; reason: string; confidence: string } | null, dealOk = true) {
  const router = makeRouter(suggestion, dealOk);
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  render(<DealDetailPage />);
}

beforeEach(() => __resetPageActionsForTest());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CLE-06 /opportunities/[id] — autoProgress", () => {
  it("registers exactly the autoProgress action", async () => {
    mountDetail({ next: "demo", reason: "3 meetings", confidence: "high" });
    await waitFor(() => expect(getActionManifest().map((a) => a.id)).toEqual(["opportunities.autoProgress"]));
    expect(getActionManifest()[0].confirm).toBe("risky");
  });

  it("applies the suggestion -> POSTs auto-progress {apply:true}", async () => {
    mountDetail({ next: "demo", reason: "3 meetings", confidence: "high" }, false);
    // Wait for fetchIntel's compute POST to be issued, then flush so setSuggestion
    // lands in suggestionRef (DOM-independent: the ref mirror runs before any
    // loading early-return).
    // Flush until the compute POST's response sets `suggestion` into the ref.
    for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const r = await runRegisteredAction("opportunities.autoProgress", { dealId: "d1", apply: true });
    expect(r.ok).toBe(true);
    expect(applyPosts()).toHaveLength(1);
  });

  it("a wrong dealId is rejected without applying", async () => {
    mountDetail({ next: "demo", reason: "x", confidence: "low" });
    const r = await runRegisteredAction("opportunities.autoProgress", { dealId: "other", apply: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not the one open here");
    expect(applyPosts()).toHaveLength(0);
  });

  it("no current suggestion -> graceful error, no apply", async () => {
    mountDetail(null);
    const r = await runRegisteredAction("opportunities.autoProgress", { dealId: "d1", apply: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no stage suggestion");
    expect(applyPosts()).toHaveLength(0);
  });
});
