import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { proposals, proposalComponents } from "@/db/schema";
import { and, eq, asc, isNull } from "drizzle-orm";

type Params = { params: Promise<{ proposalId: string }> };

/** GET /api/proposals/[proposalId] — filled proposal + its components. */
export async function GET(_req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { proposalId } = await params;
    const [p] = await db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.id, proposalId),
          eq(proposals.tenantId, authCtx.tenantId),
          isNull(proposals.deletedAt),
        ),
      )
      .limit(1);
    if (!p) return Response.json({ error: "not_found" }, { status: 404 });

    const components = await db
      .select({
        componentId: proposalComponents.componentId,
        kind: proposalComponents.kind,
        label: proposalComponents.label,
        content: proposalComponents.content,
        order: proposalComponents.order,
        confidence: proposalComponents.confidence,
        source: proposalComponents.source,
      })
      .from(proposalComponents)
      .where(
        and(
          eq(proposalComponents.proposalId, proposalId),
          eq(proposalComponents.tenantId, authCtx.tenantId),
        ),
      )
      .orderBy(asc(proposalComponents.order));

    return Response.json({
      proposal: { id: p.id, templateId: p.templateId, dealId: p.dealId, status: p.status },
      components,
    });
  });
}

/**
 * PATCH /api/proposals/[proposalId] — persist proofread edits to component
 * content (PROPOSAL-004). The download reads proposal_components.content, so
 * edits flow straight through to the filled file. Tenant-scoped.
 */
export async function PATCH(req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { proposalId } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      components?: Array<{ componentId: string; content: string }>;
    };
    if (!Array.isArray(body.components) || body.components.length === 0) {
      return Response.json({ error: "no_components" }, { status: 400 });
    }

    const [p] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(
        and(
          eq(proposals.id, proposalId),
          eq(proposals.tenantId, authCtx.tenantId),
          isNull(proposals.deletedAt),
        ),
      )
      .limit(1);
    if (!p) return Response.json({ error: "not_found" }, { status: 404 });

    let updated = 0;
    for (const c of body.components) {
      if (typeof c.componentId !== "string" || typeof c.content !== "string") continue;
      await db
        .update(proposalComponents)
        .set({ content: c.content })
        .where(
          and(
            eq(proposalComponents.proposalId, proposalId),
            eq(proposalComponents.componentId, c.componentId),
            eq(proposalComponents.tenantId, authCtx.tenantId),
          ),
        );
      updated++;
    }
    return Response.json({ ok: true, updated });
  });
}
