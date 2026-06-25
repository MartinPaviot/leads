import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { estimateCost, isNearCap, type EstimatableOp } from "@/lib/billing/estimate-cost";
import { getLlmBudgetStatus } from "@/lib/billing/llm-budget";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import logger from "@/lib/observability/logger";

/**
 * POST /api/estimate-cost
 *
 * Operation-aware cost preview helper. Consumed by WS-4's TAM kickoff
 * and any future heavy flow that wants to show the user what a
 * request will cost BEFORE committing.
 *
 * Body:
 *   { op: "tam-build" | "sequence-draft" | "inbox-scan" |
 *         "narrate-website" | "icp-analysis",
 *     params?: Record<string, unknown> }
 *
 * Response:
 *   { llmEstimateUsd, apolloCredits, estimatedDurationSeconds,
 *     confidenceLevel, summary,
 *     isFirstTimeForOp, isNearCap, currentCapStatus? }
 *
 * The display-rule hints (`isFirstTimeForOp`, `isNearCap`) let
 * callers honor the T3 mitigation from the master brief §8.1:
 * only surface the preview on first-time-per-op OR near-cap.
 */

const VALID_OPS: EstimatableOp[] = [
  "tam-build",
  "sequence-draft",
  "inbox-scan",
  "narrate-website",
  "icp-analysis",
];

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit under the "llm" bucket — estimate-cost reads budget
  // status and is adjacent to actual LLM calls. 20 req/min/user is
  // plenty for preview UIs that fire on confirmation-card edits.
  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    params?: Record<string, unknown>;
  };

  if (!body.op || !VALID_OPS.includes(body.op as EstimatableOp)) {
    return NextResponse.json(
      { error: `op must be one of ${VALID_OPS.join(" | ")}` },
      { status: 400 },
    );
  }

  const estimate = estimateCost({
    op: body.op as EstimatableOp,
    params: body.params,
  });

  // Decide display-rule hints. Errors here should not break the
  // estimate — they degrade it to `confidenceLevel: "low"` only.
  let isNearCapValue = false;
  let currentCapStatus: { capUsd: number; spentUsd: number; percentUsed: number } | undefined;
  let isFirstTimeForOp = false;

  try {
    const status = await getLlmBudgetStatus(authCtx.tenantId);
    if (status.capUsd > 0) {
      isNearCapValue = isNearCap(
        { capUsd: status.capUsd, spentUsd: status.spentUsd },
        estimate.llmEstimateUsd,
      );
      // The near-cap BOOLEAN is a useful guardrail for any member about to
      // spend, but the actual spend/cap figures are an admin-only view — a
      // member must not learn the workspace's spentUsd/capUsd from here.
      if (authCtx.role === "admin") {
        currentCapStatus = {
          capUsd: status.capUsd,
          spentUsd: status.spentUsd,
          percentUsed: status.percentUsed ?? 0,
        };
      }
    }
  } catch (err) {
    logger.warn("estimate-cost: budget status fetch failed", { err });
  }

  try {
    const settings = await getTenantSettings(authCtx.tenantId);
    const seenOps = (settings as unknown as {
      costPreviewSeenForOp?: Record<string, string>;
    }).costPreviewSeenForOp;
    isFirstTimeForOp = !seenOps || !seenOps[body.op];
  } catch (err) {
    logger.warn("estimate-cost: settings fetch for first-time check failed", { err });
    // Default to true — safer to show the preview once extra than to
    // miss the educational moment.
    isFirstTimeForOp = true;
  }

  return NextResponse.json({
    ...estimate,
    isFirstTimeForOp,
    isNearCap: isNearCapValue,
    ...(currentCapStatus ? { currentCapStatus } : {}),
  });
}
