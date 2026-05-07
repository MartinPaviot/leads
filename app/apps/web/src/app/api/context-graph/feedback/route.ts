import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contextGraphEdges } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Thumbs feedback for graph facts.
 * POST { edgeId, feedback: "up" | "down" }
 * - "up": boost confidence by 0.1 (max 1.0)
 * - "down": reduce confidence by 0.2; if confidence drops below 0.2, invalidate the edge
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { edgeId, feedback } = await req.json();

  if (!edgeId || !feedback || !["up", "down"].includes(feedback)) {
    return Response.json(
      { error: "edgeId and feedback ('up' or 'down') are required" },
      { status: 400 },
    );
  }

  try {
    const [edge] = await db.select()
      .from(contextGraphEdges)
      .where(and(
        eq(contextGraphEdges.id, edgeId),
        eq(contextGraphEdges.tenantId, authCtx.tenantId),
      ))
      .limit(1);

    if (!edge) {
      return Response.json({ error: "Edge not found" }, { status: 404 });
    }

    const currentConfidence = edge.confidence ?? 1.0;
    const existingMeta = (edge.metadata || {}) as Record<string, unknown>;
    const feedbackHistory = (existingMeta.feedbackHistory || []) as Array<{
      feedback: string;
      at: string;
      userId: string;
    }>;

    feedbackHistory.push({
      feedback,
      at: new Date().toISOString(),
      userId: authCtx.appUserId,
    });

    if (feedback === "up") {
      const newConfidence = Math.min(1.0, currentConfidence + 0.1);
      await db.update(contextGraphEdges).set({
        confidence: newConfidence,
        metadata: {
          ...existingMeta,
          feedbackHistory,
          lastFeedback: "up",
          lastFeedbackAt: new Date().toISOString(),
        },
      }).where(eq(contextGraphEdges.id, edgeId));

      return Response.json({
        success: true,
        edgeId,
        previousConfidence: currentConfidence,
        newConfidence,
        invalidated: false,
      });
    } else {
      // feedback === "down"
      const newConfidence = Math.max(0, currentConfidence - 0.2);
      const shouldInvalidate = newConfidence < 0.2;

      await db.update(contextGraphEdges).set({
        confidence: newConfidence,
        ...(shouldInvalidate ? {
          tInvalid: new Date(),
          tExpired: new Date(),
        } : {}),
        metadata: {
          ...existingMeta,
          feedbackHistory,
          lastFeedback: "down",
          lastFeedbackAt: new Date().toISOString(),
          ...(shouldInvalidate ? {
            invalidatedBy: "user_feedback",
            invalidatedAt: new Date().toISOString(),
          } : {}),
        },
      }).where(eq(contextGraphEdges.id, edgeId));

      return Response.json({
        success: true,
        edgeId,
        previousConfidence: currentConfidence,
        newConfidence,
        invalidated: shouldInvalidate,
      });
    }
  } catch (error) {
    console.error("Graph feedback failed:", error);
    return Response.json({ error: "Feedback failed" }, { status: 500 });
  }
}
