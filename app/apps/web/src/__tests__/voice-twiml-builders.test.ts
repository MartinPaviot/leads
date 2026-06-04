import { describe, it, expect } from "vitest";
import { buildTwiml, buildVoicemailDropTwiml, buildFallbackTwiml } from "@/lib/voice/twilio";

/**
 * Exercises the TwiML composition helpers against the real Twilio SDK
 * VoiceResponse — that's the surface Twilio actually validates against
 * at runtime so we don't want a hand-rolled assertion that drifts.
 */

describe("buildTwiml — outbound call composition", () => {
  it("includes <Stream> and <Dial> + <Number>", async () => {
    const xml = await buildTwiml({
      toNumber: "+33612345678",
      fromNumber: "+33122334455",
      streamUrl: "wss://example.com/stream?callId=abc",
      recordingStatusUrl: "https://example.com/api/calls/recording-status",
    });
    expect(xml).toContain("<Stream");
    expect(xml).toContain("wss://example.com/stream?callId=abc");
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+33122334455");
    expect(xml).toContain("<Number");
    expect(xml).toContain("+33612345678");
    expect(xml).toContain("recordingStatusCallback=");
  });

  it("includes <Play disclosure> when supplied", async () => {
    const xml = await buildTwiml({
      toNumber: "+33612345678",
      fromNumber: "+33122334455",
      streamUrl: "wss://example.com/stream",
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
      streamUrl: "wss://example.com/stream",
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
