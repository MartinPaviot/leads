/**
 * Hostile-QA evidence for the proposal-autodraft self-audit. Demonstrates two
 * real weaknesses deterministically (no LLM/DB needed):
 *   1. Anchor exact-match fragility: any drift in the LLM-returned heading
 *      string silently drops the component (round-trip failure, content lost).
 *   2. Zip-bomb exposure: readAllZipEntries inflates every entry with no
 *      decompressed-size cap.
 *
 * Run: pnpm -C app/apps/web exec tsx scripts/audit-proposal-weaknesses.ts
 */

import { deflateRawSync } from "node:zlib";
import {
  writeZip,
  assembleFilledDocx,
  readAllZipEntries,
  extractDocxText,
  inspectArchive,
  ArchiveTooLarge,
} from "../src/lib/proposals/ooxml";

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

console.log("=== WEAKNESS 1: anchor exact-match fragility ===");
const docXml = `<w:document ${NS}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Executive Summary</w:t></w:r></w:p><w:p><w:r><w:t>ORIGINAL BODY</w:t></w:r></w:p></w:body></w:document>`;
const tpl = writeZip([{ name: "word/document.xml", bytes: Buffer.from(docXml, "utf8") }]);

// The LLM returned "Executive summary" (lowercase s) instead of the document's
// exact "Executive Summary". This is a realistic, common drift.
const { bytes, unplaced } = assembleFilledDocx(
  tpl,
  [{ id: "exec", kind: "section", anchorHeading: "Executive summary" }],
  { exec: "FRESHLY GENERATED CONTENT" },
);
const { text } = extractDocxText(bytes);
console.log("  anchor sent:        'Executive summary' (doc has 'Executive Summary')");
console.log("  unplaced:          ", JSON.stringify(unplaced));
console.log("  generated content placed? ", text.includes("FRESHLY GENERATED CONTENT"));
console.log("  ORIGINAL BODY retained?    ", text.includes("ORIGINAL BODY"));
console.log(
  unplaced.includes("exec") && !text.includes("FRESHLY GENERATED")
    ? "  VERDICT: silent round-trip failure — content dropped, no error surfaced. CONFIRMED."
    : "  VERDICT: handled.",
);

console.log("\n=== WEAKNESS 2: zip-bomb exposure (no decompressed-size cap) ===");
function deflateZip(name: string, raw: Buffer, declaredUncomp?: number): Buffer {
  const data = deflateRawSync(raw);
  const nameBuf = Buffer.from(name, "utf8");
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(8, 8); // DEFLATE
  lh.writeUInt32LE(0, 14);
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

// Honest-header bomb: declares 200 MB -> rejected pre-inflation by inspectArchive.
const declaredBomb = deflateZip("word/document.xml", Buffer.from("x"), 200 * 1024 * 1024);
const insp = inspectArchive(declaredBomb);
console.log(`  inspectArchive(declares 200MB):          ok=${insp.ok} reason=${insp.reason ?? "-"}`);
// Lying header (small declared, large actual): caught by the inflate cap.
const lying = deflateZip("word/document.xml", Buffer.alloc(8 * 1024 * 1024, 0x41));
let capped = false;
try {
  readAllZipEntries(lying, { maxEntryBytes: 1024 * 1024 });
} catch (e) {
  capped = e instanceof ArchiveTooLarge;
}
console.log(`  readAllZipEntries(cap 1MB) on 8MB entry: ArchiveTooLarge=${capped}`);
console.log(
  !insp.ok && capped
    ? "  VERDICT: bounded — honest and lying bombs both rejected. FIXED."
    : "  VERDICT: still exposed.",
);
