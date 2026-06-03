import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readZipEntry, parseDocumentXml, extractDocxText } from "../ooxml";
import { extractDocx } from "../ingest-docx";

/**
 * Build a minimal .docx (a ZIP with one word/document.xml entry). Supports
 * STORE and DEFLATE so we exercise both decompression paths of the reader.
 * CRC is left 0 — the reader does not verify it.
 */
function makeDocx(documentXml: string, opts: { compress?: boolean } = {}): Buffer {
  const name = "word/document.xml";
  const nameBuf = Buffer.from(name, "utf8");
  const raw = Buffer.from(documentXml, "utf8");
  const compress = opts.compress ?? false;
  const data = compress ? deflateRawSync(raw) : raw;
  const method = compress ? 8 : 0;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(method, 8);
  lh.writeUInt32LE(0, 14); // crc
  lh.writeUInt32LE(data.length, 18);
  lh.writeUInt32LE(raw.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  const local = Buffer.concat([lh, nameBuf, data]);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(method, 10);
  ch.writeUInt32LE(0, 16); // crc
  ch.writeUInt32LE(data.length, 20);
  ch.writeUInt32LE(raw.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(0, 42); // local header offset
  const central = Buffer.concat([ch, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16); // central dir starts right after local
  return Buffer.concat([local, central, eocd]);
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Executive Summary</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>
<w:p><w:r><w:t>Tom &amp; Jerry</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Pricing</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Price</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body>
</w:document>`;

describe("ooxml — parseDocumentXml", () => {
  it("extracts paragraph text in document order, joining split runs", () => {
    const { text } = parseDocumentXml(SAMPLE_XML);
    const lines = text.split("\n");
    expect(lines).toEqual([
      "Executive Summary",
      "Hello world", // two runs joined
      "Tom & Jerry", // entity decoded
      "Pricing",
      "Item", // table cell
      "Price", // table cell
    ]);
  });

  it("builds a heading outline with correct levels and offsets", () => {
    const { text, outline } = parseDocumentXml(SAMPLE_XML);
    expect(outline).toEqual([
      { level: 1, text: "Executive Summary", offset: 0 },
      { level: 2, text: "Pricing", offset: text.indexOf("Pricing") },
    ]);
    // Offset actually points at the heading inside the text.
    expect(text.slice(outline[1].offset, outline[1].offset + 7)).toBe("Pricing");
  });
});

describe("ooxml — readZipEntry / extractDocxText", () => {
  it("reads a STORE-compressed entry", () => {
    const buf = makeDocx(SAMPLE_XML, { compress: false });
    const { text } = extractDocxText(buf);
    expect(text).toContain("Executive Summary");
    expect(text).toContain("Pricing");
  });

  it("reads a DEFLATE-compressed entry", () => {
    const buf = makeDocx(SAMPLE_XML, { compress: true });
    const { outline } = extractDocxText(buf);
    expect(outline.map((h) => h.text)).toEqual(["Executive Summary", "Pricing"]);
  });

  it("returns null for an absent entry", () => {
    const buf = makeDocx(SAMPLE_XML);
    expect(readZipEntry(buf, "word/footer1.xml")).toBeNull();
  });

  it("throws on bytes that are not a docx", () => {
    expect(() => extractDocxText(Buffer.from("not a zip at all"))).toThrow("not_a_docx");
  });
});

describe("ingest-docx — extractDocx never throws", () => {
  it("degrades to an error code on corrupt input", () => {
    const res = extractDocx(Buffer.from("garbage"));
    expect(res.text).toBe("");
    expect(res.outline).toEqual([]);
    expect(res.error).toBeTruthy();
  });

  it("returns text + outline on a valid docx", () => {
    const res = extractDocx(makeDocx(SAMPLE_XML, { compress: true }));
    expect(res.error).toBeUndefined();
    expect(res.text).toContain("Hello world");
    expect(res.outline).toHaveLength(2);
  });
});
