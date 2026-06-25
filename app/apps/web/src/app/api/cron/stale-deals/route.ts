import { db } from "@/db";
import { activities, deals, notifications, tenants, contacts, companies, users, outboundEmails } from "@/db/schema";
import { eq, and, desc, sql, or, ne, isNull } from "drizzle-orm";
import { getOwnerMailbox } from "@/lib/integrations/owner-mailbox";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import { verifyCronRequest } from "@/lib/auth/cron-auth";
import { isFeatureEnabled } from "@/lib/config/feature-gate";

const revivalEmailSchema = z.object({
  subject: z.string().describe("Short, personal email subject line"),
  bodyHtml: z.string().describe("Brief HTML email body — warm, personal, no hard sell"),
  bodyText: z.string().describe("Plain text version of the email"),
});

/**
 * Stale Deal Detection — finds deals with no recent activity
 * that had positive signals, and creates notifications.
 *
 * Run as cron every 24h or on-demand.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  if (!isFeatureEnabled(process.env.STALE_DEALS_ENABLED)) {
    return Response.json({ skipped: "STALE_DEALS_ENABLED=off" });
  }

  try {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    const results = [];

    for (const tenant of allTenants) {
      const result = await detectStaleDealsByTenant(tenant.id);
      results.push({ tenantId: tenant.id, ...result });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

// Also support POST for on-demand trigger with auth
export async function POST() {
  const { getAuthContext } = await import("@/lib/auth/auth-utils");
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await detectStaleDealsByTenant(authCtx.tenantId);
  return Response.json(result);
}

async function detectStaleDealsByTenant(tenantId: string) {
  // Get all active deals (not won/lost)
  const activeDeals = await db.select().from(deals)
    .where(and(
      eq(deals.tenantId, tenantId),
      ne(deals.stage, "won"),
      ne(deals.stage, "lost"),
      isNull(deals.deletedAt),
    ));

  if (activeDeals.length === 0) return { staleDeals: 0, notificationsCreated: 0 };

  const staleDeals: Array<{
    dealId: string;
    dealName: string;
    stage: string | null;
    daysSinceLastActivity: number;
    lastActivityType: string | null;
    lastActivityDate: Date | null;
    companyName: string | null;
    contactName: string | null;
  }> = [];

  for (const deal of activeDeals) {
    // Get last activity for this deal or its related contact
    const conditions = [
      eq(activities.tenantId, tenantId),
      isNull(activities.deletedAt),
      or(
        and(eq(activities.entityType, "deal"), eq(activities.entityId, deal.id)),
        ...(deal.contactId ? [and(eq(activities.entityType, "contact"), eq(activities.entityId, deal.contactId))] : []),
      )!,
    ];

    const [lastActivity] = await db.select({
      activityType: activities.activityType,
      occurredAt: activities.occurredAt,
    }).from(activities)
      .where(and(...conditions))
      .orderBy(desc(activities.occurredAt))
      .limit(1);

    const lastDate = lastActivity?.occurredAt;
    const daysSince = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Stale = no activity for 7+ days in active pipeline stages
    const staleThreshold = deal.stage === "lead" ? 14 : 7;

    if (daysSince >= staleThreshold) {
      // Get company and contact names for the notification
      let companyName: string | null = null;
      let contactName: string | null = null;

      if (deal.companyId) {
        const [company] = await db.select({ name: companies.name }).from(companies)
          .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt))).limit(1);
        companyName = company?.name || null;
      }
      if (deal.contactId) {
        const [contact] = await db.select({ firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts).where(and(eq(contacts.id, deal.contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt))).limit(1);
        contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null;
      }

      staleDeals.push({
        dealId: deal.id,
        dealName: deal.name,
        stage: deal.stage,
        daysSinceLastActivity: daysSince,
        lastActivityType: lastActivity?.activityType || null,
        lastActivityDate: lastDate || null,
        companyName,
        contactName,
      });
    }
  }

  // Get all users in this tenant for notifications
  const tenantUsers = await db.select({ id: users.id }).from(users)
    .where(eq(users.tenantId, tenantId));

  // Create notifications for stale deals
  let notificationsCreated = 0;
  for (const staleDeal of staleDeals) {
    // Check if we already sent a notification for this deal recently (within 3 days)
    const existingNotification = await db.select({ id: notifications.id, createdAt: notifications.createdAt }).from(notifications)
      .where(and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.type, "deal_risk"),
        eq(notifications.entityId, staleDeal.dealId),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (existingNotification.length > 0) {
      const notifDate = new Date(existingNotification[0].createdAt || 0);
      const daysSinceNotif = Math.floor((Date.now() - notifDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceNotif < 3) continue; // Already notified recently
    }

    // Send notification to each user in the tenant
    for (const user of tenantUsers) {
      await db.insert(notifications).values({
        tenantId,
        userId: user.id,
        type: "deal_risk",
        title: `Deal going stale: ${staleDeal.dealName}`,
        body: `No activity for ${staleDeal.daysSinceLastActivity} days${staleDeal.companyName ? ` with ${staleDeal.companyName}` : ""}. Stage: ${staleDeal.stage || "unknown"}${staleDeal.contactName ? `. Contact: ${staleDeal.contactName}` : ""}.`,
        entityType: "deal",
        entityId: staleDeal.dealId,
      });
    }
    notificationsCreated++;
  }

  // Auto-draft revival emails for deals stale 14+ days with a contact
  let revivalEmailsQueued = 0;
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (model) {
    for (const staleDeal of staleDeals) {
      if (staleDeal.daysSinceLastActivity < 14) continue;

      // Need a contact with an email to send to
      const deal = activeDeals.find((d) => d.id === staleDeal.dealId);
      if (!deal?.contactId) continue;

      const [contact] = await db.select().from(contacts)
        .where(and(eq(contacts.id, deal.contactId), eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt))).limit(1);
      if (!contact?.email) continue;

      // Personal mailboxes: send the revival from the DEAL OWNER's mailbox,
      // never a colleague's. Skip when the owner has no active mailbox.
      const mailbox = await getOwnerMailbox(tenantId, deal.ownerId);
      if (!mailbox) continue;

      try {
        const contactFirstName = contact.firstName || "there";
        const { object: email } = await tracedGenerateObject({
          model,
          schema: revivalEmailSchema,
          prompt: `Draft a short, warm revival email for a stale sales deal. The goal is to re-engage without pressure.

DEAL CONTEXT:
- Deal: ${staleDeal.dealName}
- Contact: ${contactFirstName}${contact.lastName ? ` ${contact.lastName}` : ""}
- Company: ${staleDeal.companyName || "their company"}
- Stage when it went quiet: ${staleDeal.stage || "unknown"}
- Days since last activity: ${staleDeal.daysSinceLastActivity}
- Last activity: ${staleDeal.lastActivityType || "unknown"}

<examples>
<example>
CONTEXT: Deal "Platform Migration" with Sarah at Meridian Labs, 16 days stale, stage: proposal, last activity: email_sent
Subject: quick check-in on the migration
Body (HTML): <p>Sarah,</p><p>I realized we left the platform migration conversation mid-stream a couple of weeks ago. Completely understand if priorities shifted — that happens.</p><p>If the timing is better now, I'm happy to pick up where we left off. If not, no worries at all — just let me know and I'll follow up when it makes more sense.</p>
Body (text): Sarah,\n\nI realized we left the platform migration conversation mid-stream a couple of weeks ago. Completely understand if priorities shifted — that happens.\n\nIf the timing is better now, I'm happy to pick up where we left off. If not, no worries at all — just let me know and I'll follow up when it makes more sense.
</example>
<example>
CONTEXT: Deal "Security Audit" with Marc at TechFlow, 21 days stale, stage: demo, last activity: meeting_completed
Subject: after our demo
Body (HTML): <p>Marc,</p><p>It's been a few weeks since our security audit demo. I wanted to share a quick update — we just shipped the compliance dashboard feature that came up during our conversation.</p><p>Worth a 15-minute look if security tooling is still on the roadmap for Q2?</p>
Body (text): Marc,\n\nIt's been a few weeks since our security audit demo. I wanted to share a quick update — we just shipped the compliance dashboard feature that came up during our conversation.\n\nWorth a 15-minute look if security tooling is still on the roadmap for Q2?
</example>
</examples>

RULES:
- 3-4 sentences maximum — brevity is respect
- Use ${contactFirstName}'s first name naturally
- Reference the deal context (stage, last interaction) without being robotic
- End with a soft, binary question (easy to reply yes/no) — not "let me know your thoughts"
- Never use: "just checking in", "touching base", "I hope this finds you well", "circling back"
- Tone: warm, confident, zero desperation
- Subject: under 50 characters, lowercase ok, specific to the deal`,
          _trace: { agentId: "deal-analyze", tenantId, inputPreview: `Revival email for stale deal: ${staleDeal.dealName}` },
        });

        // Insert as queued outbound email
        await db.insert(outboundEmails).values({
          tenantId,
          contactId: deal.contactId,
          mailboxId: mailbox.id,
          fromAddress: mailbox.emailAddress,
          toAddress: contact.email,
          subject: email.subject,
          bodyHtml: email.bodyHtml,
          bodyText: email.bodyText,
          status: "queued",
          queuedAt: new Date(),
        });

        // Log an activity entry for the revival email
        await db.insert(activities).values({
          tenantId,
          actorType: "system",
          entityType: "deal",
          entityId: deal.id,
          activityType: "email_sent",
          channel: "email",
          direction: "outbound",
          summary: `Revival email queued for ${contact.email}: "${email.subject}"`,
          occurredAt: new Date(),
        });

        revivalEmailsQueued++;
      } catch (err) {
        console.warn(`Failed to draft revival email for deal ${staleDeal.dealId}:`, err);
      }
    }
  }

  return {
    activeDeals: activeDeals.length,
    staleDeals: staleDeals.length,
    notificationsCreated,
    revivalEmailsQueued,
    details: staleDeals,
  };
}
