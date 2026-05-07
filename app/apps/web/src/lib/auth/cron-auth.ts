import { timingSafeEqual } from "node:crypto";

/**
 * Verify a cron request's `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Returns `null` on success (caller continues) or a 401 `Response` on
 * failure (caller returns it). Fails closed in every environment,
 * including when `CRON_SECRET` is unset — previous versions short-
 * circuited to "allowed" when both sides were `undefined`, leaving the
 * endpoints open in any deploy where the env var hadn't been wired up.
 *
 * Uses `timingSafeEqual` so the number of matching prefix bytes can't
 * be recovered via a timing side-channel.
 */
export function verifyCronRequest(req: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("cron-auth: CRON_SECRET is not configured");
    return Response.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization");
  const presented = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;

  if (!presented) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
