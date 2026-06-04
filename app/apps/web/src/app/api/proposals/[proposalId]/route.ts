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
