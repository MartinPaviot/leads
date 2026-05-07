/**
 * Citation parser for coaching responses (MONACO-PARITY-05).
 *
 * The system prompt instructs the LLM to format every transcript
 * citation as `[mm:ss]` immediately preceding the verbatim quote.
 * This module finds those markers in markdown output and returns
 * them as structured tokens so the chat renderer can replace each
 * with a clickable chip that seeks the meeting recording.
 *
 * Pure function. No regex eval, no DOM. Tests in
 * `__tests__/citation-parser.test.ts`.
 *
 * Format we accept:
 *   - `[mm:ss]`     e.g. `[12:34]`
 *   - `[hh:mm:ss]`  e.g. `[1:02:03]`
 *   - `[m:ss]`      e.g. `[5:09]` (single-digit minute)
 *
 * What we DON'T accept (deliberately strict to avoid false positives):
 *   - Plain numbers in brackets (e.g. `[12]` — could be a footnote).
 *   - Negative offsets.
 *   - Hours > 9 (a 10-hour meeting is implausible; reject to keep the
 *     pattern tight).
 *
 * Range-checks: we cap minutes/seconds at 59 — `[99:99]` is rejected.
 */

export interface CitationToken {
  /** Index in the original string where the `[` begins. */
  startIndex: number;
  /** Index AFTER the `]` (exclusive) — usable as `slice` end. */
  endIndex: number;
  /** Raw matched text including brackets, e.g. `[12:34]`. */
  raw: string;
  /** Total seconds from start of recording. Validated, never NaN. */
  seconds: number;
  /** Display form normalised to `hh:mm:ss` when ≥1h, else `mm:ss`. */
  display: string;
}

const PATTERN = /\[(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?\]/g;

/**
 * Find all citation tokens in `text`. Iteration order matches their
 * position in the source so renderers can splice them in left-to-right
 * without shifting indices.
 */
export function parseCitations(text: string): CitationToken[] {
  if (!text) return [];

  const tokens: CitationToken[] = [];
  // Reset pattern state — global regexes carry lastIndex.
  PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(text)) !== null) {
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const c = match[3] !== undefined ? parseInt(match[3], 10) : null;

    // Two-component is mm:ss; three-component is hh:mm:ss.
    let hours = 0;
    let minutes: number;
    let seconds: number;
    if (c === null) {
      minutes = a;
      seconds = b;
    } else {
      hours = a;
      minutes = b;
      seconds = c;
    }

    // Range-check. Reject [99:99] and friends so accidental matches
    // in user prose don't turn into bogus chips.
    if (hours < 0 || hours > 9) continue;
    if (minutes < 0 || minutes > 59) continue;
    if (seconds < 0 || seconds > 59) continue;

    const total = hours * 3600 + minutes * 60 + seconds;

    tokens.push({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      raw: match[0],
      seconds: total,
      display:
        hours > 0
          ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
          : `${minutes}:${String(seconds).padStart(2, "0")}`,
    });
  }

  return tokens;
}

/**
 * Format a number of seconds as `mm:ss` or `hh:mm:ss`. The inverse of
 * what the parser produces in `display` — exposed for use sites that
 * have raw seconds (e.g. chunk start times) and need a display label.
 */
export function formatSecondsAsTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Splits `text` into alternating string + token segments. Useful for
 * React renderers that want to map each piece to either a `<span>`
 * (text) or `<CitationChip>` (token). The order matches source.
 */
export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "citation"; token: CitationToken };

export function splitWithCitations(text: string): CitationSegment[] {
  const tokens = parseCitations(text);
  if (tokens.length === 0) {
    return text ? [{ kind: "text", text }] : [];
  }

  const segments: CitationSegment[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.startIndex > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, t.startIndex) });
    }
    segments.push({ kind: "citation", token: t });
    cursor = t.endIndex;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
