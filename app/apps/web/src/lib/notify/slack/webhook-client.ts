/**
 * Spec 28 — env-gated Slack webhook delivery. The pure notifySlack (./notify)
 * takes an injected SlackClient; this is the real driver: a POST to
 * SLACK_WEBHOOK_URL. When the env var is absent the delivery is a no-op, so the
 * call sites (system alerts, optimizer proposals) stay safe with zero config —
 * Slack lights up the moment the founder sets the webhook. Best-effort: a Slack
 * outage never fails the caller (in-app notification is the source of truth).
 *
 * Per-tenant channel routing is a follow-up; v1 posts to the single configured
 * workspace webhook (the founder's channel).
 */

/** Whether a Slack webhook is configured. */
export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

export interface PostSlackOptions {
  /** Override the webhook URL (tests). Defaults to SLACK_WEBHOOK_URL. */
  url?: string;
  /** Injected fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Post a plain-text message to the configured Slack webhook. Returns true on a
 * 2xx, false when not configured or on any error (never throws).
 */
export async function postSlackWebhook(text: string, opts: PostSlackOptions = {}): Promise<boolean> {
  const url = opts.url ?? process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
