import { db } from "@/db";
import { sequenceEnrollments, activities } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export type PauseReason =
  | "replied"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "manual"
  | "deal_won";

const STATUS_BY_REASON: Record<PauseReason, "replied" | "paused"> = {
  replied: "replied",
  bounced: "paused",
  complained: "paused",
  unsubscribed: "paused",
  manual: "paused",
  deal_won: "paused",
};

/**
 * Centralised "stop sending to this enrollment" logic.
 *
 * Sets `status` (replied vs paused depending on reason) and writes a
 * single audit activity. Idempotent — if the enrollment is already in
 * a non-active terminal state, no-op.
 */
export async function pauseEnrollment(
  enrollmentId: string,
  reason: PauseReason,
): Promise<{ paused: boolean; tenantId?: string; contactId?: string }> {
  const [enrollment] = await db
    .select({
      id: sequenceEnrollments.id,
      status: sequenceEnrollments.status,
      contactId: sequenceEnrollments.contactId,
    })
    .from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.id, enrollmentId))
    .limit(1);

  if (!enrollment || enrollment.status !== "active") {
    return { paused: false };
  }

  const newStatus = STATUS_BY_REASON[reason];
  await db
    .update(sequenceEnrollments)
    .set({ status: newStatus })
    .where(eq(sequenceEnrollments.id, enrollmentId));

  // Find tenantId via contact for the audit activity. Cheap (single row).
  const { contacts } = await import("@/db/schema");
  const [contact] = await db
    .select({ tenantId: contacts.tenantId })
    .from(contacts)
    .where(eq(contacts.id, enrollment.contactId))
    .limit(1);

  if (contact?.tenantId) {
    await db.insert(activities).values({
      tenantId: contact.tenantId,
      actorType: "system",
      actorId: null,
      entityType: "contact",
      entityId: enrollment.contactId,
      activityType: "system_event",
      summary: `Sequence enrollment ${newStatus}: ${reason}`,
      metadata: { enrollmentId, reason, newStatus },
    });
  }

  return { paused: true, tenantId: contact?.tenantId, contactId: enrollment.contactId };
}

/** Pause every active enrollment for a set of contacts in a single tenant. */
export async function pauseEnrollmentsForContacts(
  tenantId: string,
  contactIds: string[],
  reason: PauseReason,
): Promise<number> {
  if (contactIds.length === 0) return 0;
  const active = await db
    .select({ id: sequenceEnrollments.id })
    .from(sequenceEnrollments)
    .where(
      and(
        inArray(sequenceEnrollments.contactId, contactIds),
        eq(sequenceEnrollments.status, "active"),
      ),
    );
  let n = 0;
  for (const { id } of active) {
    const { paused } = await pauseEnrollment(id, reason);
    if (paused) n++;
  }
  return n;
}
