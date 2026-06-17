export type InboxLane = "attention" | "snoozed" | "done" | "handled";

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
  };
  contact: { id: string; name: string; email: string | null } | null;
  enrollment: { id: string; sequenceId: string; sequenceName: string; status: string } | null;
  preparedDraft: { id: string; subject: string; body: string } | null;
  /** Suggested next action by deal stage + situation (INBOX-G05). Null = nothing sharp to suggest. */
  nextAction: { action: string; why: string; stage: string | null } | null;
  /** The contact's most recent real interaction of any channel (INBOX-G03). */
  lastInteraction: { at: string; type: string } | null;
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

export interface LaneCounts {
  attention: number;
  snoozed: number;
  done: number;
  handled: number;
  outbound: number;
}
