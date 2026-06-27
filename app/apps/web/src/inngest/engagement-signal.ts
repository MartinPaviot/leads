/**
 * Engagement → buying signal (the FREE, in-product signal source).
 *
 * When a prospect's email reply is classified as genuine engagement, record a
 * `positive_reply` signal on their company so it lifts priority_score
 * (signal-dominant scoring, #455 + #461). process-reply (functions.ts) already
 * fires `reply/classified` ONLY for non-ooo / non-unsubscribe replies, so this
 * subscriber sees real engagement only.
 *
 * Event-driven by design: this touches NEITHER the frozen capture core
 * (lib/capture/approval.ts is a protected/frozen file, AC-23/AC-24) NOR the
 * email/linkedin capture paths — it just listens. recordCompanySignal merges
 * into companies.properties.signals[]; freshness (positive_reply TTL 14d) +
 * the SIGNAL_PRIORS prior (2.5) make it lift before any deal has closed.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { sequenceEnrollments, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordCompanySignal } from "@/lib/signals/record-signal";
import { logger } from "@/lib/observability/logger";

/**
 * The buying-signal type for a classified reply, or null if it isn't engagement.
 * `reply/classified` already excludes ooo/unsubscribe upstream; this is a
 * defensive belt-and-suspenders gate (and the unit-testable seam). Pure.
 */
export function replySignalType(classification: string | null | undefined): string | null {
  if (classification === "ooo" || classification === "unsubscribe") return null;
  return "positive_reply";
}

export const engagementReplySignal = inngest.createFunction(
  {
    id: "engagement-reply-signal",
    name: "Engagement: classified reply → company buying signal",
    retries: 2,
    concurrency: [{ limit: 5 }],
    onFailure: async ({ error }: { error: unknown }) => {
      logger.error("engagement-reply-signal.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ event: "reply/classified" }],
  },
  async ({ event }: { event: { data: { enrollmentId?: string; classification?: string } } }) => {
    const enrollmentId = event.data?.enrollmentId;
    const type = replySignalType(event.data?.classification);
    if (!enrollmentId || !type) return { recorded: false };

    // Resolve the company via the enrollment's contact (enrollments carry no
    // tenantId; the contact does, and carries the company link).
    const [row] = await db
      .select({ tenantId: contacts.tenantId, companyId: contacts.companyId })
      .from(sequenceEnrollments)
      .innerJoin(contacts, eq(contacts.id, sequenceEnrollments.contactId))
      .where(eq(sequenceEnrollments.id, enrollmentId))
      .limit(1);
    if (!row?.tenantId || !row.companyId) return { recorded: false };

    await recordCompanySignal(row.tenantId, row.companyId, {
      type,
      detectedAt: new Date().toISOString(),
      strength: "high",
      source: "engagement",
    });
    return { recorded: true, companyId: row.companyId };
  },
);
