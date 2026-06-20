import type { FollowupDue } from "@/lib/inbox/followup-due";

export type InboxLane = "attention" | "snoozed" | "done" | "handled";

/** Intention split (B3) — sub-segments the attention lane. */
export type BuiltInSplit = "needs_reply" | "follow_ups" | "promotions" | "social" | "other";

/** One of the user's connected mailboxes, for the unified-inbox rail. */
export interface MailboxSummary {
  id: string;
  address: string;
  label: string;
  /** Conversations needing attention in this box (its own backlog). */
  attention: number;
}

export interface ConversationListItem {
  key: string;
  lane: InboxLane;
  priority: number;
  subject: string;
  contactId: string | null;
  displayName: string;
  fromAddress: string;
  snippet: string;
  reason: string;
  /** Provenance of `reason` for the honest-badge tooltip (INBOX-T08). Null = no badge. */
  reasonSource: "reply" | "summary" | "sentiment" | "handled" | null;
  /** Hours overdue past the response SLA when awaiting our reply (INBOX-N04); null otherwise. */
  slaHoursOverdue: number | null;
  /** B7: gentle-follow-up due time on an awaiting-their-reply thread; null otherwise.
   *  SLA-exclusive — never set together with slaHoursOverdue. */
  followup: FollowupDue | null;
  /** Whether the user starred this conversation (Upstream is:starred). */
  starred: boolean;
  /** Unread = never opened, or a newer message arrived since (Upstream unread dot + bold). */
  unread: boolean;
  /** Importance tier 1–4 (1 hottest) that sorts the attention lane + cited factors (INBOX-T04). */
  importanceTier: 1 | 2 | 3 | 4;
  importanceFactors: string[];
  /** Labels applied by the user's deterministic filters (INBOX-T02). */
  labels: string[];
  handledNote: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  hasIntelligence: boolean;
  /** Intention split this conversation resolves to (B3). */
  split: BuiltInSplit;
  /** Cold/automated/newsletter mail (B4) — floored in importance. */
  noise: boolean;
  // Which of the user's connected mailboxes this conversation belongs to.
  // Null when it can't be attributed (e.g. legacy rows). Drives the
  // per-mailbox filter + the "received on X" chip in the unified inbox.
  mailboxId: string | null;
  mailboxAddress: string | null;
  mailboxLabel: string | null;
}

export interface ConversationMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Sanitized HTML body for fidelity rendering (INBOX-R01). Null ⇒ render text. */
  bodyHtml: string | null;
  /** Raw .ics of an inbound meeting invite (INBOX-R12/CAL) — drives the event card. */
  calendar: string | null;
  /** Attachment metadata (INBOX-R04) — filename/type/size/inline for the pane strip. */
  attachments?: Array<{ filename: string; contentType: string; size: number; inline: boolean }>;
  /** Sender domain-auth verdict (INBOX-R06): pass → verified badge, fail → caution. */
  senderVerified: "pass" | "fail" | "unknown";
  at: string | null;
  status: string | null;
  stepNumber: number | null;
}

export interface ThreadIntelligenceView {
  signals?: Array<{ type: string; evidence: string; confidence: number }>;
  competitors?: string[];
  sentiment?: string;
  sentimentTrend?: string;
  objections?: Array<{ category: string; summary: string; status: string }>;
  nextSteps?: string[];
  urgencyLevel?: string;
}

export interface ConversationDetail {
  conversation: ConversationListItem & {
    messages: ConversationMessage[];
    intelligence: ThreadIntelligenceView | null;
    /** B1: whether this thread warrants an AI draft offer (pure selectivity, reply-worthy.ts).
        Gates the Generate-draft affordance + Cmd/Ctrl+J + auto-draft-on-open. */
    replyWorthy: boolean;
  };
  contact: { id: string; name: string; email: string | null } | null;
  enrollment: { id: string; sequenceId: string; sequenceName: string; status: string } | null;
  preparedDraft: { id: string; subject: string; body: string } | null;
  /** Suggested next action by deal stage + situation (INBOX-G05). Null = nothing sharp to suggest. */
  nextAction: { action: string; why: string; stage: string | null } | null;
  /** The contact's most recent real interaction of any channel (INBOX-G03). */
  lastInteraction: { at: string; type: string } | null;
  /** Deterministic action items pulled from the inbound text (INBOX-S04). */
  actionItems: Array<{ text: string; due: string | null }>;
  /** High-signal entities mentioned in the thread (INBOX-S05). */
  entities: { amounts: string[]; dates: string[]; phones: string[] };
  /** Fresh company-level GTM signals — hiring/funding/etc., past-shelf-life dropped (INBOX-G04). */
  freshSignals?: Array<{ type: string; title: string; description: string }>;
}

/** Human label for where the badge text came from (INBOX-T08). Undefined = no tooltip. */
export function reasonTooltip(
  source: ConversationListItem["reasonSource"],
): string | undefined {
  switch (source) {
    case "reply":
      return "Reply to your outreach";
    case "summary":
      return "AI summary";
    case "sentiment":
      return "Reply sentiment";
    case "handled":
      return "Handled automatically";
    default:
      return undefined;
  }
}

export interface SplitCount {
  id: string;
  name: string;
  count: number;
}

export interface LaneCounts {
  attention: number;
  snoozed: number;
  done: number;
  handled: number;
  outbound: number;
}
