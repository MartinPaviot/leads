/**
 * Spec 28 (notify half, in-app) — deliver system alerts to a tenant's recipients
 * as in-app notifications. The analytics cluster (spec-32 regression alerts,
 * spec-31 optimizer proposals) persists its findings but, until now, only
 * console.warn'd them — nobody was actually told. In-app is the always-on,
 * key-free path; Slack is layered on env-gated (SLACK_WEBHOOK_URL) and best-effort.
 * HubSpot/CRM sync is the separate spec-28 half. Reuses the existing notifications
 * table + the admin-preferred recipient resolver. Pure copy helpers are
 * unit-tested; the insert is exercised against a stub db.
 */

import { db as defaultDb } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveTenantRecipients } from "@/lib/notifications/resolve-recipients";
import { isSlackConfigured, postSlackWebhook } from "@/lib/notify/slack/webhook-client";
import type { Alert } from "@/lib/analytics/alerts/alerts";

export interface NotifyPayload {
  title: string;
  body: string;
}

export interface NotifyResult {
  delivered: number;
  source: "admin" | "all_users" | "none";
  /** Whether the message also went to Slack (env-gated; false when no webhook). */
  slack: boolean;
}

/**
 * Deliver a system notification to a tenant: one `system` in-app notification per
 * resolved recipient (admin-preferred, all-users fallback) AND — when a Slack
 * webhook is configured — a Slack post. Slack is independent of in-app recipients
 * (it targets the founder's channel) and best-effort (a Slack outage never fails
 * the caller). A tenant with no users still posts to Slack but writes no in-app row.
 */
export async function notifyTenant(
  tenantId: string,
  payload: NotifyPayload,
  opts: { database?: typeof defaultDb } = {},
): Promise<NotifyResult> {
  const database = opts.database ?? defaultDb;

  // Slack (env-gated, best-effort) — independent of in-app recipients. `*..*` is
  // Slack mrkdwn bold, not an emoji.
  const slack = isSlackConfigured()
    ? await postSlackWebhook(`*${payload.title}*\n${payload.body}`).catch(() => false)
    : false;

  const recipients = await resolveTenantRecipients({
    tenantId,
    deps: {
      findTenantUsers: (tid) =>
        database.select({ id: users.id, role: users.role }).from(users).where(eq(users.tenantId, tid)),
    },
  });
  if (recipients.userIds.length === 0) return { delivered: 0, source: "none", slack };

  await database.insert(notifications).values(
    recipients.userIds.map((uid) => ({
      tenantId,
      userId: uid,
      type: "system" as const,
      title: payload.title,
      body: payload.body,
      entityType: null,
      entityId: null,
    })),
  );
  return { delivered: recipients.userIds.length, source: recipients.source, slack };
}

// ── copy helpers (pure) ──

/** One-line notification for a firing regression alert (spec 32). */
export function regressionAlertCopy(alert: Alert): NotifyPayload {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const worse = `${(alert.magnitude * 100).toFixed(0)}%`;
  return {
    title: `Deliverability regression: ${alert.metric} on ${alert.scope}`,
    body:
      `${alert.metric} is ${pct(alert.current)} vs a baseline of ${pct(alert.baseline)} (${worse} worse). ` +
      `Cause: ${alert.cause}. This was routed to ${alert.route}.`,
  };
}

/** One-line notification summarizing the weekly optimizer's new proposals (spec 31). */
export function optimizerProposalsCopy(count: number, week: string): NotifyPayload {
  return {
    title: `${count} optimization ${count === 1 ? "proposal" : "proposals"} ready for review`,
    body: `The weekly review (${week}) produced ${count} metric-grounded ${count === 1 ? "proposal" : "proposals"} awaiting your approval.`,
  };
}
