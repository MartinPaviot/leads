/**
 * Zero-dependency PPTX (PresentationML) text extraction + fill.
 *
 * A .pptx is a ZIP of OOXML like .docx, but text lives in the DrawingML
 * `a:` namespace inside slide shapes (`p:sp` -> `p:txBody` -> `a:p` -> `a:r`
 * -> `a:t`), and slide order is defined by ppt/presentation.xml + its rels.
 *
 * Reuses the OOXML zip read/write infra. Detection and the fill/trust engine
 * are format-agnostic and unchanged — only extraction + assembly are here.
 * v1 envelope: title-anchored replacement of the first non-title text
 * placeholder per slide (see _specs/proposal-autodraft/spec-issues.md SI-4).
 */

import {
  readAllZipEntries,
  writeZip,
  decodeXmlEntities,
  xmlEscape,
  matchHeading,
  type DocHeading,
  type DocxFillComponent,
  type AssembleResult,
} from "./ooxml";

function slideOrder(byName: Map<string, Buffer>): string[] {
  const pres = byName.get("ppt/presentation.xml")?.toString("utf8");
  const rels = byName.get("ppt/_rels/presentation.xml.rels")?.toString("utf8");
  if (pres && rels) {
    const relMap = new Map<string, string>();
    for (const rel of rels.matchAll(/<Relationship\b[^>]*?\/?>/g)) {
      const id = rel[0].match(/\bId="([^"]+)"/)?.[1];
      const target = rel[0].match(/\bTarget="([^"]+)"/)?.[1];
      if (id && target) relMap.set(id, target);
    }
    const order: string[] = [];
    for (const m of pres.matchAll(/<p:sldId\b[^>]*?\br:id="([^"]+)"/g)) {
      const target = relMap.get(m[1]);
      if (!target) continue;
      const clean = target.replace(/^\/+/, "").replace(/^\.\.\//, "");
      order.push(clean.startsWith("ppt/") ? clean : `ppt/${clean}`);
    }
    if (order.length) return order;
  }
  // Fallback: numeric sort of slide files.
  return [...byName.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(
      (a, b) =>
        parseInt(a.match(/slide(\d+)/)![1], 10) - parseInt(b.match(/slide(\d+)/)![1], 10),
    );
}

function shapeText(shape: string): string {
  const out: string[] = [];
  for (const p of shape.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let t = "";
    for (const tm of p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)) t += decodeXmlEntities(tm[1]);
    if (t) out.push(t);
  }
  return out.join("\n");
}

function parseSlide(xml: string): { title: string | null; lines: string[] } {
  let title: string | null = null;
  const lines: string[] = [];
  for (const s of xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
    const shape = s[0];
    const txt = shapeText(shape);
    if (!txt.trim()) continue;
    const isTitle = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shape);
    if (isTitle && title === null) title = txt.trim();
    lines.push(txt);
  }
  return { title, lines };
}

/** Extract slide text (document order) + a slide-title outline. */
export function extractPptxText(buf: Buffer): { text: string; outline: DocHeading[] } {
  const entries = readAllZipEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e.bytes] as const));
  if (![...byName.keys()].some((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    throw new Error("not_a_pptx");
  }
  let text = "";
  const outline: DocHeading[] = [];
  for (const name of slideOrder(byName)) {
    const xml = byName.get(name)?.toString("utf8");
    if (!xml) continue;
    const { title, lines } = parseSlide(xml);
    let titleRecorded = false;
    for (const l of lines) {
      if (text) text += "\n";
      const off = text.length;
      if (title !== null && !titleRecorded && l.trim() === title) {
        outline.push({ level: 1, text: title, offset: off });
        titleRecorded = true;
      }
      text += l;
    }
  }
  return { text, outline };
}

/** Never-throws wrapper for the upload route (mirrors ingest-docx.extractDocx). */
export function extractPptx(
  bytes: Buffer | Uint8Array,
): { text: string; outline: DocHeading[]; error?: string } {
  try {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return extractPptxText(buf);
  } catch (e) {
    return { text: "", outline: [], error: e instanceof Error ? e.message : "extract_failed" };
  }
}

/** Replace the first non-title text placeholder's body with `content`. */
function fillSlideBody(xml: string, content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let bodyShape: string | null = null;
  for (const s of xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
    const shape = s[0];
    const isTitle = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shape);
    const hasText = /<a:t\b[^>]*>[\s\S]*?<\/a:t>/.test(shape);
    if (!isTitle && hasText) {
      bodyShape = shape;
      break;
    }
  }
  if (!bodyShape) return xml;

  const txBody = bodyShape.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
  if (!txBody) return xml;
  const inner = txBody[1];
  const bodyPrRaw = inner.match(/<a:bodyPr\b[\s\S]*?(?:\/>|<\/a:bodyPr>)/)?.[0] ?? "<a:bodyPr/>";
  // PROPOSAL-011: drop the precomputed autofit scale so PowerPoint reflows the
  // (possibly longer) generated text instead of overflowing the placeholder.
  const bodyPr = bodyPrRaw
    .replace(/<a:normAutofit\b[^>]*\/>/g, "<a:normAutofit/>")
    .replace(/<a:normAutofit\b[^>]*>[\s\S]*?<\/a:normAutofit>/g, "<a:normAutofit/>");
  const lstStyle = inner.match(/<a:lstStyle\b[\s\S]*?(?:\/>|<\/a:lstStyle>)/)?.[0] ?? "<a:lstStyle/>";
  const rPr = inner.match(/<a:rPr\b[\s\S]*?(?:\/>|<\/a:rPr>)/)?.[0] ?? "";

  const paras = (lines.length ? lines : [""])
    .map((l) => `<a:p><a:r>${rPr}<a:t>${xmlEscape(l)}</a:t></a:r></a:p>`)
    .join("");
  const newTxBody = `<p:txBody>${bodyPr}${lstStyle}${paras}</p:txBody>`;
  const newShape = bodyShape.replace(/<p:txBody>[\s\S]*?<\/p:txBody>/, newTxBody);
  return xml.replace(bodyShape, newShape);
}

/**
 * Produce a filled .pptx: for each component anchored to a slide title,
 * replace that slide's body placeholder with its content. Every other zip
 * entry (masters, layouts, theme, media) is left untouched.
 */
export function assembleFilledPptx(
  originalBytes: Buffer,
  components: DocxFillComponent[],
  contentById: Record<string, string>,
): AssembleResult {
  const entries = readAllZipEntries(originalBytes);
  const idxByName = new Map(entries.map((e, i) => [e.name, i] as const));
  const byName = new Map(entries.map((e) => [e.name, e.bytes] as const));
  const order = slideOrder(byName);

  const titleByName = new Map<string, string>();
  for (const name of order) {
    const xml = byName.get(name)?.toString("utf8");
    if (!xml) continue;
    const { title } = parseSlide(xml);
    if (title) titleByName.set(name, title.trim());
  }

  const unplaced: string[] = [];
  const used = new Set<string>();
  for (const c of components) {
    const target = c.anchorHeading?.trim();
    if (!target) {
      unplaced.push(c.id);
      continue;
    }
    const candidates = order.filter((n) => !used.has(n));
    const mi = matchHeading(
      candidates.map((n) => titleByName.get(n) ?? ""),
      target,
    );
    const slideName = mi >= 0 ? candidates[mi] : undefined;
    if (slideName === undefined) {
      unplaced.push(c.id);
      continue;
    }
    used.add(slideName);
    const i = idxByName.get(slideName)!;
    const newXml = fillSlideBody(entries[i].bytes.toString("utf8"), contentById[c.id] ?? "");
    entries[i] = { name: slideName, bytes: Buffer.from(newXml, "utf8") };
  }

  return { bytes: writeZip(entries), unplaced };
}
