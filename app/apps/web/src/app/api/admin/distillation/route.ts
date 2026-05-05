import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import {
  getDistillationStats,
  exportDistillationDataset,
} from "@/lib/distillation/pipeline";

/**
 * Admin-only distillation dataset endpoint.
 *
 * GET: Returns dataset stats (count, agent distribution, quality distribution)
 * POST with action: "export": Exports the dataset in JSONL or Anthropic format
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const stats = await getDistillationStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[distillation] GET error:", err);
    return apiError("INTERNAL_ERROR", "Failed to fetch distillation stats");
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const { action, format = "jsonl", agentId, minScore } = body;

    if (action !== "export") {
      return apiError("VALIDATION_ERROR", 'Only action "export" is supported');
    }

    const validFormats = ["jsonl", "anthropic"] as const;
    if (!validFormats.includes(format)) {
      return apiError("VALIDATION_ERROR", `Format must be one of: ${validFormats.join(", ")}`);
    }

    const dataset = await exportDistillationDataset(format, {
      agentId,
      minScore: typeof minScore === "number" ? minScore : undefined,
    });

    // Return as downloadable JSONL file
    const filename = `elevay-distillation-${format}-${new Date().toISOString().split("T")[0]}.jsonl`;

    return new Response(dataset, {
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[distillation] POST error:", err);
    return apiError("INTERNAL_ERROR", "Failed to export distillation dataset");
  }
}
