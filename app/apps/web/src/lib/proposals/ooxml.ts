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

import { inflateRawSync } from "node:zlib";

export interface DocHeading {
  level: number; // 1..9
  text: string;
  offset: number; // char offset into the returned text where this heading begins
}

const EOCD_SIG = 0x06054b50; // End Of Central Directory
const CD_SIG = 0x02014b50; // Central Directory file header

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
      if (method === 8) return inflateRawSync(comp);
      return null; // unsupported compression
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlEntities(s: string): string {
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
