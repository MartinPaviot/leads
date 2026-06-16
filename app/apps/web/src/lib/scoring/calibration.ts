/**
 * Score calibration — does a higher grade actually convert better?
 *
 * THE certainty mechanism for scoring (_specs/propensity-scoring, Phase A2).
 * Given per-grade outcome counts (how many prospects at each grade reached an
 * outcome like a booked meeting), it reuses the cohort engine (Fisher exact +
 * Benjamini-Hochberg) to test whether each band beats the rest, and returns an
 * HONEST verdict:
 *   - "healthy"      — the top bands convert measurably above baseline, ordering
 *                      is monotonic (A+ ≥ A ≥ B …);
 *   - "inverted"     — a higher grade converts LESS than a lower one (the
 *                      "A+ takes hits" alarm — the score is miscalibrated);
 *   - "flat"         — no band separates significantly (the score doesn't yet
 *                      discriminate);
 *   - "underpowered" — too few outcomes to conclude anything (never a fake green).
 *
 * Pure: no DB, no clock. The route builds the rows from the live data and hands
 * them here. A single taule on one A+ is noise; the unit of truth is the BAND.
 */
import { classifyCohorts, type CohortCell } from "@/lib/insights/cohort-engine";

/** Best → worst, matching GRADE_THRESHOLDS in lib/scoring/scoring. */
export const GRADE_ORDER = ["A+", "A", "B", "C", "D", "F"] as const;

const MIN_TOTAL = 20; // below this, the tenant has too few outcomes to judge
const MIN_BAND_N = 5; // a band with fewer rows is too noisy to compare

export interface GradeOutcomeRow {
  grade: string;
  n: number; // prospects at this grade that entered the funnel event
  converted: number; // ...of which reached the outcome
}

export interface CalibrationBand {
  grade: string;
  n: number;
  converted: number;
  rate: number; // converted / n
  lift: number; // vs the rest (cohort engine)
  pValue: number;
  qValue: number;
  tier: "insight" | "hypothesis" | "observation";
}

export type CalibrationVerdict = "healthy" | "inverted" | "flat" | "underpowered";

export interface CalibrationReport {
  outcome: string;
  total: number;
  converted: number;
  baselineRate: number;
  bands: CalibrationBand[]; // ordered A+ → F, only grades present
  verdict: CalibrationVerdict;
  summary: string;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function buildCalibration(outcome: string, rows: GradeOutcomeRow[]): CalibrationReport {
  const cells: CohortCell[] = rows
    .filter((r) => r.n > 0)
    .map((r) => ({ dimension: "grade", value: r.grade, n: r.n, won: Math.min(r.converted, r.n) }));

  const total = cells.reduce((s, c) => s + c.n, 0);
  const converted = cells.reduce((s, c) => s + c.won, 0);
  const baselineRate = total > 0 ? converted / total : 0;

  const analysis = classifyCohorts(cells, { minTotalDeals: MIN_TOTAL, minInsightN: 10 });
  const byGrade = new Map(analysis.cohorts.map((c) => [c.value, c]));

  const bands: CalibrationBand[] = GRADE_ORDER.filter((g) => byGrade.has(g)).map((g) => {
    const c = byGrade.get(g)!;
    return {
      grade: g,
      n: c.n,
      converted: c.won,
      rate: c.rate,
      lift: c.lift,
      pValue: c.pValue,
      qValue: c.qValue,
      tier: c.tier,
    };
  });

  const populated = bands.filter((b) => b.n >= MIN_BAND_N);

  let verdict: CalibrationVerdict;
  let summary: string;

  if (total < MIN_TOTAL || populated.length < 2 || populated.every((b) => b.n < 10)) {
    verdict = "underpowered";
    summary = `Too few outcomes (${converted}/${total}) or populated grades to judge calibration.`;
  } else {
    // Monotonic non-increasing across populated bands, best → worst.
    let inverted = false;
    for (let i = 0; i + 1 < populated.length; i++) {
      if (populated[i].rate < populated[i + 1].rate - 0.001) {
        inverted = true;
        break;
      }
    }
    // The best-graded populated band that beats the rest significantly.
    const topSig = populated.find((b) => b.qValue < 0.1 && b.lift > 1);

    if (inverted) {
      verdict = "inverted";
      summary =
        `INVERTED calibration: a higher grade converts less than a lower one on "${outcome}". ` +
        `The score doesn't reflect propensity — the "A+ takes hits" case.`;
    } else if (topSig) {
      verdict = "healthy";
      summary = `Healthy calibration: ${topSig.grade} converts at ${pct(topSig.rate)} (×${topSig.lift.toFixed(1)} vs the rest, q<0.10) on "${outcome}".`;
    } else {
      verdict = "flat";
      summary = `Flat calibration: no grade separates significantly on "${outcome}" — the score doesn't discriminate (yet).`;
    }
  }

  return { outcome, total, converted, baselineRate, bands, verdict, summary };
}
