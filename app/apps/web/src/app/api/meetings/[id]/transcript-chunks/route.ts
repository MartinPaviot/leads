/**
 * GET /api/meetings/[id]/transcript-chunks
 *
 * Returns the indexed transcript chunks for a meeting in chronological
 * order — used by the meeting detail page to render the
 * `<TranscriptChunks>` viewer with [mm:ss] anchors that the citation
 * chips can deep-link into via `?t=`.
 *
 * MONACO-PARITY-05 — without this surface the citation chips have
 * nowhere to scroll to (the meeting page never showed the transcript
 * before — only the structured notes).
 */

import postgres from "postgres";
import { getAuthContext } from "@/lib/auth/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return Response.json({ chunks: [] });
  }

  const sql = postgres(process.env.DATABASE_URL);
  try {
    const rows = await sql`
      SELECT id, speaker, start_sec, end_sec, text, source
      FROM transcript_chunks
      WHERE tenant_id = ${authCtx.tenantId} AND meeting_id = ${id}
      ORDER BY start_sec ASC
    `;
    return Response.json({
      chunks: rows.map((r) => ({
        id: String(r.id),
        speaker: r.speaker ? String(r.speaker) : null,
        startSec: Number(r.start_sec),
        endSec: Number(r.end_sec),
        text: String(r.text),
        source: r.source ? String(r.source) : "unknown",
      })),
    });
  } catch (err) {
    return Response.json(
      {
        chunks: [],
        warning:
          err instanceof Error
            ? err.message
            : "Transcript chunks unavailable (table may not be migrated yet).",
      },
      { status: 200 },
    );
  } finally {
    await sql.end();
  }
}
