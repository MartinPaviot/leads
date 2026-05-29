/**
 * Phone task → notification (post voice-cold-call merge wiring).
 *
 * Voice cold call Phase 1 (PR #32) is pull-based: the agent dials
 * from `/api/calls/queue` or `/insights/hot-to-call`. It does NOT
 * subscribe to my push event `phone/task-queued` (emitted by
 * `sequence-draft-to-outbound` when an approved phone_task draft
 * fires). Without this consumer, those drafts get marked sent but
 * nothing surfaces them to the agent.
 *
 * This fn closes the gap with the smallest possible surface: insert
 * one `notifications` row per tenant user so the founder sees the
 * task in their notification bell. They then dial the contact via
 * the existing softphone UX. When voice Phase 2 ships a dedicated
 * phone_task queue, replace this with the proper consumer (the
 * event surface stays the same).
 *
 * Notifies up to 3 tenant users (mirrors the signal-to-sequence
 * pattern) so the task is visible to everyone who could dial.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";

type PhoneTaskEvent = {
  data: {
    tenantId: string;
    draftId: string;
    enrollmentId: string;
    contactId: string;
    contactName: string;
    phone: string;
    stepId: string;
    scriptSubject: string;
    scriptBody: string | null;
  };
};

export const phoneTaskNotification = inngest.createFunction(
  {
    id: "phone-task-notification",
    name: "Phone task → notification (consumer of phone/task-queued)",
    retries: 1,
    triggers: [{ event: "phone/task-queued" }],
  },
  async ({ event, step }: { event: PhoneTaskEvent; step: any }) => {
    const { tenantId, contactId, contactName, phone, scriptSubject } =
      event.data;

    const tenantUsers = await step.run("fetch-tenant-users", async () =>
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.tenantId, tenantId))
        .limit(3),
    );

    if (tenantUsers.length === 0) {
      logger.warn("phone-task-notification.no_users", {
        tenantId,
        contactId,
      });
      return { skipped: "no_tenant_users" };
    }

    const title = `Phone task ready: ${contactName}`;
    const body = `Dial ${phone}. Script: ${scriptSubject}`;

    await step.run("insert-notifications", async () => {
      await db.insert(notifications).values(
        tenantUsers.map((u: { id: string }) => ({
          tenantId,
          userId: u.id,
          type: "system" as const,
          title,
          body,
          entityType: "contact",
          entityId: contactId,
        })),
      );
    });

    return {
      notified: tenantUsers.length,
      tenantId,
      contactId,
      phone,
    };
  },
);
