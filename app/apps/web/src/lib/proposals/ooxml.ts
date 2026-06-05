/**
 * Zero-dependency OOXML (.docx) text + heading extraction.
 *
 * A .docx is a ZIP of XML parts. To feed the component detector we only
 * need the plain text of word/document.xml in document order plus the
 * heading outline. That requires nothing more than Node's zlib (DEFLATE)
 * and a small WordprocessingML scan — no third-party parser, so this runs
 * in any environment (including offline CI) and is fully deterministic.
 *
 * Scope: text + headings. It deliberately does NOT preserve tables/styling
 * (the detector does not need them). Richer fidelity (e.g. mammoth) can
 * replace this behind the extractDocx() interface later — see
 * _specs/proposal-autodraft/spec-issues.md SI-1.
 */

import { inflateRawSync, deflateRawSync } from "node:zlib";

export interface DocHeading {
  level: number; // 1..9
  text: string;
  offset: number; // char offset into the returned text where this heading begins
}

const EOCD_SIG = 0x06054b50; // End Of Central Directory
const CD_SIG = 0x02014b50; // Central Directory file header

// PROPOSAL-010: caps against zip-bomb / unbounded inflation.
export class ArchiveTooLarge extends Error {
  reason: string;
  constructor(reason: string) {
    super(`archive rejected: ${reason}`);
    this.name = "ArchiveTooLarge";
    this.reason = reason;
  }
}
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 512;

function inflateCapped(comp: Buffer, cap: number): Buffer {
  try {
    return inflateRawSync(comp, { maxOutputLength: cap });
  } catch (e) {
    if (e instanceof RangeError) throw new ArchiveTooLarge("entry_too_large");
    throw e;
  }
}

/**
 * Cheap pre-flight check (no inflation): reject archives whose central
 * directory declares too many entries or an implausibly large total/entry
 * uncompressed size. Catches classic (honest-header) zip bombs before any
 * allocation; lying headers are still caught by the inflate cap.
 */
export function inspectArchive(
  buf: Buffer,
  opts?: { maxEntryBytes?: number; maxTotalBytes?: number; maxEntries?: number },
): { ok: boolean; reason?: string } {
  const maxEntry = opts?.maxEntryBytes ?? MAX_ENTRY_BYTES;
  const maxTotal = opts?.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const maxEntries = opts?.maxEntries ?? MAX_ENTRIES;
  let eocd = -1;
  const minSearch = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minSearch; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: "not_an_archive" };
  const cdCount = buf.readUInt16LE(eocd + 10);
  if (cdCount > maxEntries) return { ok: false, reason: "too_many_entries" };
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) break;
    const uncompSize = buf.readUInt32LE(p + 24);
    if (uncompSize > maxEntry) return { ok: false, reason: "entry_too_large" };
    total += uncompSize;
    if (total > maxTotal) return { ok: false, reason: "package_too_large" };
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true };
}

/**
 * Read a single entry from a ZIP buffer by name, via the central
 * directory (robust against streamed/data-descriptor local headers).
 * Returns the decompressed bytes, or null if the entry is absent.
 * Supports STORE (0) and DEFLATE (8).
 */
export function readZipEntry(buf: Buffer, name: string): Buffer | null {
  // Locate the EOCD by scanning backwards (it sits at the tail, after an
  // optional comment of up to 65535 bytes).
  let eocd = -1;
  const minSearch = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minSearch; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const fname = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (fname === name) {
      // Jump to the local header to find where the data actually starts
      // (local name/extra lengths can differ from the central record).
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(comp);
      if (method === 8) return inflateCapped(comp, MAX_ENTRY_BYTES);
      return null; // unsupported compression
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // last, so &amp;lt; -> &lt;
}

function headingLevel(styleVal: string | null, outlineLvl: string | null): number | null {
  if (styleVal) {
    // Word style ids: "Heading1".."Heading9"; FR templates sometimes "Titre1".
    const m = styleVal.match(/^(?:heading|titre)\s*([1-9])$/i);
    if (m) return parseInt(m[1], 10);
    if (/heading|titre|^title$/i.test(styleVal)) return 1;
  }
  if (outlineLvl != null) {
    const lvl = parseInt(outlineLvl, 10);
    if (!Number.isNaN(lvl)) return Math.min(lvl + 1, 9);
  }
  return null;
}

/**
 * Parse word/document.xml into plain text (paragraphs joined by "\n",
 * table cell paragraphs included in document order) and a heading outline.
 */
export function parseDocumentXml(xml: string): { text: string; outline: DocHeading[] } {
  const bodyMatch = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/);
  const body = bodyMatch ? bodyMatch[1] : xml;

  const lines: string[] = [];
  const outline: DocHeading[] = [];
  let offset = 0;

  // Match a paragraph in either form: <w:p .../> (empty) or <w:p ...>..</w:p>.
  const paraRe = /<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(body)) !== null) {
    const inner = m[1] ?? "";

    // Text: concatenate every <w:t> run (Word splits words across runs,
    // so an empty join is correct).
    let paraText = "";
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) {
      paraText += decodeXmlEntities(t[1]);
    }

    // Heading detection from paragraph properties.
    const styleVal = inner.match(/<w:pStyle\b[^>]*\bw:val="([^"]*)"/)?.[1] ?? null;
    const outlineLvl = inner.match(/<w:outlineLvl\b[^>]*\bw:val="(\d+)"/)?.[1] ?? null;
    const level = headingLevel(styleVal, outlineLvl);

    if (level != null && paraText.trim()) {
      outline.push({ level, text: paraText.trim(), offset });
    }
    lines.push(paraText);
    offset += paraText.length + 1; // +1 for the joining "\n"
  }

  return { text: lines.join("\n"), outline };
}

/** Extract text + outline from raw .docx bytes. Throws on a non-docx. */
export function extractDocxText(buf: Buffer): { text: string; outline: DocHeading[] } {
  const xml = readZipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("not_a_docx");
  return parseDocumentXml(xml.toString("utf8"));
}

// ──────────────────────────────────────────────────────────────────
// Write side (PROPOSAL-002): fill a template and re-emit the .docx.
// ──────────────────────────────────────────────────────────────────

/** Read every entry from a ZIP (STORE + DEFLATE), in central-directory order. */
export function readAllZipEntries(
  buf: Buffer,
  opts?: { maxEntryBytes?: number; maxTotalBytes?: number; maxEntries?: number },
): Array<{ name: string; bytes: Buffer }> {
  const maxEntry = opts?.maxEntryBytes ?? MAX_ENTRY_BYTES;
  const maxTotal = opts?.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const maxEntries = opts?.maxEntries ?? MAX_ENTRIES;
  const out: Array<{ name: string; bytes: Buffer }> = [];
  let eocd = -1;
  const minSearch = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minSearch; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const cdCount = buf.readUInt16LE(eocd + 10);
  if (cdCount > maxEntries) throw new ArchiveTooLarge("too_many_entries");
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let bytes: Buffer;
    if (method === 0) bytes = Buffer.from(comp);
    else if (method === 8) bytes = inflateCapped(comp, maxEntry);
    else bytes = Buffer.alloc(0);
    if (bytes.length > maxEntry) throw new ArchiveTooLarge("entry_too_large");
    total += bytes.length;
    if (total > maxTotal) throw new ArchiveTooLarge("package_too_large");
    out.push({ name, bytes });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Re-emit a ZIP using the STORE method (no compression). Word reads it fine. */
export function writeZip(entries: Array<{ name: string; bytes: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    // PROPOSAL-011: DEFLATE so the rewritten package is not larger than the input.
    const raw = e.bytes;
    const data = deflateRawSync(raw);
    const crc = crc32(raw); // CRC is of the UNCOMPRESSED bytes

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); // DEFLATE
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); // compressed size
    lh.writeUInt32LE(raw.length, 22); // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); // DEFLATE
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); // compressed
    ch.writeUInt32LE(raw.length, 24); // uncompressed (also read by inspectArchive)
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42); // local header offset
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const localBuf = Buffer.concat(locals);
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface ParaInfo {
  start: number;
  end: number;
  full: string;
  text: string;
  isHeading: boolean;
  pPr: string;
  rPr: string;
}

function scanParagraphs(xml: string): ParaInfo[] {
  const re = /<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  const out: ParaInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[1] ?? "";
    let text = "";
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) text += decodeXmlEntities(t[1]);
    const styleVal = inner.match(/<w:pStyle\b[^>]*\bw:val="([^"]*)"/)?.[1] ?? null;
    const outlineLvl = inner.match(/<w:outlineLvl\b[^>]*\bw:val="(\d+)"/)?.[1] ?? null;
    out.push({
      start: m.index,
      end: re.lastIndex,
      full: m[0],
      text: text.trim(),
      isHeading: headingLevel(styleVal, outlineLvl) != null,
      pPr: inner.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "",
      rPr: inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "",
    });
  }
  return out;
}

function contentToParagraphs(content: string, pPr: string, rPr: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines
    .map((l) => `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(l)}</w:t></w:r></w:p>`)
    .join("");
}

export interface DocxFillComponent {
  id: string;
  kind: string; // 'section' | 'field'
  anchorHeading: string | null;
}

export interface AssembleResult {
  bytes: Buffer;
  unplaced: string[]; // component ids that could not be located in the document
}

// ── Anchor reconciliation (PROPOSAL-008) ───────────────────────────
// Heading anchors must survive drift between what the LLM returned and the
// document's exact text. Match exact -> normalized -> fuzzy so a case/space
// difference can never silently drop a component.

function normHeading(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(normHeading(a).split(" ").filter(Boolean));
  const tb = new Set(normHeading(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/** Best match of `target` in `candidates`: exact -> normalized -> fuzzy(>=0.9). Index or -1. */
export function matchHeading(candidates: string[], target: string): number {
  const t = target.trim();
  let i = candidates.findIndex((c) => c.trim() === t);
  if (i >= 0) return i;
  const nt = normHeading(t);
  i = candidates.findIndex((c) => normHeading(c) === nt);
  if (i >= 0) return i;
  let best = -1;
  let bestScore = 0.9;
  candidates.forEach((c, idx) => {
    const s = tokenSetRatio(c, t);
    if (s >= bestScore) {
      bestScore = s;
      best = idx;
    }
  });
  return best;
}

/** Match an anchor to a paragraph index, respecting `used`; fuzzy only on headings. */
function matchParagraph(paras: ParaInfo[], used: Set<number>, target: string): number {
  const t = target.trim();
  for (let i = 0; i < paras.length; i++) if (!used.has(i) && paras[i].text.trim() === t) return i;
  const nt = normHeading(t);
  for (let i = 0; i < paras.length; i++) if (!used.has(i) && normHeading(paras[i].text) === nt) return i;
  let best = -1;
  let bestScore = 0.9;
  for (let i = 0; i < paras.length; i++) {
    if (used.has(i) || !paras[i].isHeading) continue;
    const s = tokenSetRatio(paras[i].text, t);
    if (s >= bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

function fillDocumentXml(
  xml: string,
  components: DocxFillComponent[],
  contentById: Record<string, string>,
): { xml: string; unplaced: string[] } {
  const paras = scanParagraphs(xml);
  const unplaced: string[] = [];

  // Each anchored component -> the first unused paragraph whose text matches.
  const used = new Set<number>();
  const compHeading = new Map<number, number>();
  components.forEach((c, ci) => {
    const target = c.anchorHeading?.trim();
    if (!target) {
      unplaced.push(c.id);
      return;
    }
    const found = matchParagraph(paras, used, target);
    if (found < 0) {
      unplaced.push(c.id);
      return;
    }
    used.add(found);
    compHeading.set(ci, found);
  });

  const mappedHeading = new Set<number>([...compHeading.values()]);
  type Action =
    | { type: "keep" }
    | { type: "delete" }
    | { type: "replace"; html: string }
    | { type: "appendAfter"; html: string };
  const actions: Action[] = paras.map(() => ({ type: "keep" }));

  for (const [ci, h] of compHeading) {
    const content = contentById[components[ci].id] ?? "";
    // Region ends at the next anchored heading or any heading paragraph.
    let boundary = paras.length;
    for (let j = h + 1; j < paras.length; j++) {
      if (mappedHeading.has(j) || paras[j].isHeading) {
        boundary = j;
        break;
      }
    }
    const firstBody = h + 1;
    if (firstBody < boundary) {
      const html = contentToParagraphs(content, paras[firstBody].pPr, paras[firstBody].rPr);
      actions[firstBody] = html ? { type: "replace", html } : { type: "delete" };
      for (let j = firstBody + 1; j < boundary; j++) actions[j] = { type: "delete" };
    } else {
      const html = contentToParagraphs(content, paras[h].pPr, "");
      if (html) actions[h] = { type: "appendAfter", html };
    }
  }

  let result = "";
  let cursor = 0;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    result += xml.slice(cursor, p.start);
    const a = actions[i];
    if (a.type === "keep") result += p.full;
    else if (a.type === "replace") result += a.html;
    else if (a.type === "appendAfter") result += p.full + a.html;
    // 'delete' emits nothing
    cursor = p.end;
  }
  result += xml.slice(cursor);
  return { xml: result, unplaced };
}

/**
 * Produce a filled .docx from the original template bytes: replace each
 * anchored component's region with its content, leave every other zip entry
 * (styles.xml, headers, media, tables) untouched.
 */
export function assembleFilledDocx(
  originalBytes: Buffer,
  components: DocxFillComponent[],
  contentById: Record<string, string>,
): AssembleResult {
  const entries = readAllZipEntries(originalBytes);
  const docIdx = entries.findIndex((e) => e.name === "word/document.xml");
  if (docIdx < 0) throw new Error("not_a_docx");
  const { xml, unplaced } = fillDocumentXml(
    entries[docIdx].bytes.toString("utf8"),
    components,
    contentById,
  );
  entries[docIdx] = { name: "word/document.xml", bytes: Buffer.from(xml, "utf8") };
  return { bytes: writeZip(entries), unplaced };
}
