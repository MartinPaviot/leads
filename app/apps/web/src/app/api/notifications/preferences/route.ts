import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { notificationPreferences, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/notifications/preferences
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user notification preferences AND the tenant-level Slack webhook. The
  // webhook lives on tenants.settings.slackWebhookUrl (PUT persists it there),
  // NOT on the per-user preferences row — GET previously omitted it, so the
  // /settings/notifications webhook input + "Connected" badge rehydrated blank on
  // every reload. Read both so the saved webhook round-trips.
  const [[prefs], [tenantRow]] = await Promise.all([
    db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, authCtx.appUserId))
      .limit(1),
    db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, authCtx.tenantId))
      .limit(1),
  ]);

  const slackWebhook =
    ((tenantRow?.settings as Record<string, unknown> | null)?.slackWebhookUrl as
      | string
      | null) ?? null;

  if (!prefs) {
    // Return defaults
    return Response.json({
      emailEnabled: true,
      inAppEnabled: true,
      preferences: {
        deal_risk: { email: true, inApp: true },
        deal_won: { email: true, inApp: true },
        deal_lost: { email: true, inApp: true },
        enrichment_done: { email: false, inApp: true },
        sequence_reply: { email: true, inApp: true },
        task_due: { email: true, inApp: true },
        task_assigned: { email: true, inApp: true },
        meeting_upcoming: { email: true, inApp: true },
        new_contact: { email: false, inApp: true },
        system: { email: true, inApp: true },
      },
      slackWebhook,
    });
  }

  return Response.json({
    emailEnabled: prefs.emailEnabled,
    inAppEnabled: prefs.inAppEnabled,
    preferences: prefs.preferences,
    slackWebhook,
  });
}

// PUT /api/notifications/preferences
export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { emailEnabled, inAppEnabled, preferences, slackWebhook } = body;

  // Store Slack webhook URL in tenant settings (workspace-level)
  if (slackWebhook !== undefined) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, authCtx.tenantId)).limit(1);
    if (tenant) {
      const settings = (tenant.settings || {}) as Record<string, unknown>;
      await db.update(tenants).set({
        settings: { ...settings, slackWebhookUrl: slackWebhook || null },
        updatedAt: new Date(),
      }).where(eq(tenants.id, authCtx.tenantId));
    }
  }

  // Upsert preferences
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, authCtx.appUserId))
    .limit(1);

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({
        emailEnabled: emailEnabled ?? existing.emailEnabled,
        inAppEnabled: inAppEnabled ?? existing.inAppEnabled,
        preferences: preferences ?? existing.preferences,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.id, existing.id));
  } else {
    await db.insert(notificationPreferences).values({
      userId: authCtx.appUserId,
      tenantId: authCtx.tenantId,
      emailEnabled: emailEnabled ?? true,
      inAppEnabled: inAppEnabled ?? true,
      preferences: preferences ?? {},
    });
  }

  return Response.json({ success: true });
}
