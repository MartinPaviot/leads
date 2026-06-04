/**
 * End-to-end verification of the PROPOSAL-002 DOCX writer on a structurally
 * complete, Word-openable template. No DB/LLM needed — it proves the fidelity
 * contract: the original package is preserved and only the anchored section
 * bodies are replaced. Produces two real .docx files to open in Word.
 *
 * Run: pnpm -C app/apps/web exec tsx scripts/verify-proposal-fill.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  writeZip,
  assembleFilledDocx,
  readAllZipEntries,
  readZipEntry,
  extractDocxText,
  type DocxFillComponent,
} from "../src/lib/proposals/ooxml";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`;

function heading(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}
function para(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
${heading("Executive Summary")}${para("[placeholder: executive summary]")}
${heading("Proposed Solution")}${para("[placeholder: solution]")}
${heading("Pricing")}${para("[placeholder: pricing]")}
${heading("Next Steps")}${para("[placeholder: next steps]")}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

function buildTemplate(): Buffer {
  return writeZip([
    { name: "[Content_Types].xml", bytes: Buffer.from(CONTENT_TYPES, "utf8") },
    { name: "_rels/.rels", bytes: Buffer.from(ROOT_RELS, "utf8") },
    { name: "word/document.xml", bytes: Buffer.from(DOCUMENT, "utf8") },
    { name: "word/styles.xml", bytes: Buffer.from(STYLES, "utf8") },
    { name: "word/_rels/document.xml.rels", bytes: Buffer.from(DOC_RELS, "utf8") },
  ]);
}

// Simulated fill output (what resolveFieldValue + generateSections produce).
const components: DocxFillComponent[] = [
  { id: "exec", kind: "section", anchorHeading: "Executive Summary" },
  { id: "sol", kind: "section", anchorHeading: "Proposed Solution" },
  { id: "price", kind: "section", anchorHeading: "Pricing" },
  { id: "next", kind: "section", anchorHeading: "Next Steps" },
];
const contentById: Record<string, string> = {
  exec:
    "Acme Corp is scaling a field sales team and is losing context to manual CRM entry. This proposal outlines how Elevay removes that overhead.\nBased on our call on May 28, the priority is faster proposal turnaround and clean pipeline data.",
  sol: "Elevay captures every interaction automatically and drafts outbound, briefs and proposals from a live information base — no manual data entry.",
  price: "Platform: $999 / month per seat. One-time onboarding: $12,000.",
  next: "Confirm scope with Sarah Chen (VP Engineering).\nKick off onboarding the week of June 16.",
};

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "[OK]  " : "[FAIL]"} ${name}`);
  if (!cond) failures++;
}

const template = buildTemplate();
const { bytes: filled, unplaced } = assembleFilledDocx(template, components, contentById);

const origEntries = new Map(readAllZipEntries(template).map((e) => [e.name, e.bytes]));
const filledEntries = new Map(readAllZipEntries(filled).map((e) => [e.name, e.bytes]));
const { text } = extractDocxText(filled);
const filledDoc = readZipEntry(filled, "word/document.xml")!.toString("utf8");

console.log("\n=== Filled document text ===\n" + text + "\n");
console.log("=== Fidelity checks ===");

check(
  "every package part preserved",
  [...origEntries.keys()].every((n) => filledEntries.has(n)) &&
    origEntries.size === filledEntries.size,
);
check(
  "styles.xml byte-identical (look untouched)",
  Buffer.compare(origEntries.get("word/styles.xml")!, filledEntries.get("word/styles.xml")!) === 0,
);
check(
  "[Content_Types].xml + rels byte-identical",
  Buffer.compare(origEntries.get("[Content_Types].xml")!, filledEntries.get("[Content_Types].xml")!) === 0 &&
    Buffer.compare(origEntries.get("_rels/.rels")!, filledEntries.get("_rels/.rels")!) === 0,
);
check(
  "all four headings preserved, in order",
  ["Executive Summary", "Proposed Solution", "Pricing", "Next Steps"].every((h) => text.includes(h)),
);
check("placeholders removed", !text.includes("[placeholder"));
check(
  "generated content present under each section",
  text.includes("Acme Corp is scaling") &&
    text.includes("no manual data entry") &&
    text.includes("$999 / month") &&
    text.includes("Sarah Chen"),
);
check("multi-paragraph section expanded (2 exec lines)", text.includes("priority is faster proposal turnaround"));
check("page setup (sectPr) preserved", filledDoc.includes("<w:sectPr>"));
check("heading run styling (bold/size) preserved on a heading", filledDoc.includes("<w:sz w:val=\"32\"/>"));
check("no components unplaced", unplaced.length === 0);
check("output is a valid re-readable zip", filledEntries.size === 5);

// scripts -> web -> apps -> app -> leads (repo root)
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "..", "_artifacts");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "proposal-sample-template.docx"), template);
writeFileSync(join(outDir, "proposal-sample-filled.docx"), filled);
console.log(`\nWrote sample files to ${outDir}`);
console.log(`  proposal-sample-template.docx (${template.length} bytes)`);
console.log(`  proposal-sample-filled.docx   (${filled.length} bytes)`);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll fidelity checks passed.");
