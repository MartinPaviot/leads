import { db } from "@/db";
import { notifications, notificationPreferences, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// From address — use Resend's test domain until custom domain verified
const FROM_ADDRESS = "Elevay <notifications@resend.dev>";

export type NotificationType =
  | "deal_risk"
  | "deal_won"
  | "deal_lost"
  | "enrichment_done"
  | "sequence_reply"
  | "task_due"
  | "task_assigned"
  | "meeting_upcoming"
  | "new_contact"
  | "system";

interface SendNotificationParams {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

export async function sendNotification(params: SendNotificationParams) {
  const { tenantId, userId, type, title, body, entityType, entityId } = params;

  // Check user preferences
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  const typePrefs = (prefs?.preferences as Record<string, { email?: boolean; inApp?: boolean }> | null)?.[type];
  const shouldEmail = prefs?.emailEnabled !== false && typePrefs?.email !== false;
  const shouldInApp = prefs?.inAppEnabled !== false && typePrefs?.inApp !== false;

  let emailSent = false;

  // Create in-app notification
  if (shouldInApp) {
    await db.insert(notifications).values({
      tenantId,
      userId,
      type,
      title,
      body,
      entityType,
      entityId,
      emailSent: false,
    });
  }

  // Send email notification
  if (shouldEmail && resend) {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.email) {
        const { error } = await resend.emails.send({
          from: FROM_ADDRESS,
          to: [user.email],
          subject: title,
          html: buildEmailHtml(title, body || "", type, entityType, entityId),
        });

        if (error) {
          console.warn("Resend email failed:", error);
        } else {
          emailSent = true;
          // Update the notification record
          if (shouldInApp) {
            // Mark the most recent notification as email sent
            const [latest] = await db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, userId),
                  eq(notifications.type, type)
                )
              )
              .orderBy(desc(notifications.createdAt))
              .limit(1);
            if (latest) {
              await db
                .update(notifications)
                .set({ emailSent: true })
                .where(eq(notifications.id, latest.id));
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to send email notification:", err);
    }
  }

  // Send Slack webhook notification (3rd channel)
  const slackPrefs = typePrefs as { slack?: boolean } | undefined;
  if (slackPrefs?.slack !== false) {
    try {
      // Slack webhook URL stored in tenant settings
      const { tenants: tenantsTable } = await import("@/db/schema");
      const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
      const settings = (tenant?.settings || {}) as Record<string, unknown>;
      const slackWebhook = settings.slackWebhookUrl as string | undefined;

      if (slackWebhook) {
        const emoji = type === "deal_won" ? ":trophy:" : type === "deal_risk" ? ":warning:" : type === "task_due" ? ":alarm_clock:" : ":bell:";
        await fetch(slackWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `${emoji} *${title}*\n${body || ""}`,
            unfurl_links: false,
          }),
        });
      }
    } catch {
      // Non-critical Slack failure
    }
  }

  return { inApp: shouldInApp, emailSent };
}

function buildEmailHtml(
  title: string,
  body: string,
  type: string,
  entityType?: string,
  entityId?: string
): string {
  const appUrl = process.env.NEXTAUTH_URL || "https://app.elevay.com";
  let ctaUrl = appUrl;
  if (entityType && entityId) {
    const typeMap: Record<string, string> = {
      contact: "contacts",
      company: "accounts",
      deal: "deals",
      task: "tasks",
    };
    const path = typeMap[entityType] || entityType;
    ctaUrl = `${appUrl}/${path}/${entityId}`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#09090b;padding:20px 24px;">
              <span style="color:#ffffff;font-size:16px;font-weight:600;">Elevay</span>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px;font-size:18px;color:#09090b;">${escapeHtml(title)}</h2>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52525b;">${escapeHtml(body)}</p>
              <a href="${ctaUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">
                View in Elevay
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">
                You're receiving this because you have ${type.replace(/_/g, " ")} notifications enabled.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
