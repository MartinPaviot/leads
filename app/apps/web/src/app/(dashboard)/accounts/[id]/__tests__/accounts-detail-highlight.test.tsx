// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-15 — the /accounts/[id] detail page header carries data-cle-entity so
 * openRecord's navigate.highlight can pulse the record on landing, and it
 * registers an "accounts" locator that resolves the open account id to that
 * header. Purely additive to CLE-07.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "acc1" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/accounts/acc1",
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import AccountDetailPage from "@/app/(dashboard)/accounts/[id]/page";
import {
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

const account = {
  id: "acc1", name: "Acme", domain: "acme.com", industry: "Software",
  size: "50-100", revenue: "$10M", description: "desc", score: 80,
  scoreReasons: [], ownerId: null, properties: {},
};

function router(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/accounts/acc1" && method === "GET") return jsonRes({ account, deals: [] });
  if (u.startsWith("/api/contacts")) return jsonRes({ contacts: [] });
  if (u.startsWith("/api/research/dossier")) return jsonRes({});
  return jsonRes({});
}

function mountDetail() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<AccountDetailPage />);
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

describe("CLE-15 /accounts/[id] — header anchor + locator", () => {
  it("the header carries data-cle-entity and the 'accounts' locator resolves params.id to it", async () => {
    mountDetail();
    await flush();
    await waitFor(() => {
      const el = locateEntity({ entityId: "acc1", scope: "accounts" });
      expect(el).toBeTruthy();
      expect(el!.getAttribute("data-cle-entity")).toBe("acc1");
    });
  });

  it("resolves null for an account id that is not the open record (never throws)", async () => {
    mountDetail();
    await flush();
    expect(locateEntity({ entityId: "other", scope: "accounts" })).toBeNull();
  });
});
