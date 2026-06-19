/**
 * Detect a meeting time a prospect proposed in their email (INBOX-CAL02), so the
 * inbox can offer a one-click "Book this time" that pre-fills the scheduler.
 * Deterministic + pure (reuses parse-when's resolver) — no LLM, fully testable,
 * and only ever a SUGGESTION the user confirms in the scheduler before booking.
 *
 * Conservative on purpose: requires a date anchor (a weekday / "tomorrow" / …),
 * since a bare clock time is too ambiguous to auto-fill. A false positive just
 * seeds a time the user can change; it never books anything.
 */

import { parseWhen } from "./parse-when";

const DATE_RE =
  /\b(today|tomorrow|next week|this weekend|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
const TIME_RE = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/i;

export interface ProposedTime {
  start: Date;
  /** The normalized phrase fed to the resolver, e.g. "tuesday 3pm". */
  phrase: string;
}

export function extractProposedTime(
  text: string | null | undefined,
  now: Date = new Date(),
): ProposedTime | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const dateM = DATE_RE.exec(lower);
  if (!dateM) return null;
  const timeM = TIME_RE.exec(lower);
  const datePart = dateM[1];
  const timePart = timeM ? timeM[1].replace(/\s+/g, "") : "";
  const phrase = (timePart ? `${datePart} ${timePart}` : datePart).trim();
  const start = parseWhen(phrase, now);
  if (!start || start.getTime() <= now.getTime()) return null;
  return { start, phrase };
}

/** Format a Date as local "YYYY-MM-DDTHH:MM" for an <input type="datetime-local">. */
export function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
