/**
 * PROPOSAL-007: deterministic graders for the proposal eval harness. These
 * measure the LLM core that the rest of the suite only mocks — detection
 * coverage, output cleanliness, and confidence calibration. Pure + testable;
 * the live scorecard (scripts/eval-proposals.ts) feeds them real model output.
 */

import { matchHeading } from "../ooxml";

export interface CoverageResult {
  coverage: number; // 0..1: fraction of expected sections detection produced
  missing: string[];
}

/** Did detection produce a component for every expected section? (fuzzy label match) */
export function gradeDetectionCoverage(expected: string[], producedLabels: string[]): CoverageResult {
  const missing = expected.filter((e) => matchHeading(producedLabels, e) < 0);
  const coverage = expected.length ? (expected.length - missing.length) / expected.length : 1;
  return { coverage, missing };
}

const LEAKS: RegExp[] = [/\{\{/, /\bundefined\b/i, /\[placeholder/i, /\bTODO\b/, /\bTBD\b/, /\bXXX\b/];

/** No unresolved placeholders / "undefined" / TODO leaked into the prose. */
export function gradePlaceholders(components: Array<{ content: string }>): {
  clean: boolean;
  offenders: number[];
} {
  const offenders: number[] = [];
  components.forEach((c, i) => {
    if (LEAKS.some((re) => re.test(c.content))) offenders.push(i);
  });
  return { clean: offenders.length === 0, offenders };
}

export interface CalibrationIssue {
  index: number;
  issue: "high_without_citation" | "abstained_with_content";
}

/** Confidence must be backed: high needs a citation; abstained must be empty. */
export function gradeCalibration(
  components: Array<{ confidence: string; abstained: boolean; citations: unknown[]; content: string }>,
): { ok: boolean; issues: CalibrationIssue[] } {
  const issues: CalibrationIssue[] = [];
  components.forEach((c, i) => {
    if (c.confidence === "high" && c.citations.length === 0) {
      issues.push({ index: i, issue: "high_without_citation" });
    }
    if (c.abstained && c.content.trim()) {
      issues.push({ index: i, issue: "abstained_with_content" });
    }
  });
  return { ok: issues.length === 0, issues };
}
