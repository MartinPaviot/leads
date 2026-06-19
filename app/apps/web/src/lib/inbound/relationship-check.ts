/**
 * Hot-inbound confirmation — DB orchestration for stage 2 of the inbound-lead
 * funnel (see _specs/inbound-lead-recognition/).
 *
 * The deterministic stage (lead-classification.ts) stops machine mail at
 * capture. What can still slip through is a REAL human who is nonetheless not a
 * lead: a salesperson pitching us, a vendor we pay writing personally, a
 * recruiter. This loads the contact, its most recent inbound email and the
 * tenant's ICP/product, then asks the LLM relationship stage whether it is
 * genuinely a prospect — used to gate the "Hot inbound lead" notification.
 *
 * Fail-open by construction: any missing data or a null verdict returns
 * isLead:true. We only ever suppress on a CONFIDENT negative, never on
 * uncertainty — dropping a real lead is worse than showing one borderline one.
 */

import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  classifyInboundRelationship,
  type RelationshipVerdict,
} from "./relationship-classifier";
import { withLeadRelationship } from "./lead-status";

export interface HotInboundConfirmation {
  /** false only when the classifier is confident the sender is NOT a lead. */
  isLead: boolean;
  verdict: RelationshipVerdict | null;
}

export async function confirmHotInboundIsLead(opts: {
  contactId: string;
  tenantId: string;
}): Promise<HotInboundConfirmation> {
  const { contactId, tenantId } = opts;

  const [contact] = await db
    .select({
      email: contacts.email,
      title: contacts.title,
      companyId: contacts.companyId,
      properties: contacts.properties,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.tenantId, tenantId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) return { isLead: true, verdict: null };

  let companyName: string | null = null;
  if (contact.companyId) {
    const [co] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
      .limit(1);
    companyName = co?.name ?? null;
  }

  // The most recent inbound email is the message that earned the hot flag.
  const [lastInbound] = await db
    .select({
      summary: activities.summary,
      rawContent: activities.rawContent,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, contactId),
        eq(activities.activityType, "email_received"),
        eq(activities.direction, "inbound"),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(1);

  // No inbound email to reason over (e.g. a form lead) → not our job to block.
  if (!lastInbound) return { isLead: true, verdict: null };

  const settings = await getTenantSettings(tenantId);
  const industries = (settings.targetIndustries ?? []) as string[];
  const seniorities = (settings.targetSeniorities ?? []) as string[];
  const icpParts: string[] = [];
  if (industries.length) icpParts.push(`industries: ${industries.join(", ")}`);
  if (seniorities.length) icpParts.push(`seniority: ${seniorities.join(", ")}`);
  const icpSummary = icpParts.join("; ") || null;

  const meta = (lastInbound.metadata || {}) as Record<string, unknown>;
  const fromHeader = (meta.from as string | undefined) || contact.email || "";

  const verdict = await classifyInboundRelationship({
    fromHeader,
    subject: lastInbound.summary,
    text: lastInbound.rawContent,
    senderTitle: contact.title,
    senderCompany: companyName,
    productDescription: settings.productDescription ?? null,
    icpSummary,
    tenantId,
  });

  // Persist the LLM verdict so warm-leads + hot-inbounds can honour it without
  // re-running the model (tranche 3). Best-effort, never blocks the gate.
  if (verdict) {
    try {
      const properties = withLeadRelationship(
        (contact.properties as Record<string, unknown> | null) ?? null,
        {
          isInboundLead: verdict.isInboundLead,
          relationshipToUs: verdict.relationshipToUs,
          intent: verdict.intent,
          reason: verdict.reason,
          at: new Date().toISOString(),
        },
      );
      await db
        .update(contacts)
        .set({ properties })
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)));
    } catch (err) {
      console.warn("persist lead relationship failed:", err);
    }
  }

  // Only a confident negative suppresses the lead (fail-open on null).
  return { isLead: verdict?.isInboundLead !== false, verdict };
}
