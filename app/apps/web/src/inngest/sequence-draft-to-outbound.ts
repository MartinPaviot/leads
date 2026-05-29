/**
 * Sequence-draft → outbound email bridge (feat/pilae-draft-to-outbound).
 *
 * The approve route (single AND bulk-approve, B5) emits
 * `email.send.queued` with `{ draftId, tenantId }`. Before this fn
 * shipped, NOTHING subscribed to that event — approved drafts sat in
 * the `approved` state forever and never actually sent.
 *
 * This fn closes the loop:
 *   1. Load the draft (tenant-scoped).
 *   2. Pure decision via `decideDispatch` — refuses unless
 *      status='approved' AND channel='email'. Other channels route
 *      elsewhere (linkedin-send-worker reads linkedinMessages
 *      directly; phone_task waits for the voice handler).
 *   3. Resolve the contact's email + the tenant's active mailbox
 *      (mirrors the auto-pipeline-email-handler pattern so the
 *      mailbox resolution stays consistent across producers).
 *   4. Idempotency: check the draft isn't already linked to an
 *      outboundEmails row before inserting.
 *   5. Insert outboundEmails with status='queued'. The
 *      processOutboundEmails cron picks it up on the next tick.
 *   6. Flip sequenceDrafts.status to 'sent' so the founder's review
 *      queue stops showing it.
 *
 * Failure-tolerant: a missing mailbox falls back to a default sender
 * (matches auto-pipeline-email-handler), a missing contact returns
 * an error reason rather than crashing.
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  sequenceDrafts,
  sequenceSteps,
  outboundEmails,
  contacts,
  connectedMailboxes,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decideDispatch } from "@/lib/sequence-drafts/dispatch-decision";
import type { DraftStatus } from "@/lib/sequence-drafts/state-machine";
import { logger } from "@/lib/observability/logger";

type DispatchEvent = {
  data: {
    draftId: string;
    tenantId: string;
  };
};

export const sequenceDraftToOutbound = inngest.createFunction(
  {
    id: "sequence-draft-to-outbound",
    name: "Bridge: approved sequence_draft → outbound_emails",
    retries: 2,
    onFailure: async ({ error, event }) => {
      logger.error("sequence-draft-to-outbound.dead_letter", {
        draftId: (event as { data?: { draftId?: string } }).data?.draftId,
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ event: "email.send.queued" }],
  },
  async ({ event, step }: { event: DispatchEvent; step: any }) => {
    const { draftId, tenantId } = event.data;

    const [draft] = await db
      .select({
        id: sequenceDrafts.id,
        tenantId: sequenceDrafts.tenantId,
        enrollmentId: sequenceDrafts.enrollmentId,
        contactId: sequenceDrafts.contactId,
        stepId: sequenceDrafts.stepId,
        subject: sequenceDrafts.subject,
        bodyHtml: sequenceDrafts.bodyHtml,
        bodyText: sequenceDrafts.bodyText,
        status: sequenceDrafts.status,
      })
      .from(sequenceDrafts)
      .where(
        and(
          eq(sequenceDrafts.id, draftId),
          eq(sequenceDrafts.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!draft) {
      return { skipped: "draft_not_found", draftId };
    }

    // The drafts table on main doesn't carry a `channel` column yet —
    // that column lives on the linkedin-multichannel branch (S1.1).
    // We derive the channel from `sequenceSteps.stepType` instead so
    // the dispatcher routes correctly TODAY (phone_task vs email)
    // without waiting on the LinkedIn merge. When LinkedIn S1 merges,
    // the sequenceDrafts.channel column becomes the preferred source
    // and overrides this fallback — one line change.
    const [stepRow] = await db
      .select({ stepType: sequenceSteps.stepType })
      .from(sequenceSteps)
      .where(eq(sequenceSteps.id, draft.stepId))
      .limit(1);
    const draftChannel = stepRow?.stepType ?? "email";

    const decision = decideDispatch({
      status: draft.status as DraftStatus,
      channel: draftChannel,
    });
    if (!decision.dispatch) {
      return {
        skipped: decision.reason,
        draftId,
        channel: draftChannel,
        status: draft.status,
      };
    }

    // B (task) — phone_task branch. Emits phone/task-queued with the
    // draft snapshot + contact phone. Consumer (Twilio + Deepgram on
    // feat/voice-cold-call) creates the actual CallTask row + dial
    // queue entry. Producer ships here so the loop is structurally
    // wired before voice-cold-call merges.
    if (decision.via === "phone_task") {
      const [callContact] = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          email: contacts.email,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.id, draft.contactId),
            eq(contacts.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!callContact?.phone) {
        // No phone on file — the phone-enrich pipeline will fill it
        // (visitor-phone-enrich-request stub already emits
        // phone/enrich-requested for company-resolved visits). Drop
        // the draft to expired so the founder isn't queue-blocked;
        // a re-enrol once phone lands restarts the cadence.
        await step.run("mark-no-phone", async () => {
          await db
            .update(sequenceDrafts)
            .set({
              status: "expired",
              reviewedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sequenceDrafts.id, draftId));
        });
        return { skipped: "contact_phone_missing", draftId };
      }

      await step.run("emit-phone-task", async () => {
        await inngest.send({
          name: "phone/task-queued",
          data: {
            tenantId,
            draftId,
            enrollmentId: draft.enrollmentId,
            contactId: callContact.id,
            contactName:
              [callContact.firstName, callContact.lastName]
                .filter(Boolean)
                .join(" ") ||
              callContact.email ||
              "Prospect",
            phone: callContact.phone,
            stepId: draft.stepId,
            scriptSubject: draft.subject,
            scriptBody: draft.bodyText,
          },
        });
      });

      await step.run("mark-sent-phone", async () => {
        await db
          .update(sequenceDrafts)
          .set({
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sequenceDrafts.id, draftId));
      });

      return {
        dispatched: true,
        via: "phone_task",
        draftId,
        contactId: callContact.id,
      };
    }

    const [contact] = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, draft.contactId),
          eq(contacts.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!contact?.email) {
      return { skipped: "contact_email_missing", draftId };
    }

    // Hoist the narrowed types into locals — Drizzle's type inference
    // doesn't carry the contact.email narrowing across the step.run
    // boundary on the insert below, so we capture it explicitly.
    const recipientEmail: string = contact.email;
    const recipientContactId: string = contact.id;

    const [mailbox] = await db
      .select({
        id: connectedMailboxes.id,
        emailAddress: connectedMailboxes.emailAddress,
      })
      .from(connectedMailboxes)
      .where(
        and(
          eq(connectedMailboxes.tenantId, tenantId),
          eq(connectedMailboxes.status, "active"),
        ),
      )
      .limit(1);

    // Idempotency: if the draft id is already on an outboundEmails
    // row, skip. We use the draft's id in the messageId slot as a
    // hash-style dedup key — it's a free-form text column and the
    // shape is documented here.
    const dedupKey = `draft:${draftId}`;
    const [existing] = await db
      .select({ id: outboundEmails.id })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, tenantId),
          eq(outboundEmails.messageId, dedupKey),
        ),
      )
      .limit(1);

    if (existing) {
      // Already queued — fast-forward the draft state and return.
      await step.run("mark-sent", async () => {
        await db
          .update(sequenceDrafts)
          .set({
            status: "sent",
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sequenceDrafts.id, draftId));
      });
      return {
        skipped: "already_queued",
        draftId,
        outboundEmailId: existing.id,
      };
    }

    const [created] = await step.run("insert-outbound", async () =>
      db
        .insert(outboundEmails)
        .values({
          tenantId,
          enrollmentId: draft.enrollmentId,
          contactId: recipientContactId,
          mailboxId: mailbox?.id || null,
          fromAddress:
            mailbox?.emailAddress || "Elevay <outbound@resend.dev>",
          toAddress: recipientEmail,
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyText: draft.bodyText,
          messageId: dedupKey,
          status: "queued",
          queuedAt: new Date(),
        })
        .returning({ id: outboundEmails.id }),
    );

    await step.run("mark-sent", async () => {
      await db
        .update(sequenceDrafts)
        .set({
          status: "sent",
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sequenceDrafts.id, draftId));
    });

    return {
      dispatched: true,
      draftId,
      outboundEmailId: created?.id,
      via: decision.via,
      mailbox: mailbox?.emailAddress ?? "fallback",
    };
  },
);
