import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { sequences, sequenceSteps } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Q17 — GET /api/sequences/[id]/export
 *
 * Return the sequence + step templates as a portable JSON blob the
 * user can save and re-import elsewhere (other workspace, version
 * control, sharing).
 *
 * What we strip from the export:
 *   - all `*Id` fields (sequence id, step ids, tenant id) — they're
 *     opaque and would cause primary-key collisions on re-import
 *   - timestamps (createdAt / updatedAt) — meaningless on import
 *   - enrollments + sent stats — runtime data, not template data
 *
 * What we keep:
 *   - sequence name, description, status hint
 *   - per-step: stepNumber, dayOffset, type, subject, bodyHtml, bodyText
 *
 * Response is `application/json` with a `Content-Disposition: attachment`
 * header so a browser GET triggers a download instead of rendering JSON
 * inline.
 */

const EXPORT_VERSION = 1;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const [sequence] = await db
      .select()
      .from(sequences)
      .where(and(eq(sequences.id, id), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!sequence) {
      return Response.json({ error: "Sequence not found" }, { status: 404 });
    }

    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, id))
      .orderBy(sequenceSteps.stepNumber);

    const payload = {
      $schema: "https://elevay.com/schemas/sequence-export.json",
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sequence: {
        name: sequence.name,
        description: sequence.description,
      },
      steps: steps.map(stripStepForExport),
    };

    const safeName = sanitiseFilename(sequence.name);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="elevay-sequence-${safeName}.json"`,
      },
    });
  } catch (error) {
    console.error("Failed to export sequence:", error);
    return Response.json({ error: "Failed to export sequence" }, { status: 500 });
  }
}

type SequenceStepRow = typeof sequenceSteps.$inferSelect;

/**
 * Project a DB row down to the template-level fields a re-importer
 * would need. Anything not listed here is intentionally dropped.
 *
 * Field names match the live schema (`subjectTemplate`, `bodyTemplate`,
 * `delayDays`) so a re-import can map 1:1 without translation.
 */
function stripStepForExport(s: SequenceStepRow) {
  const candidate: Record<string, unknown> = {
    stepNumber: s.stepNumber,
    delayDays: s.delayDays,
    subjectTemplate: s.subjectTemplate,
    bodyTemplate: s.bodyTemplate,
  };
  for (const k of Object.keys(candidate)) {
    if (candidate[k] === null || candidate[k] === undefined) delete candidate[k];
  }
  return candidate;
}

/**
 * Make the sequence name safe to embed in a `Content-Disposition` filename:
 * lower-case, ASCII-only, dash-separated, capped at 60 chars. Falls back
 * to "untitled" if the result is empty.
 */
function sanitiseFilename(name: string | null): string {
  const cleaned = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "untitled";
}
