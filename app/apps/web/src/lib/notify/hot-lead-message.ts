/**
 * Spec 28 (A5) — format a positive-reply "hot lead" into an in-app + Slack
 * notification (delivered via the live `notifyTenant` path). Pure copy helper, so
 * the message is unit-tested independently of the reply-handler wiring.
 *
 * No emoji: this string is rendered in the in-app notifications UI
 * (feedback_no-emoji-in-ui is load-bearing) — distinct from the unwired spec-28
 * `formatHotLeadMessage`, which is Slack-mrkdwn-only.
 */

export interface HotLeadNotificationInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  title?: string | null;
  company?: string | null;
  /** processReply classification, e.g. "interested" | "meeting_request". */
  classification: string;
  replyText?: string | null;
  reason?: string | null;
}

const REPLY_SNIPPET_MAX = 240;

export function buildHotLeadNotification(input: HotLeadNotificationInput): { title: string; body: string } {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim()
    || input.email?.trim()
    || "A prospect";
  const at = input.company ? ` at ${input.company}` : "";
  const role = input.title ? `, ${input.title}` : "";
  const kind = input.classification === "meeting_request" ? "requested a meeting" : "replied — interested";

  const snippet = input.replyText?.trim() ? `\n"${input.replyText.trim().slice(0, REPLY_SNIPPET_MAX)}"` : "";
  const why = input.reason?.trim() ? `\n${input.reason.trim()}` : "";

  return {
    title: `Hot lead — ${name}${at} ${kind}`,
    body: `${name}${role}${at}${snippet}${why}`.trim(),
  };
}
