/**
 * Playbook entry validation (B4, _specs/pilae-machine/spec-v2.md R11.2).
 *
 * The capture flow is:
 *   activity (call / meeting / reply) → LLM extraction → candidate
 *   entries → validatePlaybookEntry → DB insert
 *
 * The validator is the gate. It refuses entries that would pollute
 * the playbook with low-signal noise:
 *   - Wrong type (must be one of the three documented kinds).
 *   - Too short (≤ 4 chars: it's a fragment, not a learning).
 *   - Too long (> 2000 chars: it's a transcript dump, not an entry).
 *   - perf_score out of [0, 1] if set (defensive — LLM may emit 1.5).
 *
 * Pure function. No DB, no LLM. Used by the Inngest fn AND by the
 * direct-create endpoint (`/api/playbook` — to be wired) so the
 * rules can't drift between paths.
 */

export const PLAYBOOK_ENTRY_TYPES = [
  "objection",
  "accroche",
  "question",
] as const;

export type PlaybookEntryType = (typeof PLAYBOOK_ENTRY_TYPES)[number];

export const MIN_CONTENT_LENGTH = 5;
export const MAX_CONTENT_LENGTH = 2000;

export type PlaybookCandidate = {
  type: string;
  content: string;
  outcomeLabel?: string | null;
  perfScore?: number | null;
};

export type ValidationResult =
  | {
      ok: true;
      entry: {
        type: PlaybookEntryType;
        content: string;
        outcomeLabel: string | null;
        perfScore: number | null;
      };
    }
  | { ok: false; error: string };

export function validatePlaybookEntry(
  c: PlaybookCandidate,
): ValidationResult {
  if (!isPlaybookEntryType(c.type)) {
    return {
      ok: false,
      error: `Invalid type '${c.type}' — must be one of ${PLAYBOOK_ENTRY_TYPES.join(", ")}`,
    };
  }
  // Normalize whitespace to a single line before storing. Playbook
  // entries are short single-thought learnings, and flattening newlines
  // here (the shared sink contract for BOTH the LLM extractor and the
  // manual POST) is defense-in-depth: it stops a multi-line snippet from
  // later breaking out of its bullet when injected into a drafting
  // system prompt. The consumer (get-playbook) also re-sanitizes.
  const content =
    typeof c.content === "string" ? c.content.replace(/\s+/g, " ").trim() : "";
  if (content.length < MIN_CONTENT_LENGTH) {
    return {
      ok: false,
      error: `Content too short (${content.length} chars, min ${MIN_CONTENT_LENGTH})`,
    };
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      error: `Content too long (${content.length} chars, max ${MAX_CONTENT_LENGTH})`,
    };
  }
  if (
    c.perfScore !== null &&
    c.perfScore !== undefined &&
    (c.perfScore < 0 || c.perfScore > 1 || !Number.isFinite(c.perfScore))
  ) {
    return {
      ok: false,
      error: `perfScore out of range (got ${c.perfScore}, must be 0..1 or null)`,
    };
  }
  return {
    ok: true,
    entry: {
      type: c.type as PlaybookEntryType,
      content,
      outcomeLabel: c.outcomeLabel?.trim() || null,
      perfScore: c.perfScore ?? null,
    },
  };
}

export function isPlaybookEntryType(s: unknown): s is PlaybookEntryType {
  return (
    typeof s === "string" &&
    (PLAYBOOK_ENTRY_TYPES as readonly string[]).includes(s)
  );
}

/**
 * Partition a batch of candidates into accepted / rejected. The
 * Inngest fn uses this to insert only the survivors and log the
 * rejection reasons for observability.
 */
export type BatchResult = {
  accepted: Array<{
    type: PlaybookEntryType;
    content: string;
    outcomeLabel: string | null;
    perfScore: number | null;
  }>;
  rejected: Array<{ index: number; error: string }>;
};

export function validatePlaybookBatch(
  candidates: PlaybookCandidate[],
): BatchResult {
  const accepted: BatchResult["accepted"] = [];
  const rejected: BatchResult["rejected"] = [];
  candidates.forEach((c, index) => {
    const result = validatePlaybookEntry(c);
    if (result.ok) {
      accepted.push(result.entry);
    } else {
      rejected.push({ index, error: result.error });
    }
  });
  return { accepted, rejected };
}
