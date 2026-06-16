/**
 * Inngest event-driven functions that run skills in response to CRM events.
 * - contact/created → enrich + qualify
 */

import { inngest } from "./client";
import { db } from "@/db";
import { contacts, notifications, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSkill } from "@/skills/runner";
import { inboundLeadEnrichmentSkill } from "@/skills/enrichment/inbound-lead-enrichment";
import { inboundLeadQualificationSkill } from "@/skills/scoring/inbound-lead-qualification";
import { confirmHotInboundIsLead } from "@/lib/inbound/relationship-check";

/**
 * When a contact is created, auto-enrich via Apollo then qualify.
 * Produces a notification if the lead is hot.
 */
export const onContactCreatedEnrichAndQualify = inngest.createFunction(
  {
    id: "contact-created-enrich-qualify",
    name: "Auto-Enrich & Qualify New Contact",
    retries: 2,
    onFailure: async ({ error, event }) => {
      console.error(
        `[DEAD LETTER] contact-enrich-qualify failed for ${(event as any).data?.contactId}:`,
        error.message,
      );
    },
    triggers: [{ event: "contact/created" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { contactId: string; tenantId: string; source?: string } };
    step: any;
  }) => {
    const { contactId, tenantId, source } = event.data;

    // Step 1: Enrich contact + company via Apollo
    const enrichResult = await step.run("enrich-contact", async () => {
      const result = await runSkill(inboundLeadEnrichmentSkill, {
        contactId,
        enrichCompany: true,
      }, { tenantId, dryRun: false });
      return result;
    });

    // Step 2: Qualify the contact
    const qualifyResult = await step.run("qualify-contact", async () => {
      const result = await runSkill(inboundLeadQualificationSkill, {
        contactId,
        source: (source as any) ?? "unknown",
      }, { tenantId, dryRun: false });
      return result;
    });

    // Step 3: Notify if hot lead
    if (qualifyResult.success && qualifyResult.data) {
      const data = qualifyResult.data as {
        priority: string;
        contactName: string | null;
        companyName: string | null;
        score: number;
        recommendedAction: string;
      };

      let shouldNotify = data.priority === "hot";
      // Inbound EMAIL only: confirm the sender is genuinely a prospect (not a
      // vendor we pay, a recruiter, or a newsletter that slipped the
      // deterministic stage) before raising a "Hot inbound lead". Other sources
      // (demo forms, referrals) are already high-intent. Fail-open: a null or
      // uncertain verdict keeps the notification. See _specs/inbound-lead-recognition/.
      if (shouldNotify && source === "inbound_email") {
        const conf = await step.run("confirm-inbound-relationship", async () => {
          return await confirmHotInboundIsLead({ contactId, tenantId });
        });
        shouldNotify = conf.isLead;
      }
      if (shouldNotify) {
        await step.run("notify-hot-lead", async () => {
          // Fan out to every user in the tenant — notifications.userId is required.
          const recipients = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.tenantId, tenantId));
          if (recipients.length === 0) return;
          try {
            await db.insert(notifications).values(
              recipients.map((u) => ({
                tenantId,
                userId: u.id,
                type: "new_contact" as const,
                title: `Hot inbound lead: ${data.contactName || "Unknown"}`,
                body: `${data.companyName ? `${data.companyName} — ` : ""}Score: ${data.score}. ${data.recommendedAction}`,
              })),
            );
          } catch {
            /* non-critical — never block enrichment on notification failure */
          }
        });
      }
    }

    return {
      contactId,
      enriched: enrichResult.success,
      qualified: qualifyResult.success,
      priority: (qualifyResult.data as any)?.priority ?? "unknown",
    };
  },
);
