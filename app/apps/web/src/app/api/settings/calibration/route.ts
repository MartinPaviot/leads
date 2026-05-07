/**
 * GET /api/settings/calibration
 *
 * Returns confidence threshold calibration suggestions for the
 * authenticated tenant. Analyzes historical agent actions to determine
 * whether thresholds are too aggressive or too conservative.
 *
 * Query parameters:
 *   - windowDays (optional, default 90): how many days of history to analyze
 *
 * Response: CalibrationSummary (see threshold-calibrator.ts)
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { calibrateThresholds } from "@/lib/guardrails/threshold-calibrator";
import { HIGH_CONFIDENCE_THRESHOLDS } from "@/lib/guardrails/approval-mode";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  const url = new URL(req.url);
  const windowDaysParam = url.searchParams.get("windowDays");
  const windowDays = windowDaysParam ? parseInt(windowDaysParam, 10) : 90;

  if (!Number.isFinite(windowDays) || windowDays < 1 || windowDays > 365) {
    return apiError(
      "VALIDATION_ERROR",
      "windowDays must be between 1 and 365",
    );
  }

  const summary = await calibrateThresholds(authCtx.tenantId, windowDays);

  return Response.json({
    ...summary,
    currentThresholds: HIGH_CONFIDENCE_THRESHOLDS,
  });
}
