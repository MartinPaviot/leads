import { describe, it, expect, beforeEach } from "vitest";
import { buildTwiml, buildVoicemailDropTwiml, buildFallbackTwiml } from "@/lib/voice/twilio";

/**
 * Exercises the TwiML composition helpers against the real Twilio SDK
 * VoiceResponse — that's the surface Twilio actually validates against
 * at runtime so we don't want a hand-rolled assertion that drifts.
 */

// Recording is opt-in (VOICE_RECORDING_ENABLED). Default every test to OFF so
// assertions are deterministic regardless of the ambient env.
beforeEach(() => {
  delete process.env.VOICE_RECORDING_ENABLED;
});

describe("buildTwiml — outbound call composition", () => {
  it("includes <Transcription> (Deepgram) and <Dial> + <Number>", async () => {
    const xml = await buildTwiml({
      toNumber: "+33612345678",
      fromNumber: "+33122334455",
      transcriptionCallbackUrl: "https://example.com/api/calls/transcription?callId=abc",
      languageCode: "fr-FR",
      recordingStatusUrl: "https://example.com/api/calls/recording-status",
    });
    expect(xml).toContain("<Transcription");
    expect(xml).toContain("api/calls/transcription");
    expect(xml).toContain("deepgram");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+33122334455");
    expect(xml).toContain("<Number");
    expect(xml).toContain("+33612345678");
    // Recording is opt-in — off by default, so nothing is captured/announced.
    expect(xml).not.toContain("recordingStatusCallback=");
    expect(xml).not.toContain("record-from-answer-dual");
  });

  it("records only when VOICE_RECORDING_ENABLED=true (never silently)", async () => {
    process.env.VOICE_RECORDING_ENABLED = "true";
    const xml = await buildTwiml({
      toNumber: "+33612345678",
      fromNumber: "+33122334455",
      transcriptionCallbackUrl: "https://example.com/api/calls/transcription?callId=abc",
      recordingStatusUrl: "https://example.com/api/calls/recording-status",
    });
    expect(xml).toContain("record-from-answer-dual");
    expect(xml).toContain("recordingStatusCallback=");
  });

  it("includes <Play disclosure> when supplied", async () => {
    const xml = await buildTwiml({
      toNumber: "+33612345678",
      fromNumber: "+33122334455",
      transcriptionCallbackUrl: "https://example.com/api/calls/transcription?callId=abc",
      disclosureUrl: "https://cdn.example.com/disclosure-fr.mp3",
      recordingStatusUrl: "https://example.com/api/calls/recording-status",
    });
    expect(xml).toContain("<Play");
    expect(xml).toContain("disclosure-fr.mp3");
  });

  it("omits <Play> when no disclosureUrl", async () => {
    const xml = await buildTwiml({
      toNumber: "+12125551234",
      fromNumber: "+12128889999",
      transcriptionCallbackUrl: "https://example.com/api/calls/transcription?callId=abc",
      recordingStatusUrl: "https://example.com/api/calls/recording-status",
    });
    expect(xml).not.toContain("<Play>");
  });
});

describe("buildVoicemailDropTwiml", () => {
  it("plays the supplied URL and hangs up", async () => {
    const xml = await buildVoicemailDropTwiml({
      audioUrl: "https://cdn.example.com/voicemail-fr.mp3",
    });
    expect(xml).toContain("<Play>");
    expect(xml).toContain("https://cdn.example.com/voicemail-fr.mp3");
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("<Dial");
  });
});

describe("buildFallbackTwiml", () => {
  it("says an apology in French and hangs up — no dial/stream", async () => {
    const xml = await buildFallbackTwiml();
    expect(xml).toContain("<Say");
    expect(xml).toContain("<Hangup");
    expect(xml).not.toContain("<Dial");
    expect(xml).not.toContain("<Stream");
  });

  it("uses a custom message when supplied", async () => {
    const xml = await buildFallbackTwiml({ message: "Message de test ABC123" });
    expect(xml).toContain("Message de test ABC123");
  });
});
