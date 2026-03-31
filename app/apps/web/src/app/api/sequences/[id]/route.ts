import { auth } from "@/auth";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(eq(sequences.id, id))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber);

    const enrollments = await db
      .select({
        enrollment: sequenceEnrollments,
        contact: contacts,
      })
      .from(sequenceEnrollments)
      .leftJoin(contacts, eq(sequenceEnrollments.contactId, contacts.id))
      .where(eq(sequenceEnrollments.sequenceId, id));

    return Response.json({
      sequence,
      steps,
      enrollments: enrollments.map((e) => ({
        ...e.enrollment,
        contactName: e.contact
          ? [e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ")
          : "Unknown",
        contactEmail: e.contact?.email || null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch sequence:", error);
    return Response.json({ error: "Failed to fetch sequence" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, description, status } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (status) updates.status = status;

    const [updated] = await db
      .update(sequences)
      .set(updates)
      .where(eq(sequences.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    return Response.json({ sequence: updated });
  } catch (error) {
    console.error("Failed to update sequence:", error);
    return Response.json({ error: "Failed to update sequence" }, { status: 500 });
  }
}
