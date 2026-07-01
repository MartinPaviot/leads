import { describe, it, expect } from "vitest";
import { deepgramUtterancesToChunks, type DeepgramPrerecordedResponse } from "../deepgram-batch";

describe("deepgramUtterancesToChunks", () => {
  it("maps utterances to speaker/text/tsMs chunks (seconds → ms)", () => {
    const resp: DeepgramPrerecordedResponse = {
      results: {
        utterances: [
          { speaker: 0, transcript: "Hi, is this a good time?", start: 1.5 },
          { speaker: 1, transcript: "Sure, go ahead.", start: 3.2 },
        ],
      },
    };
    expect(deepgramUtterancesToChunks(resp)).toEqual([
      { speaker: "speaker 0", text: "Hi, is this a good time?", tsMs: 1500 },
      { speaker: "speaker 1", text: "Sure, go ahead.", tsMs: 3200 },
    ]);
  });

  it("drops empty / whitespace-only utterances", () => {
    const resp: DeepgramPrerecordedResponse = {
      results: { utterances: [{ speaker: 0, transcript: "  ", start: 0 }, { speaker: 1, transcript: "real", start: 1 }] },
    };
    const out = deepgramUtterancesToChunks(resp);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("real");
  });

  it("labels a missing speaker index as 'unknown' and a missing start as 0ms", () => {
    const resp: DeepgramPrerecordedResponse = { results: { utterances: [{ transcript: "no speaker no start" }] } };
    expect(deepgramUtterancesToChunks(resp)).toEqual([{ speaker: "unknown", text: "no speaker no start", tsMs: 0 }]);
  });

  it("returns [] when there are no utterances", () => {
    expect(deepgramUtterancesToChunks({})).toEqual([]);
    expect(deepgramUtterancesToChunks({ results: {} })).toEqual([]);
    expect(deepgramUtterancesToChunks({ results: { utterances: [] } })).toEqual([]);
  });

  it("preserves turn order across many utterances", () => {
    const resp: DeepgramPrerecordedResponse = {
      results: {
        utterances: [
          { speaker: 0, transcript: "one", start: 0 },
          { speaker: 1, transcript: "two", start: 1 },
          { speaker: 0, transcript: "three", start: 2 },
        ],
      },
    };
    expect(deepgramUtterancesToChunks(resp).map((c) => c.text)).toEqual(["one", "two", "three"]);
  });
});
