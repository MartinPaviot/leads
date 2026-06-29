/**
 * Meeting recording opt-out endpoint.
 *
 * Attendees receive a signed link in the pre-meeting notification.
 * Clicking it records their opt-out so the bot will not join
 * that meeting. The token is HMAC-signed to prevent spoofing.
 *
 * GET /api/meetings/opt-out?token=...&meetingId=...&email=...
 *
 * No authentication required — the signed token IS the auth.
 */

import { db } from "@/db";
import { meetingOptOuts, activities } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { verifyOptOutToken } from "@/lib/recording/opt-out-token";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const meetingId = url.searchParams.get("meetingId");
  const email = url.searchParams.get("email");

  if (!token || !meetingId || !email) {
    return new Response(renderHtml(
      "Invalid link",
      "This opt-out link is missing required parameters. Please use the link from your notification email."
    ), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Verify the HMAC token
  const valid = verifyOptOutToken(token, meetingId, email.toLowerCase().trim());
  if (!valid) {
    return new Response(renderHtml(
      "Invalid token",
      "This opt-out link has an invalid or expired signature. Please use the original link from your notification."
    ), { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Look up the activity to get the tenant ID
  const [activity] = await db
    .select({ id: activities.id, tenantId: activities.tenantId, summary: activities.summary })
    .from(activities)
    .where(and(eq(activities.id, meetingId), isNull(activities.deletedAt)))
    .limit(1);

  if (!activity) {
    return new Response(renderHtml(
      "Meeting not found",
      "This meeting could not be found. It may have been cancelled or removed."
    ), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Record the opt-out (upsert — clicking twice is fine)
  try {
    await db
      .insert(meetingOptOuts)
      .values({
        tenantId: activity.tenantId,
        activityId: meetingId,
        attendeeEmail: email.toLowerCase().trim(),
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[opt-out] Failed to record opt-out:", err);
    return new Response(renderHtml(
      "Something went wrong",
      "We could not record your preference. Please try again or contact the meeting organizer."
    ), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const meetingName = activity.summary || "the upcoming meeting";

  return new Response(renderHtml(
    "Recording opt-out confirmed",
    `You have opted out of recording for "${meetingName}". The meeting assistant will not join this meeting. You can close this page.`
  ), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function renderHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Elevay</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#fff; border-radius:12px; padding:32px; max-width:480px; width:90%; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .logo { font-size:18px; font-weight:700; color:#09090b; margin-bottom:24px; }
    h1 { font-size:20px; color:#09090b; margin:0 0 12px; }
    p { font-size:14px; line-height:1.6; color:#52525b; margin:0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Elevay</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
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
