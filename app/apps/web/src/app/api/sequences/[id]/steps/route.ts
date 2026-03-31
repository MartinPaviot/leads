import { auth } from "@/auth";
import { db } from "@/db";
import { sequenceSteps, sequences } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify sequence exists
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(eq(sequences.id, id))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const body = await req.json();
    const { subjectTemplate, bodyTemplate, delayDays } = body;

    if (!subjectTemplate || !bodyTemplate) {
      return Response.json({ error: "Subject and body templates required" }, { status: 400 });
    }

    // Get next step number
    const [maxStep] = await db
      .select({ max: sql<number>`coalesce(max(step_number), 0)` })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id));

    const stepNumber = (maxStep?.max || 0) + 1;

    const [step] = await db
      .insert(sequenceSteps)
      .values({
        sequenceId: id,
        stepNumber,
        subjectTemplate: subjectTemplate.trim(),
        bodyTemplate: bodyTemplate.trim(),
        delayDays: delayDays || 2,
      })
      .returning();

    return Response.json({ step }, { status: 201 });
  } catch (error) {
    console.error("Failed to add step:", error);
    return Response.json({ error: "Failed to add step" }, { status: 500 });
  }
}
