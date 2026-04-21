import { resolveWriteKey } from "@/lib/inbound/write-keys";
import { recordPixelPing } from "@/lib/inbound/record-visitor";

/**
 * POST /api/public/pixel/track
 *
 * Public endpoint — no session auth. Instead the caller (pixel JS on
 * the customer's marketing site) MUST provide a valid write key via
 * header or body. Invalid keys drop silently (204) to avoid leaking
 * which keys are valid.
 *
 * Called from `/leadsens-pixel.js`. CORS permits any origin because
 * customer sites live on their own domains; nothing here reads
 * cookies or session storage, so CSRF is moot.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-leadsens-write-key",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const headers = { ...CORS_HEADERS, "content-type": "application/json" };

  let writeKey = req.headers.get("x-leadsens-write-key");
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    // Malformed JSON: fall back to query-string writeKey (some pixel
    // implementations use sendBeacon with a blob and can't set headers).
  }
  if (!writeKey && typeof body.writeKey === "string") writeKey = body.writeKey;

  const resolved = await resolveWriteKey(writeKey).catch(() => null);
  if (!resolved) {
    // 204 No Content rather than 401 — we never want the pixel to
    // display console errors that could leak key validity to visitors.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) {
    return Response.json({ error: "sessionId required" }, { status: 400, headers });
  }

  // Forwarded IPs: trust the first public IP in x-forwarded-for when
  // present (Vercel + Cloudflare both set this). Drop ::1 / 127.*
  // because they come from local dev and confuse RB2B-style lookup.
  const xff = req.headers.get("x-forwarded-for");
  const firstForwarded = xff ? xff.split(",")[0].trim() : null;
  const rawIp = firstForwarded || req.headers.get("x-real-ip") || null;
  const ipAddress = rawIp && !/^(::1|127\.|192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[01]\.)/.test(rawIp) ? rawIp : null;

  try {
    const result = await recordPixelPing({
      tenantId: resolved.tenantId,
      sessionId,
      pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : null,
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      ipAddress,
      userAgent: req.headers.get("user-agent"),
      country: req.headers.get("x-vercel-ip-country") ?? null,
      metadata: typeof body.metadata === "object" && body.metadata !== null
        ? (body.metadata as Record<string, unknown>)
        : {},
    });
    return Response.json({ ok: true, inserted: result.inserted }, { status: 200, headers });
  } catch (err) {
    console.warn("pixel/track: record failed", err);
    // Swallow to 204 so the pixel never spams the visitor's console.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
}
