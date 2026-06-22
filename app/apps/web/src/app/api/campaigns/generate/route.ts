import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps, contacts, companies } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { buildProspectContext } from "@/lib/context/prospect-context";
import { generateSequence } from "@/lib/agents/sequence-generator";
import { buildIntelligenceBrief, toResearchBriefContext, briefIsEmpty } from "@/lib/campaign-engine/build-intelligence-brief";
import type { IntelligenceBrief } from "@/lib/campaign-engine/types";
import { selectStrategy } from "@/lib/campaign-engine/select-strategy";
import { withTimeout } from "@/lib/utils/with-timeout";
import { extractDominantInsight, type DominantInsight } from "@/lib/sequence-drafts/rejection-counter-prompt";

const TIMEOUT_BRIEF_MS = Number(process.env.GENERATE_BRIEF_TIMEOUT_MS ?? 8000);

/**
 * POST /api/campaigns/generate
 *
 * AI-generates a complete outreach sequence for a specific contact or company.
 * Uses signals, methodology, knowledge base — the full intelligence stack.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contactId, companyId, sequenceId, stepCount } = body;

    // Try to find a contact to personalize from, but fall back to company-only context
    let resolvedContactId = contactId;

    if (!resolvedContactId && companyId) {
      const [bestContact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.companyId, companyId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
        .orderBy(contacts.score)
        .limit(1);
      if (bestContact) resolvedContactId = bestContact.id;
    }

    if (!resolvedContactId) {
      // Auto-pick: find top-scored company, preferably with contacts
      const topCompanies = await db
        .select()
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .orderBy(sql`score DESC NULLS LAST`)
        .limit(10);

      if (topCompanies.length === 0) {
        return Response.json({ error: "No accounts in your TAM. Build your TAM first." }, { status: 404 });
      }

      for (const comp of topCompanies) {
        const [contact] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.companyId, comp.id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
          .orderBy(contacts.score)
          .limit(1);
        if (contact) { resolvedContactId = contact.id; break; }
      }
    }

    // Build context — either from contact or from company
    // Kick off intelligence brief in background (non-blocking enrichment for future use)
    const contactForBrief = resolvedContactId;
    const companyForBrief = companyId || (resolvedContactId ? (await db.select({ companyId: contacts.companyId }).from(contacts).where(and(eq(contacts.id, resolvedContactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt))).limit(1))[0]?.companyId : null);
    // P0-2 — AWAIT the research brief (bounded + fail-open) so generation can
    // lead with it. Cache hit = instant; cold = bounded scrape; timeout/error =
    // null -> firmographic flow. The brief NEVER blocks the response.
    let resolvedBrief: IntelligenceBrief | null = null;
    if (companyForBrief) {
      resolvedBrief = await withTimeout(
        buildIntelligenceBrief(companyForBrief, authCtx.tenantId, contactForBrief || undefined),
        TIMEOUT_BRIEF_MS,
      );
    }

    // P0-6 — load the per-sequence dominant rejection insight (fail-open,
    // tenant-scoped; floor applied in extractDominantInsight) so generation
    // counters the reason founders kept rejecting for.
    let rejectionInsight: DominantInsight | null = null;
    if (sequenceId) {
      try {
        const [seq] = await db
          .select({ campaignConfig: sequences.campaignConfig })
          .from(sequences)
          .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)))
          .limit(1);
        rejectionInsight = extractDominantInsight(seq?.campaignConfig);
      } catch (err) {
        console.warn("rejectionInsight load failed (fail-open):", err);
      }
    }

    let generated;
    let strategyUsed: string | null = null;

    // Try strategy selection if brief already exists
    if (companyForBrief) {
      try {
        const candidates = await selectStrategy(companyForBrief, authCtx.tenantId, contactForBrief || undefined);
        if (candidates.length > 0) {
          strategyUsed = candidates[0].strategyId;
        }
      } catch {
        // Brief might not exist yet — fall through to default generation
      }
    }

    if (resolvedContactId) {
      const ctx = await buildProspectContext(resolvedContactId, authCtx.tenantId);
      if (!ctx) return Response.json({ error: "Contact not found" }, { status: 404 });
      generated = await generateSequence(ctx, { stepCount: stepCount || 5, rejectionInsight });
    } else {
      // No contacts yet — generate template sequence from company context
      const { getTenantSettings } = await import("@/lib/config/tenant-settings");
      const settings = await getTenantSettings(authCtx.tenantId);
      const topCompany = await db.select().from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .orderBy(sql`score DESC NULLS LAST`).limit(1);

      const company = topCompany[0];
      const { getMethodology } = await import("@/lib/scoring/outbound-methodologies");
      const methodology = getMethodology("VP"); // default to VP-level methodology

      // Build a minimal context for template generation
      const minimalCtx = {
        contact: {
          name: "{{firstName}} {{lastName}}",
          firstName: "{{firstName}}",
          lastName: "{{lastName}}",
          title: "{{title}}",
          seniority: "VP",
          departments: [],
          email: "contact@example.com",
          score: 0,
          scoreReasons: [],
        },
        company: {
          name: company?.name || "Target Company",
          domain: company?.domain || "",
          industry: (company?.industry as string) || "",
          size: (company?.size as string) || "",
          description: "",
        },
        signals: [],
        bestSignal: null,
        technologies: [],
        funding: null,
        tenant: {
          name: settings.onboardingCompanyName || "Our Company",
          productDescription: settings.productDescription || "",
          tone: settings.aiTone || "Direct",
          knowledge: [],
        },
        previousEmails: [],
        activities: [],
        researchBrief:
          resolvedBrief && !briefIsEmpty(toResearchBriefContext(resolvedBrief))
            ? toResearchBriefContext(resolvedBrief)
            : undefined,
      };

      generated = await generateSequence(minimalCtx as any, { stepCount: stepCount || 5, rejectionInsight });
    }

    let targetSequenceId = sequenceId;

    if (sequenceId) {
      // Update existing sequence steps — delete old, insert new
      await db.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId));
      await db.update(sequences).set({
        description: generated.sequenceReasoning,
        updatedAt: new Date(),
      }).where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)));

      for (const step of generated.steps) {
        await db.insert(sequenceSteps).values({
          sequenceId,
          stepNumber: step.stepNumber,
          subjectTemplate: step.subject,
          bodyTemplate: step.body,
          delayDays: step.delayDays,
        });
      }
    } else {
      // Create new sequence + steps
      const [sequence] = await db
        .insert(sequences)
        .values({
          name: generated.sequenceName,
          description: generated.sequenceReasoning,
          tenantId: authCtx.tenantId,
          createdBy: authCtx.userId,
          status: "draft",
        })
        .returning();
      targetSequenceId = sequence.id;

      for (const step of generated.steps) {
        await db.insert(sequenceSteps).values({
          sequenceId: sequence.id,
          stepNumber: step.stepNumber,
          subjectTemplate: step.subject,
          bodyTemplate: step.body,
          delayDays: step.delayDays,
        });
      }
    }

    return Response.json({
      sequenceId: targetSequenceId,
      sequenceName: generated.sequenceName,
      reasoning: generated.sequenceReasoning,
      steps: generated.steps,
      quality: {
        composite: generated.sequenceQuality?.composite ?? null,
        passed: generated.sequenceQuality?.passed ?? null,
        perStep: generated.steps.map((s: { stepNumber: number; qualityScore?: { composite: number } }) => ({
          stepNumber: s.stepNumber,
          composite: s.qualityScore?.composite ?? null,
        })),
      },
      methodology: {
        seniority: resolvedContactId ? "detected" : "VP",
        signalUsed: null,
        signalTitle: null,
      },
      strategyUsed,
    }, { status: 201 });
  } catch (error) {
    // Log the detail server-side; return a generic message so ORM /
    // LLM errors can't leak table names, schema fragments, or API
    // keys embedded in upstream error strings.
    console.error("Campaign generation failed:", error);
    return Response.json(
      { error: "Campaign generation failed" },
      { status: 500 }
    );
  }
}
