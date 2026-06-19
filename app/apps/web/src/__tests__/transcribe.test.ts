import { describe, it, expect } from "vitest";
import { resolveWhisperConfig, transcriptionConfigured } from "@/lib/integrations/transcribe";

describe("transcribe — STT seam", () => {
  it("defaults to OpenAI (no baseURL) with the default model", () => {
    const cfg = resolveWhisperConfig({ OPENAI_API_KEY: "sk-real" });
    expect(cfg.baseURL).toBeUndefined();
    expect(cfg.apiKey).toBe("sk-real");
    expect(cfg.model).toBe("gpt-4o-mini-transcribe");
  });

  it("points at a self-hosted sovereign endpoint when WHISPER_BASE_URL is set", () => {
    const cfg = resolveWhisperConfig({
      WHISPER_BASE_URL: "https://whisper.pilae.ch/v1",
      WHISPER_MODEL: "whisper-large-v3",
    });
    expect(cfg.baseURL).toBe("https://whisper.pilae.ch/v1");
    expect(cfg.model).toBe("whisper-large-v3");
    // Self-hosted server may ignore the key, but the SDK requires a non-empty one.
    expect(cfg.apiKey).toBe("sk-noauth");
  });

  it("prefers OPENAI_API_KEY, falls back to WHISPER_API_KEY", () => {
    expect(resolveWhisperConfig({ WHISPER_API_KEY: "wk" }).apiKey).toBe("wk");
    expect(resolveWhisperConfig({ OPENAI_API_KEY: "ok", WHISPER_API_KEY: "wk" }).apiKey).toBe("ok");
  });

  it("transcriptionConfigured reflects whether any endpoint/key exists", () => {
    expect(transcriptionConfigured({})).toBe(false);
    expect(transcriptionConfigured({ OPENAI_API_KEY: "ok" })).toBe(true);
    expect(transcriptionConfigured({ WHISPER_BASE_URL: "https://whisper.pilae.ch" })).toBe(true);
    expect(transcriptionConfigured({ WHISPER_API_KEY: "wk" })).toBe(true);
  });
});
