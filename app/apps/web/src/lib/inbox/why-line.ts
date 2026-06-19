/**
 * "Why this matters" rationale composer (INBOX-S09 core). Pure + unit-tested.
 *
 * Builds the one-line, grounded, cited rationale shown on a conversation —
 * "Reply to your sequence · asked about pricing", "Open deal (Proposal) · no
 * reply in 6 days", "Automated sender — no reply needed". Deterministic: it only
 * states signals it was given, NEVER the sales taxonomy on non-sequence mail and
 * NEVER the bare "Replied" fallback (supersedes it, per INBOX-T08). No grounded
 * signal + no summary ⇒ empty (never fabricated). Returns the citations that
 * produced it for the auditable tooltip.
 */

const INTENT_FRIENDLY: Record<string, string> = {
  meeting_request: "wants to meet",
  demo_request: "asked for a demo",
  calendar_scheduling: "scheduling a time",
  interested: "interested",
  pricing_inquiry: "asked about pricing",
  budget_mention: "mentioned budget",
  question: "asked a question",
  timeline_mention: "mentioned a timeline",
  referral: "made a referral",
  objection: "raised an objection",
  objection_price: "objection: pricing",
};

export interface WhyInput {
  lane: "attention" | "handled" | "snoozed" | "done";
  handledNote?: string | null;
  /** The conversation is a matched reply to one of our outbound emails. */
  isSequenceReply?: boolean;
  intentLabel?: string | null;
  /** Open deal stage label, e.g. "Proposal". */
  openDealStage?: string | null;
  /** Days since our last outbound with no reply. */
  noReplyDays?: number | null;
  /** Neutral per-message summary (INBOX-S02), used when no GTM signal applies. */
  aiSummaryLine?: string | null;
}

export interface WhyLine {
  text: string;
  citations: string[];
}

export function composeWhyLine(i: WhyInput): WhyLine {
  if (i.lane === "handled") {
    return { text: i.handledNote ?? "Handled — no action needed", citations: ["lane"] };
  }

  const parts: string[] = [];
  const citations: string[] = [];

  if (i.isSequenceReply) {
    parts.push("Reply to your sequence");
    citations.push("outbound");
    const friendly = i.intentLabel ? INTENT_FRIENDLY[i.intentLabel] : undefined;
    if (friendly) {
      parts.push(friendly);
      citations.push("intent");
    }
  }
  if (i.openDealStage) {
    parts.push(`Open deal (${i.openDealStage})`);
    citations.push("deal");
  }
  if (i.noReplyDays != null && i.noReplyDays > 0) {
    parts.push(`no reply in ${i.noReplyDays} day${i.noReplyDays === 1 ? "" : "s"}`);
    citations.push("last-interaction");
  }

  if (parts.length === 0) {
    // No grounded GTM signal — fall back to the neutral summary, else empty.
    if (i.aiSummaryLine) return { text: i.aiSummaryLine, citations: ["summary"] };
    return { text: "", citations: [] };
  }

  return { text: parts.join(" · "), citations };
}
