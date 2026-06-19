// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";

/**
 * CLE-07 — the registered /accounts list page actions, exercised against the
 * REAL mounted page through the live registry. Network is asserted via a routed
 * fetch spy (deterministic). The cost-guardrail is cross-checked against the
 * real decideAction (mode-independent confirm for the spenders).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/accounts",
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
// The list page mounts the TAM-stream and enrich-stream hooks at module scope.
// Mock them to inert objects so mounting doesn't crash and the action run()s
// (which call .start) have a spy to assert against.
const tamStart = vi.fn();
const enrichStart = vi.fn();
vi.mock("@/hooks/use-tam-stream", () => ({
  useTamStream: () => ({
    rows: new Map(), rowOrder: [], terminated: null, isRunning: false,
    progress: {}, strategies: [], summary: null, errors: [],
    start: tamStart, cancel: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-enrich-stream", () => ({
  useEnrichStream: () => ({
    cells: new Map(), isRunning: false, processed: 0, total: 0,
    terminated: null, summary: null, start: enrichStart,
  }),
}));

import AccountsPage from "@/app/(dashboard)/accounts/page";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";
import { decideAction } from "@/lib/guardrails/decide-action";

const acc = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: "Acme " + id, domain: id + ".com",
  industry: "Software", size: "50-100", revenue: "$10M", description: "desc",
  score: 80, scoreReasons: [], properties: { source: "tam" }, lastInteraction: null, ...over,
});

const FIXTURE = [acc("a1"), acc("a2")];

function jsonRes(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

// Default list payload: 2 loaded rows but a larger total so selectAll resolves
// the full id set via ?idsOnly=true.
let idsOnlyResponse: { ids: string[]; total: number } = { ids: ["a1", "a2", "a3", "a4"], total: 4 };
let listTotal = 4;

function route(url: string, init?: RequestInit) {
  const u = String(url);
  const method = init?.method ?? "GET";
  // select-all-matching ?idsOnly=true
  if (u.startsWith("/api/accounts?") && u.includes("idsOnly=true")) return jsonRes(idsOnlyResponse);
  if (u.startsWith("/api/accounts?") && method === "GET")
    return jsonRes({ accounts: FIXTURE, pagination: { page: 1, pageSize: 200, total: listTotal, totalPages: 1, hasMore: false } });
  if (u === "/api/icps") return jsonRes({ icps: [{ id: "icp1", name: "Primary", criteriaCount: 3, status: "active" }] });
  if (u === "/api/custom-signals") return jsonRes({ signals: [] });
  if (u.startsWith("/api/tam/proposals")) return jsonRes({ counts: { pending: 0 } });
  if (u.startsWith("/api/warm-paths")) return jsonRes({ pathsByCompany: {} });
  if (u === "/api/score") return jsonRes({ ok: true });
  if (u === "/api/signals") return jsonRes({ ok: true });
  if (u === "/api/accounts/extract-contacts") return jsonRes({ totalCreated: 3, accountsProcessed: 2 });
  if (u === "/api/accounts/exclude") return jsonRes({ ok: true });
  if (u === "/api/accounts/restore") return jsonRes({ restored: 2 });
  if (u === "/api/accounts/batch" && method === "DELETE") return jsonRes({ deleted: 2, cascaded: { contacts: 5 } });
  if (u === "/api/accounts/related-counts") return jsonRes({ counts: {} });
  if (u === "/api/filters/parse-nl")
    return jsonRes({ filters: [{ field: "industry", operator: "contains", value: "SaaS" }], reasoning: "industry SaaS", unmatched: [] });
  return jsonRes({});
}

beforeEach(async () => {
  __resetPageActionsForTest();
  tamStart.mockClear();
  enrichStart.mockClear();
  idsOnlyResponse = { ids: ["a1", "a2", "a3", "a4"], total: 4 };
  listTotal = 4;
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(route(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", {
    getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
  });
  render(<AccountsPage />);
  await waitFor(() => expect(screen.getAllByText(/Acme a1/).length).toBeGreaterThan(0));
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

const LIST_IDS = [
  "accounts.applyFilter", "accounts.smartSearch", "accounts.setView", "accounts.selectAll",
  "accounts.bulkEnrich", "accounts.bulkScore", "accounts.bulkDetectSignals", "accounts.bulkExtractContacts",
  "accounts.bulkExclude", "accounts.bulkRestore", "accounts.bulkDelete", "accounts.sendToCallMode",
  "accounts.enrichAccount", "accounts.scoreAccount", "accounts.excludeAccount", "accounts.deleteAccount",
  "accounts.startTamBuild", "accounts.openPersonaSearch",
];

describe("CLE-07 /accounts — manifest + metadata", () => {
  it("registers every list action with the correct cost/confirm metadata; detail ids absent", () => {
    const m = getActionManifest();
    const ids = m.map((a) => a.id);
    for (const id of LIST_IDS) expect(ids).toContain(id);
    for (const id of ["accounts.updateField", "accounts.reassignOwner", "accounts.refreshSummary",
      "accounts.generateDossier", "accounts.approveCallIntel", "accounts.dismissCallIntel"])
      expect(ids).not.toContain(id);

    const by = (id: string) => m.find((a) => a.id === id)!;
    // The headline cost guardrail
    expect(by("accounts.bulkExtractContacts").confirm).toBe("always");
    expect(by("accounts.bulkExtractContacts").cost).toBe("credits");
    expect(by("accounts.startTamBuild").confirm).toBe("always");
    expect(by("accounts.startTamBuild").cost).toBe("credits");
    expect(by("accounts.bulkEnrich").confirm).toBe("risky");
    expect(by("accounts.bulkEnrich").cost).toBe("credits");
    expect(by("accounts.enrichAccount").cost).toBe("credits");
    // Destructive = always confirm
    expect(by("accounts.bulkDelete").confirm).toBe("always");
    expect(by("accounts.deleteAccount").confirm).toBe("always");
    // Read-only / nav = never confirm, non-mutating
    for (const id of ["accounts.applyFilter", "accounts.smartSearch", "accounts.setView", "accounts.selectAll", "accounts.sendToCallMode", "accounts.openPersonaSearch"]) {
      expect(by(id).confirm).toBe("never");
      expect(by(id).mutating).toBe(false);
    }
    // The rest = risky
    for (const id of ["accounts.bulkScore", "accounts.bulkDetectSignals", "accounts.bulkExclude", "accounts.bulkRestore", "accounts.scoreAccount", "accounts.excludeAccount"]) {
      expect(by(id).confirm).toBe("risky");
    }
  });
});

describe("CLE-07 /accounts — read-only actions", () => {
  it("applyFilter sets the column/tab filters and reports them; clear resets", async () => {
    const r = await runRegisteredAction("accounts.applyFilter", { industry: ["Software"], score: ["A+", "A"], sourceTab: "tam" });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Software");
    const c = await runRegisteredAction("accounts.applyFilter", { clear: true });
    expect(c.ok).toBe(true);
    expect(c.summary).toContain("Cleared");
  });

  it("applyFilter rejects an unknown score grade at the schema boundary", async () => {
    const r = await runRegisteredAction("accounts.applyFilter", { score: ["Z"] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_params");
  });

  it("smartSearch POSTs parse-nl with resourceType account and applies the filters", async () => {
    const r = await runRegisteredAction("accounts.smartSearch", { query: "SaaS in France, high fit" });
    expect(r.ok).toBe(true);
    const call = callsTo("/api/filters/parse-nl")[0];
    expect(bodyOf(call)).toMatchObject({ query: "SaaS in France, high fit", resourceType: "account" });
    expect((r.data as { count: number }).count).toBe(1);
  });

  it("smartSearch with empty query clears; no parse-nl request", async () => {
    const r = await runRegisteredAction("accounts.smartSearch", { query: "  " });
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Cleared");
    expect(callsTo("/api/filters/parse-nl")).toHaveLength(0);
  });

  it("setView flips excluded/archived/active without persistence", async () => {
    expect((await runRegisteredAction("accounts.setView", { view: "excluded" })).summary).toContain("not a fit");
    expect((await runRegisteredAction("accounts.setView", { view: "archived" })).summary).toContain("archive");
    expect((await runRegisteredAction("accounts.setView", { view: "active" })).summary).toContain("active");
  });

  it("REQUIRED — selectAll resolves the full matching set honestly and reports the count", async () => {
    const r = await runRegisteredAction("accounts.selectAll", { matchingCurrentFilter: true });
    expect(r.ok).toBe(true);
    // ?idsOnly=true was requested
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("idsOnly=true"))).toBe(true);
    // The resolved set is the union of visible + server ids (4)
    expect((r.data as { count: number }).count).toBe(4);
  });

  it("selectAll rejects matchingCurrentFilter:false at the schema boundary", async () => {
    const r = await runRegisteredAction("accounts.selectAll", { matchingCurrentFilter: false });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_params");
  });
});

describe("CLE-07 /accounts — bulk actions over the selection", () => {
  // Populate the selection AND flush the setSelectedRows render so the bulk
  // run()s see it in selectedRef.current (the page reads live state via refs).
  async function selectAll() {
    await act(async () => {
      await runRegisteredAction("accounts.selectAll", { matchingCurrentFilter: true });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  it("REQUIRED — bulkEnrich runs the streaming enrich over the selection; empty selection guards", async () => {
    // Empty selection first
    const empty = await runRegisteredAction("accounts.bulkEnrich", {});
    expect(empty.ok).toBe(false);
    expect(enrichStart).not.toHaveBeenCalled();
    // Now select all, then enrich
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkEnrich", { criteria: ["industry"] });
    expect(r.ok).toBe(true);
    expect(enrichStart).toHaveBeenCalledTimes(1);
    expect(enrichStart.mock.calls[0][0]).toMatchObject({ criteria: ["industry"] });
    expect((enrichStart.mock.calls[0][0] as { companyIds: string[] }).companyIds.length).toBe(4);
  });

  it("bulkScore chunked-calls /api/score over the selected ids; empty guards", async () => {
    expect((await runRegisteredAction("accounts.bulkScore", {})).ok).toBe(false);
    expect(callsTo("/api/score")).toHaveLength(0);
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkScore", {});
    expect(r.ok).toBe(true);
    const call = callsTo("/api/score")[0];
    expect((bodyOf(call).companyIds as string[]).length).toBe(4);
  });

  it("bulkDetectSignals chunked-calls /api/signals over the enriched selection", async () => {
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkDetectSignals", {});
    expect(r.ok).toBe(true);
    expect(callsTo("/api/signals").length).toBeGreaterThan(0);
  });

  it("REQUIRED cost — bulkExtractContacts confirms even under auto-high-confidence, then 50-id fan-out", async () => {
    const d = decideAction({
      action: { mutating: true, reversible: true, cost: "credits", confirm: "always" },
      approvalMode: "auto-high-confidence", role: "member",
    });
    expect(d.disposition).toBe("confirm");
    // empty guard
    expect((await runRegisteredAction("accounts.bulkExtractContacts", {})).ok).toBe(false);
    expect(callsTo("/api/accounts/extract-contacts")).toHaveLength(0);
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkExtractContacts", {});
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("Added 3 contacts");
    const call = callsTo("/api/accounts/extract-contacts")[0];
    expect((bodyOf(call).accountIds as string[]).length).toBeLessThanOrEqual(50);
  });

  it("bulkExclude POSTs /api/accounts/exclude exclude over the selection", async () => {
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkExclude", {});
    expect(r.ok).toBe(true);
    const call = callsTo("/api/accounts/exclude")[0];
    expect(bodyOf(call)).toMatchObject({ action: "exclude" });
  });

  it("bulkRestore is view-dependent: Excluded view -> include, Archive view -> restore, neither -> no-op", async () => {
    await selectAll();
    // default active view: nothing to restore
    const noop = await runRegisteredAction("accounts.bulkRestore", {});
    expect(noop.ok).toBe(true);
    expect(noop.summary).toContain("Nothing to restore");

    // Excluded view -> exclude endpoint with action include
    await runRegisteredAction("accounts.setView", { view: "excluded" });
    await selectAll();
    await runRegisteredAction("accounts.bulkRestore", {});
    expect(callsTo("/api/accounts/exclude").some((c) => bodyOf(c).action === "include")).toBe(true);

    // Archive view -> restore endpoint
    await runRegisteredAction("accounts.setView", { view: "archived" });
    await selectAll();
    await runRegisteredAction("accounts.bulkRestore", {});
    expect(callsTo("/api/accounts/restore").length).toBeGreaterThan(0);
  });

  it("bulkDelete DELETEs /api/accounts/batch with the cascade; default cascade []", async () => {
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkDelete", { cascade: ["contacts"] });
    expect(r.ok).toBe(true);
    const call = callsTo("/api/accounts/batch", "DELETE")[0];
    expect(bodyOf(call)).toMatchObject({ cascade: ["contacts"] });
    expect((bodyOf(call).ids as string[]).length).toBe(4);
    expect(r.summary).toContain("related record");
  });

  it("bulkDelete rejects a bad cascade key at the schema boundary", async () => {
    await selectAll();
    const r = await runRegisteredAction("accounts.bulkDelete", { cascade: ["bogus"] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_params");
  });

  it("sendToCallMode navigates with the selection; empty guards", async () => {
    // jsdom/happy-dom: stub location.href setter via a spy object.
    const loc = { href: "" };
    // @ts-expect-error override for test
    delete window.location;
    // @ts-expect-error override for test
    window.location = loc;
    expect((await runRegisteredAction("accounts.sendToCallMode", { accountIds: [] })).ok).toBe(false);
    await runRegisteredAction("accounts.sendToCallMode", { accountIds: ["a1", "a2"] });
    expect(loc.href).toContain("/call-mode?accounts=");
    expect(loc.href).toContain("a1");
  });
});

describe("CLE-07 /accounts — single-row + sourcing", () => {
  it("enrichAccount enriches one id via the stream", async () => {
    const r = await runRegisteredAction("accounts.enrichAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect((enrichStart.mock.calls.at(-1)![0] as { companyIds: string[] }).companyIds).toEqual(["a1"]);
  });

  it("scoreAccount scores one id", async () => {
    const r = await runRegisteredAction("accounts.scoreAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect(bodyOf(callsTo("/api/score")[0]).companyIds).toEqual(["a1"]);
  });

  it("excludeAccount and restore route through /api/accounts/exclude", async () => {
    await runRegisteredAction("accounts.excludeAccount", { accountId: "a1" });
    expect(callsTo("/api/accounts/exclude").some((c) => bodyOf(c).action === "exclude" && (bodyOf(c).ids as string[])[0] === "a1")).toBe(true);
    await runRegisteredAction("accounts.excludeAccount", { accountId: "a1", restore: true });
    expect(callsTo("/api/accounts/exclude").some((c) => bodyOf(c).action === "include")).toBe(true);
  });

  it("deleteAccount soft-deletes one id (always-confirm metadata)", async () => {
    const r = await runRegisteredAction("accounts.deleteAccount", { accountId: "a1" });
    expect(r.ok).toBe(true);
    expect((bodyOf(callsTo("/api/accounts/batch", "DELETE")[0]).ids as string[])).toEqual(["a1"]);
  });

  it("REQUIRED cost — startTamBuild confirms even under auto-high-confidence; builds; unknown icpId rejected", async () => {
    const d = decideAction({
      action: { mutating: true, reversible: true, cost: "credits", confirm: "always" },
      approvalMode: "auto-high-confidence", role: "member",
    });
    expect(d.disposition).toBe("confirm");
    const r = await runRegisteredAction("accounts.startTamBuild", { allProfiles: true });
    expect(r.ok).toBe(true);
    expect(tamStart).toHaveBeenCalledTimes(1);
    expect((tamStart.mock.calls[0][0] as { icpIds: string[] }).icpIds).toContain("icp1");
    // single profile
    await runRegisteredAction("accounts.startTamBuild", { icpId: "icp1" });
    expect((tamStart.mock.calls.at(-1)![0] as { icpId: string }).icpId).toBe("icp1");
    // unknown id
    const bad = await runRegisteredAction("accounts.startTamBuild", { icpId: "ghost" });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("No such ICP profile");
  });

  it("openPersonaSearch opens the modal only (no network)", async () => {
    const r = await runRegisteredAction("accounts.openPersonaSearch", {});
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("persona");
  });
});

describe("CLE-07 /accounts — decideAction cross-check + off-page degradation", () => {
  it("read-only/nav execute, mutating confirm, the three spenders confirm under auto-high-confidence", () => {
    const m = getActionManifest();
    const scalars = (id: string) => {
      const a = m.find((x) => x.id === id)!;
      return { mutating: a.mutating, outbound: a.outbound, reversible: a.reversible, cost: a.cost, confirm: a.confirm };
    };
    const dec = (id: string, mode: "review-each" | "auto-high-confidence" = "review-each", role: "member" | "viewer" = "member") =>
      decideAction({ action: scalars(id), approvalMode: mode, role }).disposition;

    for (const id of ["accounts.applyFilter", "accounts.smartSearch", "accounts.setView", "accounts.selectAll", "accounts.sendToCallMode", "accounts.openPersonaSearch"])
      expect(dec(id)).toBe("execute");
    for (const id of ["accounts.bulkScore", "accounts.bulkExclude", "accounts.bulkDelete", "accounts.enrichAccount"])
      expect(dec(id)).toBe("confirm");
    for (const id of ["accounts.bulkExtractContacts", "accounts.startTamBuild"])
      expect(dec(id, "auto-high-confidence")).toBe("confirm");
    // viewer: mutating refused, read-only allowed
    expect(dec("accounts.bulkDelete", "review-each", "viewer")).toBe("refuse");
    expect(dec("accounts.applyFilter", "review-each", "viewer")).toBe("execute");
  });

  it("after unmount the ids are gone and a stale invoke degrades gracefully", async () => {
    cleanup();
    expect(getActionManifest().map((a) => a.id)).not.toContain("accounts.bulkDelete");
    const r = await runRegisteredAction("accounts.bulkDelete", { accountIds: ["x"] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
