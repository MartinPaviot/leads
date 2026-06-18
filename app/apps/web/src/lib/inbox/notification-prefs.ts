/**
 * Inbox notification preferences (INBOX-N01 smart notifications / N02 morning +
 * end-of-day digest / N03 do-not-disturb) — owner-scoped user_preferences JSONB
 * (resource "inbox", key "notifications"; NO migration) + pure helpers the
 * delivery path consults.
 *
 * Delivery itself (push / email) rides Inngest and is deferred this loop; what
 * ships here is the preference model + the read-time decision (shouldNotify)
 * that any delivery path must gate on — per-event opt-in, a DND quiet window
 * (wraps past midnight), and the digest cadence.
 */

import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type DigestMode = "off" | "morning" | "morning_evening";

export interface NotifiableEvent {
  id: string;
  label: string;
  description: string;
  default: boolean;
}

export const NOTIFICATION_EVENTS: NotifiableEvent[] = [
  { id: "important_inbound", label: "Important inbound", description: "A high-priority email lands.", default: true },
  { id: "sla_overdue", label: "Reply overdue", description: "A thread passes its response SLA.", default: true },
  { id: "reply_received", label: "Reply received", description: "A prospect replies to your thread.", default: true },
  { id: "meeting_booked", label: "Meeting booked", description: "A prospect books time with you.", default: true },
  { id: "mention", label: "Mentions", description: "A teammate @-mentions you on a thread.", default: true },
  { id: "bulk_summary", label: "Newsletters & bulk", description: "Low-priority bulk mail (off by default).", default: false },
];

export interface NotificationPrefs {
  events: Record<string, boolean>;
  digest: DigestMode;
  /** DND quiet window as "HH:MM" 24h local; null = no quiet hours. */
  dndStart: string | null;
  dndEnd: string | null;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  events: {},
  digest: "morning",
  dndStart: null,
  dndEnd: null,
};

const RESOURCE = "inbox";
const KEY = "notifications";
const DIGESTS: DigestMode[] = ["off", "morning", "morning_evening"];

function parseHM(s: string | null | undefined): number | null {
  if (typeof s !== "string" || !s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** True if `minutes` (0..1439) falls within the DND window, which may wrap past midnight. */
export function isInDnd(minutes: number, dndStart: string | null, dndEnd: string | null): boolean {
  const start = parseHM(dndStart);
  const end = parseHM(dndEnd);
  if (start == null || end == null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function isEventEnabled(prefs: NotificationPrefs, eventId: string): boolean {
  const ev = NOTIFICATION_EVENTS.find((e) => e.id === eventId);
  if (!ev) return false;
  const v = prefs.events?.[eventId];
  return typeof v === "boolean" ? v : ev.default;
}

/** The read-time gate any delivery path consults. nowMinutes = local minutes-of-day. */
export function shouldNotify(prefs: NotificationPrefs, eventId: string, nowMinutes: number): boolean {
  if (!isEventEnabled(prefs, eventId)) return false;
  if (isInDnd(nowMinutes, prefs.dndStart, prefs.dndEnd)) return false;
  return true;
}

export function clampPrefs(prefs: Partial<NotificationPrefs>): NotificationPrefs {
  const events: Record<string, boolean> = {};
  for (const e of NOTIFICATION_EVENTS) {
    const v = prefs.events?.[e.id];
    if (typeof v === "boolean") events[e.id] = v;
  }
  const digest = DIGESTS.includes(prefs.digest as DigestMode) ? (prefs.digest as DigestMode) : "morning";
  const start = parseHM(prefs.dndStart) != null ? (prefs.dndStart as string) : null;
  const end = parseHM(prefs.dndEnd) != null ? (prefs.dndEnd as string) : null;
  const bothValid = start != null && end != null;
  return { events, digest, dndStart: bothValid ? start : null, dndEnd: bothValid ? end : null };
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.resource, RESOURCE),
        eq(userPreferences.key, KEY),
      ),
    )
    .limit(1);
  const v = row?.value as Partial<NotificationPrefs> | undefined;
  if (!v || typeof v !== "object") return DEFAULT_PREFS;
  return clampPrefs(v);
}

export async function saveNotificationPrefs(
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const clamped = clampPrefs(prefs);
  await db
    .insert(userPreferences)
    .values({ userId, resource: RESOURCE, key: KEY, value: clamped })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.resource, userPreferences.key],
      set: { value: clamped, updatedAt: new Date() },
    });
  return clamped;
}
