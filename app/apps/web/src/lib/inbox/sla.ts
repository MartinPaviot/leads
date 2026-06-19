/**
 * Response-SLA breach detection (INBOX-N04 core). Pure + unit-tested.
 *
 * A conversation breaches its SLA when it is awaiting OUR reply (last message is
 * inbound, nothing sent since) and more than `thresholdHours` have passed. Used
 * for the no-reply/SLA alert. The alert delivery + per-user thresholds are wiring
 * (residual). Grounded in real reply state, never a guess.
 */

export interface SlaInput {
  /** Last message is inbound and we haven't replied since. */
  awaitingOurReply: boolean;
  /** When that inbound arrived (ms), or null. */
  lastInboundAt: number | null;
  now: number;
  thresholdHours: number;
}

export interface SlaResult {
  breached: boolean;
  hoursOver: number;
}

export function checkSla(i: SlaInput): SlaResult {
  if (!i.awaitingOurReply || i.lastInboundAt == null) {
    return { breached: false, hoursOver: 0 };
  }
  const hours = (i.now - i.lastInboundAt) / 3_600_000;
  const over = hours - i.thresholdHours;
  return { breached: over > 0, hoursOver: over > 0 ? Math.round(over * 10) / 10 : 0 };
}
