// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-08 — the registered /contacts list page actions, exercised against the
 * REAL mounted page through the live registry. Network is asserted via a routed
 * fetch spy (deterministic). The cost / human-bound guardrails are cross-checked
 * against the real decideAction and the absence of any upload fetch.
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
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";
import { decideAction } from "@/lib/guardrails/decide-action";

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

// 2 loaded rows but a larger total so selectAll resolves the full id set via
// ?idsOnly=true (lib/infra/select-all-matching).
let idsOnlyResponse: { ids: string[]; total: number } = { ids: ["c1", "c2", "c3", "c4"], total: 4 };
let listTotal = 4;

function route(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u.startsWith("/api/contacts?") && u.includes("idsOnly=true")) return jsonRes(idsOnlyResponse);
  if (u.startsWith("/api/contacts?") && method === "GET")
    return jsonRes({ contacts: FIXTURE, pagination: { page: 1, pageSize: 200, total: listTotal, totalPages: 1, hasMore: false } });
  if (u === "/api/contacts" && method === "POST") return jsonRes({ id: "new1" });
  if (u === "/api/import/history") return jsonRes({ imports: [] });
  if (u === "/api/enrich-contacts" && method === "POST") return jsonRes({ ok: true });
  if (u === "/api/contacts/fullenrich-enrich" && method === "POST") return jsonRes({ requested: 4 });
  if (u === "/api/contacts/restore" && method === "POST") return jsonRes({ restored: 4 });
  if (u === "/api/contacts/related-counts") return jsonRes({ counts: {} });
  if (u === "/api/score-contacts" && method === "POST") return jsonRes({ scored: 818 });
  if (u.startsWith("/api/contacts/") && method === "DELETE") return jsonRes({ cascaded: {} });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  routerPush.mockClear();
  idsOnlyResponse = { ids: ["c1", "c2", "c3", "c4"], total: 4 };
  listTotal = 4;
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

function callsTo(url: string, method = "POST") {
  return fetchMock.mock.calls.filter((c) => String(c[0]) === url && (c[1]?.method ?? "GET") === method);
}
function deleteCalls() {
  return fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/contacts/") && (c[1]?.method ?? "GET") === "DELETE");
}
function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}

const LIST_IDS = [
  "contacts.applyFilter", "contacts.smartSearch", "contacts.selectAll",
  "contacts.bulkEnrich", "contacts.bulkFindMobile", "contacts.bulkMerge",
  "contacts.bulkDelete", "contacts.bulkRestore", "contacts.scoreAll",
  "contacts.createContact", "contacts.openImport", "contacts.openSmartImport",
];
const DETAIL_IDS = [
  "contacts.updateField", "contacts.reassignOwner", "contacts.call", "contacts.sendEmail",
  "contacts.suggestReply", "contacts.approveCallIntel", "contacts.dismissCallIntel",
];

describe("CLE-08 /contacts — manifest + metadata", () => {
  it("registers every list action with the correct cost/confirm metadata; detail ids absent", () => {
    const m = getActionManifest();
    const ids = m.map((a) => a.id);
    for (const id of LIST_IDS) expect(ids).toContain(id);
    for (const id of DETAIL_IDS) expect(ids).not.toContain(id);

    const by = (id: string) => m.find((a) => a.id === id)!;
    // Credit spenders
    expect(by("contacts.bulkEnrich").cost).toBe("credits");
    expect(by("contacts.bulkEnrich").confirm).toBe("risky");
    expect(by("contacts.bulkFindMobile").cost).toBe("credits");
    expect(by("contacts.bulkFindMobile").confirm).toBe("risky");
    // Destructive = always confirm
    expect(by("contacts.bulkDelete").confirm).toBe("always");
    // Read-only / nav = never confirm, non-mutating
    for (const id of ["contacts.applyFilter", "contacts.smartSearch", "contacts.selectAll", "contacts.openImport", "contacts.openSmartImport"]) {
      expect(by(id).confirm).toBe("never");
      expect(by(id).mutating).toBe(false);
    }
    // scoreAll is a mutating tenant-wide run
    expect(by("contacts.scoreAll").mutating).toBe(true);
    expect(by("contacts.scoreAll").confirm).toBe("risky");
    // bulkMerge navigates but is risky
    expect(by("contacts.bulkMerge").confirm).toBe("risky");
    expect(by("contacts.bulkMerge").mutating).toBe(false);
    // The rest = risky
    for (const id of ["contacts.bulkRestore", "contacts.createContact"]) {
      expect(by(id).confirm).toBe("risky");
    }
  });
});

describe("CLE-08 /contacts — read-only actions", () => {
  it("applyFilter sets the column filters and names them in the summary", async () => {
    const r = await runRegisteredAction("contacts.applyFilter", { title: ["CTO"], industry: ["Financial Services"] });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("CTO");
    expect(r.summary).toContain("Financial Services");
  });

  it("applyFilter rejects an unknown score grade at the schema boundary; no filter applied", async () => {
    const r = await runRegisteredAction("contacts.applyFilter", { score: ["Z"] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_params");
  });

  it("smartSearch types into the box; empty query clears", async () => {
    const r = await runRegisteredAction("contacts.smartSearch", { query: "CTOs at fintech" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("CTOs at fintech");
    const c = await runRegisteredAction("contacts.smartSearch", { query: "  " });
    expect(c.ok).toBe(true);
    expect(c.summary).toContain("Cleared");
  });

  it("selectAll resolves the full matching set and reports the count", async () => {
    const r = await runRegisteredAction("contacts.selectAll", { matchingCurrentFilter: true });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("idsOnly=true"))).toBe(true);
    expect((r.data as { count: number }).count).toBe(4);
  });
});

describe("CLE-08 /contacts — bulk actions over the selection", () => {
  // Populate the selection AND flush the setSelectedRows render so the bulk
  // run()s see it in selectedRef.current (the page reads live state via refs).
  async function selectAll() {
    await act(async () => { await runRegisteredAction("contacts.selectAll", { matchingCurrentFilter: true }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  it("REGRESSION — the selection bar renders BELOW the filter bar (can't shift the header)", async () => {
    await selectAll();
    const toolbar = await screen.findByRole("toolbar");
    // The "All (" anchor tab lives in the filter bar (hardcoded, locale-independent).
    const allTab = screen.getAllByText(/^All \(/)[0];
    expect(allTab.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bulkEnrich runs the chunked /api/enrich-contacts over the selection; empty selection guards", async () => {
    const empty = await runRegisteredAction("contacts.bulkEnrich", {});
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/enrich-contacts")).toHaveLength(0);
    await selectAll();
    const r = await runRegisteredAction("contacts.bulkEnrich", {});
    expect(r.ok).toBe(true);
    expect(callsTo("/api/enrich-contacts").length).toBeGreaterThan(0);
    // chunked-20: each request body carries at most 20 ids
    for (const call of callsTo("/api/enrich-contacts")) {
      expect((bodyOf(call).contactIds as string[]).length).toBeLessThanOrEqual(20);
    }
  });

  it("bulkFindMobile POSTs /api/contacts/fullenrich-enrich over the selection; empty guards", async () => {
    const empty = await runRegisteredAction("contacts.bulkFindMobile", {});
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/contacts/fullenrich-enrich")).toHaveLength(0);
    await selectAll();
    const r = await runRegisteredAction("contacts.bulkFindMobile", {});
    expect(r.ok).toBe(true);
    const call = callsTo("/api/contacts/fullenrich-enrich")[0];
    expect((bodyOf(call).contactIds as string[]).length).toBe(4);
  });

  it("bulkMerge navigates to the merge picker with >=2; <2 guards (no push)", async () => {
    // <2 selected (nothing) -> guard
    const guard = await runRegisteredAction("contacts.bulkMerge", {});
    expect(guard.ok).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
    await selectAll();
    const r = await runRegisteredAction("contacts.bulkMerge", {});
    expect(r.ok).toBe(true);
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(String(routerPush.mock.calls[0][0])).toContain("/contacts/merge?ids=");
  });

  it("bulkDelete per-id DELETEs with the cascade; default cascade []; bad key schema-rejected; empty guards", async () => {
    const empty = await runRegisteredAction("contacts.bulkDelete", {});
    expect(empty.ok).toBe(false);
    expect(deleteCalls()).toHaveLength(0);

    await selectAll();
    const r = await runRegisteredAction("contacts.bulkDelete", { cascade: ["activities"] });
    expect(r.ok).toBe(true);
    expect(deleteCalls().length).toBe(4);
    expect(bodyOf(deleteCalls()[0])).toMatchObject({ cascade: ["activities"] });

    await selectAll();
    const dflt = await runRegisteredAction("contacts.bulkDelete", {});
    expect(dflt.ok).toBe(true);
    expect(bodyOf(deleteCalls().at(-1)!)).toMatchObject({ cascade: [] });

    const bad = await runRegisteredAction("contacts.bulkDelete", { cascade: ["bogus"] });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("invalid_params");
  });

  it("bulkRestore POSTs /api/contacts/restore over the selection; empty guards", async () => {
    const empty = await runRegisteredAction("contacts.bulkRestore", {});
    expect(empty.ok).toBe(false);
    expect(callsTo("/api/contacts/restore")).toHaveLength(0);
    await selectAll();
    const r = await runRegisteredAction("contacts.bulkRestore", {});
    expect(r.ok).toBe(true);
    const call = callsTo("/api/contacts/restore")[0];
    expect((bodyOf(call).ids as string[]).length).toBe(4);
  });
});

describe("CLE-08 /contacts — scoreAll + createContact", () => {
  it("scoreAll POSTs /api/score-contacts {all:true}", async () => {
    const r = await runRegisteredAction("contacts.scoreAll", {});
    expect(r.ok).toBe(true);
    const call = callsTo("/api/score-contacts")[0];
    expect(bodyOf(call)).toMatchObject({ all: true });
  });

  it("createContact maps the params to the POST body; neither firstName nor email -> no POST", async () => {
    const r = await runRegisteredAction("contacts.createContact", { firstName: "Jane", lastName: "Doe", title: "CTO" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Jane Doe");
    const call = callsTo("/api/contacts")[0];
    expect(bodyOf(call)).toMatchObject({ firstName: "Jane", lastName: "Doe", title: "CTO" });

    const before = callsTo("/api/contacts").length;
    const bad = await runRegisteredAction("contacts.createContact", { title: "CTO" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("First name or email");
    expect(callsTo("/api/contacts").length).toBe(before);
  });
});

describe("CLE-08 /contacts — REQUIRED human-bound file-picker boundary", () => {
  it("openImport opens the native picker (click once) and NEVER fetches /api/import", async () => {
    const clickSpy = vi.fn();
    // The hidden <input ref={fileRef}> is rendered; spy its click().
    const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    input!.click = clickSpy;

    const r = await runRegisteredAction("contacts.openImport", {});
    expect(r.ok).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // No upload is triggered by the action — the human picks the file.
    expect(callsTo("/api/import").length).toBe(0);
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/import")).toBe(false);

    const by = getActionManifest().find((a) => a.id === "contacts.openImport")!;
    expect(by.mutating).toBe(false);
  });

  it("openSmartImport opens the modal (no upload fetch)", async () => {
    const r = await runRegisteredAction("contacts.openSmartImport", {});
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Smart Import");
    expect(fetchMock.mock.calls.some((c) => String(c[0]) === "/api/import/smart/preview")).toBe(false);
    const by = getActionManifest().find((a) => a.id === "contacts.openSmartImport")!;
    expect(by.mutating).toBe(false);
  });
});

describe("CLE-08 /contacts — decideAction cross-check + off-page degradation", () => {
  it("read-only/nav execute, mutating confirm, the credit spenders confirm under auto-high-confidence", () => {
    const m = getActionManifest();
    const scalars = (id: string) => {
      const a = m.find((x) => x.id === id)!;
      return { mutating: a.mutating, outbound: a.outbound, reversible: a.reversible, cost: a.cost, confirm: a.confirm };
    };
    const dec = (id: string, mode: "review-each" | "auto-high-confidence" = "review-each", role: "member" | "viewer" = "member") =>
      decideAction({ action: scalars(id), approvalMode: mode, role }).disposition;

    for (const id of ["contacts.applyFilter", "contacts.smartSearch", "contacts.selectAll", "contacts.openImport", "contacts.openSmartImport"])
      expect(dec(id)).toBe("execute");
    for (const id of ["contacts.bulkEnrich", "contacts.bulkFindMobile", "contacts.bulkDelete", "contacts.scoreAll", "contacts.createContact", "contacts.bulkRestore"])
      expect(dec(id)).toBe("confirm");
    // bulkDelete is confirm:"always" -> still confirms even under auto-high-confidence (mode-independent)
    expect(dec("contacts.bulkDelete", "auto-high-confidence")).toBe("confirm");
    // viewer: mutating refused, read-only allowed
    expect(dec("contacts.bulkDelete", "review-each", "viewer")).toBe("refuse");
    expect(dec("contacts.applyFilter", "review-each", "viewer")).toBe("execute");
  });

  it("after unmount the ids are gone and a stale invoke degrades gracefully", async () => {
    cleanup();
    expect(getActionManifest().map((a) => a.id)).not.toContain("contacts.bulkDelete");
    const r = await runRegisteredAction("contacts.bulkEnrich", {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
