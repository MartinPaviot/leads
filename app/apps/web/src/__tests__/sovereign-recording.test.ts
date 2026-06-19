import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  isSovereignRecordingEnabled,
  isSovereignVisioUrl,
  verifyJibriSignature,
  jibriEventSchema,
} from "@/lib/recording/sovereign-recording";

const CH = { VIDEO_MEET_BASE_URL: "https://visio.pilae.ch" };

describe("sovereign-recording helpers", () => {
  it("flag is off unless explicitly 'true'", () => {
    expect(isSovereignRecordingEnabled({})).toBe(false);
    expect(isSovereignRecordingEnabled({ SOVEREIGN_RECORDING_ENABLED: "false" })).toBe(false);
    expect(isSovereignRecordingEnabled({ SOVEREIGN_RECORDING_ENABLED: "1" })).toBe(false);
    expect(isSovereignRecordingEnabled({ SOVEREIGN_RECORDING_ENABLED: "true" })).toBe(true);
  });

  it("recognises our sovereign Jitsi host, rejects everything else", () => {
    expect(isSovereignVisioUrl("https://visio.pilae.ch/rdv-abc#config.disableDeepLinking=true", CH)).toBe(true);
    expect(isSovereignVisioUrl("https://meet.google.com/xyz-abc", CH)).toBe(false);
    expect(isSovereignVisioUrl("https://teams.microsoft.com/l/meetup", CH)).toBe(false);
    expect(isSovereignVisioUrl(null, CH)).toBe(false);
    expect(isSovereignVisioUrl("not a url", CH)).toBe(false);
    // No explicit host configured → the meet.jit.si fallback is NOT "ours"
    // (so Recall is not skipped for it).
    expect(isSovereignVisioUrl("https://meet.jit.si/rdv-abc", {})).toBe(false);
  });

  it("verifies a valid Jibri signature and rejects tampering", () => {
    const secret = "whatever-secret";
    const body = JSON.stringify({ roomName: "rdv-abc", status: "finalized" });
    const sig = createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyJibriSignature(body, sig, secret)).toBe(true);
    expect(verifyJibriSignature(body, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyJibriSignature(body, sig, "wrong-secret")).toBe(false);
    expect(verifyJibriSignature(body + "x", sig, secret)).toBe(false);
    expect(verifyJibriSignature(body, sig, undefined)).toBe(false);
    expect(verifyJibriSignature(body, null, secret)).toBe(false);
  });

  it("validates the finalize payload shape", () => {
    expect(
      jibriEventSchema.safeParse({ roomName: "rdv-abc", status: "finalized", transcriptVtt: "WEBVTT\n..." }).success,
    ).toBe(true);
    expect(
      jibriEventSchema.safeParse({ roomName: "rdv-abc", status: "finalized", audioUrl: "https://visio.pilae.ch/rec/1.webm" }).success,
    ).toBe(true);
    expect(jibriEventSchema.safeParse({ roomName: "", status: "finalized" }).success).toBe(false);
    expect(jibriEventSchema.safeParse({ roomName: "x", status: "bogus" }).success).toBe(false);
    expect(jibriEventSchema.safeParse({ roomName: "x", status: "finalized", audioUrl: "not-a-url" }).success).toBe(false);
  });
});
