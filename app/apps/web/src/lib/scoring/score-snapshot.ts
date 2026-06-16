/**
 * Record a prospect's grade/score AT a funnel-entry event, so score
 * calibration joins the outcome to the grade that actually drove the action —
 * not the current re-scored grade (no look-ahead). _specs/propensity-scoring A1.
 *
 * Fire-and-forget: never throws, never blocks the caller. An unscored entity is
 * skipped (nothing meaningful to snapshot).
 */
import { db } from "@/db";
import { contacts, companies, scoreSnapshots } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getGrade } from "@/lib/scoring/scoring";

export type SnapshotEntity = "contact" | "company";
export type SnapshotEvent = "call_attempt" | "sequence_enroll" | "email_sent";

export async function recordScoreSnapshot(params: {
  tenantId: string;
  entityType: SnapshotEntity;
  entityId: string;
  event: SnapshotEvent;
  eventRef?: string | null;
}): Promise<void> {
  try {
    let score: number | null = null;
    if (params.entityType === "contact") {
      const [row] = await db
        .select({ score: contacts.score })
        .from(contacts)
        .where(and(eq(contacts.id, params.entityId), eq(contacts.tenantId, params.tenantId), isNull(contacts.deletedAt)))
        .limit(1);
      score = row?.score ?? null;
    } else {
      const [row] = await db
        .select({ score: companies.score })
        .from(companies)
        .where(and(eq(companies.id, params.entityId), eq(companies.tenantId, params.tenantId), isNull(companies.deletedAt)))
        .limit(1);
      score = row?.score ?? null;
    }
    if (score == null) return; // unscored → no meaningful snapshot

    await db.insert(scoreSnapshots).values({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      grade: getGrade(score).grade,
      score,
      event: params.event,
      eventRef: params.eventRef ?? null,
    });
  } catch (e) {
    console.error("recordScoreSnapshot failed (non-fatal):", e);
  }
}
