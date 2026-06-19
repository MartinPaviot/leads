// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

/**
 * CLE-15 — the /contacts list page activates the highlight feature by
 * registering an entity locator for the "contacts" scope so the chat can pulse a
 * contact row. Purely additive to CLE-08. The contacts detail page is covered in
 * contacts-detail-highlight.test.tsx.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/contacts",
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

import ContactsPage from "@/app/(dashboard)/contacts/page";
import {
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

const ct = (id: string, over: Record<string, unknown> = {}) => ({
  id, firstName: "Person", lastName: id, email: id + "@acme.com", title: "CTO",
  phone: null, linkedinUrl: null, companyId: null, companyName: "Acme", companyDomain: "acme.com",
  companyIndustry: "Software", score: 80, scoreReasons: [], properties: {}, lastInteraction: null, ...over,
});

const FIXTURE = [ct("c1"), ct("c2")];

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function route(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/contacts?") && method === "GET")
    return jsonRes({ contacts: FIXTURE, pagination: { page: 1, pageSize: 200, total: 2, totalPages: 1, hasMore: false } });
  if (u === "/api/import/history") return jsonRes({ imports: [] });
  if (u === "/api/contacts/related-counts") return jsonRes({ counts: {} });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  __resetEntityLocatorsForTest();
  routerPush.mockClear();
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(route(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<ContactsPage />);
  await waitFor(() => expect(screen.getAllByText(/Person c1/).length).toBeGreaterThan(0));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CLE-15 /contacts — entity locator", () => {
  it("registers a 'contacts' locator that resolves a mounted contact to its row element", () => {
    const el = locateEntity({ entityId: "c1", scope: "contacts" });
    expect(el).toBeTruthy();
    expect(el!.getAttribute("data-cle-entity")).toBe("c1");
  });

  it("resolves null for a contact not on the page (never throws)", () => {
    expect(locateEntity({ entityId: "ghost", scope: "contacts" })).toBeNull();
  });
});
