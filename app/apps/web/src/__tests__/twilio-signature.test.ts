import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import twilio from "twilio";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";

/**
 * Guards the webhook auth on /api/calls/twiml + /api/calls/transcription.
 * Correctness is cross-checked against Twilio's OWN validateRequest so our
 * self-contained HMAC matches the spec exactly.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function sign(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("validateTwilioSignature", () => {
  const authToken = "tok_test_abc";
  const url = "https://www.elevay.dev/api/calls/transcription?callId=abc123";
  const params = {
    TranscriptionEvent: "transcription-content",
    Track: "inbound_track",
    Final: "true",
    CallSid: "CA1234567890ABCDE",
  };
  const sig = sign(authToken, url, params);

  it("matches Twilio's own validateRequest (our HMAC == the spec)", () => {
    // Twilio's official validator accepts our signature → our algorithm is correct.
    expect(twilio.validateRequest(authToken, sig, url, params)).toBe(true);
  });

  it("accepts a valid signature", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: sig })).toBe(true);
  });

  it("rejects a tampered signature", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: "WRONGSIGNATURE=" })).toBe(false);
  });

  it("rejects when a param is altered", () => {
    expect(validateTwilioSignature({ authToken, url, params: { ...params, Final: "false" }, signature: sig })).toBe(false);
  });

  it("rejects a wrong auth token", () => {
    expect(validateTwilioSignature({ authToken: "other", url, params, signature: sig })).toBe(false);
  });

  it("rejects a missing/empty signature", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: null })).toBe(false);
    expect(validateTwilioSignature({ authToken, url, params, signature: "" })).toBe(false);
  });
});
