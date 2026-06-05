import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeZip } from "@/lib/proposals/ooxml";

const {
  getAuthContextMock,
  dbMock,
  storagePutMock,
  extractDocxMock,
  detectMock,
} = vi.hoisted(() => ({
  getAuthContextMock: vi.fn(),
  dbMock: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  storagePutMock: vi.fn(),
  extractDocxMock: vi.fn(),
  detectMock: vi.fn(),
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
  proposalTemplates: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    sourceFormat: "source_format",
    status: "status",
    originalFileName: "original_file_name",
    storageRef: "storage_ref",
    extractedText: "extracted_text",
    extractedOutline: "extracted_outline",
    componentMap: "component_map",
    detectionMeta: "detection_meta",
    extractionError: "extraction_error",
    mapConfirmed: "map_confirmed",
    mappedByUserId: "mapped_by_user_id",
    mappedAt: "mapped_at",
    createdByUserId: "created_by_user_id",
    deletedAt: "deleted_at",
    updatedAt: "updated_at",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
  desc: (x: unknown) => ({ desc: x }),
  isNull: (x: unknown) => ({ isNull: x }),
}));
vi.mock("@/lib/proposals/storage", () => ({
  getProposalStorage: () => ({ put: storagePutMock, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/proposals/ingest-docx", () => ({ extractDocx: extractDocxMock }));
vi.mock("@/lib/proposals/detect-components", () => {
  class DetectionUnavailable extends Error {
    reason: string;
    constructor(reason: string, msg: string) {
      super(msg);
      this.name = "DetectionUnavailable";
      this.reason = reason;
    }
  }
  return { detectComponents: detectMock, DetectionUnavailable };
});

const listRoute = await import("@/app/api/proposals/templates/route");
const idRoute = await import("@/app/api/proposals/templates/[id]/route");
const { DetectionUnavailable } = await import("@/lib/proposals/detect-components");

const CTX = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "member" };

const VALID_MAP = {
  version: 1,
  components: [
    {
      id: "a",
      kind: "section",
      label: "Executive Summary",
      placeholderToken: "{{exec}}",
      dataKey: null,
      anchor: { headingText: null, offset: null },
      required: true,
      confidence: "high",
      order: 0,
    },
    {
      id: "b",
      kind: "field",
      label: "Client",
      placeholderToken: "{{client}}",
      dataKey: "company.name",
      anchor: { headingText: null, offset: null },
      required: true,
      confidence: "high",
      order: 1,
    },
  ],
};

function selectChain(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}
function postReq(fd: FormData): Request {
  return { formData: async () => fd } as unknown as Request;
}
function jsonReq(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}
function docxFile(name = "tpl.docx", size?: number): File {
  // Real (small, valid) zip so the PROPOSAL-010 pre-flight inspector passes;
  // the oversize case keeps invalid bytes (the size gate fires before inspection).
  const bytes =
    size != null
      ? new Uint8Array(size)
      : new Uint8Array(writeZip([{ name: "word/document.xml", bytes: Buffer.from("<w:document/>", "utf8") }]));
  return new File([bytes], name);
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContextMock.mockResolvedValue(CTX);
  dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  dbMock.update.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
});

describe("POST /api/proposals/templates", () => {
  it("401 when unauthenticated", async () => {
    getAuthContextMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.append("file", docxFile());
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(401);
  });

  it("400 unsupported_format for a non-.docx", async () => {
    const fd = new FormData();
    fd.append("file", docxFile("notes.txt"));
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_format");
    expect(storagePutMock).not.toHaveBeenCalled();
  });

  it("400 file_too_large beyond 10MB", async () => {
    const fd = new FormData();
    fd.append("file", docxFile("big.docx", 10 * 1024 * 1024 + 1));
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_too_large");
  });

  it("422 unreadable_docx + status=failed when extraction fails", async () => {
    storagePutMock.mockResolvedValue("ref1");
    extractDocxMock.mockReturnValue({ text: "", outline: [], error: "not_a_docx" });
    const fd = new FormData();
    fd.append("file", docxFile());
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(422);
    expect((await res.json()).status).toBe("failed");
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("201 detected on the happy path", async () => {
    storagePutMock.mockResolvedValue("ref1");
    extractDocxMock.mockReturnValue({
      text: "Executive Summary\n...",
      outline: [{ level: 1, text: "Executive Summary", offset: 0 }],
    });
    detectMock.mockResolvedValue({
      componentMap: VALID_MAP,
      meta: { truncated: false, model: "m", componentCount: 2 },
    });
    const fd = new FormData();
    fd.append("file", docxFile());
    fd.append("name", "Standard SOW");
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("detected");
    expect(data.componentMap).toEqual(VALID_MAP);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("201 degraded (status stays uploaded) when detection abstains", async () => {
    storagePutMock.mockResolvedValue("ref1");
    extractDocxMock.mockReturnValue({ text: "Some text", outline: [] });
    detectMock.mockRejectedValue(
      new DetectionUnavailable("missing_required_data", "no model"),
    );
    const fd = new FormData();
    fd.append("file", docxFile());
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      status: "uploaded",
      degraded: true,
      degradationReason: "missing_required_data",
    });
    expect(data.userSuggestion).toBeTruthy();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("422 archive_rejected for a suspicious archive (too many entries)", async () => {
    const bomb = writeZip(
      Array.from({ length: 600 }, (_, i) => ({ name: `f${i}.xml`, bytes: Buffer.from("x") })),
    );
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(bomb)], "bomb.docx"));
    const res = await listRoute.POST(postReq(fd));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("archive_rejected");
  });
});

describe("GET /api/proposals/templates", () => {
  it("lists the tenant's templates", async () => {
    dbMock.select.mockReturnValue(
      selectChain([
        { id: "x", name: "n", sourceFormat: "docx", status: "mapped", updatedAt: new Date() },
      ]),
    );
    const res = await listRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).templates).toHaveLength(1);
  });
});

describe("GET/PATCH/DELETE /api/proposals/templates/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("404 when the template is not in the tenant", async () => {
    dbMock.select.mockReturnValue(selectChain([]));
    const res = await idRoute.GET(jsonReq({}), params("missing"));
    expect(res.status).toBe(404);
  });

  it("PATCH confirms a valid map -> status mapped", async () => {
    dbMock.select.mockReturnValue(selectChain([{ id: "tpl1" }]));
    const res = await idRoute.PATCH(jsonReq({ componentMap: VALID_MAP }), params("tpl1"));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("mapped");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("PATCH rejects an incomplete map (field without dataKey)", async () => {
    dbMock.select.mockReturnValue(selectChain([{ id: "tpl1" }]));
    const badMap = {
      version: 1,
      components: [
        {
          id: "b",
          kind: "field",
          label: "Client",
          placeholderToken: "{{client}}",
          dataKey: null,
          anchor: { headingText: null, offset: null },
          required: true,
          confidence: "high",
          order: 0,
        },
      ],
    };
    const res = await idRoute.PATCH(jsonReq({ componentMap: badMap }), params("tpl1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_map");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("DELETE soft-deletes", async () => {
    const res = await idRoute.DELETE(jsonReq({}), params("tpl1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });
});
