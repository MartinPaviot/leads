/**
 * POST /api/meetings/[id]/share-slack — post a meeting's summary + next steps to
 * the workspace Slack channel. Reuses the existing tenant settings.slackWebhookUrl
 * (set in Settings → Notifications, already used for deal/task notifications) — no
 * new integration, just a new use of the same incoming webhook.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, tenants } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)))
    .limit(1);
  if (!activity) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  const webhook = (tenant?.settings as Record<string, unknown> | null)?.slackWebhookUrl as string | undefined;
  if (!webhook || !/^https:\/\/hooks\.slack\.com\//.test(webhook)) {
    return Response.json({ error: "Connect Slack first in Settings → Notifications." }, { status: 400 });
  }

  const meta = (activity.metadata || {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notes = (meta.structuredNotes || {}) as any;
  const title = (meta.title as string) || activity.summary || "Meeting";
  const summary: string = notes.summary || activity.summary || "";
  const keyPoints: string[] = Array.isArray(notes.keyPoints) ? notes.keyPoints.slice(0, 6) : [];
  const nextSteps: string[] = Array.isArray(notes?.buyingSignals?.nextSteps)
    ? notes.buyingSignals.nextSteps.slice(0, 6)
    : [];

  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const lines: string[] = [`*Meeting summary — ${title}*`];
  if (summary) lines.push(summary);
  if (keyPoints.length) lines.push("", "*Key points*", ...keyPoints.map((p) => `• ${p}`));
  if (nextSteps.length) lines.push("", "*Next steps*", ...nextSteps.map((s) => `• ${s}`));
  lines.push("", `<${base}/meetings/${id}|View in Elevay>`);

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
    if (!res.ok) return Response.json({ error: "Slack rejected the message." }, { status: 502 });
  } catch {
    return Response.json({ error: "Couldn't reach Slack." }, { status: 502 });
  }

  // Stamp it so the UI can show "shared".
  await db
    .update(activities)
    .set({ metadata: { ...meta, slackSharedAt: new Date().toISOString() } })
    .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId)));

  return Response.json({ ok: true });
}
