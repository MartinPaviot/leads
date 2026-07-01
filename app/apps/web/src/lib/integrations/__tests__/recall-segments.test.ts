import { describe, it, expect } from "vitest";
import { recallSegmentsToChunkSegments } from "../recall";

// Minimal Recall segment factory.
function seg(name: string, id: number, words: Array<[string, number, number]>) {
  return {
    participant: { id, name, is_host: false, platform: "zoom" },
    words: words.map(([text, s, e]) => ({
      text,
      start_timestamp: { relative: s, absolute: "" },
      end_timestamp: { relative: e, absolute: "" },
    })),
  };
}

describe("recallSegmentsToChunkSegments", () => {
  it("maps a turn to {speaker, startSec, endSec, text}", () => {
    const out = recallSegmentsToChunkSegments([seg("Paul", 1, [["Hey", 0, 0.5], ["there", 0.5, 1.0]])] as never);
    expect(out).toEqual([{ speaker: "Paul", startSec: 0, endSec: 1.0, text: "Hey there" }]);
  });

  it("falls back to a Speaker N label when the participant has no name", () => {
    const out = recallSegmentsToChunkSegments([seg("", 3, [["Hi", 2, 3]])] as never);
    expect(out[0].speaker).toBe("Speaker 3");
  });

  it("uses the first word's start and the last word's end as the window", () => {
    const out = recallSegmentsToChunkSegments([seg("A", 1, [["one", 5, 6], ["two", 6, 7], ["three", 7, 9]])] as never);
    expect(out[0].startSec).toBe(5);
    expect(out[0].endSec).toBe(9);
  });

  it("drops empty turns (no words / whitespace only)", () => {
    const out = recallSegmentsToChunkSegments([
      seg("A", 1, []),
      seg("B", 2, [["  ", 1, 2]]),
      seg("C", 3, [["real", 3, 4]]),
    ] as never);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("real");
  });

  it("never lets endSec fall below startSec", () => {
    const out = recallSegmentsToChunkSegments([seg("A", 1, [["x", 10, 9]])] as never);
    expect(out[0].endSec).toBeGreaterThanOrEqual(out[0].startSec);
  });

  it("preserves multiple turns in order", () => {
    const out = recallSegmentsToChunkSegments([
      seg("Paul", 1, [["first", 0, 1]]),
      seg("Martin", 2, [["second", 1, 2]]),
    ] as never);
    expect(out.map((s) => s.speaker)).toEqual(["Paul", "Martin"]);
    expect(out.map((s) => s.text)).toEqual(["first", "second"]);
  });
});
