/**
 * Recall.ai API client — meeting bot management.
 * Docs: https://docs.recall.ai
 */

import { withCircuitBreaker, RECALL_CIRCUIT } from "../infra/circuit-breaker";
import type { TranscriptSegment as ChunkTranscriptSegment } from "@/lib/coaching/chunk-transcript";

const RECALL_BASE = "https://us-east-1.recall.ai/api/v1";

function getApiKey(): string {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error("RECALL_API_KEY not configured");
  return key;
}

function headers(): HeadersInit {
  return {
    Authorization: `Token ${getApiKey()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RecallBot {
  id: string;
  meeting_url: string;
  status_changes: Array<{
    code: string;
    sub_code: string | null;
    message: string | null;
    created_at: string;
  }>;
  recordings: Array<{
    id: string;
    media_shortcuts?: {
      transcript?: {
        id: string;
        data: { download_url: string };
      };
      video_mixed?: {
        data: { download_url: string };
        format: string;
      };
    };
  }>;
}

export interface TranscriptSegment {
  participant: {
    id: number;
    name: string;
    is_host: boolean;
    platform: string;
  };
  words: Array<{
    text: string;
    start_timestamp: { relative: number; absolute: string };
    end_timestamp: { relative: number; absolute: string };
  }>;
}

export interface RecallWebhookEvent {
  event: string;
  data: {
    data: {
      code: string;
      sub_code: string | null;
      updated_at: string;
    };
    bot: {
      id: string;
      metadata: Record<string, unknown>;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  API functions                                                      */
/* ------------------------------------------------------------------ */

/**
 * Create a bot that joins a meeting and records + transcribes.
 * Uses Recall.ai's built-in streaming transcription.
 */
export async function createBot(
  meetingUrl: string,
  options?: {
    botName?: string;
    webhookUrl?: string;
  }
): Promise<RecallBot> {
  return withCircuitBreaker(RECALL_CIRCUIT, async () => {
    const webhookUrl = options?.webhookUrl || `${process.env.AUTH_URL || process.env.NEXTAUTH_URL}/api/webhooks/recall`;

    const body: Record<string, unknown> = {
      meeting_url: meetingUrl,
      bot_name: options?.botName || "Elevay",
      recording_config: {
        transcript: {
          provider: {
            meeting_captions: {},
          },
        },
      },
    };

    // If we have a webhook URL, add status change webhook
    if (webhookUrl) {
      body.metadata = { webhook_url: webhookUrl };
    }

    const res = await fetch(`${RECALL_BASE}/bot/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Recall.ai createBot failed (${res.status}): ${text}`);
    }

    return res.json();
  });
}

/**
 * Get bot details including status and recordings.
 */
export async function getBotStatus(botId: string): Promise<RecallBot> {
  return withCircuitBreaker(RECALL_CIRCUIT, async () => {
    const res = await fetch(`${RECALL_BASE}/bot/${botId}/`, {
      headers: headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Recall.ai getBotStatus failed (${res.status}): ${text}`);
    }

    return res.json();
  });
}

/**
 * Get the transcript for a bot's recording.
 * Fetches the bot details, extracts the transcript download URL,
 * then downloads and returns the transcript segments.
 */
// M9 — transcript download URLs come out of Recall.ai's own API, and
// we send our API token with the request. If Recall were compromised,
// or a MITM altered the response, an attacker could point this fetch
// at an arbitrary host and exfiltrate our API key. Constrain the
// destination to AWS S3 signed-URL hosts (recall.ai's storage backend)
// and a couple of Recall-owned CNAMEs we've actually seen in traffic.
const RECALL_TRANSCRIPT_HOST_ALLOWLIST = [
  /\.s3\.amazonaws\.com$/i,
  /\.s3\.us-east-1\.amazonaws\.com$/i,
  /\.s3\.us-east-2\.amazonaws\.com$/i,
  /\.s3\.us-west-2\.amazonaws\.com$/i,
  /(^|\.)recall\.ai$/i,
  /(^|\.)recallai\.com$/i,
];

function isAllowedRecallDownloadUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return RECALL_TRANSCRIPT_HOST_ALLOWLIST.some((re) => re.test(host));
}

export async function getBotTranscript(botId: string): Promise<TranscriptSegment[]> {
  const bot = await getBotStatus(botId);

  const recording = bot.recordings?.[0];
  if (!recording?.media_shortcuts?.transcript?.data?.download_url) {
    throw new Error(`No transcript available for bot ${botId}`);
  }

  const downloadUrl = recording.media_shortcuts.transcript.data.download_url;
  if (!isAllowedRecallDownloadUrl(downloadUrl)) {
    // Don't echo the rejected URL back — it's attacker-influenced if
    // we got here via a compromised upstream and could be a phishing
    // payload in its own right.
    console.warn("recall: rejected transcript download URL outside allowlist");
    throw new Error("Untrusted transcript download URL");
  }
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Token ${getApiKey()}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download transcript (${res.status})`);
  }

  return res.json();
}

/**
 * Convert Recall.ai transcript segments to plain text with speaker labels.
 */
export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const speaker = seg.participant.name || `Speaker ${seg.participant.id}`;
      const text = seg.words.map((w) => w.text).join(" ");
      return `${speaker}: ${text}`;
    })
    .join("\n\n");
}

/**
 * Map Recall.ai's per-turn transcript segments onto the speaker-aware
 * `TranscriptSegment` shape the transcript chunker/indexer expects
 * (`lib/coaching/chunk-transcript`). One Recall segment = one speaker turn; we
 * take its first word's relative start and last word's relative end as the
 * time window, and join the words as the turn text. Empty turns are dropped.
 * Pure — unit-tested so the mapping stays locked as the indexer relies on it.
 */
export function recallSegmentsToChunkSegments(segments: TranscriptSegment[]): ChunkTranscriptSegment[] {
  const out: ChunkTranscriptSegment[] = [];
  for (const seg of segments) {
    const text = seg.words.map((w) => w.text).join(" ").trim();
    if (!text) continue;
    const startSec = seg.words[0]?.start_timestamp?.relative ?? 0;
    const endSec = seg.words[seg.words.length - 1]?.end_timestamp?.relative ?? startSec;
    out.push({
      speaker: seg.participant.name || (seg.participant.id != null ? `Speaker ${seg.participant.id}` : null),
      startSec,
      endSec: Math.max(endSec, startSec),
      text,
    });
  }
  return out;
}

/**
 * Alias for getBotTranscript — convenience export matching the naming
 * convention used by callers that don't need the "Bot" prefix.
 */
export const getTranscript = getBotTranscript;

/**
 * Check whether the Recall.ai API is reachable and authenticated.
 * Returns a health status object. Does NOT use the circuit breaker so
 * health probes never trip it open.
 */
export async function getBotHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${RECALL_BASE}/bot/?limit=1`, {
      headers: headers(),
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        healthy: false,
        latencyMs,
        error: `Recall.ai returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    return { healthy: true, latencyMs };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Delete a bot (stops recording if in progress).
 */
export async function deleteBot(botId: string): Promise<void> {
  return withCircuitBreaker(RECALL_CIRCUIT, async () => {
    const res = await fetch(`${RECALL_BASE}/bot/${botId}/`, {
      method: "DELETE",
      headers: headers(),
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Recall.ai deleteBot failed (${res.status}): ${text}`);
    }
  });
}

/**
 * Map Recall.ai status codes to simple status labels.
 */
export function mapBotStatus(code: string): string {
  switch (code) {
    case "ready":
    case "joining_call":
      return "scheduled";
    case "in_waiting_room":
      return "waiting";
    case "in_call_not_recording":
    case "in_call_recording":
      return "recording";
    case "call_ended":
    case "done":
      return "done";
    case "fatal":
    case "error":
      return "error";
    default:
      return code;
  }
}
