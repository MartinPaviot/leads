import { describe, it, expect } from "vitest";
import {
  writeZip,
  readAllZipEntries,
  assembleFilledDocx,
  extractDocxText,
  readZipEntry,
  type DocxFillComponent,
} from "../ooxml";

const DOC_XML = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Executive Summary</w:t></w:r></w:p>
<w:p><w:r><w:t>OLD exec body</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Pricing</w:t></w:r></w:p>
<w:p><w:r><w:t>OLD pricing body</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body></w:document>`;

function fixtureDocx(): Buffer {
  return writeZip([
    { name: "word/document.xml", bytes: Buffer.from(DOC_XML, "utf8") },
    { name: "word/styles.xml", bytes: Buffer.from("<w:styles/>", "utf8") },
  ]);
}

describe("writeZip / readAllZipEntries round-trip", () => {
  it("round-trips multiple entries with valid CRCs", () => {
    const entries = readAllZipEntries(fixtureDocx());
    expect(entries.map((e) => e.name).sort()).toEqual(["word/document.xml", "word/styles.xml"]);
    expect(entries.find((e) => e.name === "word/styles.xml")!.bytes.toString()).toBe("<w:styles/>");
  });

  it("compresses entries losslessly (DEFLATE, PROPOSAL-011)", () => {
    const big = Buffer.from("A".repeat(50000), "utf8");
    const z = writeZip([{ name: "a.xml", bytes: big }]);
    expect(z.length).toBeLessThan(big.length); // smaller than the raw payload
    expect(readAllZipEntries(z)[0].bytes.toString()).toBe(big.toString()); // lossless
  });
});

describe("assembleFilledDocx", () => {
  const components: DocxFillComponent[] = [
    { id: "sec1", kind: "section", anchorHeading: "Executive Summary" },
    { id: "sec2", kind: "section", anchorHeading: "Pricing" },
    { id: "ghost", kind: "section", anchorHeading: "Nonexistent" },
  ];
  const contentById = {
    sec1: "New exec line one\nNew exec line two",
    sec2: "New pricing body",
  };

  it("replaces anchored bodies, preserves headings + sectPr + other entries", () => {
    const { bytes, unplaced } = assembleFilledDocx(fixtureDocx(), components, contentById);

    const { text, outline } = extractDocxText(bytes);
    expect(text.split("\n")).toEqual([
      "Executive Summary",
      "New exec line one",
      "New exec line two",
      "Pricing",
      "New pricing body",
    ]);
    expect(outline.map((h) => h.text)).toEqual(["Executive Summary", "Pricing"]);
    expect(text).not.toContain("OLD exec body");
    expect(text).not.toContain("OLD pricing body");

    // anchor not found -> reported, never mis-placed
    expect(unplaced).toEqual(["ghost"]);

    // structural parts survive
    const newDoc = readZipEntry(bytes, "word/document.xml")!.toString("utf8");
    expect(newDoc).toContain("<w:sectPr>");
    expect(
      readAllZipEntries(bytes).find((e) => e.name === "word/styles.xml")!.bytes.toString(),
    ).toBe("<w:styles/>");
  });

  it("reconciles a drifted anchor (case + spacing) instead of dropping it — PROPOSAL-008", () => {
    const drifted: DocxFillComponent[] = [
      { id: "sec1", kind: "section", anchorHeading: "  executive   SUMMARY " },
    ];
    const { bytes, unplaced } = assembleFilledDocx(fixtureDocx(), drifted, {
      sec1: "RECONCILED CONTENT",
    });
    const { text } = extractDocxText(bytes);
    // C1 regression: previously this silently dropped the content (unplaced).
    expect(unplaced).toEqual([]);
    expect(text).toContain("RECONCILED CONTENT");
    expect(text).not.toContain("OLD exec body");
  });
});
