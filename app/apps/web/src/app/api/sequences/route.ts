import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, outboundEmails } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { z } from "zod";

const createSequenceSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
});

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select()
      .from(sequences)
      .where(eq(sequences.tenantId, authCtx.tenantId))
      .limit(50);

    // Get step counts and enrollment counts for each sequence
    const withCounts = await Promise.all(
      result.map(async (seq) => {
        const steps = await db
          .select({ count: sql<number>`count(*)` })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, seq.id));

        const enrollments = await db
          .select({ count: sql<number>`count(*)` })
          .from(sequenceEnrollments)
          .where(eq(sequenceEnrollments.sequenceId, seq.id));

        // Email stats
        const emailCounts = await db
          .select({
            status: outboundEmails.status,
            count: sql<number>`count(*)`,
          })
          .from(outboundEmails)
          .where(eq(outboundEmails.campaignId, seq.id))
          .groupBy(outboundEmails.status);

        const emailStats: Record<string, number> = {};
        for (const row of emailCounts) {
          emailStats[row.status as string] = Number(row.count);
        }

        return {
          ...seq,
          stepCount: Number(steps[0]?.count || 0),
          enrolledCount: Number(enrollments[0]?.count || 0),
          emailStats,
        };
      })
    );

    return Response.json({ sequences: withCounts });
  } catch (error) {
    console.error("Failed to fetch sequences:", error);
    return Response.json({ error: "Failed to fetch sequences" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createSequenceSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid sequence data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, description } = parsed.data;

    const [sequence] = await db
      .insert(sequences)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        tenantId: authCtx.tenantId,
        createdBy: authCtx.userId,
      })
      .returning();

    return Response.json({ sequence }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sequence:", error);
    return apiError("INTERNAL_ERROR", "Failed to create sequence");
  }
}
