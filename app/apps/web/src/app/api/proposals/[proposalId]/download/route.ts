import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { proposals, proposalComponents, proposalTemplates } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getProposalStorage } from "@/lib/proposals/storage";
import { assembleFilledDocx, type DocxFillComponent } from "@/lib/proposals/ooxml";
import type { ComponentMap } from "@/lib/proposals/component-map";

type Params = { params: Promise<{ proposalId: string }> };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * GET /api/proposals/[proposalId]/download — assemble + stream the filled .docx
 * from the original template bytes (every non-document entry preserved).
 */
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

    const [tpl] = await db
      .select()
      .from(proposalTemplates)
      .where(
        and(eq(proposalTemplates.id, p.templateId), eq(proposalTemplates.tenantId, authCtx.tenantId)),
      )
      .limit(1);
    if (!tpl || !tpl.componentMap || !tpl.storageRef) {
      return Response.json({ error: "template_unavailable" }, { status: 409 });
    }

    const stored = await getProposalStorage().get(authCtx.tenantId, tpl.storageRef);
    if (!stored) return Response.json({ error: "original_missing" }, { status: 409 });

    const comps = await db
      .select({ componentId: proposalComponents.componentId, content: proposalComponents.content })
      .from(proposalComponents)
      .where(
        and(
          eq(proposalComponents.proposalId, proposalId),
          eq(proposalComponents.tenantId, authCtx.tenantId),
        ),
      );
    const contentById: Record<string, string> = {};
    for (const c of comps) contentById[c.componentId] = c.content;

    const map = tpl.componentMap as ComponentMap;
    const fillComponents: DocxFillComponent[] = map.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      anchorHeading: c.anchor.headingText,
    }));
    const { bytes } = assembleFilledDocx(stored.bytes, fillComponents, contentById);

    const safeName = (tpl.name || "proposal").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="${safeName}-filled.docx"`,
      },
    });
  });
}
