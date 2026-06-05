import { describe, it, expect } from "vitest";
import { writeZip, readAllZipEntries, type DocxFillComponent } from "../ooxml";
import { extractPptxText, extractPptx, assembleFilledPptx } from "../pptx";

const P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function slide(title: string, body: string): string {
  return `<p:sld ${P_NS} ${A_NS}><p:cSld><p:spTree>` +
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>` +
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>` +
    `</p:spTree></p:cSld></p:sld>`;
}

const PRESENTATION = `<p:presentation ${P_NS} ${R_NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>`;
const PRES_RELS = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`;

function fixturePptx(): Buffer {
  return writeZip([
    { name: "[Content_Types].xml", bytes: Buffer.from("<Types/>", "utf8") },
    { name: "ppt/presentation.xml", bytes: Buffer.from(PRESENTATION, "utf8") },
    { name: "ppt/_rels/presentation.xml.rels", bytes: Buffer.from(PRES_RELS, "utf8") },
    { name: "ppt/slides/slide1.xml", bytes: Buffer.from(slide("Executive Summary", "OLD body 1"), "utf8") },
    { name: "ppt/slides/slide2.xml", bytes: Buffer.from(slide("Pricing", "OLD body 2"), "utf8") },
  ]);
}

describe("extractPptxText", () => {
  it("extracts slide text in presentation order with a title outline", () => {
    const { text, outline } = extractPptxText(fixturePptx());
    expect(text.split("\n")).toEqual(["Executive Summary", "OLD body 1", "Pricing", "OLD body 2"]);
    expect(outline.map((h) => h.text)).toEqual(["Executive Summary", "Pricing"]);
  });

  it("extractPptx degrades to an error on non-pptx", () => {
    const res = extractPptx(Buffer.from("garbage"));
    expect(res.text).toBe("");
    expect(res.error).toBeTruthy();
  });
});

describe("assembleFilledPptx", () => {
  const components: DocxFillComponent[] = [
    { id: "s1", kind: "section", anchorHeading: "Executive Summary" },
    { id: "s2", kind: "section", anchorHeading: "Pricing" },
    { id: "ghost", kind: "section", anchorHeading: "Nope" },
  ];
  const contentById = { s1: "New exec\nLine two", s2: "New pricing" };

  it("replaces the body of the matching slide, preserves titles + other parts", () => {
    const { bytes, unplaced } = assembleFilledPptx(fixturePptx(), components, contentById);

    const { text } = extractPptxText(bytes);
    expect(text.split("\n")).toEqual([
      "Executive Summary",
      "New exec",
      "Line two",
      "Pricing",
      "New pricing",
    ]);
    expect(text).not.toContain("OLD body");
    expect(unplaced).toEqual(["ghost"]);

    // presentation.xml + content types untouched
    const entries = new Map(readAllZipEntries(bytes).map((e) => [e.name, e.bytes.toString("utf8")]));
    expect(entries.get("ppt/presentation.xml")).toBe(PRESENTATION);
    expect(entries.get("[Content_Types].xml")).toBe("<Types/>");
  });

  it("resets normAutofit so PowerPoint reflows the new text (PROPOSAL-011)", () => {
    const slideXml =
      `<p:sld ${P_NS} ${A_NS}><p:cSld><p:spTree>` +
      `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>Pricing</a:t></a:r></a:p></p:txBody></p:sp>` +
      `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr><a:normAutofit fontScale="62500" lnSpcReduction="20000"/></a:bodyPr><a:p><a:r><a:t>OLD</a:t></a:r></a:p></p:txBody></p:sp>` +
      `</p:spTree></p:cSld></p:sld>`;
    const fixture = writeZip([
      { name: "ppt/presentation.xml", bytes: Buffer.from(`<p:presentation ${P_NS} ${R_NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`, "utf8") },
      { name: "ppt/_rels/presentation.xml.rels", bytes: Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="x" Target="slides/slide1.xml"/></Relationships>`, "utf8") },
      { name: "ppt/slides/slide1.xml", bytes: Buffer.from(slideXml, "utf8") },
    ]);
    const { bytes } = assembleFilledPptx(
      fixture,
      [{ id: "s1", kind: "section", anchorHeading: "Pricing" }],
      { s1: "NEW pricing" },
    );
    const out = readAllZipEntries(bytes).find((e) => e.name === "ppt/slides/slide1.xml")!.bytes.toString();
    expect(out).toContain("NEW pricing");
    expect(out).toContain("<a:normAutofit/>");
    expect(out).not.toContain("fontScale");
  });
});
