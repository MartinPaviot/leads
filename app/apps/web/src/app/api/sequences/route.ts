import { auth } from "@/auth";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select()
      .from(sequences)
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

        return {
          ...seq,
          stepCount: Number(steps[0]?.count || 0),
          enrolledCount: Number(enrollments[0]?.count || 0),
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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const [sequence] = await db
      .insert(sequences)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        tenantId: "default",
      })
      .returning();

    return Response.json({ sequence }, { status: 201 });
  } catch (error) {
    console.error("Failed to create sequence:", error);
    return Response.json({ error: "Failed to create sequence" }, { status: 500 });
  }
}
