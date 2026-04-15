/** Simple in-memory rate limiter for API endpoints */

const store = new Map<string, { count: number; resetAt: number }>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60 * 1000
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
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
export function rateLimitLLM(userId: string): { success: boolean; remaining: number; resetAt: number } {
  return rateLimit(`llm:${userId}`, 20, 60 * 1000);
}

/** Rate limit for Apollo/enrichment routes: 30 req/min per user */
export function rateLimitEnrich(userId: string): { success: boolean; remaining: number; resetAt: number } {
  return rateLimit(`enrich:${userId}`, 30, 60 * 1000);
}

/** Rate limit for bulk/import routes: 5 req/min per user */
export function rateLimitBulk(userId: string): { success: boolean; remaining: number; resetAt: number } {
  return rateLimit(`bulk:${userId}`, 5, 60 * 1000);
}

/** Rate limit for auth/public routes: 10 req/min per IP */
export function rateLimitAuth(ip: string): { success: boolean; remaining: number; resetAt: number } {
  return rateLimit(`auth:${ip}`, 10, 60 * 1000);
}

/**
 * Rate limit a password-reset request per email: 3 per hour. The limit is
 * intentionally low to make bulk-email harvesting costly for an attacker
 * while still allowing a genuine user a handful of retries in the hour.
 */
export function rateLimitPasswordResetEmail(normalizedEmail: string): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  return rateLimit(`pwd-reset:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
}

/**
 * Rate limit a password-reset request per IP: 10 per hour. A loose cap
 * so a shared NAT egress for a whole org doesn't lock everyone out, but
 * tight enough to blunt credential-stuffing probes.
 */
export function rateLimitPasswordResetIp(ip: string): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  return rateLimit(`pwd-reset:ip:${ip}`, 10, 60 * 60 * 1000);
}

/**
 * Verify-email resend cap per email: 3/hour. Same shape as the
 * password-reset limiter — same threat model (mailbomb / enumeration
 * via repeated send requests).
 */
export function rateLimitVerifyEmail(normalizedEmail: string): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  return rateLimit(`verify-email:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
}

/**
 * Verify-email resend cap per IP: 10/hour.
 */
export function rateLimitVerifyEmailIp(ip: string): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  return rateLimit(`verify-email:ip:${ip}`, 10, 60 * 60 * 1000);
}

/**
 * Apply rate limiting and return 429 if exceeded.
 * Returns null if allowed, or a Response to return immediately.
 */
export function checkRateLimit(
  tier: "llm" | "enrich" | "bulk",
  userId: string
): Response | null {
  const fn = tier === "llm" ? rateLimitLLM : tier === "enrich" ? rateLimitEnrich : rateLimitBulk;
  const rl = fn(userId);
  if (!rl.success) return rateLimitResponse(rl.resetAt);
  return null;
}
