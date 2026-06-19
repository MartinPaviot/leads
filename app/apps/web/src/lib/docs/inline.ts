/**
 * Minimal inline emphasis for doc content strings: `**bold**` only.
 * Pure (no React) so the parsing is unit-testable; the renderer maps
 * segments to <strong> / text nodes. Anything else (links, code, italics)
 * is intentionally unsupported: docs copy stays plain and scannable.
 */

export interface InlineSegment {
  bold: boolean;
  text: string;
}

export function parseInline(text: string): InlineSegment[] {
  // Split on **...** pairs; odd indices are the bold captures.
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  const segments: InlineSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    segments.push({ bold: i % 2 === 1, text: parts[i] });
  }
  return segments;
}
