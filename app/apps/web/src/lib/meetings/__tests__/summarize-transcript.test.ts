import { describe, it, expect, vi, beforeEach } from "vitest";

const { tracedGenerateObject, tracedGenerateText } = vi.hoisted(() => ({
  tracedGenerateObject: vi.fn(),
  tracedGenerateText: vi.fn(),
}));
vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateObject, tracedGenerateText }));
vi.mock("@/lib/meetings/notes-schema", () => ({
  meetingNotesSchema: { __schema: true },
  buildMeetingNotesPrompt: ({ transcript }: { transcript: string }) => `PROMPT::${transcript}`,
}));

import { summarizeMeetingTranscript, chunkTranscript } from "../summarize-transcript";

beforeEach(() => {
  tracedGenerateObject.mockReset();
  tracedGenerateText.mockReset();
  tracedGenerateObject.mockResolvedValue({ object: { summary: "notes" } });
  tracedGenerateText.mockResolvedValue({ text: "segment summary" });
});

describe("chunkTranscript", () => {
  it("splits into bounded windows", () => {
    expect(chunkTranscript("x".repeat(30000), 12000, 8)).toHaveLength(3);
  });
  it("caps the number of chunks", () => {
    expect(chunkTranscript("x".repeat(200000), 12000, 8)).toHaveLength(8);
  });
  it("returns a single chunk for short text", () => {
    expect(chunkTranscript("short", 12000, 8)).toEqual(["short"]);
  });
});

describe("summarizeMeetingTranscript", () => {
  it("does ONE synthesis pass over the FULL transcript for a short meeting (unchanged path)", async () => {
    const r = await summarizeMeetingTranscript({
      transcriptText: "a short meeting",
      model: {},
      meetingTitle: "M",
      meetingDate: "D",
      traceAgentId: "x",
    });
    expect(tracedGenerateText).not.toHaveBeenCalled();
    expect(tracedGenerateObject).toHaveBeenCalledTimes(1);
    // The full transcript reaches the prompt — no truncation for short meetings.
    expect(tracedGenerateObject.mock.calls[0][0].prompt).toBe("PROMPT::a short meeting");
    expect(r).toEqual({ summary: "notes" });
  });

  it("map-reduces a long meeting: a summary per segment, then one combine pass", async () => {
    const long = "x".repeat(30000); // > 15000 → 3 segments
    await summarizeMeetingTranscript({
      transcriptText: long,
      model: {},
      meetingTitle: "M",
      meetingDate: "D",
      traceAgentId: "x",
    });
    expect(tracedGenerateText).toHaveBeenCalledTimes(3); // one summary per segment
    expect(tracedGenerateObject).toHaveBeenCalledTimes(1); // one combine
    // The combine synthesizes over the SEGMENT SUMMARIES, not the raw transcript.
    const combinePrompt = tracedGenerateObject.mock.calls[0][0].prompt as string;
    expect(combinePrompt).toContain("[Segment 1/3]");
    expect(combinePrompt).toContain("segment summary");
    expect(combinePrompt).not.toContain("xxxx"); // raw transcript chars do not leak in
  });
});
