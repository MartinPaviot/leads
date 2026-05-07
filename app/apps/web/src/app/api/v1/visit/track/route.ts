/**
 * POST /api/v1/visit/track — pixel ingestion endpoint.
 * MONACO-PARITY-04 — receives visit beacons from the first-party
 * pixel script, persists a row in `visits`, and (optionally) emits
 * an Inngest event so async identification can run without blocking
 * the response.
 *
 * Privacy: we hash the IP with SHA-256 and store only the hash —
 * never the raw IP. We don't store cookie values beyond what the
 * pixel itself sends (`visitorId`, a stable UUID per device, no
 * personal info). Geolocation lookups happen via the visitor-id
 * provider in the async job and the resolved company domain only —
 * we never attempt person-level identification.
 *
 * Always returns 200 (or 400 on malformed JSON). We never fail-loud
 * on this surface because errors here would block the page render
 * for the visitor — wrong tradeoff. Bad payloads simply skip insert.
 */

import { db } from "@/db";
import { visits } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { logger } from "@/lib/observability/logger";
import { createHash } from "crypto";
import { z } from "zod";
import { hashSubnet } from "@/lib/visitor-id/dedup";

const trackSchema = z.object({
  tenantId: z.string().min(1).max(100),
  visitorId: z.string().min(1).max(100),
  url: z.string().url().max(2000),
  referrer: z.string().nullable().optional(),
  utm: z.record(z.string()).optional().default({}),
});

function ipFromReq(req: Request): string {
  // Trust standard reverse-proxy headers in this order. In dev all
  // are absent and we record "0.0.0.0" — never the loopback because
  // hashed loopback would still leak the dev environment.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "0.0.0.0";
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(req: Request) {
  let parsed: z.infer<typeof trackSchema>;
  try {
    const body = await req.json();
    const result = trackSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ ok: false, error: "validation" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }

  const rawIp = ipFromReq(req);
  const ipHash = sha256(rawIp);
  // P0-2 follow-up — populate /24 subnet hash for IPv4 visits so the
  // dedup window can match same-office traffic that arrives via
  // different NAT IPs. Null for IPv6 / malformed (helper rejects
  // both cleanly).
  const subnetHash = hashSubnet(rawIp);
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 500);

  let visitId: string | null = null;
  try {
    const [row] = await db
      .insert(visits)
      .values({
        tenantId: parsed.tenantId,
        visitorId: parsed.visitorId,
        ipHash,
        subnetHash,
        url: parsed.url,
        referrer: parsed.referrer ?? null,
        utm: parsed.utm,
        userAgent: userAgent || null,
      })
      .returning({ id: visits.id });
    visitId = row?.id ?? null;
  } catch (err) {
    logger.warn("visit/track: insert failed", {
      tenantId: parsed.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: true });
  }

  // Async identification — fire-and-forget. We pass the raw IP only
  // through the in-flight Inngest event so the identify job can call
  // the provider; it is NOT persisted to the visits row (we keep
  // only the SHA-256 hash there).
  if (visitId) {
    inngest
      .send({
        name: "visit/created",
        data: { visitId, tenantId: parsed.tenantId, ip: rawIp },
      })
      .catch((err: unknown) => {
        logger.warn("visit/track: inngest send failed", {
          visitId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return Response.json({ ok: true, visitId });
}
