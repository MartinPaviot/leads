import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), select: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/db", () => ({ db: dbMock }));
vi.mock("@/db/schema", () => ({
  proposalAssets: {
    id: "id",
    tenantId: "tenant_id",
    contentType: "content_type",
    byteSize: "byte_size",
    bytes: "bytes",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
}));

const { getProposalStorage } = await import("../storage");

function chainOf(rows: unknown[]) {
  const self: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) self[m] = () => self;
  self.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
    Promise.resolve(rows).then(res, rej);
  return self;
}

beforeEach(() => vi.clearAllMocks());

describe("DbBlobStorage (default ProposalStorage)", () => {
  it("put stores tenant-scoped bytes and returns a ref", async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values: valuesMock });

    const bytes = Buffer.from("PK-fake-docx");
    const ref = await getProposalStorage().put("t1", bytes, "application/docx");

    expect(typeof ref).toBe("string");
    const row = valuesMock.mock.calls[0][0];
    expect(row).toMatchObject({
      id: ref,
      tenantId: "t1",
      contentType: "application/docx",
      byteSize: bytes.length,
    });
    expect(Buffer.isBuffer(row.bytes)).toBe(true);
  });

  it("get returns the asset for the owning tenant", async () => {
    dbMock.select.mockReturnValue(
      chainOf([{ bytes: Buffer.from("hi"), contentType: "application/docx" }]),
    );
    const asset = await getProposalStorage().get("t1", "ref1");
    expect(asset).not.toBeNull();
    expect(asset!.bytes.toString()).toBe("hi");
    expect(asset!.contentType).toBe("application/docx");
  });

  it("get returns null for a missing / cross-tenant ref", async () => {
    dbMock.select.mockReturnValue(chainOf([]));
    expect(await getProposalStorage().get("t2", "ref1")).toBeNull();
  });

  it("delete is tenant-scoped", async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    dbMock.delete.mockReturnValue({ where: whereMock });
    await getProposalStorage().delete("t1", "ref1");
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});
