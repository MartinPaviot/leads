/**
 * Prospect Context Builder
 *
 * Assembles ALL available intelligence about a prospect into a single
 * structured context for LLM consumption. Used by sequence generation,
 * email personalization, and reply handling.
 */

import { db } from "@/db";
import { contacts, companies, activities, knowledgeEntries } from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { getTenantSettings, type KnowledgeEntry } from "@/lib/config/tenant-settings";
import { isSignalFresh } from "@/lib/signals/freshness";

export interface ProspectSignal {
  type: string;
  title: string;
  description: string;
  relevance: string;
  dataSource?: string;
}

export interface ProspectContext {
  // Contact
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string;
    email: string | null;
    title: string | null;
    seniority: string | null;
    departments: string[];
    linkedinUrl: string | null;
    score: number | null;
    scoreReasons: string[];
  };

  // Company
  company: {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    size: string | null;
    revenue: string | null;
    description: string | null;
    foundedYear: number | null;
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;

  // Enrichment signals
  signals: ProspectSignal[];
  bestSignal: ProspectSignal | null;
  technologies: string[];
  funding: {
    stage: string | null;
    amount: string | null;
    amountPrinted: string | null;
  };

  // Tenant knowledge
  knowledge: KnowledgeEntry[];
  productDescription: string;
  aiTone: string;
  companyName: string;

  // Interaction history
  previousEmails: Array<{
    stepNumber: number | null;
    subject: string;
    bodyText: string | null;
    sentAt: string | null;
  }>;
  recentActivities: Array<{
    type: string;
    summary: string | null;
    direction: string | null;
    occurredAt: string | null;
  }>;
}

/**
 * Build a complete prospect context for LLM consumption.
 * Fetches contact, company, signals, knowledge, and interaction history.
 */
export async function buildProspectContext(
  contactId: string,
  tenantId: string
): Promise<ProspectContext | null> {
  // Fetch contact
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
    .limit(1);

  if (!contact) return null;

  const contactProps = (contact.properties || {}) as Record<string, any>;

  // Fetch company
  let companyData: ProspectContext["company"] = null;
  let signals: ProspectSignal[] = [];
  let technologies: string[] = [];
  let funding: ProspectContext["funding"] = { stage: null, amount: null, amountPrinted: null };

  if (contact.companyId) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, tenantId)))
      .limit(1);

    if (company) {
      const props = (company.properties || {}) as Record<string, any>;

      companyData = {
        id: company.id,
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        size: company.size,
        revenue: company.revenue,
        description: company.description,
        foundedYear: props.founded_year || null,
        city: props.city || null,
        state: props.state || null,
        country: props.country || null,
      };

      // Extract signals (high + medium only). A signal past its shelf life is
      // dropped before it reaches the LLM — a stale trigger cited in a draft
      // is the tell of automation (lib/signals/freshness.ts). Entries without
      // a detectedAt are kept (cannot prove staleness).
      if (Array.isArray(props.signals)) {
        signals = props.signals
          .filter((s: any) => s.relevance === "high" || s.relevance === "medium")
          .filter((s: any) => isSignalFresh(String(s.type ?? ""), s.detectedAt ?? null))
          .map((s: any) => ({
            type: s.type,
            title: s.title,
            description: s.description,
            relevance: s.relevance,
            dataSource: s.dataSource,
          }));
      }

      technologies = Array.isArray(props.technologies) ? props.technologies : [];

      funding = {
        stage: props.latest_funding_stage || null,
        amount: props.total_funding ? String(props.total_funding) : null,
        amountPrinted: props.total_funding_printed || null,
      };
    }
  }

  // Fetch tenant settings
  const settings = await getTenantSettings(tenantId);

  // Fetch previous outbound emails to this contact (for follow-up awareness)
  let previousEmails: ProspectContext["previousEmails"] = [];
  try {
    const { outboundEmails } = await import("@/db/schema");
    const emails = await db
      .select({
        stepNumber: outboundEmails.stepNumber,
        subject: outboundEmails.subject,
        bodyText: outboundEmails.bodyText,
        sentAt: outboundEmails.sentAt,
      })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.contactId, contactId),
          eq(outboundEmails.tenantId, tenantId)
        )
      )
      .orderBy(outboundEmails.stepNumber)
      .limit(10);

    previousEmails = emails.map((e) => ({
      stepNumber: e.stepNumber,
      subject: e.subject,
      bodyText: e.bodyText,
      sentAt: e.sentAt?.toISOString() || null,
    }));
  } catch {
    // Non-critical
  }

  // Fetch recent activities with this contact
  let recentActivities: ProspectContext["recentActivities"] = [];
  try {
    const acts = await db
      .select({
        activityType: activities.activityType,
        summary: activities.summary,
        direction: activities.direction,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .where(
        and(
          eq(activities.entityId, contactId),
          eq(activities.tenantId, tenantId)
        )
      )
      .orderBy(desc(activities.occurredAt))
      .limit(10);

    recentActivities = acts.map((a) => ({
      type: a.activityType || "",
      summary: a.summary,
      direction: a.direction,
      occurredAt: a.occurredAt?.toISOString() || null,
    }));
  } catch {
    // Non-critical
  }

  // Find best signal
  const { pickBestSignal } = await import("@/lib/scoring/outbound-methodologies");
  const bestSignal = pickBestSignal(signals);

  return {
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "there",
      email: contact.email,
      title: contact.title,
      seniority: contactProps.seniority || null,
      departments: Array.isArray(contactProps.departments) ? contactProps.departments : [],
      linkedinUrl: contact.linkedinUrl || contactProps.linkedin_url || null,
      score: contact.score,
      scoreReasons: Array.isArray(contact.scoreReasons) ? (contact.scoreReasons as string[]) : [],
    },
    company: companyData,
    signals,
    bestSignal,
    technologies,
    funding,
    knowledge: await (async (): Promise<KnowledgeEntry[]> => {
      try {
        const rows = await db
          .select({ title: knowledgeEntries.title, content: knowledgeEntries.content })
          .from(knowledgeEntries)
          .where(and(
            eq(knowledgeEntries.tenantId, tenantId),
            eq(knowledgeEntries.isActive, true),
            eq(knowledgeEntries.scope, "workspace"),
          ))
          .orderBy(desc(knowledgeEntries.updatedAt))
          .limit(10);
        if (rows.length > 0) return rows.map((r) => ({ topic: r.title, content: r.content }));
      } catch { /* fall through */ }
      return settings.knowledge || [];
    })(),
    productDescription: settings.productDescription || "",
    aiTone: settings.aiTone || "Direct",
    companyName: settings.onboardingCompanyName || "",
    previousEmails,
    recentActivities,
  };
}

/**
 * Format a ProspectContext into a structured text block for LLM prompts.
 */
export function formatContextForPrompt(ctx: ProspectContext): string {
  const sections: string[] = [];

  // Prospect
  sections.push(`PROSPECT:
- Name: ${ctx.contact.fullName}
- Title: ${ctx.contact.title || "unknown"}
- Seniority: ${ctx.contact.seniority || "unknown"}
- Department: ${ctx.contact.departments.join(", ") || "unknown"}`);

  // Company
  if (ctx.company) {
    sections.push(`COMPANY:
- Name: ${ctx.company.name}
- Industry: ${ctx.company.industry || "unknown"}
- Size: ${ctx.company.size || "unknown"}
- Revenue: ${ctx.company.revenue || "unknown"}
- Location: ${[ctx.company.city, ctx.company.state, ctx.company.country].filter(Boolean).join(", ") || "unknown"}
- Founded: ${ctx.company.foundedYear || "unknown"}
- Description: ${ctx.company.description || "N/A"}`);
  }

  // Signals
  if (ctx.signals.length > 0) {
    const signalLines = ctx.signals
      .map((s) => `- [${s.relevance.toUpperCase()}] ${s.type}: ${s.title} — ${s.description} (source: ${s.dataSource || "enrichment"})`)
      .join("\n");
    sections.push(`BUYING SIGNALS:\n${signalLines}`);
  }

  // Tech stack
  if (ctx.technologies.length > 0) {
    sections.push(`TECH STACK: ${ctx.technologies.join(", ")}`);
  }

  // Funding
  if (ctx.funding.stage) {
    sections.push(`FUNDING: ${ctx.funding.stage}${ctx.funding.amountPrinted ? ` (${ctx.funding.amountPrinted})` : ""}`);
  }

  // Knowledge base
  if (ctx.knowledge.length > 0) {
    const kbLines = ctx.knowledge
      .map((k) => `- ${k.topic}: ${k.content}`)
      .join("\n");
    sections.push(`OUR BUSINESS CONTEXT:\n${kbLines}`);
  }

  // Product
  if (ctx.productDescription) {
    sections.push(`OUR PRODUCT: ${ctx.productDescription}`);
  }

  // Previous emails (for follow-up awareness)
  if (ctx.previousEmails.length > 0) {
    const emailLines = ctx.previousEmails
      .map((e) => `- Step ${e.stepNumber}: "${e.subject}" ${e.sentAt ? `(sent ${e.sentAt.split("T")[0]})` : ""}`)
      .join("\n");
    sections.push(`PREVIOUS EMAILS SENT TO THIS PROSPECT:\n${emailLines}\n(Do NOT repeat these angles or subject lines)`);
  }

  return sections.join("\n\n");
}
