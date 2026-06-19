// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-07 — the /accounts/[id] detail page registers exactly the six detail
 * actions and reuses the page's extracted handlers / the lifted CompanyDossier
 * callback / the call-intel review REST contract.
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
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}
function errRes() {
  return { ok: false, status: 500, json: async () => ({}), text: async () => "{}" } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

const DETAIL_IDS = [
  "accounts.updateField", "accounts.reassignOwner", "accounts.refreshSummary",
  "accounts.generateDossier", "accounts.approveCallIntel", "accounts.dismissCallIntel",
];

// `accountOk:false` keeps the page on its safe "Account not found" render (the
// full detail tree needs more fixtures than these action tests care about),
// while the registered actions + refs still populate from the GET response.
function makeAccount(over: Record<string, unknown> = {}) {
  return {
    id: "acc1", name: "Acme", domain: "acme.com", industry: "Software",
    size: "50-100", revenue: "$10M", description: "desc", score: 80,
    scoreReasons: [], ownerId: null, properties: {}, ...over,
  };
}

function makeRouter(account: Record<string, unknown> | null, accountOk = true) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u === "/api/accounts/acc1" && method === "GET")
      return accountOk ? jsonRes({ account, deals: [] }) : errRes();
    if (u === "/api/accounts/acc1" && method === "PUT") return jsonRes({ ok: true });
    if (u === "/api/accounts/acc1/generate-summary" && method === "POST")
      return jsonRes({ ai_account_summary: "s", ai_how_they_make_money: "m" });
    if (u.startsWith("/api/contacts")) return jsonRes({ contacts: [] });
    if (u === "/api/research/dossier" && method === "POST") return jsonRes({ ok: true });
    if (u.startsWith("/api/research/dossier")) return jsonRes({}); // GET poll -> no dossier
    if (u === "/api/call-intel/review" && method === "POST") return jsonRes({ ok: true });
    return jsonRes({});
  };
}

function mountDetail(account: Record<string, unknown> | null, accountOk = false) {
  const router = makeRouter(account, accountOk);
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  render(<AccountDetailPage />);
}

beforeEach(() => __resetPageActionsForTest());
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

describe("CLE-07 /accounts/[id] — manifest", () => {
  it("registers exactly the six detail actions; list-only ids absent", async () => {
    mountDetail(makeAccount());
    await waitFor(() => {
      const ids = getActionManifest().map((a) => a.id).sort();
      expect(ids).toEqual([...DETAIL_IDS].sort());
    });
    const m = getActionManifest();
    for (const a of m) expect(a.confirm).toBe("risky");
    expect(getActionManifest().map((a) => a.id)).not.toContain("accounts.bulkDelete");
  });
});

describe("CLE-07 /accounts/[id] — run behaviour", () => {
  it("updateField PUTs one field; wrong account rejected; bad field schema-rejected", async () => {
    mountDetail(makeAccount());
    await flush();
    const r = await runRegisteredAction("accounts.updateField", { accountId: "acc1", field: "size", value: "200-500" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/accounts/acc1", "PUT")[0])).toEqual({ size: "200-500" });

    const wrong = await runRegisteredAction("accounts.updateField", { accountId: "other", field: "size", value: "x" });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toContain("not the one open here");

    const bad = await runRegisteredAction("accounts.updateField", { accountId: "acc1", field: "bogus", value: "x" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
  });

  it("reassignOwner PUTs ownerId (and null un-assigns)", async () => {
    mountDetail(makeAccount());
    await flush();
    await runRegisteredAction("accounts.reassignOwner", { accountId: "acc1", ownerId: "u1" });
    expect(bodyOf(callsTo("/api/accounts/acc1", "PUT").at(-1)!)).toEqual({ ownerId: "u1" });
    await runRegisteredAction("accounts.reassignOwner", { accountId: "acc1", ownerId: null });
    expect(bodyOf(callsTo("/api/accounts/acc1", "PUT").at(-1)!)).toEqual({ ownerId: null });
  });

  it("refreshSummary POSTs generate-summary; wrong id rejected", async () => {
    mountDetail(makeAccount());
    await flush();
    const r = await runRegisteredAction("accounts.refreshSummary", { accountId: "acc1" });
    expect(r.ok).toBe(true);
    expect(callsTo("/api/accounts/acc1/generate-summary").length).toBe(1);
    const wrong = await runRegisteredAction("accounts.refreshSummary", { accountId: "other" });
    expect(wrong.ok).toBe(false);
  });

  it("generateDossier: with a domain drives the card's own POST; no domain -> ok:false, no POST", async () => {
    // The dossier card only registers its api once it has mounted, which on this
    // page happens only on the FULL render (accountOk:true).
    mountDetail(makeAccount({ domain: "acme.com" }), true);
    await flush();
    const r = await runRegisteredAction("accounts.generateDossier", { accountId: "acc1" });
    expect(r.ok).toBe(true);
    expect(callsTo("/api/research/dossier").length).toBe(1);

    cleanup();
    __resetPageActionsForTest();
    mountDetail(makeAccount({ domain: null }), true);
    await flush();
    const nd = await runRegisteredAction("accounts.generateDossier", { accountId: "acc1" });
    expect(nd.ok).toBe(false);
    expect(nd.error).toContain("no domain");
    expect(callsTo("/api/research/dossier", "POST").length).toBe(0);
  });

  it("approveCallIntel/dismissCallIntel POST review when pending; no pending -> ok:false, no POST", async () => {
    // No pending intel (accountOk:true so the account lands in accountRef)
    mountDetail(makeAccount({ properties: {} }), true);
    await flush();
    const none = await runRegisteredAction("accounts.approveCallIntel", { accountId: "acc1" });
    expect(none.ok).toBe(false);
    expect(none.error).toContain("no pending call intel");
    expect(callsTo("/api/call-intel/review").length).toBe(0);

    cleanup();
    __resetPageActionsForTest();
    // Pending intel present
    mountDetail(makeAccount({ properties: { pendingCallIntel: { stack: ["x"] } } }), true);
    await flush();
    const ok = await runRegisteredAction("accounts.approveCallIntel", { accountId: "acc1" });
    expect(ok.ok).toBe(true);
    const call = callsTo("/api/call-intel/review")[0];
    expect(bodyOf(call)).toMatchObject({ entityType: "company", entityId: "acc1", action: "approve" });

    const dis = await runRegisteredAction("accounts.dismissCallIntel", { accountId: "acc1" });
    expect(dis.ok).toBe(true);
    expect(callsTo("/api/call-intel/review").some((c) => bodyOf(c).action === "dismiss")).toBe(true);
  });
});
