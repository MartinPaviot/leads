/**
 * Pure helpers for the deal-property LLM synthesise worker
 * (P0-5 follow-up).
 *
 * `applySignalsToProperties` defers narrative-field conflicts to an
 * async LLM round-trip — `why_now` and `summary` need a paragraph
 * synthesise, not a "latest wins" coin-flip. The cascade fires
 * `deal/property-llm-synthesize` per field ; this module owns the
 * prompt composition + the result-validation logic, while the
 * Inngest worker (`deal-property-llm-synthesize.ts`) owns the IO.
 *
 * Pure : tests cover every prompt branch + every result-validation
 * branch without spinning the LLM.
 */

const MAX_INPUT_LEN = 4000; // per-narrative cap to keep tokens bounded
const MAX_OUTPUT_LEN = 1200; // synthesised result cap

export interface SynthesizeInputs {
  field: string;
  /** What's currently on the deal (null if first synthesise). */
  current: { value: string; source: string; date: string | Date } | null;
  /** What the most-recent signal proposed. */
  incoming: { value: string; source: string; date: string | Date };
  /** Optional surrounding context (deal name, stage, value) — hints
   *  the LLM toward the right tone for this customer. */
  dealContext?: {
    name: string;
    stage: string;
    value: number | null;
  } | null;
}

export interface SynthesizePrompt {
  /** System message — caller passes through the existing `traced-ai`
   *  wrapper. */
  system: string;
  /** User message — composed from inputs. */
  user: string;
}

/**
 * Compose the prompt for narrative synthesis. Truncates each
 * narrative to MAX_INPUT_LEN to keep the LLM call bounded.
 *
 * Hard rules baked into the system prompt :
 *  - Output ≤ MAX_OUTPUT_LEN chars (the worker also re-trims).
 *  - One paragraph, no bullet lists (the field is a paragraph
 *    field by contract).
 *  - Verbatim phrases preferred over paraphrases when they read
 *    well.
 *  - When old and new contradict, the merged narrative explicitly
 *    notes the change ("Originally X ; per Sarah's call on Oct 15,
 *    now Y") rather than picking a winner.
 */
export function buildSynthesizePrompt(
  inputs: SynthesizeInputs,
): SynthesizePrompt {
  const fieldLabel = inputs.field === "why_now" ? "why_now" : inputs.field;

  const system = `You synthesise two versions of a single sales-deal narrative
into one coherent paragraph. Rules :
1. Output a single paragraph, ≤ ${MAX_OUTPUT_LEN} characters.
2. No bullet lists, no headings — narrative prose only.
3. Prefer verbatim phrases over paraphrase when they read well.
4. When old and new contradict, NOTE the change explicitly with
   the source date (e.g. "Originally X ; per the Oct 15 call, now Y").
   Never silently drop one version.
5. Do not invent facts that aren't in either input.`;

  const dealLine = inputs.dealContext
    ? `Deal context : ${inputs.dealContext.name} · stage ${inputs.dealContext.stage}${
        inputs.dealContext.value
          ? ` · value $${inputs.dealContext.value.toLocaleString("en-US")}`
          : ""
      }.\n\n`
    : "";

  const currentBlock = inputs.current
    ? `Current ${fieldLabel} (source : ${inputs.current.source}, dated ${formatDate(inputs.current.date)}) :
"${truncate(inputs.current.value, MAX_INPUT_LEN)}"`
    : `Current ${fieldLabel} : (none yet — this is the first version)`;

  const incomingBlock = `Incoming ${fieldLabel} (source : ${inputs.incoming.source}, dated ${formatDate(inputs.incoming.date)}) :
"${truncate(inputs.incoming.value, MAX_INPUT_LEN)}"`;

  const user = `${dealLine}${currentBlock}\n\n${incomingBlock}\n\nSynthesise these into one ${fieldLabel} paragraph that incorporates both, noting any change explicitly.`;

  return { system, user };
}

/**
 * Validate + clean the LLM's output. Returns null when the output
 * is unusable (caller falls back to keeping the current value).
 *
 * Rejection reasons :
 *  - Empty / whitespace
 *  - Wrapped in markdown fences (```)
 *  - Contains bullet lists (the prompt forbids them)
 *  - Exceeds MAX_OUTPUT_LEN even after trim
 */
export function validateSynthesizeResult(raw: string): {
  ok: true;
  value: string;
} | { ok: false; reason: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  // Strip leading/trailing code fences if present (LLMs sometimes
  // wrap output in ``` even when told not to).
  const stripped = trimmed
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  if (!stripped) return { ok: false, reason: "empty_after_fence_strip" };

  // Reject bullet lists — system prompt explicitly forbids them.
  // Markdown bullets : leading "-", "*", or numbered "1.".
  if (/^\s*[-*]\s/m.test(stripped) || /^\s*\d+\.\s/m.test(stripped)) {
    return { ok: false, reason: "bullet_list_rejected" };
  }

  // Reject markdown headings — narrative prose only.
  if (/^\s*#{1,6}\s/m.test(stripped)) {
    return { ok: false, reason: "heading_rejected" };
  }

  // Cap length — keep within bounded jsonb size.
  if (stripped.length > MAX_OUTPUT_LEN) {
    // Soft-truncate at sentence boundary, fall back to char-cap.
    const lastDot = stripped.slice(0, MAX_OUTPUT_LEN).lastIndexOf(". ");
    const cap = lastDot > MAX_OUTPUT_LEN * 0.6
      ? stripped.slice(0, lastDot + 1)
      : stripped.slice(0, MAX_OUTPUT_LEN).trim();
    return { ok: true, value: cap };
  }

  return { ok: true, value: stripped };
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatDate(d: string | Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "unknown date";
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const SYNTHESIZE_LIMITS = {
  MAX_INPUT_LEN,
  MAX_OUTPUT_LEN,
};
