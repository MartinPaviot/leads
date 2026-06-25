/**
 * Pick the mailbox the Resend / owner-SMTP round-robin (email-send-worker) should
 * send from, EXCLUDING provider `instantly`.
 *
 * Why the exclusion: Instantly mailboxes have no Resend/owner-SMTP send path — sends
 * for them must go through the Instantly API (`sendViaInstantly`), which is not wired
 * into the worker. Routing an Instantly box through here sends from the Instantly
 * address via Resend → the domain isn't authenticated in Resend → SPF/DKIM fail →
 * spam/hard-bounce → trips the spec-27 deliverability guard. Silent self-harm.
 * `mailbox-selector.ts` already excludes `instantly`; the Resend cron's own resolver
 * did not — this closes that gap.
 *
 * Returns null when the tenant has NO Resend/SMTP-capable mailbox (e.g. only Instantly
 * boxes): the caller must then NOT route the mail through Resend — it stays queued
 * (correctly un-sent) rather than being mis-delivered.
 */
export interface RoundRobinMailbox {
  provider?: string | null;
  sentToday: number;
  effectiveLimit: number;
}

export function pickResendEligibleMailbox<T extends RoundRobinMailbox>(mailboxes: T[]): T | null {
  const sendable = mailboxes.filter((m) => (m.provider ?? "").toLowerCase() !== "instantly");
  if (sendable.length === 0) return null;
  // Lowest sentToday/limit ratio = most capacity left; fall back to the first
  // sendable box if all are at/over cap (matches the prior round-robin behaviour).
  const eligible = sendable
    .filter((m) => m.sentToday < m.effectiveLimit)
    .sort((a, b) => a.sentToday / a.effectiveLimit - b.sentToday / b.effectiveLimit);
  return eligible[0] ?? sendable[0];
}
