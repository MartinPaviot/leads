import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps, contacts, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { buildProspectContext } from "@/lib/prospect-context";
import { generateSequence } from "@/lib/sequence-generator";

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

    // Resolve contact — auto-pick from TAM if nothing provided
    let resolvedContactId = contactId;

    if (!resolvedContactId && companyId) {
      const [bestContact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.companyId, companyId), eq(contacts.tenantId, authCtx.tenantId)))
        .orderBy(contacts.score)
        .limit(1);
      if (bestContact) resolvedContactId = bestContact.id;
    }

    if (!resolvedContactId) {
      // Auto-pick: find top-scored company with contacts
      const topCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.tenantId, authCtx.tenantId))
        .orderBy(companies.score)
        .limit(10);

      for (const comp of topCompanies) {
        const [contact] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.companyId, comp.id), eq(contacts.tenantId, authCtx.tenantId)))
          .orderBy(contacts.score)
          .limit(1);
        if (contact) { resolvedContactId = contact.id; break; }
      }

      if (!resolvedContactId) {
        return Response.json({ error: "No contacts found in your TAM. Build your TAM first." }, { status: 404 });
      }
    }

    // Build full prospect context
    const ctx = await buildProspectContext(resolvedContactId, authCtx.tenantId);
    if (!ctx) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    // Generate the sequence
    const generated = await generateSequence(ctx, { stepCount: stepCount || 5 });

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
      methodology: {
        seniority: ctx.contact.seniority,
        signalUsed: ctx.bestSignal?.type || null,
        signalTitle: ctx.bestSignal?.title || null,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("Campaign generation failed:", error);
    return Response.json({ error: error.message || "Campaign generation failed" }, { status: 500 });
  }
}
