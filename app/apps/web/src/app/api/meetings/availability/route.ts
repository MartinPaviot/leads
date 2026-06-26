import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { getConnectedFreeSlots } from "@/lib/integrations/meeting-availability";

/**
 * GET /api/meetings/availability?duration=45&days=5
 *
 * Free meeting slots from the user's connected calendar — CalDAV (Infomaniak…)
 * first, then Google. Powers the scheduler's one-click slot suggestions so a
 * meeting booked from the inbox lands on a time the user is actually free.
 * Returns { source, slots: [{ start, end }] } with ISO timestamps; `source:
 * "none"` (no calendar connected) just means the card keeps its manual picker.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  const url = new URL(req.url);
  const duration = Math.min(240, Math.max(15, Number(url.searchParams.get("duration")) || 30));
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days")) || 5));
  // Cap per day so the week grid shows openings on every day (not all on day 1).
  const perDay = Math.min(12, Math.max(1, Number(url.searchParams.get("perDay")) || 6));
  // The browser's IANA timezone, so the 09:00–17:00 window is the user's local
  // time (the server runs UTC). Validated — a bad value falls back to server-local.
  let timeZone = url.searchParams.get("tz") || undefined;
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      timeZone = undefined;
    }
  }

  try {
    const { source, slots } = await getConnectedFreeSlots(authCtx.userId, authCtx.tenantId, {
      slotDurationMinutes: duration,
      daysAhead: days,
      max: days * perDay,
      maxPerDay: perDay,
      timeZone,
    });
    return Response.json({
      source,
      slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    });
  } catch {
    // Availability is a nice-to-have over the manual picker — never 500 the card.
    return Response.json({ source: "none", slots: [] });
  }
}
