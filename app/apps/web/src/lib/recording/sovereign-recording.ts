/**
 * Sovereign meeting recording — shared, pure helpers.
 *
 * The recorder for a sovereign Jitsi visio must itself be sovereign: a
 * self-hosted Jibri records the room and POSTs to /api/webhooks/jibri, which
 * feeds the EXISTING meeting-intel pipeline. This module holds the flag, the
 * "is this our Jitsi host" check, the webhook signature verifier and the
 * payload schema — all pure so they unit-test without I/O.
 *
 * See _specs/sovereign-recording. Off by default: the app is inert until the
 * Jibri + Whisper infrastructure exists (SOVEREIGN_RECORDING_ENABLED=true).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// NODE_ENV (a declared NodeJS.ProcessEnv member) lets `= process.env` satisfy
// this otherwise all-optional type while tests can pass plain objects.
type FlagEnv = { SOVEREIGN_RECORDING_ENABLED?: string; NODE_ENV?: string };

export function isSovereignRecordingEnabled(env: FlagEnv = process.env): boolean {
  return env.SOVEREIGN_RECORDING_ENABLED === "true";
}

/**
 * Does this join URL live on our sovereign Jitsi host (VIDEO_MEET_BASE_URL)?
 * Used to suppress the US Recall.ai bot for sovereign visios.
 */
export function isSovereignVisioUrl(
  url: string | null | undefined,
  env: { VIDEO_MEET_BASE_URL?: string; NODE_ENV?: string } = process.env,
): boolean {
  if (!url) return false;
  // Only an EXPLICITLY configured host counts as "ours" (Jibri-enabled). The
  // meet.jit.si fallback is not our host, so we must NOT skip Recall for it.
  const configured = (env.VIDEO_MEET_BASE_URL || "").trim();
  if (!configured) return false;
  try {
    const host = new URL(url).host.toLowerCase();
    const baseHost = new URL(configured).host.toLowerCase();
    return host === baseHost;
  } catch {
    return false;
  }
}

/**
 * Verify a Jibri finalize webhook. HMAC-SHA256 (hex) over the raw body with
 * JIBRI_WEBHOOK_SECRET; header may be "sha256=<hex>" or "<hex>". Fail-closed
 * when the secret or header is missing (the route returns 503/401).
 */
export function verifyJibriSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const jibriEventSchema = z.object({
  /** The Jitsi room name (matches activity.metadata.roomName). */
  roomName: z.string().min(1),
  status: z.enum(["started", "finalized", "failed"]),
  /** Pre-extracted transcript (WebVTT) when the recorder produced one. */
  transcriptVtt: z.string().optional(),
  /** URL of the recorded audio on OUR infra — fetched then transcribed. */
  audioUrl: z.string().url().optional(),
  durationSec: z.number().nonnegative().optional(),
});

export type JibriEvent = z.infer<typeof jibriEventSchema>;
