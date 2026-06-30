/**
 * Inbox conversation assembly — pure, injectable, fully unit-testable.
 *
 * Groups inbound activities (email_received) and outbound emails into
 * conversations keyed by threadId (fallback contact:<id>, then email:<id>),
 * assigns each conversation a lane (attention / handled / snoozed / done),
 * a deterministic priority bucket and a label-driven reason line.
 *
 * No LLM here: every signal shown is a label the sync pipeline already
 * persisted (activities.intent / sentiment, outbound_emails.reply_classification,
 * metadata.threadIntelligence). Missing labels degrade to the neutral bucket.
 * See _specs/inbox-triage/design.md.
 */

import { classifyInboundSender } from "@/lib/inbound/lead-classification";
import type { SenderAuthStatus } from "@/lib/inbox/sender-auth";
import { normalizeAttachments, type AttachmentMeta } from "@/lib/inbox/attachment-meta";
import { checkSla } from "@/lib/inbox/sla";
import { scoreImportance } from "@/lib/inbox/importance";
import { resolveGeneralIntent, type GeneralIntent } from "@/lib/inbox/general-intent";
import { isReplyWorthy } from "@/lib/inbox/reply-worthy";
import { resolveSplit, type BuiltInSplit } from "@/lib/inbox/splits";
import { followupFromMessages, type FollowupDue } from "@/lib/inbox/followup-due";
import { classifyNoise } from "@/lib/inbox/noise";
import { noiseOverrideMatches, type NoiseOverride } from "@/lib/inbox/noise-override-store";

/** Hours awaiting our reply before a conversation is flagged overdue (INBOX-N04). */
const SLA_THRESHOLD_HOURS = 24;

export interface InboundRow {
  id: string;
  threadId: string | null;
  contactId: string | null;
  occurredAt: Date | string | null;
  summary: string | null;
  rawContent: string | null;
  metadata: Record<string, unknown> | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  intent: string[] | null;
}

export interface OutboundRow {
  id: string;
  threadId: string | null;
  contactId: string | null;
  subject: string;
  bodyText: string | null;
  sentAt: Date | string | null;
  status: string | null;
  repliedAt: Date | string | null;
  replyClassification: string | null;
  bounceType: string | null;
  stepNumber: number | null;
  toAddress: string;
  fromAddress: string;
  enrollmentId: string | null;
}

export interface TriageRow {
  conversationKey: string;
  status: string; // open | done | snoozed
  doneAt: Date | string | null;
  snoozedUntil: Date | string | null;
  updatedAt: Date | string | null;
}

export type Lane = "attention" | "handled" | "snoozed" | "done";

/** Where a conversation's `reason` line came from — drives the honest-badge tooltip (INBOX-T08). */
export type ReasonSource = "reply" | "summary" | "sentiment" | "handled" | null;

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Sanitized HTML body for fidelity rendering (INBOX-R01). Null ⇒ render `body`
   *  as text. Inbound only today; outbound is composed as text. */
  bodyHtml: string | null;
  /** Raw .ics of an inbound meeting invite (INBOX-R12/CAL), when present — drives
   *  the inline event card. Null ⇒ not an invite. */
  calendar: string | null;
  /** Attachment metadata (INBOX-R04) — filename/type/size/inline for the pane strip. */
  attachments: AttachmentMeta[];
  /** Sender domain-auth verdict (INBOX-R06): "pass" earns a verified badge,
   *  "fail" a caution, "unknown" shows nothing. Outbound is always "unknown". */
  senderVerified: SenderAuthStatus;
  at: string | null;
  status: string | null;
  stepNumber: number | null;
}

export interface Conversation {
  key: string;
  lane: Lane;
  /** 1 (hot) … 4 (neutral); only meaningful inside the attention lane. */
  priority: number;
  subject: string;
  contactId: string | null;
  /** Counterparty address (last inbound from, else last outbound to). */
  fromAddress: string;
  snippet: string;
  reason: string;
  /** Provenance of `reason`, for the honest-badge tooltip. Null when there is no badge. */
  reasonSource: ReasonSource;
  /** Hours overdue if we're past the response SLA on a conversation awaiting our
   *  reply (INBOX-N04); null when not awaiting us or within the SLA. */
  slaHoursOverdue: number | null;
  /** Explainable importance (INBOX-T04): 0–100 score, coarse 1–4 tier (1 hottest)
   *  that the attention lane sorts on, and the cited contributing factors. */
  importanceScore: number;
  importanceTier: 1 | 2 | 3 | 4;
  importanceFactors: string[];
  /** Last inbound is automated/bulk — drives newsletter/promo bundling (INBOX-T03). */
  isBulk: boolean;
  /** Inbound is worth offering an AI reply draft for (B1 selectivity); gates the
   *  Generate-draft affordance + auto-draft so the AI never drafts on machine/
   *  no-reply/bulk mail. Recall-biased: ambiguous human mail stays worthy. */
  replyWorthy: boolean;
  /** Resolved general intent (B3) — surfaced (no longer discarded) for the split. */
  generalIntent: GeneralIntent;
  /** Attention thread whose latest message is inbound — we owe a reply (B3). */
  awaitingOurReply: boolean;
  /** Attention thread whose latest message is outbound — they owe a reply (B3). */
  awaitingTheirReply: boolean;
  /** B7: when (and how overdue) a gentle follow-up is due on an awaiting-their-reply
   *  thread; null otherwise. SLA-exclusive with slaHoursOverdue (a thread's last
   *  message is inbound xor outbound, so the two never co-populate). */
  followup: FollowupDue | null;
  /** Intention split (B3): needs_reply / follow_ups / promotions / social / other. */
  split: BuiltInSplit;
  /** Cold/automated/newsletter mail (B4) — floored in importance; never a
   *  reply-worthy human thread (the override/reply-worthy/prior KEEP guards). */
  noise: boolean;
  /** What the pipeline did, for the handled lane. Null elsewhere. */
  handledNote: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  inboundCount: number;
  messageCount: number;
  messages: ConversationMessage[];
  intelligence: Record<string, unknown> | null;
}

// ── Label tables (cover BOTH intent enums in the codebase:
//    sync-functions.ts analyzeEmailBatch + enrichment/email-extract.ts,
//    plus processReply classifications) ─────────────────────────────

const PRIORITY_BY_LABEL: Record<string, number> = {
  // 1 — wants to talk
  meeting_request: 1,
  demo_request: 1,
  calendar_scheduling: 1,
  interested: 1,
  // 2 — asked something / gave a buying signal
  question: 2,
  pricing_inquiry: 2,
  budget_mention: 2,
  timeline_mention: 2,
  referral: 2,
  decision_pending: 2,
  // 3 — pushing back
  objection: 3,
  objection_price: 3,
  objection_timing: 3,
  objection_competitor: 3,
  objection_authority: 3,
  competitor_mention: 3,
  not_interested: 3,
};

/** Order labels hottest-first (lowest priority number wins). F2: hoisted so the
 *  highest-priority label is sorted once per conversation, not twice. */
const byPriorityAsc = (a: string, b: string) => (PRIORITY_BY_LABEL[a] ?? 4) - (PRIORITY_BY_LABEL[b] ?? 4);

const REASON_BY_LABEL: Record<string, string> = {
  meeting_request: "Meeting request",
  demo_request: "Asked for a demo",
  calendar_scheduling: "Scheduling a meeting",
  interested: "Interested",
  question: "Asked a question",
  pricing_inquiry: "Asked about pricing",
  budget_mention: "Mentioned budget",
  timeline_mention: "Mentioned a timeline",
  referral: "Referred someone",
  decision_pending: "Decision pending",
  objection: "Raised an objection",
  objection_price: "Objection: pricing",
  objection_timing: "Objection: timing",
  objection_competitor: "Objection: competitor",
  objection_authority: "Objection: authority",
  competitor_mention: "Mentioned a competitor",
  not_interested: "Not interested",
  follow_up: "Followed up",
  follow_up_needed: "Needs a follow-up",
  introduction: "Introduction",
  thank_you: "Said thanks",
  support_request: "Support request",
  feature_request: "Feature request",
  internal_forward: "Forwarded internally",
};

const HANDLED_LABELS = new Set(["out_of_office", "ooo", "unsubscribe"]);

const HANDLED_NOTES: Record<string, string> = {
  out_of_office: "Out of office — sequence rescheduled",
  ooo: "Out of office — sequence rescheduled",
  unsubscribe: "Unsubscribed — added to opt-out list",
  bounced: "Bounced — sending stopped",
};

// ── Helpers ──────────────────────────────────────────────────────

function toMs(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toIso(d: Date | string | null | undefined): string | null {
  const ms = toMs(d);
  return ms === null ? null : new Date(ms).toISOString();
}

export function conversationKeyFor(row: { threadId: string | null; contactId: string | null; id: string }): string {
  if (row.threadId) return row.threadId;
  if (row.contactId) return `contact:${row.contactId}`;
  return `email:${row.id}`;
}

function normalizeSnippet(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Labels of one conversation, most-authoritative first. */
function conversationLabels(lastInbound: InboundRow | null, outbound: OutboundRow[]): string[] {
  const labels: string[] = [];
  if (lastInbound?.intent) labels.push(...lastInbound.intent.filter(Boolean));
  // Latest classified outbound (processReply writes reply_classification) —
  // but only while it still describes the LAST inbound. A newer inbound
  // supersedes it; otherwise a thread once classified ooo/unsubscribe would
  // sit in the handled lane forever, hiding a genuine new reply.
  const classified = outbound
    .filter((o) => o.replyClassification)
    .sort((a, b) => (toMs(b.repliedAt) ?? 0) - (toMs(a.repliedAt) ?? 0));
  const latest = classified[0];
  if (latest?.replyClassification) {
    const repliedMs = toMs(latest.repliedAt);
    const lastInboundMs = lastInbound ? toMs(lastInbound.occurredAt) : null;
    const stale = repliedMs !== null && lastInboundMs !== null && lastInboundMs > repliedMs;
    if (!stale) labels.push(latest.replyClassification);
  }
  return labels;
}

// ── Assembly ─────────────────────────────────────────────────────

export function buildConversations(input: {
  inbound: InboundRow[];
  outbound: OutboundRow[];
  triage: TriageRow[];
  now?: Date;
  /** B4: the user's not-noise overrides (pure-builder input, like triage). */
  noiseOverrides?: NoiseOverride[];
  /** P1: per-contact deal/seniority enrichment (loader joins it once, keyed by
   *  contactId), fed into the importance score so an open deal / advanced stage /
   *  senior sender lifts the thread. Absent → scored exactly as before. */
  importanceByContactId?: Map<
    string,
    { hasOpenDeal?: boolean; dealStageRank?: number; senioritySenior?: boolean }
  >;
}): Conversation[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const noiseOverrides = input.noiseOverrides ?? [];

  const groups = new Map<string, { inbound: InboundRow[]; outbound: OutboundRow[] }>();
  const groupFor = (key: string) => {
    let g = groups.get(key);
    if (!g) {
      g = { inbound: [], outbound: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const row of input.inbound) groupFor(conversationKeyFor(row)).inbound.push(row);
  for (const row of input.outbound) groupFor(conversationKeyFor(row)).outbound.push(row);

  const triageByKey = new Map(input.triage.map((t) => [t.conversationKey, t]));
  const conversations: Conversation[] = [];

  for (const [key, g] of groups) {
    g.inbound.sort((a, b) => (toMs(a.occurredAt) ?? 0) - (toMs(b.occurredAt) ?? 0));
    g.outbound.sort((a, b) => (toMs(a.sentAt) ?? 0) - (toMs(b.sentAt) ?? 0));

    const lastInbound = g.inbound[g.inbound.length - 1] ?? null;
    const lastOutbound = g.outbound[g.outbound.length - 1] ?? null;
    const lastInboundMs = lastInbound ? toMs(lastInbound.occurredAt) : null;

    // Outbound-only conversations belong to the Outbound tab — except a
    // bounce, which the agent already acted on (sending stopped).
    const bounced = lastOutbound?.status === "bounced";
    if (g.inbound.length === 0 && !bounced) continue;

    const labels = conversationLabels(lastInbound, g.outbound);
    const handledLabel = labels.find((l) => HANDLED_LABELS.has(l));

    // Effective triage (reopen computed, never stored).
    const triage = triageByKey.get(key);
    let triageState: "open" | "done" | "snoozed" = "open";
    if (triage) {
      const updatedMs = toMs(triage.updatedAt);
      const newInboundSince = lastInboundMs !== null && updatedMs !== null && lastInboundMs > updatedMs;
      if (triage.status === "done") {
        const doneMs = toMs(triage.doneAt);
        triageState =
          doneMs !== null && (lastInboundMs === null || doneMs >= lastInboundMs) ? "done" : "open";
      } else if (triage.status === "snoozed") {
        const untilMs = toMs(triage.snoozedUntil);
        triageState = untilMs !== null && untilMs > nowMs && !newInboundSince ? "snoozed" : "open";
      }
    }

    // An automated/role sender (noreply@, notifications@, newsletter@…) never
    // needs a human reply, so it must never sit in the "attention" lane — not
    // in the Inbox, nor in the dashboard "Needs you" which reads this lane.
    // Treat it as handled. See _specs/inbound-lead-recognition/.
    const lastInboundFrom = String((lastInbound?.metadata as Record<string, unknown> | null)?.from ?? "");
    const inboundIsAutomated =
      !!lastInbound && classifyInboundSender({ fromHeader: lastInboundFrom }).isMachineSent;

    let lane: Lane;
    let handledNote: string | null = null;
    if (handledLabel || inboundIsAutomated || (g.inbound.length === 0 && bounced)) {
      lane = "handled";
      handledNote = handledLabel
        ? HANDLED_NOTES[handledLabel] ?? HANDLED_NOTES.bounced
        : inboundIsAutomated
          ? "Automated sender — no reply needed"
          : HANDLED_NOTES.bounced;
    } else if (triageState === "done") {
      lane = "done";
    } else if (triageState === "snoozed") {
      lane = "snoozed";
    } else {
      lane = "attention";
    }

    const priority = Math.min(4, ...labels.map((l) => PRIORITY_BY_LABEL[l] ?? 4));
    // F2: the highest-priority label, sorted once and reused for the reason badge
    // and the importance intent (was an identical [...labels].sort() in both).
    const topLabel = labels.length ? [...labels].sort(byPriorityAsc)[0] : undefined;

    // Honest badge (INBOX-T08): a sales-reply label ("Asked about pricing",
    // "Introduction", "Forwarded internally"…) is only legitimate on a genuine
    // reply to one of OUR outbound emails. On general or automated inbound we
    // never guess a sales meaning — we show a neutral AI summary line when one
    // was cached (INBOX-S02), otherwise nothing. The bare "Replied" fallback is
    // never emitted: an empty reason renders no badge, which is honest.
    const aiSummaryLine =
      typeof (lastInbound?.metadata as Record<string, unknown> | null)?.aiSummaryLine === "string"
        ? ((lastInbound!.metadata as Record<string, unknown>).aiSummaryLine as string).trim()
        : "";

    let reason: string;
    let reasonSource: ReasonSource;
    if (lane === "handled") {
      reason = handledNote ?? "Handled";
      reasonSource = "handled";
    } else {
      const hasOutbound = g.outbound.length > 0;
      const reasonLabel = hasOutbound ? topLabel : undefined;
      const mappedLabel = reasonLabel ? REASON_BY_LABEL[reasonLabel] : undefined;
      if (mappedLabel) {
        reason = mappedLabel;
        reasonSource = "reply";
      } else if (aiSummaryLine) {
        reason = aiSummaryLine;
        reasonSource = "summary";
      } else if (hasOutbound && lastInbound?.sentiment === "positive") {
        reason = "Positive reply";
        reasonSource = "sentiment";
      } else if (hasOutbound && lastInbound?.sentiment === "negative") {
        reason = "Negative reply";
        reasonSource = "sentiment";
      } else {
        reason = "";
        reasonSource = null;
      }
    }

    const messages: ConversationMessage[] = [
      ...g.inbound.map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          direction: "inbound" as const,
          from: String(meta.from ?? ""),
          to: String(meta.to ?? ""),
          subject: r.summary ?? String(meta.subject ?? ""),
          body: r.rawContent ?? String(meta.snippet ?? ""),
          bodyHtml: typeof meta.bodyHtml === "string" ? meta.bodyHtml : null,
          calendar: typeof meta.calendar === "string" ? meta.calendar : null,
          attachments: normalizeAttachments(meta.attachments),
          senderVerified:
            (meta.senderAuth as { status?: SenderAuthStatus } | undefined)?.status ?? "unknown",
          at: toIso(r.occurredAt),
          status: null,
          stepNumber: null,
        };
      }),
      ...g.outbound.map((r) => ({
        id: r.id,
        direction: "outbound" as const,
        from: r.fromAddress,
        to: r.toAddress,
        subject: r.subject,
        body: r.bodyText ?? "",
        bodyHtml: null,
        calendar: null,
        attachments: [],
        senderVerified: "unknown" as const,
        at: toIso(r.sentAt),
        status: r.status,
        stepNumber: r.stepNumber,
      })),
    ].sort((a, b) => (a.at ? new Date(a.at).getTime() : 0) - (b.at ? new Date(b.at).getTime() : 0));

    // Latest persisted thread intelligence, scanning newest inbound first.
    let intelligence: Record<string, unknown> | null = null;
    for (let i = g.inbound.length - 1; i >= 0; i--) {
      const ti = (g.inbound[i].metadata as Record<string, unknown> | null)?.threadIntelligence;
      if (ti && typeof ti === "object") {
        intelligence = ti as Record<string, unknown>;
        break;
      }
    }

    const lastInboundMeta = (lastInbound?.metadata ?? {}) as Record<string, unknown>;
    const lastMessage = messages[messages.length - 1] ?? null;

    // Response SLA (INBOX-N04): overdue only when we're the ones who owe a reply
    // (the latest message is inbound) on an active conversation, past the threshold.
    const awaitingOurReply = lane === "attention" && lastMessage?.direction === "inbound";
    const sla = checkSla({
      awaitingOurReply,
      lastInboundAt: lastInbound ? toMs(lastInbound.occurredAt) : null,
      now: nowMs,
      thresholdHours: SLA_THRESHOLD_HOURS,
    });
    const slaHoursOverdue = sla.breached ? sla.hoursOver : null;

    // Importance (INBOX-T04): rank the attention lane by revenue relevance from
    // already-persisted signals — intent, urgency/sentiment trend, recency — with
    // automated senders pinned to the bottom. P1: hasOpenDeal/dealStageRank/
    // seniority now come from the loader's per-contact deal+title join (keyed by
    // contactId), so an open deal / advanced stage / senior sender lifts the row.
    // The cited factors drive the "why" shown on the row.
    const intel = (intelligence ?? {}) as Record<string, unknown>;
    const lastInAtMs = lastInbound ? toMs(lastInbound.occurredAt) : null;
    const convContactId = lastInbound?.contactId ?? lastOutbound?.contactId ?? null;
    const ci = convContactId ? input.importanceByContactId?.get(convContactId) : undefined;
    const importance = scoreImportance({
      intentLabel: topLabel ?? null,
      hasOpenDeal: ci?.hasOpenDeal,
      dealStageRank: ci?.dealStageRank,
      senioritySenior: ci?.senioritySenior,
      urgencyLevel:
        typeof intel.urgencyLevel === "string"
          ? (intel.urgencyLevel as "none" | "low" | "medium" | "high")
          : null,
      sentimentTrend:
        typeof intel.sentimentTrend === "string"
          ? (intel.sentimentTrend as "improving" | "declining" | "stable")
          : null,
      isAutomated: inboundIsAutomated,
      ageHours: lastInAtMs != null ? Math.max(0, (nowMs - lastInAtMs) / 3_600_000) : undefined,
    });

    // B1 selectivity + B3 split: compute once from the signals this row already
    // carries. resolveGeneralIntent is no longer discarded — B3 reuses it (zero
    // new classification cost). Pure resolvers.
    const generalIntent: GeneralIntent = resolveGeneralIntent({
      modelIntent: lastInbound?.intent?.[0] ?? undefined,
      isMachineSent: inboundIsAutomated,
      hasOutbound: g.outbound.length > 0,
    }).generalIntent;
    const replyWorthy = isReplyWorthy({
      isMachineSent: inboundIsAutomated,
      generalIntent,
      isBulk: inboundIsAutomated,
    }).replyWorthy;
    // B3: the mirror of awaitingOurReply — we sent and are awaiting their reply.
    const awaitingTheirReply = lane === "attention" && lastMessage?.direction === "outbound";
    // B7: a gentle-follow-up due time, only on awaiting-their-reply threads (so it
    // is SLA-exclusive). Derived purely from the trailing outbound run + nowMs.
    const followup: FollowupDue | null = awaitingTheirReply
      ? followupFromMessages(messages, { now: nowMs })
      : null;
    const split: BuiltInSplit = resolveSplit({
      lane,
      replyWorthy,
      generalIntent,
      isBulk: inboundIsAutomated,
      awaitingOurReply,
      awaitingTheirReply,
    }).split;

    // B4 noise: demote cold/automated/newsletter mail. hasPriorHumanReply (a real
    // 1:1 — we've emailed this human) and the not-noise override are the KEEP
    // guards classifyNoise applies before any demotion signal (cardinal sin can't
    // fire). Soft demotion: a noisy attention thread is floored (tier 4 / score 0)
    // so it sinks; the `noise` field + the route count let a Noise filter surface
    // them. Read-time + reversible (the override un-demotes); no row is mutated.
    const fromAddress = String(lastInboundMeta.from ?? "") || lastOutbound?.toAddress || "";
    const hasPriorHumanReply = g.outbound.length > 0 && !inboundIsAutomated;
    const overridden = noiseOverrideMatches(noiseOverrides, fromAddress, key);
    const noise = classifyNoise({
      isMachineSent: inboundIsAutomated,
      isBulk: inboundIsAutomated,
      generalIntent,
      replyWorthy,
      importanceTier: importance.tier,
      hasPriorHumanReply,
      overridden,
    }).noise;
    const demoteNoise = noise && lane === "attention";
    const noiseTier: 1 | 2 | 3 | 4 = demoteNoise ? 4 : importance.tier;
    const noiseScore = demoteNoise ? 0 : importance.score;

    conversations.push({
      key,
      lane,
      priority,
      subject:
        lastInbound?.summary ||
        String(lastInboundMeta.subject ?? "") ||
        lastOutbound?.subject ||
        "(no subject)",
      contactId: lastInbound?.contactId ?? lastOutbound?.contactId ?? null,
      fromAddress,
      snippet: normalizeSnippet(
        lastInbound?.rawContent ||
          (typeof lastInboundMeta.snippet === "string" ? lastInboundMeta.snippet : "") ||
          lastOutbound?.bodyText,
      ),
      reason,
      reasonSource,
      slaHoursOverdue,
      importanceScore: noiseScore,
      importanceTier: noiseTier,
      importanceFactors: importance.factors.map((f) => f.label),
      isBulk: inboundIsAutomated,
      replyWorthy,
      generalIntent,
      awaitingOurReply,
      awaitingTheirReply,
      followup,
      split,
      noise,
      handledNote,
      lastInboundAt: lastInbound ? toIso(lastInbound.occurredAt) : null,
      lastMessageAt: lastMessage?.at ?? null,
      inboundCount: g.inbound.length,
      messageCount: messages.length,
      messages,
      intelligence,
    });
  }

  return sortConversations(conversations);
}

/** Attention: importance tier, then finer score, then freshest inbound (INBOX-T04).
 *  Other lanes: freshest first. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    if (a.lane === "attention" && b.lane === "attention") {
      if (a.importanceTier !== b.importanceTier) return a.importanceTier - b.importanceTier;
      if (a.importanceScore !== b.importanceScore) return b.importanceScore - a.importanceScore;
      // B7: within equal importance, an overdue follow-up leads (it needs action now).
      const aOver = a.followup?.overdue ? 1 : 0;
      const bOver = b.followup?.overdue ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
    }
    const aMs = a.lastInboundAt ?? a.lastMessageAt ?? "";
    const bMs = b.lastInboundAt ?? b.lastMessageAt ?? "";
    return bMs < aMs ? -1 : bMs > aMs ? 1 : 0;
  });
}

export function laneCounts(conversations: Conversation[]): Record<Lane, number> {
  const counts: Record<Lane, number> = { attention: 0, handled: 0, snoozed: 0, done: 0 };
  for (const c of conversations) counts[c.lane]++;
  return counts;
}
