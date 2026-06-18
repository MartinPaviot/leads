// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-15 — the /contacts/[id] detail page activates the highlight feature: its
 * header carries data-cle-entity (so openRecord's navigate.highlight can pulse
 * the record on landing), it registers a "contacts" locator that resolves the
 * open contact id, and updateField opts the edited contact into a post-run
 * highlight via data.highlight. Purely additive to CLE-08.
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: "c1" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/contacts/c1",
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

import ContactDetailPage from "@/app/(dashboard)/contacts/[id]/page";
import {
  runRegisteredAction,
  locateEntity,
  __resetPageActionsForTest,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function makeContact(over: Record<string, unknown> = {}) {
  return {
    id: "c1", firstName: "Jane", lastName: "Doe", email: "jane@acme.com", title: "VP",
    phone: "+15550100", linkedinUrl: null, companyId: null, ownerId: null, properties: {}, ...over,
  };
}

function makeRouter(contact: Record<string, unknown>) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u === "/api/contacts/c1" && method === "GET") return jsonRes({ contact });
    if (u === "/api/contacts/c1" && method === "PUT") return jsonRes({ contact });
    if (u.startsWith("/api/activities")) return jsonRes({ activities: [] });
    if (u.startsWith("/api/contacts/c1/buyer-intent")) return jsonRes({ score: null });
    if (u.startsWith("/api/settings/members")) return jsonRes({ members: [] });
    if (u.startsWith("/api/calls")) return jsonRes({ calls: [] });
    return jsonRes({});
  };
}

function mountDetail(contact: Record<string, unknown>) {
  const router = makeRouter(contact);
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<ContactDetailPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  __resetEntityLocatorsForTest();
  routerPush.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("CLE-15 /contacts/[id] — header anchor + locator", () => {
  it("the header carries data-cle-entity and the 'contacts' locator resolves params.id to it", async () => {
    mountDetail(makeContact());
    await flush();
    await waitFor(() => {
      const el = locateEntity({ entityId: "c1", scope: "contacts" });
      expect(el).toBeTruthy();
      expect(el!.getAttribute("data-cle-entity")).toBe("c1");
    });
  });

  it("resolves null for a contact id that is not the open record (never throws)", async () => {
    mountDetail(makeContact());
    await flush();
    expect(locateEntity({ entityId: "other", scope: "contacts" })).toBeNull();
  });
});

describe("CLE-15 /contacts/[id] — updateField result highlight", () => {
  it("a successful field edit carries data.highlight for the open contact", async () => {
    mountDetail(makeContact());
    await flush();
    const r = await runRegisteredAction("contacts.updateField", { id: "c1", field: "title", value: "VP Sales" });
    expect(r.ok).toBe(true);
    expect((r.data as { highlight: { entityId: string; scope: string; field?: string } }).highlight).toMatchObject({
      entityId: "c1", scope: "contacts", field: "title",
    });
  });
});
