import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/voice/twilio-signature", () => ({
  validateTwilioSignature: vi.fn(() => true),
}));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn() } }));

import { validateTwilioSignature } from "@/lib/voice/twilio-signature";

const route = await import("@/app/api/calls/disclosure-whisper/route");

const DISC = "https://cdn.example.com/disclosure-fr.mp3";

function post(u: string) {
  return new Request(
    `http://x/api/calls/disclosure-whisper?u=${encodeURIComponent(u)}`,
    { method: "POST", headers: { "x-twilio-signature": "sig" }, body: "CallSid=CA1" },
  );
}

describe("POST /api/calls/disclosure-whisper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateTwilioSignature).mockReturnValue(true);
    process.env.VOICE_DISCLOSURE_AUDIO_URL = DISC;
  });
  afterEach(() => {
    delete process.env.VOICE_DISCLOSURE_AUDIO_URL;
  });

  it("plays the configured disclosure when u matches", async () => {
    const res = await route.POST(post(DISC));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain("<Play>");
    expect(body).toContain("disclosure-fr.mp3");
  });

  it("returns an empty response (no arbitrary audio) when u doesn't match the configured URL", async () => {
    const res = await route.POST(post("https://evil.example.com/anything.mp3"));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain("evil.example.com");
    expect(body).not.toContain("<Play>");
  });

  it("403s on an invalid Twilio signature", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(false);
    const res = await route.POST(post(DISC));
    expect(res.status).toBe(403);
  });
});
