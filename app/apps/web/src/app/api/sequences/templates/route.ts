/**
 * Proven sequence-template gallery API.
 *
 * GET  → the library (summary shape) + which templates this tenant already
 *        instantiated (so the gallery shows "Ajouté" vs "Utiliser").
 * POST → instantiate one template for the tenant as a DRAFT sequence (the router
 *        only routes to `active`, so this configures without sending). Idempotent
 *        on campaignConfig.templateId via the pure factory.
 *
 * Thin glue over the unit-tested `lib/sequences/templates/*` — the route only
 * wires Drizzle IO into the injected factory deps.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps } from "@/db/schema";
import { apiError } from "@/lib/infra/api-errors";
import {
  PROVEN_TEMPLATES,
  getTemplate,
  toTemplateSummary,
  templateIdOf,
} from "@/lib/sequences/templates/registry";
import {
  instantiateTemplate,
  type InstantiateDeps,
  type SequenceInsert,
  type StepInsert,
} from "@/lib/sequences/templates/instantiate";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  try {
    const rows = await db
      .select({ campaignConfig: sequences.campaignConfig })
      .from(sequences)
      .where(eq(sequences.tenantId, authCtx.tenantId));

    const instantiated = new Set(
      rows.map((r) => templateIdOf(r.campaignConfig as Record<string, unknown> | null)).filter((x): x is string => !!x),
    );

    const templates = PROVEN_TEMPLATES.map((t) => ({
      ...toTemplateSummary(t),
      instantiated: instantiated.has(t.id),
    }));

    return Response.json({ templates });
  } catch (error) {
    console.error("Failed to load sequence templates:", error);
    return apiError("INTERNAL_ERROR", "Failed to load templates");
  }
}

const useTemplateSchema = z.object({ templateId: z.string().min(1) });

/** Drizzle-wired factory deps for the authenticated tenant. */
function tenantInstantiateDeps(): InstantiateDeps {
  return {
    findExisting: async (tenantId, templateId) => {
      const [row] = await db
        .select({ id: sequences.id })
        .from(sequences)
        .where(and(eq(sequences.tenantId, tenantId), sql`${sequences.campaignConfig}->>'templateId' = ${templateId}`))
        .limit(1);
      return row ? { id: row.id } : null;
    },
    insertSequence: async (row: SequenceInsert) => {
      const [seq] = await db
        .insert(sequences)
        .values({
          tenantId: row.tenantId,
          name: row.name,
          description: row.description,
          status: row.status,
          campaignConfig: row.campaignConfig,
          createdBy: row.createdBy,
        })
        .returning({ id: sequences.id });
      return { id: seq.id };
    },
    insertSteps: async (rows: StepInsert[]) => {
      if (rows.length === 0) return;
      await db.insert(sequenceSteps).values(
        rows.map((s) => ({
          sequenceId: s.sequenceId,
          stepNumber: s.stepNumber,
          stepType: s.stepType,
          subjectTemplate: s.subjectTemplate,
          bodyTemplate: s.bodyTemplate,
          delayDays: s.delayDays,
          channelConfig: s.channelConfig,
        })),
      );
    },
  };
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  let parsed: z.infer<typeof useTemplateSchema>;
  try {
    parsed = useTemplateSchema.parse(await req.json());
  } catch {
    return apiError("VALIDATION_ERROR", "templateId is required");
  }

  const template = getTemplate(parsed.templateId);
  if (!template) return apiError("NOT_FOUND", `Unknown template: ${parsed.templateId}`);

  try {
    const result = await instantiateTemplate(authCtx.tenantId, template, tenantInstantiateDeps(), {
      status: "draft", // configured, NOT activated
      createdBy: authCtx.userId,
    });
    return Response.json({ result }, { status: result.outcome === "created" ? 201 : 200 });
  } catch (error) {
    console.error("Failed to instantiate template:", error);
    return apiError("INTERNAL_ERROR", "Failed to add template");
  }
}
