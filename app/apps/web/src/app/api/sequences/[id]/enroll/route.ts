import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequenceEnrollments, sequenceSteps, sequences, contacts } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

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
    // Verify sequence exists and belongs to tenant
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
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    let enrolled = 0;
    let skipped = 0;

    // Get first step delay
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber)
      .limit(1);

    const firstStepDelay = steps[0]?.delayDays || 0;

    for (const contactId of contactIds.slice(0, 100)) {
      // Check contact exists, belongs to tenant, and has email
      const [contact] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
        .limit(1);

      if (!contact || !contact.email) {
        skipped++;
        continue;
      }

      // Check not already enrolled
      const [existing] = await db
        .select()
        .from(sequenceEnrollments)
        .where(
          and(
            eq(sequenceEnrollments.sequenceId, id),
            eq(sequenceEnrollments.contactId, contactId)
          )
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const nextStepAt = new Date();
      nextStepAt.setDate(nextStepAt.getDate() + firstStepDelay);

      await db
        .insert(sequenceEnrollments)
        .values({
          sequenceId: id,
          contactId,
          currentStep: 1,
          nextStepAt,
        });

      enrolled++;
    }

    return Response.json({ success: true, enrolled, skipped });
  } catch (error) {
    console.error("Failed to enroll contacts:", error);
    return Response.json({ error: "Failed to enroll contacts" }, { status: 500 });
  }
}

/**
 * PUT — update enrollment status (pause/resume/stop).
 * Body: { enrollmentId: string, status: "active" | "paused" | "completed" }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sequenceId } = await params;

  try {
    const body = await req.json();
    const { enrollmentId, status } = body;

    if (!enrollmentId || !status) {
      return Response.json({ error: "enrollmentId and status required" }, { status: 400 });
    }

    const validStatuses = ["active", "paused", "completed"];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Verify enrollment belongs to this sequence
    const [enrollment] = await db
      .select()
      .from(sequenceEnrollments)
      .where(
        and(
          eq(sequenceEnrollments.id, enrollmentId),
          eq(sequenceEnrollments.sequenceId, sequenceId),
        ),
      )
      .limit(1);

    if (!enrollment) {
      return Response.json({ error: "Enrollment not found" }, { status: 404 });
    }

    await db
      .update(sequenceEnrollments)
      .set({ status: status as "active" | "paused" | "completed" })
      .where(eq(sequenceEnrollments.id, enrollmentId));

    return Response.json({ success: true, enrollmentId, status });
  } catch (error) {
    console.error("Failed to update enrollment:", error);
    return Response.json({ error: "Failed to update enrollment" }, { status: 500 });
  }
}
