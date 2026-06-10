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

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  body: string;
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
}): Conversation[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

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

    let lane: Lane;
    let handledNote: string | null = null;
    if (handledLabel || (g.inbound.length === 0 && bounced)) {
      lane = "handled";
      handledNote = HANDLED_NOTES[handledLabel ?? "bounced"] ?? HANDLED_NOTES.bounced;
    } else if (triageState === "done") {
      lane = "done";
    } else if (triageState === "snoozed") {
      lane = "snoozed";
    } else {
      lane = "attention";
    }

    const priority = Math.min(4, ...labels.map((l) => PRIORITY_BY_LABEL[l] ?? 4));

    let reason: string;
    if (lane === "handled") {
      reason = handledNote ?? "Handled";
    } else {
      const reasonLabel = [...labels].sort(
        (a, b) => (PRIORITY_BY_LABEL[a] ?? 4) - (PRIORITY_BY_LABEL[b] ?? 4),
      )[0];
      reason =
        (reasonLabel && REASON_BY_LABEL[reasonLabel]) ||
        (lastInbound?.sentiment === "positive"
          ? "Positive reply"
          : lastInbound?.sentiment === "negative"
            ? "Negative reply"
            : "Replied");
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
      fromAddress: String(lastInboundMeta.from ?? "") || lastOutbound?.toAddress || "",
      snippet: normalizeSnippet(
        lastInbound?.rawContent ||
          (typeof lastInboundMeta.snippet === "string" ? lastInboundMeta.snippet : "") ||
          lastOutbound?.bodyText,
      ),
      reason,
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

/** Attention: priority bucket then freshest inbound. Other lanes: freshest first. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    if (a.lane === "attention" && b.lane === "attention" && a.priority !== b.priority) {
      return a.priority - b.priority;
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
