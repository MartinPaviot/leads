import { describe, it, expect } from "vitest";
import { callNotesSchema } from "@/lib/voice/extraction-schema";

describe("callNotesSchema", () => {
  it("accepts a fully populated note", () => {
    const ok = callNotesSchema.safeParse({
      summary: "Connected briefly; prospect curious but busy.",
      outcome: "callback_requested",
      sentiment: "positive",
      keyPoints: ["Currently using Outreach", "Renews in Q4"],
      actionItems: [
        { owner: "Martin", task: "Send 1-pager", deadline: "2026-05-25" },
      ],
      buyingSignals: {
        budget: null,
        timeline: "Q4 renewal",
        currentStack: ["Outreach"],
        painPoints: ["Reply rate dropping"],
        objections: [],
        nextSteps: ["Send email"],
        competitors: ["Outreach"],
        teamSize: null,
      },
      callbackRequest: {
        requested: true,
        whenIso: "2026-05-21T14:00:00+02:00",
        note: "Tuesday after lunch",
      },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown outcome value", () => {
    const bad = callNotesSchema.safeParse({
      summary: "x",
      outcome: "ghosted",
      sentiment: "neutral",
      keyPoints: [],
      actionItems: [],
      buyingSignals: {
        budget: null,
        timeline: null,
        currentStack: [],
        painPoints: [],
        objections: [],
        nextSteps: [],
        competitors: [],
        teamSize: null,
      },
      callbackRequest: null,
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a minimal voicemail note", () => {
    const ok = callNotesSchema.safeParse({
      summary: "Dropped voicemail introducing Elevay.",
      outcome: "voicemail_left",
      sentiment: "neutral",
      keyPoints: [],
      actionItems: [],
      buyingSignals: {
        budget: null,
        timeline: null,
        currentStack: [],
        painPoints: [],
        objections: [],
        nextSteps: [],
        competitors: [],
        teamSize: null,
      },
      callbackRequest: null,
    });
    expect(ok.success).toBe(true);
  });
});
