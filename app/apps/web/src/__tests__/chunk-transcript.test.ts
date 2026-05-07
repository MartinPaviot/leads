import { describe, it, expect } from "vitest";
import {
  chunkBySpeakerTurns,
  chunkByTimeWindows,
  chunkTranscript,
  type TranscriptSegment,
} from "@/lib/coaching/chunk-transcript";

describe("chunkBySpeakerTurns", () => {
  it("emits one chunk per short turn", () => {
    const segs: TranscriptSegment[] = [
      { speaker: "Jane", startSec: 0, endSec: 5, text: "Hello there." },
      { speaker: "Bob", startSec: 5, endSec: 10, text: "Hi Jane, how are you?" },
    ];
    const chunks = chunkBySpeakerTurns(segs);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      speaker: "Jane",
      startSec: 0,
      endSec: 5,
      text: "Hello there.",
    });
    expect(chunks[1].speaker).toBe("Bob");
  });

  it("coalesces tiny same-speaker continuations", () => {
    const segs: TranscriptSegment[] = [
      { speaker: "Jane", startSec: 0, endSec: 30, text: "So I was thinking we should explore the budget for next quarter and align with finance." },
      { speaker: "Jane", startSec: 30, endSec: 32, text: "Yeah." },
      { speaker: "Jane", startSec: 32, endSec: 35, text: "Right." },
    ];
    const chunks = chunkBySpeakerTurns(segs);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Yeah.");
    expect(chunks[0].text).toContain("Right.");
    expect(chunks[0].endSec).toBe(35);
  });

  it("does NOT coalesce across speakers", () => {
    const segs: TranscriptSegment[] = [
      { speaker: "Jane", startSec: 0, endSec: 30, text: "What's your timeline for the rollout? We have a board meeting on the 15th and would love to share progress." },
      { speaker: "Bob", startSec: 30, endSec: 32, text: "OK." },
    ];
    const chunks = chunkBySpeakerTurns(segs);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].speaker).toBe("Jane");
    expect(chunks[1].speaker).toBe("Bob");
  });

  it("splits long turns at sentence boundaries with proportional time", () => {
    const longSentences = Array(10)
      .fill(0)
      .map((_, i) => `Sentence number ${i} with reasonable length to push past the chunk limit.`)
      .join(" ");
    const segs: TranscriptSegment[] = [
      { speaker: "Jane", startSec: 0, endSec: 100, text: longSentences },
    ];
    const chunks = chunkBySpeakerTurns(segs);
    expect(chunks.length).toBeGreaterThan(1);
    // Chronological order preserved
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startSec).toBeGreaterThanOrEqual(chunks[i - 1].startSec);
    }
    // Last chunk's endSec ≈ 100 (small float tolerance)
    expect(chunks[chunks.length - 1].endSec).toBeCloseTo(100, 1);
    // No chunk grossly over the cap
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(500);
    }
  });

  it("skips empty/whitespace-only turns", () => {
    const segs: TranscriptSegment[] = [
      { speaker: "Jane", startSec: 0, endSec: 1, text: "" },
      { speaker: "Bob", startSec: 1, endSec: 2, text: "   " },
      { speaker: "Jane", startSec: 2, endSec: 5, text: "Real content here." },
    ];
    const chunks = chunkBySpeakerTurns(segs);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Real content here.");
  });
});

describe("chunkByTimeWindows", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkByTimeWindows("", 60)).toEqual([]);
    expect(chunkByTimeWindows("   ", 60)).toEqual([]);
  });

  it("falls back to zero-time chunks when duration is missing", () => {
    const text = "First sentence. Second sentence. Third one.";
    const chunks = chunkByTimeWindows(text, 0);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.startSec).toBe(0);
      expect(c.endSec).toBe(0);
      expect(c.speaker).toBeNull();
    }
  });

  it("produces ascending time-windowed chunks at given duration", () => {
    // 600 words over 600s ≈ 1 word/sec, so a 60s window = 60 words.
    const text = Array(600).fill("word").join(" ");
    const chunks = chunkByTimeWindows(text, 600, 60);
    expect(chunks.length).toBeGreaterThan(0);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startSec).toBeGreaterThanOrEqual(chunks[i - 1].startSec);
    }
    expect(chunks[chunks.length - 1].endSec).toBeLessThanOrEqual(600.1);
  });
});

describe("chunkTranscript", () => {
  it("prefers segments when both are provided", () => {
    const out = chunkTranscript({
      segments: [{ speaker: "Jane", startSec: 0, endSec: 5, text: "Hi." }],
      rawText: "should be ignored",
      totalDurationSec: 60,
    });
    expect(out).toHaveLength(1);
    expect(out[0].speaker).toBe("Jane");
  });

  it("falls back to rawText when segments are empty/missing", () => {
    const out = chunkTranscript({ rawText: "Some content here.", totalDurationSec: 10 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].speaker).toBeNull();
  });

  it("returns empty array when neither segments nor rawText present", () => {
    expect(chunkTranscript({})).toEqual([]);
  });
});
