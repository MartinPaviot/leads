/**
 * Spec 28 (AC2) — Slack hot-lead notifications. Formats context + a link and
 * posts via the injected Slack client, idempotent per hot-lead id so a duplicate
 * hot-lead event posts once. Blast radius: notify/slack/* only.
 */

export interface HotLead {
  id: string;
  contactId: string;
  contactName?: string;
  company?: string;
  replyText?: string;
  sentiment?: string;
  /** Deep link into the app for the rep. */
  link: string;
}

export interface SlackClient {
  postMessage(channel: string, text: string): Promise<{ ts: string }>;
}

export interface SlackIdempotencyStore {
  has(id: string): Promise<boolean>;
  add(id: string): Promise<void>;
}

export interface NotifyDeps {
  slack: SlackClient;
  channel: string;
  idempotency: SlackIdempotencyStore;
}

/** Human-readable hot-lead message with context + link. */
export function formatHotLeadMessage(lead: HotLead): string {
  const who = [lead.contactName, lead.company].filter(Boolean).join(" @ ") || lead.contactId;
  const snippet = lead.replyText ? `\n> ${lead.replyText.slice(0, 200)}` : "";
  return `🔥 Hot lead: ${who}${lead.sentiment ? ` (${lead.sentiment})` : ""}${snippet}\n${lead.link}`;
}

export interface NotifyResult {
  posted: boolean;
  deduped?: boolean;
  ts?: string;
}

/** Post a hot-lead notification once. A repeat id is a no-op. */
export async function notifySlack(lead: HotLead, deps: NotifyDeps): Promise<NotifyResult> {
  if (await deps.idempotency.has(lead.id)) return { posted: false, deduped: true };
  const res = await deps.slack.postMessage(deps.channel, formatHotLeadMessage(lead));
  await deps.idempotency.add(lead.id);
  return { posted: true, ts: res.ts };
}
