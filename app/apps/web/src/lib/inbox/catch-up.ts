/**
 * Catch-me-up digest selection (INBOX-S03 core). Pure + unit-tested.
 *
 * The deterministic "what changed since you were last here" pass: pick the
 * conversations with a new inbound after `lastSeenAt`, newest first, with a
 * count. The LLM that turns this selection into a readable digest narrative is
 * residual; this guarantees the digest is grounded in real new activity, never
 * fabricated. Runs over the already-scoped conversation set (per-user/tenant).
 */

export interface CatchUpInput {
  key: string;
  subject: string;
  lastInboundAt: string | null;
  inboundCount: number;
}

export interface CatchUpResult {
  sinceCount: number;
  items: CatchUpInput[];
}

export function selectCatchUp(items: CatchUpInput[], lastSeenAt: string | null): CatchUpResult {
  const since = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const changed = items.filter((it) => {
    if (!it.lastInboundAt) return false;
    const t = new Date(it.lastInboundAt).getTime();
    return Number.isFinite(t) && t > since;
  });
  changed.sort((a, b) => (b.lastInboundAt ?? "").localeCompare(a.lastInboundAt ?? ""));
  return { sinceCount: changed.length, items: changed };
}
