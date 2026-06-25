/**
 * GET /api/calls/[id]/recording
 *
 * Authenticated, tenant-scoped proxy for a call's audio recording. The raw
 * Twilio media URL requires HTTP basic auth (account SID + auth token), so we
 * never hand it to the browser — the dashboard player points here, we
 * authenticate the tenant, then stream Twilio's bytes through.
 *
 * Returns 404 when the call isn't this tenant's, was never recorded, or the
 * audio has already been purged by the 90-day retention job (the row's
 * `recordingUrl` is nulled on purge). Range requests are forwarded so the
 * <audio> element can seek.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;

    const [row] = await db
      .select({ recordingUrl: calls.recordingUrl })
      .from(calls)
      .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!row) {
      return new Response("Not found", { status: 404 });
    }
    if (!row.recordingUrl) {
      // Never captured, or purged by retention — nothing to stream.
      return new Response("No recording", { status: 404 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return new Response("Voice not configured", { status: 503 });
    }

    // Normalise to the mp3 rendering (Twilio's RecordingUrl is extensionless).
    const mediaUrl = `${row.recordingUrl.replace(/\.(mp3|wav)$/i, "")}.mp3`;
    const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

    const range = req.headers.get("range");
    const upstream = await fetch(mediaUrl, {
      headers: {
        Authorization: authHeader,
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      // 404 at Twilio (purged/expired) → 404; everything else → 502.
      return new Response("Recording unavailable", {
        status: upstream.status === 404 ? 404 : 502,
      });
    }

    const headers = new Headers();
    headers.set("content-type", upstream.headers.get("content-type") ?? "audio/mpeg");
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=60");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("content-length", len);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);

    return new Response(upstream.body, { status: upstream.status, headers });
  });
}
