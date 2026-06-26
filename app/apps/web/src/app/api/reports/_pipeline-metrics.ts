/**
 * Pure pipeline-metric helpers for the report generator, extracted so the
 * open-vs-closed semantics are unit-testable (the prompt builder is DB-coupled).
 */

export interface DealValueRow {
  value: number | null;
  stage: string | null;
}

/**
 * Pipeline value = the summed value of OPEN deals only (stage not in won/lost).
 * Including closed deals inflated the report's headline "pipeline value" — the
 * same all-stages defect fixed for dashboard/summary in #444.
 */
export function openPipelineValue(deals: DealValueRow[]): number {
  return deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((sum, d) => sum + (d.value || 0), 0);
}
