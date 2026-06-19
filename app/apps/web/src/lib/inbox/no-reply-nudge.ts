/**
 * No-reply nudge engine (INBOX-T06) — the decision behind INBOX-T05's "if no
 * reply" snooze. Pure + unit-tested; consumed at read time (the snooze branch of
 * conversations) AND by an event-driven sweep. "No reply" is grounded in our own
 * send/reply tracking and reconciled with the live sequence, so we never nag when
 * the cadence will already follow up.
 */

export interface NoReplyInput {
  /** The snooze was set with the conditional "if no reply" flag. */
  snoozeIfNoReply: boolean;
  /** When the conditional snooze is due (ms epoch), or null. */
  snoozedUntil: number | null;
  /** Most recent inbound from the counterparty (ms), or null. */
  lastInboundAt: number | null;
  /** Most recent outbound from us — the message awaiting a reply (ms), or null. */
  lastOutboundAt: number | null;
  /** That outbound bounced → no real send, nothing to wait on. */
  outboundBounced: boolean;
  /** An active sequence enrollment exists. */
  enrollmentActive: boolean;
  /** When the sequence will next touch the contact (ms), or null. */
  enrollmentNextRunAt: number | null;
  now: number;
}

export interface NoReplyDecision {
  resurface: boolean;
  why: string;
}

export function shouldResurface(i: NoReplyInput): NoReplyDecision {
  if (!i.snoozeIfNoReply) return { resurface: false, why: "" };
  if (i.snoozedUntil == null || i.now < i.snoozedUntil) {
    return { resurface: false, why: "snoozed" };
  }

  // Due now — decide whether the nudge still applies.
  if (i.outboundBounced) {
    return { resurface: false, why: "message bounced — no reply expected" };
  }
  const replied =
    i.lastInboundAt != null && i.lastOutboundAt != null && i.lastInboundAt > i.lastOutboundAt;
  if (replied) {
    return { resurface: false, why: "reply received — reminder cancelled" };
  }
  // Defer to the sequence if it will follow up on its own.
  if (i.enrollmentActive && i.enrollmentNextRunAt != null && i.enrollmentNextRunAt >= i.now) {
    return { resurface: false, why: "deferring to the sequence cadence" };
  }

  const ref = i.lastOutboundAt ?? i.snoozedUntil;
  const days = Math.max(1, Math.round((i.now - ref) / 86_400_000));
  return { resurface: true, why: `no answer in ${days} day${days === 1 ? "" : "s"}` };
}
