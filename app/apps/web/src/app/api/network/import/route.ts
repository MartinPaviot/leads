/**
 * POST /api/network/import — import the founder's LinkedIn `Connections.csv`,
 * dedup + tag as `network`, and score against the ICP.
 *
 * Body: `multipart/form-data` with a `file`, OR JSON `{ csv: string }`.
 * Thin glue: auth + rate-limit + size cap, then delegate to the service.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { importLinkedInConnections } from "@/lib/network/import-service";

// Scoring walks the imported ids in SQL batches — same budget as the other
// long synchronous routes (score-contacts, enrich/stream).
export const maxDuration = 300;

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — a LinkedIn export is a few thousand rows

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("bulk", authCtx.userId);
  if (rl) return rl;

  const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_SIZE) {
    return Response.json({ error: "File too large. Maximum size is 5MB." }, { status: 413 });
  }

  try {
    let csv: string;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const data = body.csv ?? body.csvData ?? body.csv_data;
      if (typeof data !== "string" || data.length === 0) {
        return Response.json({ error: "Missing csv in JSON body" }, { status: 400 });
      }
      csv = data;
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }
      if (file.size > MAX_SIZE) {
        return Response.json({ error: "File too large. Maximum size is 5MB." }, { status: 413 });
      }
      csv = await file.text();
    }

    if (csv.length > MAX_SIZE) {
      return Response.json({ error: "CSV too large. Maximum size is 5MB." }, { status: 413 });
    }

    const result = await importLinkedInConnections({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      csv,
    });

    if (!result.ok) {
      return Response.json({ error: result.error ?? "Import failed" }, { status: 400 });
    }
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Network import failed:", error);
    return Response.json({ error: "Import failed" }, { status: 500 });
  }
}
