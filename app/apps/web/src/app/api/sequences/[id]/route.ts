import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, contacts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // IMPORTANT — tenant scope lives here. `sequenceSteps` and
    // `sequenceEnrollments` carry no `tenantId` column of their own; the
    // only thing anchoring them to a tenant is `sequenceId`. By first
    // proving the parent sequence belongs to `authCtx.tenantId` and
    // bailing with 404 if not, every subsequent query keyed on `id`
    // stays tenant-safe. Do not delete this check.
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);

    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber);

    // Enrollment rows only reference contacts — cross-check that the
    // joined contact is also tenant-scoped so a malformed enrollment
    // row pointing at a contact from another tenant (shouldn't be
    // possible, but belt-and-braces) can't leak PII.
    const enrollments = await db
      .select({
        enrollment: sequenceEnrollments,
        contact: contacts,
      })
      .from(sequenceEnrollments)
      .leftJoin(
        contacts,
        and(
          eq(sequenceEnrollments.contactId, contacts.id),
          eq(contacts.tenantId, authCtx.tenantId)
        )
      )
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
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { name, description, status } = body;

    // Status is the lifecycle control (Start/Pause → real sending via the
    // status-gated cron). Editing name/description stays open; flipping
    // status requires sequences:execute.
    if (status) {
      const denied = requirePermission(authCtx.role, "sequences:execute");
      if (denied) return denied;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (status) updates.status = status;
    // AUTOPILOT-AUTOPAUSE: a human resuming a sequence protects it from the
    // dead-sequence auto-pause (errs toward the operator's intent) and clears the
    // auto-pause audit fields. Sticky in v1 — a follow-up can lapse protection
    // after a cooldown so a still-dead resumed sequence becomes re-eligible.
    if (status === "active") {
      updates.autopilotProtected = true;
      updates.pausedReason = null;
      updates.pausedBy = null;
      updates.pausedAt = null;
    }

    const [updated] = await db
      .update(sequences)
      .set(updates)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
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
