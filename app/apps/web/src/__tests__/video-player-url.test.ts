import { describe, it, expect } from "vitest";
import {
  detectProvider,
  buildEmbedUrl,
} from "@/lib/coaching/video-player-url";

describe("detectProvider", () => {
  it("loom URLs", () => {
    expect(detectProvider("https://www.loom.com/share/abc123")).toBe("loom");
    expect(detectProvider("https://loom.com/share/abc123")).toBe("loom");
    expect(detectProvider("https://www.loom.com/embed/xyz")).toBe("loom");
  });

  it("zoom recording URLs", () => {
    expect(
      detectProvider(
        "https://us02web.zoom.us/rec/share/abcdefg",
      ),
    ).toBe("zoom");
    expect(detectProvider("https://zoom.us/recording/123")).toBe("zoom");
  });

  it("recall.ai URLs", () => {
    expect(detectProvider("https://recall.ai/play/bot-123")).toBe("recall");
    expect(detectProvider("https://recallai.com/something")).toBe("recall");
  });

  it("YouTube URLs", () => {
    expect(detectProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectProvider("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
  });

  it("Vimeo URLs", () => {
    expect(detectProvider("https://vimeo.com/12345678")).toBe("vimeo");
    expect(detectProvider("https://player.vimeo.com/video/12345678")).toBe(
      "vimeo",
    );
  });

  it("direct mp4/webm", () => {
    expect(detectProvider("https://cdn.example.com/recording.mp4")).toBe("direct");
    expect(detectProvider("https://cdn.example.com/recording.webm")).toBe("direct");
    expect(detectProvider("https://cdn.example.com/r.mp4?token=abc")).toBe("direct");
  });

  it("unknown / empty / null", () => {
    expect(detectProvider(null)).toBe("unknown");
    expect(detectProvider(undefined)).toBe("unknown");
    expect(detectProvider("")).toBe("unknown");
    expect(detectProvider("   ")).toBe("unknown");
    expect(detectProvider("https://example.com/page")).toBe("unknown");
  });

  it("is case-insensitive on hostname", () => {
    expect(detectProvider("https://WWW.LOOM.COM/share/abc")).toBe("loom");
  });
});

describe("buildEmbedUrl — loom", () => {
  it("composes /embed URL with seek param", () => {
    const desc = buildEmbedUrl("https://www.loom.com/share/abc123", 90);
    expect(desc.provider).toBe("loom");
    expect(desc.canEmbed).toBe(true);
    expect(desc.seekInUrl).toBe(true);
    expect(desc.embedUrl).toBe("https://www.loom.com/embed/abc123?t=90s");
  });

  it("falls back when ID can't be extracted", () => {
    const desc = buildEmbedUrl("https://www.loom.com/", 30);
    expect(desc.canEmbed).toBe(false);
  });

  it("clamps negative seek to 0", () => {
    const desc = buildEmbedUrl("https://www.loom.com/share/x", -5);
    expect(desc.embedUrl).toContain("t=0s");
  });

  it("floors fractional seek", () => {
    const desc = buildEmbedUrl("https://www.loom.com/share/x", 12.7);
    expect(desc.embedUrl).toContain("t=12s");
  });
});

describe("buildEmbedUrl — zoom", () => {
  it("appends startTime in milliseconds, not embeddable", () => {
    const desc = buildEmbedUrl(
      "https://us02web.zoom.us/rec/share/abcdef",
      125,
    );
    expect(desc.provider).toBe("zoom");
    expect(desc.canEmbed).toBe(false);
    expect(desc.embedUrl).toBe(
      "https://us02web.zoom.us/rec/share/abcdef?startTime=125000",
    );
  });

  it("replaces existing startTime", () => {
    const desc = buildEmbedUrl(
      "https://us02web.zoom.us/rec/share/abc?startTime=999999",
      60,
    );
    expect(desc.embedUrl).toContain("startTime=60000");
    expect(desc.embedUrl).not.toContain("startTime=999999");
  });
});

describe("buildEmbedUrl — recall.ai", () => {
  it("appends ?t=Ns and is embeddable", () => {
    const desc = buildEmbedUrl("https://recall.ai/play/bot-99", 45);
    expect(desc.provider).toBe("recall");
    expect(desc.canEmbed).toBe(true);
    expect(desc.embedUrl).toBe("https://recall.ai/play/bot-99?t=45s");
  });
});

describe("buildEmbedUrl — youtube", () => {
  it("watch URL → /embed with start param", () => {
    const desc = buildEmbedUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      62,
    );
    expect(desc.provider).toBe("youtube");
    expect(desc.canEmbed).toBe(true);
    expect(desc.embedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=62",
    );
  });

  it("youtu.be short → /embed with start", () => {
    const desc = buildEmbedUrl("https://youtu.be/dQw4w9WgXcQ", 30);
    expect(desc.embedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=30",
    );
  });
});

describe("buildEmbedUrl — vimeo", () => {
  it("composes /video/<id># t=Ns", () => {
    const desc = buildEmbedUrl("https://vimeo.com/12345678", 90);
    expect(desc.provider).toBe("vimeo");
    expect(desc.embedUrl).toBe("https://player.vimeo.com/video/12345678#t=90s");
  });
});

describe("buildEmbedUrl — direct video", () => {
  it("uses media-fragment #t=N", () => {
    const desc = buildEmbedUrl("https://cdn.example.com/r.mp4", 17);
    expect(desc.provider).toBe("direct");
    expect(desc.embedUrl).toBe("https://cdn.example.com/r.mp4#t=17");
  });

  it("strips an existing fragment before appending", () => {
    const desc = buildEmbedUrl(
      "https://cdn.example.com/r.mp4#t=999",
      30,
    );
    expect(desc.embedUrl).toBe("https://cdn.example.com/r.mp4#t=30");
  });
});

describe("buildEmbedUrl — unknown", () => {
  it("returns canEmbed=false and pass-through URL", () => {
    const desc = buildEmbedUrl("https://example.com/page", 30);
    expect(desc.provider).toBe("unknown");
    expect(desc.canEmbed).toBe(false);
    expect(desc.seekInUrl).toBe(false);
  });

  it("handles null and empty", () => {
    expect(buildEmbedUrl(null, 0).provider).toBe("unknown");
    expect(buildEmbedUrl("", 0).provider).toBe("unknown");
  });
});
