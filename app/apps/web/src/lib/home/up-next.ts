/**
 * Up Next — pure aggregation for the founder's morning briefing.
 *
 * No DB, no fetch, no ambient `Date.now()` (time is injected). Every input is a
 * plain shape the API maps from a live source, so each lane is independent: if
 * one source is missing the others still produce a queue, and the whole thing is
 * unit-testable. See _specs/up-next-redesign/design.md.
 *
 * The queue is built ONLY from live sources (inbox replies, scheduled agent
 * actions, live at-risk deals, today's meetings, due tasks) — never from the
 * stale `agentWorkItems` book — which is what removes the old page's
 * self-contradiction (10 "tracked" deals vs 0 active deals).
 */

// ── Lane inputs (mapped by the API from live sources) ───────────────

/** An inbound reply needing a human answer (inbox "attention" lane). */
export interface ReplyInput {
  conversationKey: string;
  contactId: string | null;
  subject: string;
  fromAddress: string;
  /** Grounded label-driven reason, e.g. "Asked about pricing". */
  reason: string;
  /** 1 (wants to talk) … 4 (neutral) — from the inbox priority bucket. */
  priority: number;
  lastInboundAt: string | null;
}

/** An agent action waiting for the founder's approval (status 'scheduled'). */
export interface ApprovalInput {
  id: string;
  actionType: string;
  reasoning: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  confidence: number | null;
  amount: number | null;
  createdAt: string | null;
}

/** A live deal that has gone quiet. */
export interface DealRiskInput {
  id: string;
  name: string;
  stage: string | null;
  value: number | null;
  daysSilent: number;
}

/** A meeting on today's calendar. */
export interface MeetingInput {
  id: string;
  title: string;
  time: string;
  overdue?: boolean;
}

/** A task due today or overdue. */
export interface TaskInput {
  id: string;
  title: string;
  overdue: boolean;
  account: string | null;
  entityType: string | null;
  entityId: string | null;
}

export interface NeedsYouInput {
  replies?: ReplyInput[];
  approvals?: ApprovalInput[];
  dealsAtRisk?: DealRiskInput[];
  meetings?: MeetingInput[];
  tasks?: TaskInput[];
}

// ── Output ──────────────────────────────────────────────────────────

export type NeedsYouKind = "approval" | "reply" | "deal_risk" | "meeting" | "task";

/** Semantic accent — colour means one thing, never decoration. */
export type Tone = "approval" | "reply" | "risk" | "meeting" | "task";

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  tone: Tone;
  /** Primary line — who / what. */
  title: string;
  /** Secondary context (company / title / stage). */
  subtitle: string | null;
  /** Grounded "why now". */
  why: string;
  /** Stakes — $ amount, stage, time. */
  stakes: string | null;
  /** Lower = more urgent. */
  score: number;
  // routing / action payload (only the relevant ones are non-null per kind)
  entityType: string | null;
  entityId: string | null;
  contactId: string | null;
  conversationKey: string | null;
  toAddress: string | null;
  actionId: string | null;
  confidence: number | null;
  href: string | null;
}

export interface LedgerGroup {
  trigger: string;
  verb: string;
  count: number;
  samples: string[];
}

export interface EngineLine {
  text: string;
  cta: { label: string; href: string } | null;
}

export interface EngineMetrics {
  totalAccounts: number;
  activeDeals: number;
  totalContacts: number;
  emailsSent7d: number;
  pipelineValue: number;
  winRate: number | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

const LANE_BASE: Record<NeedsYouKind, number> = {
  reply: 0,
  approval: 4,
  meeting: 6,
  deal_risk: 20,
  task: 30,
};

/** Founder-facing feeds must never show seed/e2e rows. Only test markers — no
 *  business-domain word lists (those belong to LLM classification, not here). */
export function isTestLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const s = label.toLowerCase();
  return (
    /\be2e\b/.test(s) ||
    s.includes("__test") ||
    s.includes("test deal") ||
    s.includes("test workspace") ||
    s.startsWith("test ") ||
    s.endsWith(" test")
  );
}

function money(v: number | null | undefined): string | null {
  if (!v || v <= 0) return null;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

/** Boost (a positive number to SUBTRACT from score) from a $ amount. Capped. */
function valueBoost(amount: number | null | undefined): number {
  if (!amount || amount <= 0) return 0;
  return Math.min(6, amount / 10000);
}

// ── Queue ───────────────────────────────────────────────────────────

export function buildNeedsYou(input: NeedsYouInput, now: Date = new Date()): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];

  for (const r of input.replies ?? []) {
    if (isTestLabel(r.subject) || isTestLabel(r.fromAddress)) continue;
    const bucket = Number.isFinite(r.priority) ? Math.max(1, Math.min(4, r.priority)) : 4;
    items.push({
      id: `reply:${r.conversationKey}`,
      kind: "reply",
      tone: "reply",
      title: r.fromAddress || r.subject || "New reply",
      subtitle: r.subject && r.subject !== r.fromAddress ? r.subject : null,
      why: r.reason || "Replied",
      stakes: null,
      score: LANE_BASE.reply + (bucket - 1) * 3,
      entityType: r.contactId ? "contact" : null,
      entityId: r.contactId,
      contactId: r.contactId,
      conversationKey: r.conversationKey,
      toAddress: r.fromAddress || null,
      actionId: null,
      confidence: null,
      href: r.contactId ? `/contacts/${r.contactId}` : `/inbox`,
    });
  }

  for (const a of input.approvals ?? []) {
    if (isTestLabel(a.entityLabel)) continue;
    const boost = valueBoost(a.amount) + (a.confidence ? a.confidence * 1.5 : 0);
    items.push({
      id: `approval:${a.id}`,
      kind: "approval",
      tone: "approval",
      title: humanizeAction(a.actionType),
      subtitle: a.entityLabel || (a.entityType ? `on ${a.entityType}` : null),
      why: a.reasoning || "The agent is ready to act — approve to proceed.",
      stakes: money(a.amount),
      score: LANE_BASE.approval - boost,
      entityType: a.entityType,
      entityId: a.entityId,
      contactId: a.entityType === "contact" ? a.entityId : null,
      conversationKey: null,
      toAddress: null,
      actionId: a.id,
      confidence: a.confidence ?? null,
      href: a.entityId ? hrefFor(a.entityType, a.entityId) : null,
    });
  }

  for (const d of input.dealsAtRisk ?? []) {
    if (isTestLabel(d.name)) continue;
    const overdueBoost = Math.min(8, d.daysSilent / 7);
    items.push({
      id: `deal_risk:${d.id}`,
      kind: "deal_risk",
      tone: "risk",
      title: d.name,
      subtitle: d.stage ? `${d.stage} stage` : null,
      why: `Silent ${d.daysSilent} day${d.daysSilent === 1 ? "" : "s"}`,
      stakes: money(d.value),
      score: LANE_BASE.deal_risk - overdueBoost - valueBoost(d.value),
      entityType: "deal",
      entityId: d.id,
      contactId: null,
      conversationKey: null,
      toAddress: null,
      actionId: null,
      confidence: null,
      href: `/opportunities/${d.id}`,
    });
  }

  for (const m of input.meetings ?? []) {
    if (isTestLabel(m.title)) continue;
    items.push({
      id: `meeting:${m.id}`,
      kind: "meeting",
      tone: "meeting",
      title: m.title || "Meeting",
      subtitle: null,
      why: m.overdue ? "Earlier today" : "On your calendar today",
      stakes: m.time || null,
      score: LANE_BASE.meeting - (m.overdue ? 2 : 0),
      entityType: null,
      entityId: m.id,
      contactId: null,
      conversationKey: null,
      toAddress: null,
      actionId: null,
      confidence: null,
      href: `/meetings`,
    });
  }

  // Dedupe: a contact already surfaced as a reply shouldn't reappear as a task.
  const repliedContacts = new Set(
    items.filter((i) => i.kind === "reply" && i.contactId).map((i) => i.contactId),
  );

  for (const t of input.tasks ?? []) {
    if (isTestLabel(t.title)) continue;
    if (t.entityType === "contact" && t.entityId && repliedContacts.has(t.entityId)) continue;
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      tone: "task",
      title: t.title,
      subtitle: t.account,
      why: t.overdue ? "Overdue" : "Due today",
      stakes: null,
      score: LANE_BASE.task - (t.overdue ? 10 : 0),
      entityType: t.entityType,
      entityId: t.entityId,
      contactId: t.entityType === "contact" ? t.entityId : null,
      conversationKey: null,
      toAddress: null,
      actionId: null,
      confidence: null,
      href: t.entityId ? hrefFor(t.entityType, t.entityId) : `/tasks`,
    });
  }

  return items.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
}

// ── Ledger (autonomy synthesis) ─────────────────────────────────────

export interface ReactionInput {
  trigger: string;
  entityLabel: string | null;
  actionsTaken: number;
  actionsDeferred: number;
}

const LEDGER_VERB: Record<string, string> = {
  signal_detected: "Detected buying signals",
  email_replied: "Processed replies",
  email_received: "Triaged new email",
  inbound_email: "Triaged new email",
  email_opened: "Tracked opens",
  email_clicked: "Tracked link clicks",
  email_bounced: "Handled bounces",
  deal_stale: "Flagged stalling deals",
  deal_stage_changed: "Advanced deals",
  meeting_completed: "Logged meetings",
  contact_enriched: "Enriched contacts",
  sequence_completed: "Completed sequences",
  daily_sweep: "Reviewed the pipeline",
};

function ledgerVerb(trigger: string): string {
  return (
    LEDGER_VERB[trigger] ||
    trigger.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function buildLedger(reactions: ReactionInput[]): LedgerGroup[] {
  // The ledger is a pure "what the agent observed / did" synthesis. It does NOT
  // surface reactions.actionsDeferred as "awaiting approval": that counter is
  // disconnected from actionable rows (deferred actions are currently recorded
  // status='executed', and no dispatcher consumes scheduled actions — see
  // _specs/up-next-redesign/tasks.md follow-up). Pending approvals have ONE
  // source of truth: the "Needs you" approval lane (scheduled agent_actions).
  const byTrigger = new Map<string, { count: number; samples: string[] }>();
  for (const r of reactions) {
    if (isTestLabel(r.entityLabel)) continue;
    let g = byTrigger.get(r.trigger);
    if (!g) {
      g = { count: 0, samples: [] };
      byTrigger.set(r.trigger, g);
    }
    g.count += 1;
    if (r.entityLabel && g.samples.length < 3 && !g.samples.includes(r.entityLabel)) {
      g.samples.push(r.entityLabel);
    }
  }

  return [...byTrigger.entries()]
    .map(([trigger, g]) => ({
      trigger,
      verb: ledgerVerb(trigger),
      count: g.count,
      samples: g.samples,
    }))
    .sort((a, b) => b.count - a.count);
}

/** "Detected buying signals at Siit, Axelor +3" — the synthesised one-liner. */
export function ledgerSentence(g: LedgerGroup): string {
  if (g.samples.length === 0) return `${g.verb} (${g.count})`;
  const shown = g.samples.join(", ");
  const extra = g.count - g.samples.length;
  return extra > 0 ? `${g.verb} at ${shown} +${extra}` : `${g.verb} at ${shown}`;
}

// ── Engine-health line (one number, one lever) ──────────────────────

export function buildEngineLine(m: EngineMetrics): EngineLine {
  if (m.totalAccounts > 0 && m.activeDeals === 0) {
    return {
      text: `${m.totalAccounts.toLocaleString()} target accounts · none in an active deal yet`,
      cta: { label: "Start with your best-fit accounts", href: "/accounts?sort=score&dir=desc" },
    };
  }
  if (m.totalContacts > 0 && m.emailsSent7d === 0) {
    return {
      text: `${m.totalContacts.toLocaleString()} contacts ready · no outreach in the last 7 days`,
      cta: { label: "Launch a campaign", href: "/sequences" },
    };
  }
  const pv = money(m.pipelineValue);
  const win = m.winRate != null ? ` · ${m.winRate}% win rate` : "";
  return {
    text: `${pv ? `${pv} pipeline` : "Pipeline building"} · ${m.activeDeals} active deal${m.activeDeals === 1 ? "" : "s"}${win}`,
    cta: { label: "Review pipeline", href: "/opportunities" },
  };
}

// ── shared ──────────────────────────────────────────────────────────

export function humanizeAction(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function hrefFor(entityType: string | null, entityId: string): string {
  if (entityType === "contact") return `/contacts/${entityId}`;
  if (entityType === "deal") return `/opportunities/${entityId}`;
  if (entityType === "company") return `/accounts/${entityId}`;
  return `/accounts`;
}
