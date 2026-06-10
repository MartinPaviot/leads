/**
 * Up Next — pure aggregation for the founder's dashboard.
 *
 * No DB, no fetch, no ambient `Date.now()` (time is injected) → every input is a
 * plain shape the API maps from a live source, each lane is independent, and the
 * whole thing is unit-testable. See _specs/up-next-redesign/.
 *
 * The dashboard is three things, all from REAL data:
 *   1. KPIs        — the founder metrics that matter (buildKpis).
 *   2. Actualités  — a cross-page feed of real events (buildActualites).
 *   3. À faire     — only genuine human work (buildNeedsYou): replies to answer,
 *                    discovery calls to prep, live deals at risk, due tasks.
 *
 * It does NOT surface reflexive agent actions (signal→create_deal). Deals are
 * created when a discovery call is booked and updated from transcript/email
 * analysis — never reflexively.
 */

// ── Shared helpers ──────────────────────────────────────────────────

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

export function money(v: number | null | undefined): string {
  if (!v || v <= 0) return "€0";
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1000) return `€${Math.round(v / 1000)}k`;
  return `€${v}`;
}

// ── KPIs ────────────────────────────────────────────────────────────

export interface KpiMetrics {
  pipelineValue: number;
  activeDeals: number;
  /** Discovery calls booked this week (and prior week, for the WoW delta). */
  callsBookedWeek: number;
  callsBookedPrevWeek: number | null;
  replies7d: number;
  /** 0–100, or null when nothing was sent. */
  replyRate: number | null;
  outreach7d: number;
  /** 0–100, or null when no closed deals yet. */
  winRate: number | null;
}

export interface Kpi {
  key: string;
  label: string;
  value: string;
  /** Optional supporting line under the value (e.g. "18% taux"). */
  sub: string | null;
  /** WoW delta (absolute); only set where a prior window is known. */
  delta: number | null;
}

export function buildKpis(m: KpiMetrics): Kpi[] {
  const callsDelta =
    m.callsBookedPrevWeek == null ? null : m.callsBookedWeek - m.callsBookedPrevWeek;
  return [
    { key: "pipeline", label: "Pipeline", value: money(m.pipelineValue), sub: null, delta: null },
    { key: "deals", label: "Active deals", value: `${m.activeDeals}`, sub: null, delta: null },
    {
      key: "calls",
      label: "Calls booked",
      value: `${m.callsBookedWeek}`,
      sub: "this week",
      delta: callsDelta,
    },
    {
      key: "replies",
      label: "Replies",
      value: `${m.replies7d}`,
      sub: m.replyRate != null ? `${m.replyRate}% · 7d` : "7d",
      delta: null,
    },
    { key: "outreach", label: "Outreach", value: `${m.outreach7d}`, sub: "sent · 7d", delta: null },
    {
      key: "winrate",
      label: "Win rate",
      value: m.winRate != null ? `${m.winRate}%` : "—",
      sub: m.winRate == null ? "no closed deals yet" : null,
      delta: null,
    },
  ];
}

// ── Actualités (cross-page real-event feed) ─────────────────────────

export type ActualiteKind =
  | "deal" // deal created / updated (incl. from transcript/email analysis)
  | "reply" // inbound reply received
  | "meeting_booked"
  | "meeting_done"
  | "account" // account added / enriched
  | "contact" // contact added / enriched
  | "campaign";

export interface Actualite {
  id: string;
  kind: ActualiteKind;
  title: string;
  detail: string | null;
  /** ISO timestamp; null sorts last. */
  at: string | null;
  href: string | null;
}

/** Merge cross-source events into one feed: drop test rows, dedupe by id, sort
 *  newest-first, cap. The API does the per-source mapping; this is the pure
 *  merge/sort/filter so it's unit-testable. */
export function buildActualites(items: Actualite[], limit = 12): Actualite[] {
  const seen = new Set<string>();
  const out: Actualite[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    if (isTestLabel(it.title) || isTestLabel(it.detail)) continue;
    seen.add(it.id);
    out.push(it);
  }
  out.sort((a, b) => {
    const at = a.at ? new Date(a.at).getTime() : 0;
    const bt = b.at ? new Date(b.at).getTime() : 0;
    return bt - at;
  });
  return out.slice(0, limit);
}

// ── À faire (genuine human work only — no agent reflexes) ───────────

export type NeedsYouKind = "reply" | "deal_risk" | "meeting" | "task";
export type Tone = "reply" | "risk" | "meeting" | "task";

export interface ReplyInput {
  conversationKey: string;
  contactId: string | null;
  subject: string;
  fromAddress: string;
  reason: string;
  priority: number;
  lastInboundAt: string | null;
}
export interface DealRiskInput {
  id: string;
  name: string;
  stage: string | null;
  value: number | null;
  daysSilent: number;
}
export interface MeetingInput {
  id: string;
  title: string;
  time: string;
  overdue?: boolean;
}
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
  dealsAtRisk?: DealRiskInput[];
  meetings?: MeetingInput[];
  tasks?: TaskInput[];
}

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  tone: Tone;
  title: string;
  subtitle: string | null;
  why: string;
  stakes: string | null;
  score: number;
  entityType: string | null;
  entityId: string | null;
  contactId: string | null;
  conversationKey: string | null;
  toAddress: string | null;
  href: string | null;
}

const LANE_BASE: Record<NeedsYouKind, number> = { reply: 0, meeting: 6, deal_risk: 20, task: 30 };

function valueBoost(amount: number | null | undefined): number {
  if (!amount || amount <= 0) return 0;
  return Math.min(6, amount / 10000);
}

export function buildNeedsYou(input: NeedsYouInput): NeedsYouItem[] {
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
      href: r.contactId ? `/contacts/${r.contactId}` : `/inbox`,
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
      why: m.overdue ? "Earlier today" : "Today",
      stakes: m.time || null,
      score: LANE_BASE.meeting - (m.overdue ? 2 : 0),
      entityType: null,
      entityId: m.id,
      contactId: null,
      conversationKey: null,
      toAddress: null,
      href: `/meetings`,
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
      subtitle: d.stage ? `${d.stage}` : null,
      why: `Silent ${d.daysSilent}d`,
      stakes: d.value ? money(d.value) : null,
      score: LANE_BASE.deal_risk - overdueBoost - valueBoost(d.value),
      entityType: "deal",
      entityId: d.id,
      contactId: null,
      conversationKey: null,
      toAddress: null,
      href: `/opportunities/${d.id}`,
    });
  }

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
      why: t.overdue ? "Overdue" : "Due",
      stakes: null,
      score: LANE_BASE.task - (t.overdue ? 10 : 0),
      entityType: t.entityType,
      entityId: t.entityId,
      contactId: t.entityType === "contact" ? t.entityId : null,
      conversationKey: null,
      toAddress: null,
      href: t.entityId && t.entityType === "contact" ? `/contacts/${t.entityId}` : `/tasks`,
    });
  }

  return items.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
}
