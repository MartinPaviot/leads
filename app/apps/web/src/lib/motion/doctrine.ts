/**
 * Doctrine-as-runtime: the Method (lib/docs/steps/*) is not just a docs page,
 * it is the rubric our moment-specific features speak. getStepDoctrine maps a
 * moment to its Method step and renders a CONDENSED rubric — the actionable
 * rules (headings, lists, tables), not the human-reading prose — so prompts
 * apply the doctrine to THIS prospect instead of parroting an essay.
 *
 * Mapping is by SLUG, never step number: slugs are stable, numbers drift when
 * steps are renumbered (a CI test asserts every slug still resolves).
 */

import { getDocBySlug } from "@/lib/docs/content";
import type { DocBlock } from "@/lib/docs/types";
import type { Moment } from "./moment";

export const MOMENT_TO_SLUG: Readonly<Record<Moment, string | null>> = {
  discovery: "the-discovery-call",
  demo: "the-demo",
  proposal: "the-proposal",
  close: "closing",
  cold_call: "cold-calling",
  outbound: "design-the-cadence",
  // No dedicated expansion-of-a-customer step yet → generic fallback upstream.
  expansion: null,
};

/** ~900 tokens at ~4 chars/token. Bounds prompt bloat; truncated at a block boundary. */
export const MAX_RUBRIC_CHARS = 3600;

/**
 * Render the rules of a doc block; drop prose. Paragraphs, callouts, and worked
 * examples are for humans reading the docs — they dilute an LLM instruction and
 * tempt it to restate rather than apply. Keep headings, lists, and tables.
 */
function renderBlock(block: DocBlock): string | null {
  switch (block.type) {
    case "h2":
      return `## ${block.text}`;
    case "h3":
      return `### ${block.text}`;
    case "ul":
    case "ol":
      return block.items.map((i) => `- ${i}`).join("\n");
    case "table": {
      const header = `| ${block.headers.join(" | ")} |`;
      const rows = block.rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
      return `${header}\n${rows}`;
    }
    case "p":
    case "callout":
    case "example":
    default:
      return null;
  }
}

/**
 * Pure — reads the in-memory docSteps, no DB/LLM. Returns the matched slug (for
 * traceability) and a condensed, size-bounded rubric. Empty rubric when the
 * moment has no doctrine step (expansion) or the slug no longer resolves.
 */
export function getStepDoctrine(moment: Moment): { slug: string | null; rubric: string } {
  const slug = MOMENT_TO_SLUG[moment];
  if (!slug) return { slug: null, rubric: "" };

  const step = getDocBySlug(slug);
  if (!step) return { slug, rubric: "" };

  const lines: string[] = [];
  for (const block of step.blocks) {
    const rendered = renderBlock(block);
    if (!rendered) continue;
    const candidate = lines.length ? `${lines.join("\n")}\n${rendered}` : rendered;
    if (candidate.length > MAX_RUBRIC_CHARS) break; // stop at the last whole block under the bound
    lines.push(rendered);
  }
  return { slug, rubric: lines.join("\n") };
}
