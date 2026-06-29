import { db } from "@/db";
import { notifications, notificationPreferences, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { Resend } from "resend";
import { EMAIL_FROM } from "./from";
import { renderBrandedEmail, getBrandedEmailAttachments, escapeHtml } from "./email-shell";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

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
        const { html, text } = buildEmailParts(
          title,
          body || "",
          type,
          entityType,
          entityId
        );
        const { error } = await resend.emails.send({
          from: EMAIL_FROM,
          to: [user.email],
          subject: title,
          html,
          text,
          attachments: getBrandedEmailAttachments(),
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

function buildEmailParts(
  title: string,
  body: string,
  type: string,
  entityType?: string,
  entityId?: string
): { html: string; text: string } {
  const appUrl = process.env.NEXTAUTH_URL || "https://www.elevay.dev";
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

  // Same branded shell as every other no-reply email (invite, verify, etc.).
  const html = renderBrandedEmail({
    preheader: body || title,
    heading: title,
    bodyHtml: body
      ? `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">${escapeHtml(body)}</p>`
      : "",
    button: { label: "View in Elevay", url: ctaUrl },
    footnoteHtml: `You're receiving this because you have ${escapeHtml(
      type.replace(/_/g, " ")
    )} notifications enabled.`,
  });

  const text = `${title}${body ? `\n\n${body}` : ""}\n\nView in Elevay: ${ctaUrl}`;

  return { html, text };
}
