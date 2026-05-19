import { describe, it, expect, vi } from "vitest";
import { createCoachingTap } from "@/lib/voice/coaching-tap";
import type { TranscriptChunk } from "@/lib/voice/deepgram-bridge";

function prospectChunk(text: string, tsMs = 0): {
  callId: string;
  chunk: TranscriptChunk;
  recentAgentText: string;
} {
  return {
    callId: "call_test",
    chunk: { speaker: "prospect", text, tsMs },
    recentAgentText: "Bonjour Marie, Martin de Elevay, 30 secondes ?",
  };
}

describe("createCoachingTap", () => {
  it("skips chunks that don't pass the keyword prefilter", async () => {
    const generate = vi.fn();
    const tap = createCoachingTap({
      model: {} as never,
      generate: generate as never,
    });
    const card = await tap(prospectChunk("Bonjour ravi de vous rencontrer."));
    expect(card).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("invokes the classifier when keyword prefilter passes", async () => {
    const generate = vi.fn().mockResolvedValue({
      object: {
        objectionDetected: true,
        objectionClass: "price_too_high",
        prospectQuote: "trop cher",
        confidence: 0.8,
      },
    });
    let now = 0;
    const tap = createCoachingTap(
      { model: {} as never, generate: generate as never },
      { now: () => now },
    );
    const card = await tap(prospectChunk("c'est trop cher pour nous"));
    expect(card).not.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(card?.objectionClass).toBe("price_too_high");
  });

  it("respects the debounce window", async () => {
    const generate = vi.fn().mockResolvedValue({
      object: {
        objectionDetected: true,
        objectionClass: "price_too_high",
        prospectQuote: "trop cher",
        confidence: 0.8,
      },
    });
    let now = 0;
    const tap = createCoachingTap(
      { model: {} as never, generate: generate as never },
      { now: () => now, debounceMs: 5_000 },
    );
    const first = await tap(prospectChunk("c'est trop cher franchement"));
    expect(first).not.toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    now = 2_000; // within debounce
    const second = await tap(prospectChunk("oui vraiment trop cher"));
    expect(second).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1); // not invoked again
  });

  it("suppresses same-class cards within sameClassSuppressMs", async () => {
    const generate = vi.fn().mockResolvedValue({
      object: {
        objectionDetected: true,
        objectionClass: "price_too_high",
        prospectQuote: "trop cher",
        confidence: 0.8,
      },
    });
    let now = 0;
    const tap = createCoachingTap(
      { model: {} as never, generate: generate as never },
      { now: () => now, debounceMs: 0, sameClassSuppressMs: 30_000 },
    );
    const first = await tap(prospectChunk("trop cher pour nous"));
    expect(first).not.toBeNull();
    now = 10_000; // past debounce, within same-class suppress window
    const second = await tap(prospectChunk("vraiment trop cher quand même"));
    expect(second).toBeNull();
    // Classifier ran twice, but tap returned null on the second to suppress.
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("allows different classes within the same window", async () => {
    let classToReturn = "price_too_high";
    const generate = vi.fn(async () => ({
      object: {
        objectionDetected: true,
        objectionClass: classToReturn,
        prospectQuote: "quote",
        confidence: 0.8,
      },
    }));
    let now = 0;
    const tap = createCoachingTap(
      { model: {} as never, generate: generate as never },
      { now: () => now, debounceMs: 0, sameClassSuppressMs: 30_000 },
    );
    const first = await tap(prospectChunk("c'est trop cher pour nous franchement"));
    expect(first?.objectionClass).toBe("price_too_high");
    now = 5_000;
    classToReturn = "not_the_right_time";
    const second = await tap(prospectChunk("pas le bon moment"));
    expect(second?.objectionClass).toBe("not_the_right_time");
  });
});
