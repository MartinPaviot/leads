import { describe, it, expect, vi, beforeEach } from "vitest";

const { getAuthContextMock, dbMock, buildFillMock, storageGetMock } = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  dbMock: { select: vi.fn(), update: vi.fn() },
  buildFillMock: vi.fn(),
  storageGetMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: getAuthContextMock,
  withAuthRLS: async (handler: (ctx: unknown) => Promise<Response>) => {
    const ctx = await getAuthContextMock();
    if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(ctx);
  },
}));
vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => ({
  proposals: { id: "id", tenantId: "tenant_id", templateId: "template_id", dealId: "deal_id", status: "status", deletedAt: "deleted_at" },
  proposalComponents: { componentId: "component_id", tenantId: "tenant_id", proposalId: "proposal_id", kind: "kind", label: "label", content: "content", order: "order" },
  proposalTemplates: { id: "id", tenantId: "tenant_id", name: "name", componentMap: "component_map", storageRef: "storage_ref" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
  asc: (x: unknown) => ({ asc: x }),
  isNull: (x: unknown) => ({ isNull: x }),
}));
vi.mock("@/lib/proposals/fill", () => {
  class FillUnavailable extends Error {
    reason: string;
    constructor(reason: string, msg: string) {
      super(msg);
      this.name = "FillUnavailable";
      this.reason = reason;
    }
  }
  return { buildProposalFill: buildFillMock, FillUnavailable };
});
vi.mock("@/lib/proposals/storage", () => ({
  getProposalStorage: () => ({ get: storageGetMock, put: vi.fn(), delete: vi.fn() }),
}));

// ooxml is intentionally NOT mocked — the download test exercises the real writer.
const { writeZip, readZipEntry } = await import("@/lib/proposals/ooxml");
const fillRoute = await import("@/app/api/proposals/templates/[id]/fill/route");
const detailRoute = await import("@/app/api/proposals/[proposalId]/route");
const downloadRoute = await import("@/app/api/proposals/[proposalId]/download/route");
const { FillUnavailable } = await import("@/lib/proposals/fill");

const CTX = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "member" };

function selectChain(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}
function jsonReq(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContextMock.mockResolvedValue(CTX);
});

describe("POST /api/proposals/templates/[id]/fill", () => {
  const params = { params: Promise.resolve({ id: "tpl1" }) };

  it("400 when dealId is missing", async () => {
    const res = await fillRoute.POST(jsonReq({}), params);
    expect(res.status).toBe(400);
  });

  it("201 with the filled proposal", async () => {
    buildFillMock.mockResolvedValue({
      proposalId: "p1",
      templateId: "tpl1",
      dealId: "d1",
      components: [{ componentId: "f1", kind: "field", label: "Client", content: "Acme", order: 0 }],
      unmappedSections: [],
    });
    const res = await fillRoute.POST(jsonReq({ dealId: "d1" }), params);
    expect(res.status).toBe(201);
    expect((await res.json()).proposalId).toBe("p1");
  });

  it("409 template_not_mapped and 404 deal_not_found", async () => {
    buildFillMock.mockRejectedValueOnce(new FillUnavailable("template_not_mapped", "x"));
    expect((await fillRoute.POST(jsonReq({ dealId: "d1" }), params)).status).toBe(409);
    buildFillMock.mockRejectedValueOnce(new FillUnavailable("deal_not_found", "x"));
    expect((await fillRoute.POST(jsonReq({ dealId: "d1" }), params)).status).toBe(404);
  });
});

describe("GET /api/proposals/[proposalId]", () => {
  it("404 when not in tenant", async () => {
    dbMock.select.mockReturnValue(selectChain([]));
    const res = await detailRoute.GET(jsonReq({}), { params: Promise.resolve({ proposalId: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("200 with ordered components", async () => {
    let i = 0;
    dbMock.select.mockImplementation(() => {
      i++;
      return selectChain(
        i === 1
          ? [{ id: "p1", templateId: "tpl1", dealId: "d1", status: "filled" }]
          : [{ componentId: "f1", kind: "field", label: "Client", content: "Acme", order: 0 }],
      );
    });
    const res = await detailRoute.GET(jsonReq({}), { params: Promise.resolve({ proposalId: "p1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.components).toHaveLength(1);
  });
});

describe("PATCH /api/proposals/[proposalId] (proofread edits)", () => {
  it("persists component edits, tenant-scoped", async () => {
    dbMock.select.mockReturnValue(selectChain([{ id: "p1" }]));
    const where = vi.fn().mockResolvedValue(undefined);
    dbMock.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) });
    const res = await detailRoute.PATCH(
      jsonReq({ components: [{ componentId: "sec1", content: "human-edited" }] }),
      { params: Promise.resolve({ proposalId: "p1" }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(1);
    expect(where).toHaveBeenCalled();
  });

  it("404 when the proposal is not in the tenant", async () => {
    dbMock.select.mockReturnValue(selectChain([]));
    const res = await detailRoute.PATCH(
      jsonReq({ components: [{ componentId: "x", content: "y" }] }),
      { params: Promise.resolve({ proposalId: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("400 when no components are provided", async () => {
    const res = await detailRoute.PATCH(jsonReq({}), {
      params: Promise.resolve({ proposalId: "p1" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/proposals/[proposalId]/download", () => {
  const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Executive Summary</w:t></w:r></w:p><w:p><w:r><w:t>OLD</w:t></w:r></w:p></w:body></w:document>`;
  const componentMap = {
    version: 1,
    components: [
      {
        id: "sec1",
        kind: "section",
        label: "Executive Summary",
        placeholderToken: "{{exec}}",
        dataKey: null,
        anchor: { headingText: "Executive Summary", offset: 0 },
        required: true,
        confidence: "high",
        order: 0,
      },
    ],
  };
  const compRow = { componentId: "sec1", label: "Executive Summary", kind: "section", content: "Filled exec body", order: 0 };
  const urlReq = (u: string): Request => ({ url: u }) as unknown as Request;

  it("streams a filled .docx assembled from the original template", async () => {
    const fixture = writeZip([{ name: "word/document.xml", bytes: Buffer.from(docXml, "utf8") }]);
    let i = 0;
    dbMock.select.mockImplementation(() => {
      i++;
      if (i === 1) return selectChain([{ id: "p1", templateId: "tpl1", dealId: "d1", status: "filled" }]);
      if (i === 2) return selectChain([compRow]); // components
      return selectChain([{ id: "tpl1", name: "SOW", componentMap, storageRef: "ref1" }]); // template
    });
    storageGetMock.mockResolvedValue({ bytes: fixture, contentType: "application/docx" });

    const res = await downloadRoute.GET(urlReq("http://x/api/proposals/p1/download"), {
      params: Promise.resolve({ proposalId: "p1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("wordprocessingml");
    expect(res.headers.get("Content-Disposition")).toContain("SOW-filled.docx");
    const out = Buffer.from(await res.arrayBuffer());
    const doc = readZipEntry(out, "word/document.xml")!.toString("utf8");
    expect(doc).toContain("Filled exec body");
  });

  it("regenerates a PDF with ?as=pdf (no template bytes needed)", async () => {
    let i = 0;
    dbMock.select.mockImplementation(() => {
      i++;
      if (i === 1) return selectChain([{ id: "p1", templateId: "tpl1", status: "filled" }]);
      if (i === 2) return selectChain([compRow]); // components
      return selectChain([{ id: "tpl1", name: "SOW" }]); // template (name only)
    });
    const res = await downloadRoute.GET(urlReq("http://x/api/proposals/p1/download?as=pdf"), {
      params: Promise.resolve({ proposalId: "p1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const out = Buffer.from(await res.arrayBuffer()).toString("latin1");
    expect(out.startsWith("%PDF")).toBe(true);
    expect(out).toContain("Filled exec body");
  });
});
