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
    const { contactId, companyId, stepCount } = body;

    if (!contactId && !companyId) {
      return Response.json({ error: "contactId or companyId required" }, { status: 400 });
    }

    // Resolve contact
    let resolvedContactId = contactId;

    if (!resolvedContactId && companyId) {
      // Pick the best-scored contact at this company
      const [bestContact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, companyId),
            eq(contacts.tenantId, authCtx.tenantId)
          )
        )
        .orderBy(contacts.score)
        .limit(1);

      if (!bestContact) {
        return Response.json({ error: "No contacts found at this company" }, { status: 404 });
      }
      resolvedContactId = bestContact.id;
    }

    // Build full prospect context
    const ctx = await buildProspectContext(resolvedContactId, authCtx.tenantId);
    if (!ctx) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    // Generate the sequence
    const generated = await generateSequence(ctx, { stepCount: stepCount || 5 });

    // Create sequence + steps in DB
    const [sequence] = await db
      .insert(sequences)
      .values({
        name: generated.sequenceName,
        description: generated.sequenceReasoning,
        tenantId: authCtx.tenantId,
        status: "draft",
      })
      .returning();

    for (const step of generated.steps) {
      await db.insert(sequenceSteps).values({
        sequenceId: sequence.id,
        stepNumber: step.stepNumber,
        subjectTemplate: step.subject,
        bodyTemplate: step.body,
        delayDays: step.delayDays,
      });
    }

    return Response.json({
      sequenceId: sequence.id,
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
