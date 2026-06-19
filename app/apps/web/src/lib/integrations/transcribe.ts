/**
 * Speech-to-text seam.
 *
 * Defaults to OpenAI Whisper (the current behaviour). Point WHISPER_BASE_URL at
 * a self-hosted, OpenAI-compatible endpoint (faster-whisper / whisper.cpp /
 * Speaches) to keep the prospect's voice on sovereign EU/CH infrastructure —
 * see _specs/sovereign-recording. Same code, config swap. Shared by the manual
 * upload path and the Jibri recording webhook so there is one STT seam.
 */

import OpenAI from "openai";

type WhisperEnv = {
  WHISPER_BASE_URL?: string;
  WHISPER_API_KEY?: string;
  WHISPER_MODEL?: string;
  OPENAI_API_KEY?: string;
  // Declared on NodeJS.ProcessEnv — lets `= process.env` satisfy this
  // otherwise all-optional ("weak") type while tests pass plain objects.
  NODE_ENV?: string;
};

export interface WhisperConfig {
  baseURL: string | undefined;
  apiKey: string;
  model: string;
}

/** Resolve the STT endpoint from env. baseURL unset = OpenAI's default host. */
export function resolveWhisperConfig(env: WhisperEnv = process.env): WhisperConfig {
  return {
    baseURL: env.WHISPER_BASE_URL?.trim() || undefined,
    // A self-hosted server often ignores the key but the SDK requires one.
    apiKey: env.OPENAI_API_KEY || env.WHISPER_API_KEY || "sk-noauth",
    model: env.WHISPER_MODEL?.trim() || "gpt-4o-mini-transcribe",
  };
}

/** True when transcription can run (a self-hosted endpoint or an OpenAI key). */
export function transcriptionConfigured(env: WhisperEnv = process.env): boolean {
  return !!(env.WHISPER_BASE_URL || env.OPENAI_API_KEY || env.WHISPER_API_KEY);
}

/** Transcribe an audio File to plain text. */
export async function transcribeAudio(file: File): Promise<string> {
  const { baseURL, apiKey, model } = resolveWhisperConfig();
  const client = new OpenAI({ apiKey, baseURL });
  const res = await client.audio.transcriptions.create({
    model,
    file,
    response_format: "verbose_json",
  });
  return res.text;
}

/** Fetch a (sovereign, our-infra) audio URL and transcribe it. */
export async function transcribeFromUrl(audioUrl: string): Promise<string> {
  const resp = await fetch(audioUrl);
  if (!resp.ok) throw new Error(`Failed to fetch recording (${resp.status})`);
  const blob = await resp.blob();
  const name = new URL(audioUrl).pathname.split("/").pop() || "recording.webm";
  const file = new File([blob], name, { type: blob.type || "audio/webm" });
  return transcribeAudio(file);
}
