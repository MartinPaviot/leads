import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { proposals, proposalComponents, proposalTemplates } from "@/db/schema";
import { and, eq, asc, isNull } from "drizzle-orm";
import { getProposalStorage } from "@/lib/proposals/storage";
import { assembleFilledDocx, type DocxFillComponent } from "@/lib/proposals/ooxml";
import { assembleFilledPptx } from "@/lib/proposals/pptx";
import { renderProposalPdf } from "@/lib/proposals/pdf";
import type { ComponentMap } from "@/lib/proposals/component-map";

type Params = { params: Promise<{ proposalId: string }> };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * GET /api/proposals/[proposalId]/download[?as=pdf]
 * Default: assemble the filled .docx/.pptx from the original template bytes
 * (layout-faithful). With ?as=pdf: regenerate a clean PDF from the components
 * (content-faithful; PDFs do not reflow — see SI-5).
 */
export async function GET(req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { proposalId } = await params;
    const asPdf = new URL(req.url).searchParams.get("as") === "pdf";

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

    const comps = await db
      .select({
        componentId: proposalComponents.componentId,
        label: proposalComponents.label,
        kind: proposalComponents.kind,
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

    const [tpl] = await db
      .select()
      .from(proposalTemplates)
      .where(
        and(eq(proposalTemplates.id, p.templateId), eq(proposalTemplates.tenantId, authCtx.tenantId)),
      )
      .limit(1);
    const safeName = (tpl?.name || "proposal").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80);

    // PDF export: regenerate from the components, no template bytes needed.
    if (asPdf) {
      const pdf = renderProposalPdf(comps.map((c) => ({ label: c.label, content: c.content, kind: c.kind })));
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        },
      });
    }

    // Office: layout-faithful assembly needs the template map + original bytes.
    if (!tpl || !tpl.componentMap || !tpl.storageRef) {
      return Response.json({ error: "template_unavailable" }, { status: 409 });
    }
    const stored = await getProposalStorage().get(authCtx.tenantId, tpl.storageRef);
    if (!stored) return Response.json({ error: "original_missing" }, { status: 409 });

    const contentById: Record<string, string> = {};
    for (const c of comps) contentById[c.componentId] = c.content;

    const map = tpl.componentMap as ComponentMap;
    const fillComponents: DocxFillComponent[] = map.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      anchorHeading: c.anchor.headingText,
    }));
    const isPptx = tpl.sourceFormat === "pptx";
    const { bytes } = isPptx
      ? assembleFilledPptx(stored.bytes, fillComponents, contentById)
      : assembleFilledDocx(stored.bytes, fillComponents, contentById);

    const ext = isPptx ? "pptx" : "docx";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": isPptx ? PPTX_MIME : DOCX_MIME,
        "Content-Disposition": `attachment; filename="${safeName}-filled.${ext}"`,
      },
    });
  });
}
