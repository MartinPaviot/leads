import { describe, it, expect } from "vitest";
import { formatChunksForPrompt } from "@/lib/coaching/retrieve-transcript-chunks";

describe("formatChunksForPrompt", () => {
  it("returns a no-evidence marker when given no chunks", () => {
    expect(formatChunksForPrompt([])).toBe(
      "(no relevant transcript chunks found)",
    );
  });

  it("groups chunks by meeting", () => {
    const out = formatChunksForPrompt([
      {
        meetingId: "m1",
        speaker: "Jane",
        startSec: 60,
        endSec: 90,
        text: "We don't have budget right now.",
        similarity: 0.9,
        source: "recall_bot",
        promptLine: `[1:00, Jane]: "We don't have budget right now."`,
      },
      {
        meetingId: "m1",
        speaker: "Bob",
        startSec: 120,
        endSec: 140,
        text: "Maybe Q2 instead.",
        similarity: 0.85,
        source: "recall_bot",
        promptLine: `[2:00, Bob]: "Maybe Q2 instead."`,
      },
      {
        meetingId: "m2",
        speaker: "Jane",
        startSec: 30,
        endSec: 50,
        text: "Compliance team needs review.",
        similarity: 0.8,
        source: "recall_bot",
        promptLine: `[0:30, Jane]: "Compliance team needs review."`,
      },
    ]);

    // Two meetings → two `<meeting>` sections.
    expect(out).toMatch(/<meeting id="m1">[\s\S]*<\/meeting>/);
    expect(out).toMatch(/<meeting id="m2">[\s\S]*<\/meeting>/);
    // Both m1 chunks appear inside its section.
    const m1Section = out.match(/<meeting id="m1">([\s\S]*?)<\/meeting>/)?.[1] ?? "";
    expect(m1Section).toContain("budget right now");
    expect(m1Section).toContain("Maybe Q2 instead");
  });

  it("preserves the [mm:ss] markers verbatim", () => {
    const out = formatChunksForPrompt([
      {
        meetingId: "m1",
        speaker: null,
        startSec: 0,
        endSec: 5,
        text: "Hello.",
        similarity: 1.0,
        source: "manual_paste",
        promptLine: `[0:00]: "Hello."`,
      },
    ]);
    expect(out).toContain("[0:00]");
    expect(out).toContain(`"Hello."`);
  });
});
