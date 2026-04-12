/**
 * Inngest event-driven functions that run skills in response to CRM events.
 * - contact/created → enrich + qualify
 */

import { inngest } from "./client";
import { db } from "@/db";
import { contacts, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSkill } from "@/skills/runner";
import { inboundLeadEnrichmentSkill } from "@/skills/enrichment/inbound-lead-enrichment";
import { inboundLeadQualificationSkill } from "@/skills/scoring/inbound-lead-qualification";

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

      if (data.priority === "hot") {
        await step.run("notify-hot-lead", async () => {
          await db.insert(notifications).values({
            tenantId,
            type: "new_contact",
            title: `Hot inbound lead: ${data.contactName || "Unknown"}`,
            body: `${data.companyName ? `${data.companyName} — ` : ""}Score: ${data.score}. ${data.recommendedAction}`,
          }).catch(() => {});
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
