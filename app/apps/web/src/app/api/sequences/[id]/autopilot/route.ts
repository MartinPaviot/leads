import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, contacts } from "@/db/schema";
import { eq, sql, and, isNotNull, gte, isNull } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify sequence exists, belongs to tenant, and has steps
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const [stepCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id));

    if (!stepCount || Number(stepCount.count) === 0) {
      return Response.json({ error: "Sequence has no steps" }, { status: 400 });
    }

    const body = await req.json();
    const minScore = body.minScore ?? 50;
    const maxEnroll = Math.min(body.maxEnroll ?? 20, 100);

    // Get already enrolled contact IDs
    const enrolled = await db
      .select({ contactId: sequenceEnrollments.contactId })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, id));
    const enrolledIds = new Set(enrolled.map((e) => e.contactId));

    // Get eligible contacts: belongs to tenant, has email, score >= minScore, not enrolled
    const eligible = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, authCtx.tenantId),
          isNotNull(contacts.email),
          gte(contacts.score, minScore),
          isNull(contacts.deletedAt)
        )
      )
      .orderBy(sql`score DESC NULLS LAST`)
      .limit(maxEnroll * 2); // fetch extra to account for already-enrolled

    // Get first step delay
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber)
      .limit(1);
    const firstStepDelay = steps[0]?.delayDays || 0;

    let enrolledCount = 0;
    let skippedCount = 0;

    for (const contact of eligible) {
      if (enrolledCount >= maxEnroll) break;

      if (enrolledIds.has(contact.id)) {
        skippedCount++;
        continue;
      }

      const nextStepAt = new Date();
      nextStepAt.setDate(nextStepAt.getDate() + firstStepDelay);

      await db
        .insert(sequenceEnrollments)
        .values({
          sequenceId: id,
          contactId: contact.id,
          currentStep: 1,
          nextStepAt,
        });

      enrolledCount++;
    }

    return Response.json({
      success: true,
      enrolled: enrolledCount,
      skipped: skippedCount,
      eligible: eligible.length,
    });
  } catch (error) {
    console.error("Autopilot enrollment failed:", error);
    return Response.json({ error: "Autopilot enrollment failed" }, { status: 500 });
  }
}
