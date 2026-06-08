import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { resolveCriteria } from "@/lib/providers/company-enrichment/criteria";
import { loadCompanyRow, enrichOneCompany } from "@/lib/enrichment/enrich-company-row";
import type { EnrichStreamEvent, EnrichStreamSummary } from "@/lib/enrichment/enrich-stream-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Generous vs the JSON route's 20 — the stream resolves rows one by one
// so a large selection stays responsive. Bounded so a runaway request
// can't tie up a function for the full 300s.
const MAX_STREAM_COMPANIES = 100;

/**
 * POST /api/enrich/stream — the live sibling of `/api/enrich`.
 *
 * Streams NDJSON events (one JSON object per line, like `/api/tam/build`)
 * so the accounts table can flip each targeted cell to a "searching…"
 * shimmer and then to its resolved value, company by company. The honest
 * per-criterion logic is shared with the JSON route via
 * `enrichOneCompany`.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  let body: { companyIds?: unknown; criteria?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyIds = Array.isArray(body.companyIds)
    ? (body.companyIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_STREAM_COMPANIES)
    : [];
  if (companyIds.length === 0) {
    return Response.json({ error: "companyIds array required" }, { status: 400 });
  }

  const requestedCriteria = resolveCriteria(
    Array.isArray(body.criteria) ? (body.criteria as string[]) : undefined,
  );

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const jobId = crypto.randomUUID();
  const tenantId = authCtx.tenantId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: EnrichStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Controller already closed (client disconnected) — stop sending.
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", ts: new Date().toISOString() });
      }, 15_000);

      const summary: EnrichStreamSummary = {
        total: companyIds.length,
        enriched: 0,
        alreadyComplete: 0,
        noData: 0,
        failed: 0,
        durationMs: 0,
      };

      try {
        send({
          type: "hello",
          jobId,
          companyIds,
          criteria: requestedCriteria.map((c) => c.key),
          startedAt: new Date(startedAt).toISOString(),
        });

        for (const id of companyIds) {
          if (closed) break;
          send({ type: "company.start", companyId: id });
          try {
            const company = await loadCompanyRow(id, tenantId);
            if (!company) {
              summary.failed++;
              send({ type: "company.done", companyId: id, status: "error", provider: null });
              continue;
            }

            const outcome = await enrichOneCompany({
              company,
              requestedCriteria,
              tenantId,
              onSearching: (keys) => {
                for (const key of keys) send({ type: "criterion.searching", companyId: id, key });
              },
            });

            for (const c of outcome.criteria) {
              send({
                type: "criterion.resolved",
                companyId: id,
                key: c.key,
                label: c.label,
                outcome: c.outcome,
                value: c.value,
              });
            }

            if (outcome.status === "enriched") summary.enriched++;
            else if (outcome.status === "already-complete") summary.alreadyComplete++;
            else summary.noData++;

            send({ type: "company.done", companyId: id, status: outcome.status, provider: outcome.provider });
          } catch (err) {
            summary.failed++;
            console.warn(`enrich-stream: company ${id} failed`, err);
            send({ type: "error", companyId: id, message: err instanceof Error ? err.message : String(err) });
            send({ type: "company.done", companyId: id, status: "error", provider: null });
          }
        }

        summary.durationMs = Date.now() - startedAt;
        send({ type: "done", summary });
      } catch (err) {
        console.error("enrich-stream: fatal", err);
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
