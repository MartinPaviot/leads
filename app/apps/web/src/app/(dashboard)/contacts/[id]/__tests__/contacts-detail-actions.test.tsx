// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-08 — the /contacts/[id] detail page registers exactly the seven detail
 * actions and reuses the page's extracted handlers (updateField, the lifted
 * startCallResult, reassignContactOwner) + the call-intel review REST contract.
 * The human-bound contract is asserted: `call` navigates (does NOT auto-dial),
 * `sendEmail` opens the composer (does NOT POST a send).
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
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}
function errRes(code?: string) {
  return { ok: false, status: 400, json: async () => (code ? { code } : {}), text: async () => "{}" } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let callStartResponse: () => Response = () => jsonRes({ ok: true });

const DETAIL_IDS = [
  "contacts.updateField", "contacts.reassignOwner", "contacts.call", "contacts.sendEmail",
  "contacts.suggestReply", "contacts.approveCallIntel", "contacts.dismissCallIntel",
];

function makeContact(over: Record<string, unknown> = {}) {
  return {
    id: "c1", firstName: "Jane", lastName: "Doe", email: "jane@acme.com", title: "VP",
    phone: "+15550100", linkedinUrl: null, companyId: null, ownerId: null, properties: {}, ...over,
  };
}

const INBOUND_ACTIVITY = {
  id: "act1", activityType: "email_inbound", channel: "email", direction: "inbound",
  summary: "Question about pricing", occurredAt: new Date().toISOString(), metadata: {},
};

function makeRouter(contact: Record<string, unknown>, activities: unknown[] = []) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u === "/api/contacts/c1" && method === "GET") return jsonRes({ contact });
    if (u === "/api/contacts/c1" && method === "PUT") return jsonRes({ contact });
    if (u.startsWith("/api/activities")) return jsonRes({ activities });
    if (u.startsWith("/api/contacts/c1/buyer-intent")) return jsonRes({ score: null });
    if (u === "/api/calls/start" && method === "POST") return callStartResponse();
    if (u === "/api/call-intel/review" && method === "POST") return jsonRes({ ok: true });
    if (u.startsWith("/api/settings/members")) return jsonRes({ members: [] });
    if (u.startsWith("/api/calls")) return jsonRes({ calls: [] });
    return jsonRes({});
  };
}

function mountDetail(contact: Record<string, unknown>, activities: unknown[] = []) {
  const router = makeRouter(contact, activities);
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<ContactDetailPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  callStartResponse = () => jsonRes({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function callsTo(url: string, method = "POST") {
  return fetchMock.mock.calls.filter((c) => String(c[0]) === url && (c[1]?.method ?? "GET") === method);
}
function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
async function flush() {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("CLE-08 /contacts/[id] — manifest", () => {
  it("registers exactly the seven detail actions; list-only ids absent", async () => {
    mountDetail(makeContact());
    await waitFor(() => {
      const ids = getActionManifest().map((a) => a.id).sort();
      expect(ids).toEqual([...DETAIL_IDS].sort());
    });
    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;
    expect(by("contacts.call").confirm).toBe("always");
    expect(by("contacts.call").outbound).toBe(true);
    expect(by("contacts.call").reversible).toBe(false);
    expect(by("contacts.updateField").confirm).toBe("risky");
    expect(by("contacts.sendEmail").mutating).toBe(false);
    expect(by("contacts.sendEmail").confirm).toBe("never");
    expect(getActionManifest().map((a) => a.id)).not.toContain("contacts.bulkDelete");
  });
});

describe("CLE-08 /contacts/[id] — updateField + reassignOwner", () => {
  it("updateField PUTs one field; invalid email -> ok:false no PUT; wrong id -> ok:false; bad field schema-rejected", async () => {
    mountDetail(makeContact());
    await flush();
    const r = await runRegisteredAction("contacts.updateField", { id: "c1", field: "title", value: "VP Sales" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/contacts/c1", "PUT").at(-1)!)).toEqual({ title: "VP Sales" });

    const before = callsTo("/api/contacts/c1", "PUT").length;
    const badEmail = await runRegisteredAction("contacts.updateField", { id: "c1", field: "email", value: "not-an-email" });
    expect(badEmail.ok).toBe(false);
    expect(badEmail.error).toContain("valid email");
    expect(callsTo("/api/contacts/c1", "PUT").length).toBe(before); // no PUT

    const wrong = await runRegisteredAction("contacts.updateField", { id: "other", field: "title", value: "x" });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toContain("not the one open here");

    const badField = await runRegisteredAction("contacts.updateField", { id: "c1", field: "bogus", value: "x" });
    expect(badField.ok).toBe(false);
    expect(badField.error).toBe("invalid_params");
  });

  it("reassignOwner PUTs ownerId (and null un-assigns); wrong id -> ok:false", async () => {
    mountDetail(makeContact());
    await flush();
    await runRegisteredAction("contacts.reassignOwner", { id: "c1", ownerId: "u1" });
    expect(bodyOf(callsTo("/api/contacts/c1", "PUT").at(-1)!)).toEqual({ ownerId: "u1" });
    await runRegisteredAction("contacts.reassignOwner", { id: "c1", ownerId: null });
    expect(bodyOf(callsTo("/api/contacts/c1", "PUT").at(-1)!)).toEqual({ ownerId: null });
    const wrong = await runRegisteredAction("contacts.reassignOwner", { id: "other", ownerId: "u1" });
    expect(wrong.ok).toBe(false);
  });
});

describe("CLE-08 /contacts/[id] — REQUIRED call (outbound, navigates, no auto-dial)", () => {
  it("call POSTs /api/calls/start then navigates to /call-mode; server code -> ok:false no nav; wrong id -> ok:false", async () => {
    mountDetail(makeContact());
    await flush();
    routerPush.mockClear();
    const r = await runRegisteredAction("contacts.call", { id: "c1" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/calls/start")[0])).toEqual({ contactId: "c1" });
    // It NAVIGATES to call-mode; it does NOT drive a live WebRTC dial.
    expect(routerPush).toHaveBeenCalledWith("/call-mode");

    // server rejection (no_phone) -> ok:false, no further navigation
    cleanup();
    __resetPageActionsForTest();
    callStartResponse = () => errRes("no_phone");
    mountDetail(makeContact());
    await flush();
    routerPush.mockClear();
    const nop = await runRegisteredAction("contacts.call", { id: "c1" });
    expect(nop.ok).toBe(false);
    expect(nop.error).toContain("no phone number");
    expect(routerPush).not.toHaveBeenCalled();

    const wrong = await runRegisteredAction("contacts.call", { id: "other" });
    expect(wrong.ok).toBe(false);
  });
});

describe("CLE-08 /contacts/[id] — sendEmail + suggestReply (open composer, no send)", () => {
  it("sendEmail opens the composer and does NOT POST a send; no email -> ok:false; wrong id -> ok:false", async () => {
    mountDetail(makeContact());
    await flush();
    const r = await runRegisteredAction("contacts.sendEmail", { id: "c1", draft: { subject: "Hi" } });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("composer");
    // No send endpoint is hit by the action — the user sends from the composer.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/email") || String(c[0]).includes("/api/send"))).toBe(false);

    const wrong = await runRegisteredAction("contacts.sendEmail", { id: "other" });
    expect(wrong.ok).toBe(false);

    cleanup();
    __resetPageActionsForTest();
    mountDetail(makeContact({ email: null }));
    await flush();
    const noEmail = await runRegisteredAction("contacts.sendEmail", { id: "c1" });
    expect(noEmail.ok).toBe(false);
    expect(noEmail.error).toContain("no email");
  });

  it("suggestReply opens a reply from an inbound activity; unknown activity -> ok:false", async () => {
    mountDetail(makeContact(), [INBOUND_ACTIVITY]);
    await flush();
    const r = await runRegisteredAction("contacts.suggestReply", { id: "c1", activityId: "act1" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("reply");

    const unknown = await runRegisteredAction("contacts.suggestReply", { id: "c1", activityId: "ghost" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("activity");
  });
});

describe("CLE-08 /contacts/[id] — approveCallIntel / dismissCallIntel", () => {
  it("POSTs the review when pending; no pending -> ok:false, no POST", async () => {
    // No pending proposal
    mountDetail(makeContact({ properties: {} }));
    await flush();
    const none = await runRegisteredAction("contacts.approveCallIntel", { id: "c1" });
    expect(none.ok).toBe(false);
    expect(none.error).toContain("no pending call-intel");
    expect(callsTo("/api/call-intel/review").length).toBe(0);

    // Pending proposal present
    cleanup();
    __resetPageActionsForTest();
    mountDetail(makeContact({ properties: { pendingCallProfile: { role: "Buyer" } } }));
    await flush();
    const ok = await runRegisteredAction("contacts.approveCallIntel", { id: "c1" });
    expect(ok.ok).toBe(true);
    expect(bodyOf(callsTo("/api/call-intel/review")[0])).toMatchObject({ entityType: "contact", entityId: "c1", action: "approve" });

    const dis = await runRegisteredAction("contacts.dismissCallIntel", { id: "c1" });
    expect(dis.ok).toBe(true);
    expect(callsTo("/api/call-intel/review").some((c) => bodyOf(c).action === "dismiss")).toBe(true);
  });
});
