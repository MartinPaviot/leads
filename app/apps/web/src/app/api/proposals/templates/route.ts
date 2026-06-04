import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { proposalTemplates } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { getProposalStorage } from "@/lib/proposals/storage";
import { inspectArchive } from "@/lib/proposals/ooxml";
import { extractDocx } from "@/lib/proposals/ingest-docx";
import { extractPptx } from "@/lib/proposals/pptx";
import {
  detectComponents,
  DetectionUnavailable,
} from "@/lib/proposals/detect-components";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * POST /api/proposals/templates
 * Upload a .docx template, store it, extract text+outline, and run LLM
 * component detection. On detection failure we keep the template at
 * status='uploaded' and return a degraded response (never a fabricated map).
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "invalid_form" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing_file" }, { status: 400 });
    }
    const name = ((form.get("name") as string | null)?.trim() || file.name).slice(0, 200);

    const lower = file.name.toLowerCase();
    const sourceFormat = lower.endsWith(".pptx") ? "pptx" : lower.endsWith(".docx") ? "docx" : null;
    if (!sourceFormat) {
      return Response.json({ error: "unsupported_format" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "file_too_large" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    // PROPOSAL-010: reject zip-bombs before storing or inflating.
    const inspection = inspectArchive(bytes);
    if (!inspection.ok) {
      return Response.json({ error: "archive_rejected", reason: inspection.reason }, { status: 422 });
    }

    const storage = getProposalStorage();
    let storageRef: string;
    try {
      storageRef = await storage.put(
        authCtx.tenantId,
        bytes,
        file.type || (sourceFormat === "pptx" ? PPTX_MIME : DOCX_MIME),
      );
    } catch (e) {
      console.error("proposal upload: storage failed", e);
      return Response.json({ error: "storage_failed" }, { status: 500 });
    }

    const id = crypto.randomUUID();
    const { text, outline, error: extractErr } =
      sourceFormat === "pptx" ? extractPptx(bytes) : extractDocx(bytes);

    if (extractErr || !text.trim()) {
      await db.insert(proposalTemplates).values({
        id,
        tenantId: authCtx.tenantId,
        createdByUserId: authCtx.userId,
        name,
        sourceFormat,
        originalFileName: file.name,
        storageRef,
        status: "failed",
        extractionError: extractErr ?? "empty_document",
      });
      return Response.json({ id, status: "failed", error: "unreadable_docx" }, { status: 422 });
    }

    await db.insert(proposalTemplates).values({
      id,
      tenantId: authCtx.tenantId,
      createdByUserId: authCtx.userId,
      name,
      sourceFormat,
      originalFileName: file.name,
      storageRef,
      status: "uploaded",
      extractedText: text,
      extractedOutline: outline,
    });

    try {
      const { componentMap, meta } = await detectComponents(text, outline, {
        tenantId: authCtx.tenantId,
      });
      await db
        .update(proposalTemplates)
        .set({ componentMap, detectionMeta: meta, status: "detected", updatedAt: new Date() })
        .where(
          and(
            eq(proposalTemplates.id, id),
            eq(proposalTemplates.tenantId, authCtx.tenantId),
          ),
        );
      return Response.json({ id, status: "detected", componentMap }, { status: 201 });
    } catch (e) {
      const reason =
        e instanceof DetectionUnavailable ? e.reason : "below_quality_threshold";
      const userSuggestion =
        reason === "missing_required_data"
          ? "No language model is configured, so components could not be detected automatically. Map the template's components manually, or retry once a model is available."
          : "Automatic detection did not return a usable structure. Retry, or map the components manually.";
      if (!(e instanceof DetectionUnavailable)) {
        console.error("proposal detect failed", e);
      }
      return Response.json(
        { id, status: "uploaded", degraded: true, degradationReason: reason, userSuggestion },
        { status: 201 },
      );
    }
  });
}

/** GET /api/proposals/templates — list the tenant's templates, newest first. */
export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const templates = await db
      .select({
        id: proposalTemplates.id,
        name: proposalTemplates.name,
        sourceFormat: proposalTemplates.sourceFormat,
        status: proposalTemplates.status,
        updatedAt: proposalTemplates.updatedAt,
      })
      .from(proposalTemplates)
      .where(
        and(
          eq(proposalTemplates.tenantId, authCtx.tenantId),
          isNull(proposalTemplates.deletedAt),
        ),
      )
      .orderBy(desc(proposalTemplates.updatedAt));
    return Response.json({ templates });
  });
}
