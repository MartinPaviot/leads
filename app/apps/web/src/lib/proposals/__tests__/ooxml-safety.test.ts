import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { writeZip, readAllZipEntries, inspectArchive, ArchiveTooLarge } from "../ooxml";

// A DEFLATE zip whose central-directory uncompressed size can be set
// independently of the real payload (to model an honest OR lying header).
function deflateZip(name: string, raw: Buffer, declaredUncomp?: number): Buffer {
  const data = deflateRawSync(raw);
  const nameBuf = Buffer.from(name, "utf8");
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(data.length, 18);
  lh.writeUInt32LE(raw.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  const local = Buffer.concat([lh, nameBuf, data]);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(data.length, 20);
  ch.writeUInt32LE(declaredUncomp ?? raw.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(0, 42);
  const central = Buffer.concat([ch, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

describe("inspectArchive (pre-flight, no inflation)", () => {
  it("rejects an archive that declares an oversized entry", () => {
    const buf = deflateZip("word/document.xml", Buffer.from("tiny"), 200 * 1024 * 1024);
    expect(inspectArchive(buf)).toMatchObject({ ok: false, reason: "entry_too_large" });
  });

  it("rejects an archive with too many entries", () => {
    const buf = writeZip(
      Array.from({ length: 600 }, (_, i) => ({ name: `f${i}.xml`, bytes: Buffer.from("x") })),
    );
    expect(inspectArchive(buf)).toMatchObject({ ok: false, reason: "too_many_entries" });
  });

  it("accepts a normal small archive", () => {
    const buf = writeZip([{ name: "word/document.xml", bytes: Buffer.from("<x/>") }]);
    expect(inspectArchive(buf)).toEqual({ ok: true });
  });

  it("rejects non-archive bytes", () => {
    expect(inspectArchive(Buffer.from("not a zip")).ok).toBe(false);
  });
});

describe("readAllZipEntries inflation cap", () => {
  it("throws ArchiveTooLarge when an entry inflates past the cap (lying header)", () => {
    const buf = deflateZip("word/document.xml", Buffer.alloc(100 * 1024, 0x41)); // 100KB real
    expect(() => readAllZipEntries(buf, { maxEntryBytes: 1024 })).toThrow(ArchiveTooLarge);
  });

  it("allows a normal archive under the cap", () => {
    const buf = writeZip([{ name: "a", bytes: Buffer.from("hello") }]);
    expect(readAllZipEntries(buf)).toHaveLength(1);
  });
});
