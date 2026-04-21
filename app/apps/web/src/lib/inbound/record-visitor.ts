import { db } from "@/db";
import { inboundVisitors } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Normalised ping shape the public pixel endpoint hands to us.
 * Every field is caller-controlled and therefore untrusted — we
 * truncate/cap fields at record time so a rogue client can't blow
 * the DB with 10MB referrer strings.
 */
export interface PixelPing {
  tenantId: string;
  sessionId: string;
  pageUrl?: string | null;
  referrer?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown>;
}

const MAX_URL_LEN = 2048;
const MAX_UA_LEN = 512;

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Upsert-by-session: repeated pings within the same session bump
 * `event_count` + `last_seen_at` instead of creating new rows. This
 * keeps the table size sane (one row per browsing session, not one
 * per pageview) while still giving us multi-page traversal via the
 * incremented counter.
 *
 * Identification fields are left null; a downstream provider adapter
 * (RB2B / Snitcher / Clearbit Reveal) fills them in when live.
 */
export async function recordPixelPing(ping: PixelPing): Promise<{ inserted: boolean; id: string }> {
  const tenantId = ping.tenantId;
  const sessionId = ping.sessionId.trim();
  if (!sessionId) throw new Error("recordPixelPing: sessionId required");

  const [existing] = await db
    .select({ id: inboundVisitors.id })
    .from(inboundVisitors)
    .where(and(eq(inboundVisitors.tenantId, tenantId), eq(inboundVisitors.sessionId, sessionId)))
    .limit(1);

  if (existing) {
    await db
      .update(inboundVisitors)
      .set({
        lastSeenAt: new Date(),
        eventCount: sql`${inboundVisitors.eventCount} + 1`,
        // Update the page URL so "last page seen" reflects reality;
        // we preserve the original referrer because that's first-
        // session-only.
        ...(ping.pageUrl ? { pageUrl: clip(ping.pageUrl, MAX_URL_LEN) } : {}),
      })
      .where(eq(inboundVisitors.id, existing.id));
    return { inserted: false, id: existing.id };
  }

  const [created] = await db
    .insert(inboundVisitors)
    .values({
      tenantId,
      sessionId,
      pageUrl: clip(ping.pageUrl, MAX_URL_LEN),
      referrer: clip(ping.referrer, MAX_URL_LEN),
      ipAddress: clip(ping.ipAddress, 64),
      userAgent: clip(ping.userAgent, MAX_UA_LEN),
      country: clip(ping.country, 8),
      metadata: ping.metadata ?? {},
    })
    .returning({ id: inboundVisitors.id });

  return { inserted: true, id: created.id };
}
