/**
 * Rate limiter wrappers. Delegates to `rate-limit-store` which picks
 * the in-memory driver locally and the Upstash Redis driver when
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set — so
 * counts are shared across Vercel serverless instances instead of
 * resetting on every cold start.
 *
 * These helpers are async now. The 20-ish call sites already `await`
 * them (they wrap async route handlers), so this is a drop-in.
 */
import { hit, type RateLimitResult } from "./rate-limit-store";

export async function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
  return hit(key, limit, windowMs);
}

export function rateLimitResponse(resetAt: number): Response {
  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString(),
        "X-RateLimit-Reset": new Date(resetAt).toISOString(),
      },
    }
  );
}

// ── Preset tiers for common use cases ──

/** Rate limit for LLM-calling routes: 20 req/min per user */
export function rateLimitLLM(userId: string): Promise<RateLimitResult> {
  return rateLimit(`llm:${userId}`, 20, 60 * 1000);
}

/** Rate limit for Apollo/enrichment routes: 30 req/min per user */
export function rateLimitEnrich(userId: string): Promise<RateLimitResult> {
  return rateLimit(`enrich:${userId}`, 30, 60 * 1000);
}

/** Rate limit for bulk/import routes: 5 req/min per user */
export function rateLimitBulk(userId: string): Promise<RateLimitResult> {
  return rateLimit(`bulk:${userId}`, 5, 60 * 1000);
}

/** Rate limit for auth/public routes: 10 req/min per IP */
export function rateLimitAuth(ip: string): Promise<RateLimitResult> {
  return rateLimit(`auth:${ip}`, 10, 60 * 1000);
}

/**
 * Rate limit a password-reset request per email: 3 per hour. The limit is
 * intentionally low to make bulk-email harvesting costly for an attacker
 * while still allowing a genuine user a handful of retries in the hour.
 */
export function rateLimitPasswordResetEmail(normalizedEmail: string): Promise<RateLimitResult> {
  return rateLimit(`pwd-reset:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
}

/**
 * Rate limit a password-reset request per IP: 10 per hour. A loose cap
 * so a shared NAT egress for a whole org doesn't lock everyone out, but
 * tight enough to blunt credential-stuffing probes.
 */
export function rateLimitPasswordResetIp(ip: string): Promise<RateLimitResult> {
  return rateLimit(`pwd-reset:ip:${ip}`, 10, 60 * 60 * 1000);
}

/**
 * Verify-email resend cap per email: 3/hour. Same shape as the
 * password-reset limiter — same threat model (mailbomb / enumeration
 * via repeated send requests).
 */
export function rateLimitVerifyEmail(normalizedEmail: string): Promise<RateLimitResult> {
  return rateLimit(`verify-email:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
}

/**
 * Verify-email resend cap per IP: 10/hour.
 */
export function rateLimitVerifyEmailIp(ip: string): Promise<RateLimitResult> {
  return rateLimit(`verify-email:ip:${ip}`, 10, 60 * 60 * 1000);
}

/**
 * P4 (inbox deal-closer roadmap, volume hardening) — tenant-scoped send rate
 * limit, checked inside lib/guardrails/sending-gate.ts#evaluateSend so it
 * automatically covers every send chokepoint (campaign cron, single-send,
 * SMTP cron, interactive composer, meeting follow-up).
 *
 * This is a SAFETY NET against a runaway loop/bug (a retry storm, a misfiring
 * cron re-sending the same batch), NOT a product volume policy — that's a
 * separate founder decision (max replies/hour per mailbox, post-warmup ramp)
 * still pending. The numbers here are deliberately generous specifically so
 * they never throttle legitimate human-paced or autopilot-paced sending —
 * only an obviously-broken loop blows past either window. Tune down once the
 * founder sets the real per-mailbox/tenant policy.
 */
export function rateLimitTenantSendBurst(tenantId: string): Promise<RateLimitResult> {
  return rateLimit(`send:tenant:${tenantId}:burst`, 60, 60 * 1000);
}
export function rateLimitTenantSendHourly(tenantId: string): Promise<RateLimitResult> {
  return rateLimit(`send:tenant:${tenantId}:hourly`, 600, 60 * 60 * 1000);
}

/**
 * Apply rate limiting and return 429 if exceeded.
 * Returns null if allowed, or a Response to return immediately.
 */
export async function checkRateLimit(
  tier: "llm" | "enrich" | "bulk",
  userId: string
): Promise<Response | null> {
  const fn = tier === "llm" ? rateLimitLLM : tier === "enrich" ? rateLimitEnrich : rateLimitBulk;
  const rl = await fn(userId);
  if (!rl.success) return rateLimitResponse(rl.resetAt);
  return null;
}
