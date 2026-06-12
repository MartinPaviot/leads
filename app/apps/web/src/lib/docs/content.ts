import type { DocBlock, DocPhase, DocStep } from "./types";
import { foundationSteps } from "./steps/foundations";
import { buildSteps } from "./steps/build";
import { runSteps } from "./steps/run";
import { closeSteps } from "./steps/close";
import { learnSteps } from "./steps/learn";

/** Display order of phases everywhere (index page, sidebars). */
export const DOC_PHASES: DocPhase[] = [
  "Foundations",
  "Build the machine",
  "Run outbound",
  "Win the deal",
  "Learn and compound",
];

export const PHASE_TAGLINES: Record<DocPhase, string> = {
  Foundations: "The doctrine and the message work that everything else depends on.",
  "Build the machine": "From ICP hypothesis to a scored, signal-aware account universe.",
  "Run outbound": "The cadence, one playbook per channel, and the brand layer.",
  "Win the deal": "From the first meeting to the signature: discovery, demo, proposal, closing, and the objections of every stage.",
  "Learn and compound": "Honest measurement, a living TAM, and scaling past yourself.",
};

/** Canonical order of the method: sorted by step number. */
export const docSteps: DocStep[] = [
  ...foundationSteps,
  ...buildSteps,
  ...runSteps,
  ...closeSteps,
  ...learnSteps,
].sort((a, b) => a.step - b.step);

export function getDocBySlug(slug: string): DocStep | undefined {
  return docSteps.find((s) => s.slug === slug);
}

export function docsByPhase(): Array<{ phase: DocPhase; steps: DocStep[] }> {
  return DOC_PHASES.map((phase) => ({
    phase,
    steps: docSteps.filter((s) => s.phase === phase),
  })).filter((g) => g.steps.length > 0);
}

export function getAdjacentDocs(slug: string): {
  prev: DocStep | null;
  next: DocStep | null;
} {
  const i = docSteps.findIndex((s) => s.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? docSteps[i - 1] : null,
    next: i < docSteps.length - 1 ? docSteps[i + 1] : null,
  };
}

/** Every human-readable string of a block, for tests and read-time. */
export function collectBlockStrings(block: DocBlock): string[] {
  switch (block.type) {
    case "p":
    case "h2":
    case "h3":
      return [block.text];
    case "ul":
    case "ol":
      return [...block.items];
    case "callout":
      return block.title ? [block.title, block.text] : [block.text];
    case "example":
      return block.title ? [block.title, ...block.lines] : [...block.lines];
    case "table":
      return [...block.headers, ...block.rows.flat()];
  }
}

export function collectDocStrings(step: DocStep): string[] {
  return [step.title, step.description, ...step.blocks.flatMap(collectBlockStrings)];
}

/** Rough reading time at ~200 words/min, floored at 2 minutes. */
export function estimateReadMinutes(step: DocStep): number {
  const words = collectDocStrings(step)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}
