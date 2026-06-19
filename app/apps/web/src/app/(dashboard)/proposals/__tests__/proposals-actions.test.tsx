// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, cleanup, act, screen } from "@testing-library/react";

/**
 * CLE-14 /proposals — the page registers exactly the seven parity actions and
 * reuses the page's OWN result-returning helpers (the extractions) so the agent
 * path and the button path issue ONE identical request each. The headline guard
 * is the file boundary: a template UPLOAD-SUBMIT (multipart byte stream) and a
 * DOWNLOAD-STREAM are NEVER registered. The two file-adjacent actions only OPEN
 * the native picker / NAVIGATE to the download URL — they never stream bytes.
 */

// The page itself imports none of these, but mock defensively (full sets) so the
// test is robust to future imports and matches the proven harness shape.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/proposals",
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

import ProposalsPage from "@/app/(dashboard)/proposals/page";
import { PROPOSALS_EXCLUDED_IDS } from "@/app/(dashboard)/proposals/_excluded-ids";
import { getActionManifest, runRegisteredAction, __resetPageActionsForTest } from "@/lib/chat/page-actions/registry";

function jsonRes(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response;
}

const REGISTERED_IDS = [
  "proposals.draftFromDeal",
  "proposals.confirmMapping",
  "proposals.editComponentMap",
  "proposals.regenerateComponent",
  "proposals.saveEdits",
  "proposals.openTemplateUpload",
  "proposals.openDownload",
];

const FIXTURE_LIST = {
  templates: [
    { id: "t1", name: "MSA Template", sourceFormat: "docx", status: "mapped", updatedAt: "2026-06-01T00:00:00Z" },
  ],
};

const FIXTURE_DETAIL = {
  template: {
    id: "t1",
    name: "MSA Template",
    status: "mapped",
    originalFileName: "msa.docx",
    componentMap: {
      components: [
        { id: "k1", kind: "field", label: "Company", dataKey: "companyName", confidence: "high", order: 0 },
        { id: "k2", kind: "section", label: "Intro", dataKey: null, confidence: "medium", order: 1 },
      ],
    },
  },
};

const FIXTURE_FILLED = {
  proposalId: "p1",
  components: [
    {
      componentId: "fc1", kind: "section", label: "Intro", content: "Hello Acme.", order: 0,
      confidence: "high", abstained: false, supportRatio: 1, unsupported: false, citations: [],
    },
  ],
  unmappedSections: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

// Per-test overridable responses for the endpoints the tests vary.
let fillResponse: () => Response = () => jsonRes(FIXTURE_FILLED);
let confirmResponse: () => Response = () => jsonRes({ ok: true });
let regenResponse: () => Response = () => jsonRes({ content: "Hello Acme Corp.", confidence: "high", citations: [] });
let saveResponse: () => Response = () => jsonRes({ ok: true });

function router(url: string, init?: RequestInit): Response {
  const u = String(url);
  const method = init?.method ?? "GET";
  if (u === "/api/proposals/templates" && method === "GET") return jsonRes(FIXTURE_LIST);
  if (u === "/api/proposals/templates" && method === "POST") return jsonRes({ id: "tNew" }); // upload SUBMIT — must NEVER be hit by an action
  if (/^\/api\/proposals\/templates\/[^/]+\/fill$/.test(u) && method === "POST") return fillResponse();
  if (/^\/api\/proposals\/templates\/[^/]+$/.test(u) && method === "GET") return jsonRes(FIXTURE_DETAIL);
  if (/^\/api\/proposals\/templates\/[^/]+$/.test(u) && method === "PATCH") return confirmResponse();
  if (/^\/api\/proposals\/[^/]+\/components\/[^/]+\/regenerate$/.test(u) && method === "POST") return regenResponse();
  if (/^\/api\/proposals\/[^/]+$/.test(u) && method === "PATCH") return saveResponse();
  if (u.startsWith("/api/opportunities")) return jsonRes({ items: [] });
  return jsonRes({});
}

function mountPage() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(router(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  render(<ProposalsPage />);
}

beforeEach(() => {
  __resetPageActionsForTest();
  fillResponse = () => jsonRes(FIXTURE_FILLED);
  confirmResponse = () => jsonRes({ ok: true });
  regenResponse = () => jsonRes({ content: "Hello Acme Corp.", confidence: "high", citations: [] });
  saveResponse = () => jsonRes({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function callsTo(url: string | RegExp, method = "POST") {
  return fetchMock.mock.calls.filter((c) => {
    const u = String(c[0]);
    const m = c[1]?.method ?? "GET";
    const match = typeof url === "string" ? u === url : url.test(u);
    return match && m === method;
  });
}
function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse(((call[1] as RequestInit)?.body as string) || "{}");
}
async function flush() {
  for (let i = 0; i < 12; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** Mount the page, wait for actions to register + the template list to load. */
async function mountLoaded() {
  mountPage();
  await waitFor(() => {
    expect(getActionManifest().map((a) => a.id)).toContain("proposals.draftFromDeal");
  });
  await flush();
}

/** Open the t1 template (sets `selected` + `draft`) by clicking its row. */
async function openTemplate() {
  const btn = await screen.findByText("MSA Template");
  await act(async () => { btn.click(); });
  await flush();
}

describe("CLE-14 /proposals — manifest membership + metadata", () => {
  it("registers exactly the seven parity actions with the right scalars", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id).sort();
    expect(ids).toEqual([...REGISTERED_IDS].sort());

    const m = getActionManifest();
    const by = (id: string) => m.find((a) => a.id === id)!;

    expect(by("proposals.draftFromDeal").confirm).toBe("risky");
    expect(by("proposals.draftFromDeal").mutating).toBe(true);
    expect(by("proposals.confirmMapping").confirm).toBe("risky");
    expect(by("proposals.regenerateComponent").confirm).toBe("risky");
    expect(by("proposals.saveEdits").confirm).toBe("risky");

    expect(by("proposals.editComponentMap").mutating).toBe(false);
    expect(by("proposals.editComponentMap").confirm).toBe("never");

    // The two safe file edges: pure view/navigate, no card, no spend.
    expect(by("proposals.openTemplateUpload").mutating).toBe(false);
    expect(by("proposals.openTemplateUpload").confirm).toBe("never");
    expect(by("proposals.openDownload").mutating).toBe(false);
    expect(by("proposals.openDownload").confirm).toBe("never");

    // No action declares cost:"money" and none is outbound.
    expect(m.some((a) => a.cost === "money")).toBe(false);
    expect(m.some((a) => a.outbound)).toBe(false);
  });
});

describe("CLE-14 /proposals — REQUIRED file boundary (the headline)", () => {
  it("the manifest is DISJOINT from the excluded upload-submit / download-stream ids", async () => {
    await mountLoaded();
    const ids = getActionManifest().map((a) => a.id);
    for (const banned of PROPOSALS_EXCLUDED_IDS) {
      expect(ids).not.toContain(banned);
    }
    expect(PROPOSALS_EXCLUDED_IDS.filter((b) => ids.includes(b))).toEqual([]);
  });
});

describe("CLE-14 /proposals — draftFromDeal", () => {
  it("POSTs .../fill with {dealId}; empty dealId -> no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "d9" });
    expect(r.ok).toBe(true);
    const fill = callsTo(/^\/api\/proposals\/templates\/t1\/fill$/);
    expect(fill.length).toBe(1);
    expect(bodyOf(fill[0])).toEqual({ dealId: "d9" });

    // Empty / whitespace dealId is rejected by the schema (min(1)) -> no POST.
    const empty = await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "   " });
    expect(empty.ok).toBe(false);
    expect(callsTo(/^\/api\/proposals\/templates\/t1\/fill$/).length).toBe(1); // unchanged
  });

  it("a fill server failure surfaces ok:false", async () => {
    fillResponse = () => jsonRes({ error: "deal_not_found" }, false, 404);
    await mountLoaded();
    const r = await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "ghost" });
    expect(r.ok).toBe(false);
  });
});

describe("CLE-14 /proposals — confirmMapping (reads live draft)", () => {
  it("PATCHes .../templates/:id with the live componentMap", async () => {
    await mountLoaded();
    await openTemplate(); // populates draftRef from the detail fixture
    const r = await runRegisteredAction("proposals.confirmMapping", { templateId: "t1" });
    expect(r.ok).toBe(true);
    const patch = callsTo(/^\/api\/proposals\/templates\/t1$/, "PATCH");
    expect(patch.length).toBe(1);
    const body = bodyOf(patch[0]) as { componentMap: { components: unknown[] } };
    expect(body.componentMap.components.length).toBe(2);
  });
});

describe("CLE-14 /proposals — editComponentMap (client-side, no network)", () => {
  it("updates a component in the draft and issues NO fetch", async () => {
    await mountLoaded();
    await openTemplate();
    const before = fetchMock.mock.calls.length;
    let r!: Awaited<ReturnType<typeof runRegisteredAction>>;
    await act(async () => { r = await runRegisteredAction("proposals.editComponentMap", { index: 0, label: "Customer" }); });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(before); // no network
    await flush(); // let the setDraft re-render refresh draftRef.current

    // The edit is reflected in the next confirmMapping PATCH (live draft).
    const conf = await runRegisteredAction("proposals.confirmMapping", { templateId: "t1" });
    expect(conf.ok).toBe(true);
    const body = bodyOf(callsTo(/^\/api\/proposals\/templates\/t1$/, "PATCH")[0]) as {
      componentMap: { components: Array<{ label: string }> };
    };
    expect(body.componentMap.components[0].label).toBe("Customer");
  });

  it("an out-of-range index -> ok:false, no network", async () => {
    await mountLoaded();
    await openTemplate();
    const before = fetchMock.mock.calls.length;
    const r = await runRegisteredAction("proposals.editComponentMap", { index: 99, label: "x" });
    expect(r.ok).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

describe("CLE-14 /proposals — regenerateComponent + saveEdits (read live filled)", () => {
  it("regenerateComponent POSTs .../regenerate after a draft exists", async () => {
    await mountLoaded();
    await openTemplate();
    await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "d9" });
    await flush();

    const r = await runRegisteredAction("proposals.regenerateComponent", {
      proposalId: "p1", componentId: "fc1", guidance: "shorter",
    });
    expect(r.ok).toBe(true);
    const regen = callsTo(/^\/api\/proposals\/p1\/components\/fc1\/regenerate$/);
    expect(regen.length).toBe(1);
    expect(bodyOf(regen[0])).toEqual({ guidance: "shorter" });
  });

  it("regenerateComponent before any draft -> ok:false no POST", async () => {
    await mountLoaded();
    const r = await runRegisteredAction("proposals.regenerateComponent", { proposalId: "p1", componentId: "fc1" });
    expect(r.ok).toBe(false);
    expect(callsTo(/regenerate$/).length).toBe(0);
  });

  it("saveEdits with no edits -> ok:false, NO PATCH (E-12)", async () => {
    await mountLoaded();
    await openTemplate();
    await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "d9" });
    await flush();

    // filled exists but no edits were made -> guard short-circuits, no PATCH.
    const r = await runRegisteredAction("proposals.saveEdits", { proposalId: "p1" });
    expect(r.ok).toBe(false);
    expect(callsTo(/^\/api\/proposals\/p1$/, "PATCH").length).toBe(0);
  });

  it("saveEdits with an edit PATCHes /api/proposals/:id", async () => {
    await mountLoaded();
    await openTemplate();
    await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "d9" });
    await flush();

    // Simulate the human typing an edit into the component textarea.
    const ta = (await screen.findAllByRole("textbox")).find(
      (el) => (el as HTMLTextAreaElement).tagName === "TEXTAREA",
    ) as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(ta, "Hello Acme Inc.");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    const r = await runRegisteredAction("proposals.saveEdits", { proposalId: "p1" });
    expect(r.ok).toBe(true);
    const patch = callsTo(/^\/api\/proposals\/p1$/, "PATCH");
    expect(patch.length).toBe(1);
    const body = bodyOf(patch[0]) as { components: Array<{ componentId: string; content: string }> };
    expect(body.components[0]).toEqual({ componentId: "fc1", content: "Hello Acme Inc." });
  });
});

describe("CLE-14 /proposals — openTemplateUpload (SAFE EDGE: open-only, never streams bytes)", () => {
  it("clicks the hidden file input ONCE and NEVER POSTs /api/proposals/templates (X-3/E-4)", async () => {
    await mountLoaded();
    // Spy on the hidden <input type=file> click — that is the only effect.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    const postsBefore = callsTo("/api/proposals/templates").length;
    const r = await runRegisteredAction("proposals.openTemplateUpload", {});
    expect(r.ok).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // The multipart upload SUBMIT endpoint is NEVER hit by the action.
    expect(callsTo("/api/proposals/templates").length).toBe(postsBefore);
    // No FormData/multipart body was ever sent.
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.body instanceof FormData)).toBe(false);
  });
});

describe("CLE-14 /proposals — openDownload (NAVIGATE-ONLY: never fetches the file, X-4/E-5)", () => {
  // happy-dom does not let you assign window.location.href on the real location;
  // we replace window.location with a plain object exposing an href setter spy so
  // we can assert the navigation target while matching the <a href> semantics
  // (the run sets window.location.href = the download URL — it never fetch()es it).
  it("sets window.location.href to the download URL (?as=pdf) and fetches NOTHING", async () => {
    await mountLoaded();
    const hrefSetter = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, set href(v: string) { hrefSetter(v); }, get href() { return ""; } },
    });
    try {
      const fetchBefore = fetchMock.mock.calls.length;
      const r = await runRegisteredAction("proposals.openDownload", { proposalId: "p1", format: "pdf" });
      expect(r.ok).toBe(true);
      expect(hrefSetter).toHaveBeenCalledTimes(1);
      expect(hrefSetter).toHaveBeenCalledWith("/api/proposals/p1/download?as=pdf");
      // The action NEVER fetch()es the file — the browser streams it.
      expect(fetchMock.mock.calls.length).toBe(fetchBefore);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("defaults to the .docx/.pptx URL when no format is given", async () => {
    await mountLoaded();
    const hrefSetter = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, set href(v: string) { hrefSetter(v); }, get href() { return ""; } },
    });
    try {
      const r = await runRegisteredAction("proposals.openDownload", { proposalId: "p1" });
      expect(r.ok).toBe(true);
      expect(hrefSetter).toHaveBeenCalledWith("/api/proposals/p1/download");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});

describe("CLE-14 /proposals — boundary disjointness (id-level)", () => {
  it("registered ids never intersect the frozen excluded set", async () => {
    await mountLoaded();
    const ids = new Set(getActionManifest().map((a) => a.id));
    for (const banned of PROPOSALS_EXCLUDED_IDS) expect(ids.has(banned)).toBe(false);
  });
});

describe("CLE-14 /proposals — off-page degradation", () => {
  it("after unmount the proposals.* ids are gone and runRegisteredAction refuses", async () => {
    await mountLoaded();
    expect(getActionManifest().map((a) => a.id)).toContain("proposals.draftFromDeal");
    cleanup();
    await flush();
    expect(getActionManifest().map((a) => a.id)).not.toContain("proposals.draftFromDeal");
    const r = await runRegisteredAction("proposals.draftFromDeal", { templateId: "t1", dealId: "d9" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("action_not_registered");
  });
});
