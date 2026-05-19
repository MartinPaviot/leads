/**
 * POST /api/calls/[id]/finalize
 *
 * Manual / internal trigger to re-run the post-call worker on a single
 * call. Used by the eval suite and by the dashboard "retry processing"
 * button when the worker dead-letters.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const [row] = await db
      .select({ id: calls.id })
      .from(calls)
      .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await db
      .update(calls)
      .set({ processingState: "pending", processingError: null })
      .where(eq(calls.id, id));

    await inngest.send({
      name: "calls/post-process",
      data: { callId: id, manual: true },
    });

    return Response.json({ ok: true, callId: id });
  });
}
