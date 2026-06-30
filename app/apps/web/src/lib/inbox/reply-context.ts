import type { EnrichedProspectContext } from "@/lib/context/enriched-prospect-context";

/**
 * A compact, reply-focused brief from the enriched prospect context — only the
 * deal-relevant signals that change WHAT the salesperson should say next: the
 * open deal stage, open objections, pending next steps, budget/champion signals,
 * competitors in play, and high-confidence graph facts.
 *
 * Deliberately omits the verbose verbatim email excerpts that
 * formatEnrichedContextForPrompt includes — the live thread is already in the
 * reply prompt, so re-injecting it would just bloat the context. Pure +
 * unit-testable; returns "" when there is nothing grounded to add.
 */
export function buildReplyContextBrief(
  ctx: EnrichedProspectContext | null,
  dealStage?: string | null,
): string {
  const lines: string[] = [];
  if (dealStage && dealStage.trim()) lines.push(`Open deal stage: ${dealStage.trim()}.`);
  if (ctx) {
    const s = ctx.extractedSignals;
    const openObjections = s.objections.filter((o) => o.status === "open").map((o) => o.text.trim()).filter(Boolean);
    if (openObjections.length) lines.push(`Open objections to address: ${openObjections.slice(0, 3).join("; ")}.`);
    const nextSteps = s.nextSteps.map((n) => n.text.trim()).filter(Boolean);
    if (nextSteps.length) lines.push(`Pending next steps: ${nextSteps.slice(0, 3).join("; ")}.`);
    const budget = s.budgetMentions.map((b) => b.text.trim()).filter(Boolean);
    if (budget.length) lines.push(`Budget signals: ${budget.slice(0, 2).join("; ")}.`);
    const champions = s.championSignals.map((c) => c.text.trim()).filter(Boolean);
    if (champions.length) lines.push(`Champion signals: ${champions.slice(0, 2).join("; ")}.`);
    const competitors = s.competitorMentions.map((c) => c.competitor.trim()).filter(Boolean);
    if (competitors.length) lines.push(`Competitors in play: ${[...new Set(competitors)].slice(0, 3).join(", ")}.`);
    const facts = ctx.graphFacts.filter((f) => f.confidence >= 0.6).map((f) => f.fact.trim()).filter(Boolean);
    if (facts.length) lines.push(`Known facts: ${facts.slice(0, 3).join("; ")}.`);
  }
  return lines.join(" ");
}
