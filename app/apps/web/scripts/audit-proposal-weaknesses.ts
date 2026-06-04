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
import { writeZip, assembleFilledDocx, readAllZipEntries, extractDocxText } from "../src/lib/proposals/ooxml";

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
function deflateZip(name: string, raw: Buffer): Buffer {
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
  ch.writeUInt32LE(raw.length, 24);
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

const payload = Buffer.alloc(8 * 1024 * 1024, 0x41); // 8 MB, highly compressible
const bombZip = deflateZip("word/document.xml", payload);
const entries = readAllZipEntries(bombZip);
const decompressed = entries[0].bytes.length;
console.log(`  compressed zip size: ${(bombZip.length / 1024).toFixed(1)} KB`);
console.log(`  decompressed entry:  ${(decompressed / (1024 * 1024)).toFixed(1)} MB`);
console.log(`  amplification:       ${Math.round(decompressed / bombZip.length)}x with NO cap`);
console.log("  VERDICT: a small upload can force unbounded memory allocation. CONFIRMED (scale linearly to a GB bomb).");
