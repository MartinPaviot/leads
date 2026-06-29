/**
 * Up Next — pure aggregation for the founder's dashboard.
 *
 * No DB, no fetch, no ambient `Date.now()` (time is injected) → every input is a
 * plain shape the API maps from a live source, each lane is independent, and the
 * whole thing is unit-testable. See _specs/up-next-redesign/.
 *
 * The dashboard is three things, all from REAL data:
 *   1. KPIs        — the founder metrics that matter (buildKpis).
 *   2. Actualités  — a cross-page feed of real events (buildActualites):
 *                    replies, email opens (aggregated), inbound forms, calls
 *                    with outcomes, deal lifecycle events (from the
 *                    deal_stage_changed/won/lost activities, NOT the
 *                    updatedAt proxy), meetings, and adds with provenance
 *                    (bulk imports grouped to one line per source).
 *   3. À faire     — only genuine human work (buildNeedsYou): replies to answer,
 *                    discovery calls to prep, live deals at risk, due tasks.
 *
 * It does NOT surface reflexive agent actions (signal→create_deal). Deals are
 * created when a discovery call is booked and updated from transcript/email
 * analysis — never reflexively.
 */

import { classifyInboundSender } from "@/lib/inbound/lead-classification";
import {
  isExcludedAsLead,
  getLeadFeedback,
  getLeadRelationship,
} from "@/lib/inbound/lead-status";

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
  // Every card carries a sub-line that frames its value — including the zero
  // state. A brand-new tenant has no pipeline, deals, calls, replies or sends
  // yet, so without this the strip directly under the greeting is six
  // context-free "0" / "€0" / "—" numerals that read as a broken dashboard
  // rather than an empty one. The zero copy mirrors the win-rate card's
  // existing "no … yet" framing so the whole strip reads as intentional.
  return [
    {
      key: "pipeline",
      label: "Pipeline",
      value: money(m.pipelineValue),
      sub: m.pipelineValue === 0 ? "no open deals yet" : null,
      delta: null,
    },
    {
      key: "deals",
      label: "Active deals",
      value: `${m.activeDeals}`,
      sub: m.activeDeals === 0 ? "none open yet" : null,
      delta: null,
    },
    {
      key: "calls",
      label: "Calls booked",
      value: `${m.callsBookedWeek}`,
      sub: m.callsBookedWeek === 0 ? "none this week" : "this week",
      delta: callsDelta,
    },
    {
      key: "replies",
      label: "Replies",
      value: `${m.replies7d}`,
      sub:
        m.replies7d === 0
          ? "none yet · 7d"
          : m.replyRate != null
            ? `${m.replyRate}% · 7d`
            : "7d",
      delta: null,
    },
    {
      key: "outreach",
      label: "Outreach",
      value: `${m.outreach7d}`,
      sub: m.outreach7d === 0 ? "none sent yet · 7d" : "sent · 7d",
      delta: null,
    },
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
  | "deal" // deal created / stage changed (transcript/email analysis or chat)
  | "deal_won"
  | "deal_lost"
  | "reply" // inbound reply received
  | "open" // prospect opened an outbound email (pixel logs first open per email)
  | "form" // inbound form submission
  | "call" // outbound call with a meaningful outcome (Call Mode)
  | "meeting_booked"
  | "meeting_done"
  | "account" // account added (individually, or grouped per import source)
  | "contact" // contact added (individually, or grouped per import source)
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

/** Per-kind feed caps so one chatty source (opens, bulk adds) can't drown a
 *  reply. Kinds not listed are uncapped — the overall limit still rules. */
export const ACTUALITE_KIND_CAPS: Partial<Record<ActualiteKind, number>> = {
  open: 3,
  call: 4,
  account: 4,
  contact: 4,
};

/** Merge cross-source events into one feed: drop test rows, dedupe by id, sort
 *  newest-first, cap per kind then overall. The API does the per-source
 *  mapping; this is the pure merge/sort/filter so it's unit-testable. */
export function buildActualites(
  items: Actualite[],
  limit = 12,
  caps: Partial<Record<ActualiteKind, number>> = ACTUALITE_KIND_CAPS,
): Actualite[] {
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
  const kept: Actualite[] = [];
  const perKind = new Map<ActualiteKind, number>();
  for (const it of out) {
    const cap = caps[it.kind];
    const n = perKind.get(it.kind) ?? 0;
    if (cap != null && n >= cap) continue;
    perKind.set(it.kind, n + 1);
    kept.push(it);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Raw email-open rows, one per outbound email. The tracking pixel records
 *  only the FIRST open of each email, so the honest per-contact aggregate is
 *  "N emails opened" — never "opened N times". */
export interface OpenRow {
  id: string;
  contactId: string | null;
  name: string | null;
  at: string | null;
}

export function aggregateOpens(rows: OpenRow[]): Actualite[] {
  const byContact = new Map<string, { name: string | null; newest: string | null; count: number }>();
  for (const r of rows) {
    if (!r.contactId) continue; // unattributable — no feed value
    if (isTestLabel(r.name)) continue;
    const g = byContact.get(r.contactId) ?? { name: null, newest: null, count: 0 };
    g.count += 1;
    g.name = g.name ?? r.name;
    // ISO strings from the same formatter compare lexicographically.
    if (r.at && (!g.newest || r.at > g.newest)) g.newest = r.at;
    byContact.set(r.contactId, g);
  }
  return [...byContact.entries()].map(([contactId, g]) => ({
    id: `open:${contactId}`,
    kind: "open" as const,
    title: g.name ? `${g.name} opened your email` : "Email opened",
    detail: g.count > 1 ? `${g.count} emails opened` : null,
    at: g.newest,
    href: `/contacts/${contactId}`,
  }));
}

/**
 * Gate for the Actualités feed's inbound email events (email_received /
 * email_replied). The feed must show PROSPECT activity, not every email the
 * founder happens to correspond with (newsletters, bots, colleagues, vendor
 * receipts). An inbound email event is feed-worthy only when ALL hold:
 *
 *   1. it's attributed to a contact — `unassigned` service/newsletter mail
 *      is never news;
 *   2. the sender isn't machine-generated — checked on the From header,
 *      falling back to the contact's email because legacy rows lost their
 *      From header (clobber bug #260) so the machine check would otherwise
 *      silently pass;
 *   3. the contact isn't ruled "not a lead" (the user's or the LLM's verdict);
 *   4. the contact is actually in the pipeline: we ENGAGED them (an outbound
 *      send or a sequence enrollment ties us to them) OR a human/LLM CONFIRMED
 *      them an inbound lead. A pure inbound-only contact we never worked — a
 *      colleague, a person-shaped newsletter address — is noise, not news.
 *
 * Pure: the route resolves `engaged` (a DB fact) and the contact fields; this
 * is the unit-testable decision. See _specs/up-next-redesign/ + the inbound
 * lead funnel (_specs/inbound-lead-recognition/).
 */
export function shouldSurfaceInboundEvent(input: {
  entityType: string | null;
  fromHeader: string | null;
  contactEmail: string | null;
  contactProperties: Record<string, unknown> | null;
  /** True when an outbound send or sequence enrollment ties us to this contact. */
  engaged: boolean;
}): boolean {
  if (input.entityType !== "contact") return false;
  const senderHint = (input.fromHeader || "").trim() || (input.contactEmail || "");
  if (senderHint && classifyInboundSender({ fromHeader: senderHint }).isMachineSent) {
    return false;
  }
  if (isExcludedAsLead(input.contactProperties)) return false;
  const feedback = getLeadFeedback(input.contactProperties);
  const relationship = getLeadRelationship(input.contactProperties);
  const confirmedLead =
    feedback?.isLead === true || relationship?.isInboundLead === true;
  return input.engaged || confirmedLead;
}

/** Provenance in PRODUCT language only — provider names (Apollo, SIRENE,
 *  Pappers, Zefix...) are Elevay's plumbing and never reach the UI. Machine
 *  sourcing reads "sourced by Elevay"; unknown values show NOTHING rather
 *  than leak a raw internal string. */
const SOURCE_LABEL: Record<string, string> = {
  apollo: "sourced by Elevay",
  tam: "sourced by Elevay",
  sirene: "sourced by Elevay",
  pappers: "sourced by Elevay",
  zefix: "sourced by Elevay",
  csv: "via CSV import",
  manual: "manually",
  inbound: "via inbound",
};

function sourceLabel(s: string | null): string | null {
  if (!s) return null;
  return SOURCE_LABEL[s.toLowerCase()] ?? null;
}

/** One import burst = one EVENT. The API reconstructs batches in SQL (same
 *  source, gap > 30 min starts a new batch) so each line is a dated fact with
 *  a count that never changes — not a rolling-window aggregate. `sampleIds`/
 *  `sampleNames` carry up to 2 most-recent members so a small batch can render
 *  as individual named lines. */
export interface AddBatch {
  sourceSystem: string | null;
  n: number;
  /** ISO timestamp of the batch's most recent row. */
  newest: string | null;
  sampleIds: string[];
  sampleNames: string[];
}

export function mapAddBatches(
  batches: AddBatch[],
  kind: "account" | "contact",
  threshold = 3,
): Actualite[] {
  const listHref = kind === "account" ? "/accounts" : "/contacts";
  const single = kind === "account" ? "account added" : "contact added";
  const out: Actualite[] = [];
  for (const b of batches) {
    const label = sourceLabel(b.sourceSystem);
    if (b.n >= threshold) {
      out.push({
        id: `${kind}-batch:${(b.sourceSystem ?? "unknown").toLowerCase()}:${b.sampleIds[0] ?? b.newest ?? "x"}`,
        kind,
        title: `${b.n} ${kind === "account" ? "accounts" : "contacts"} added`,
        detail: label,
        at: b.newest,
        href: listHref,
      });
    } else {
      for (let i = 0; i < b.sampleIds.length; i++) {
        const name = b.sampleNames[i];
        if (!name || isTestLabel(name)) continue;
        out.push({
          id: `${kind === "account" ? "company" : "contact"}:${b.sampleIds[i]}`,
          kind,
          title: name,
          detail: label ? `${single} · ${label}` : single,
          at: b.newest,
          href: `${listHref}/${b.sampleIds[i]}`,
        });
      }
    }
  }
  return out;
}

/** "45s" under a minute; "6m" / "6m12" above. */
export function formatCallDuration(sec: number | null | undefined): string | null {
  if (sec == null || sec <= 0) return null;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m${String(s).padStart(2, "0")}` : `${m}m`;
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
