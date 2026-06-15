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
}

export interface LaneCounts {
  attention: number;
  snoozed: number;
  done: number;
  handled: number;
  outbound: number;
}
