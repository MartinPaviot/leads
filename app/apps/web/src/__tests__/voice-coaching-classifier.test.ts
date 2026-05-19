import { describe, it, expect, vi } from "vitest";
import { classifyObjection } from "@/lib/voice/coaching-classifier";
import { looksLikeObjection, PLAYBOOK } from "@/lib/voice/coaching-playbook";

describe("looksLikeObjection (keyword prefilter)", () => {
  it("matches FR objection phrasing", () => {
    expect(looksLikeObjection("on a déjà Outreach")).toBe(true);
    expect(looksLikeObjection("trop cher pour nous franchement")).toBe(true);
    expect(looksLikeObjection("envoyez moi un mail je verrai")).toBe(true);
    expect(looksLikeObjection("pas le bon moment, on est en plein produit")).toBe(true);
  });

  it("matches EN objection phrasing", () => {
    expect(looksLikeObjection("we already have an SEP, but thanks")).toBe(true);
    expect(looksLikeObjection("it's too expensive for us right now")).toBe(true);
    expect(looksLikeObjection("send me an email and I'll review")).toBe(true);
  });

  it("ignores too-short or off-topic chunks", () => {
    expect(looksLikeObjection("hello")).toBe(false);
    expect(looksLikeObjection("ok cool")).toBe(false);
    expect(looksLikeObjection("Bonjour Martin, ravi.")).toBe(false);
  });
});

describe("classifyObjection", () => {
  it("returns a coaching card when LLM detects an objection", async () => {
    const card = await classifyObjection(
      {
        prospectWindow: "Non non, on a déjà Outreach et ça marche bien.",
      },
      {
        model: { _mock: true },
        generate: vi.fn().mockResolvedValue({
          object: {
            objectionDetected: true,
            objectionClass: "already_have_a_vendor",
            prospectQuote: "on a déjà Outreach",
            confidence: 0.82,
          },
        }) as never,
      },
    );
    expect(card).not.toBeNull();
    expect(card?.objectionClass).toBe("already_have_a_vendor");
    expect(card?.label).toBe(PLAYBOOK.already_have_a_vendor.label);
    expect(card?.suggestedResponses.length).toBeGreaterThan(0);
  });

  it("returns null when objectionDetected=false", async () => {
    const card = await classifyObjection(
      { prospectWindow: "Oui ça m'intéresse, continuez." },
      {
        model: {} as never,
        generate: vi.fn().mockResolvedValue({
          object: {
            objectionDetected: false,
            objectionClass: null,
            prospectQuote: null,
            confidence: 0.05,
          },
        }) as never,
      },
    );
    expect(card).toBeNull();
  });

  it("returns null when confidence is below threshold", async () => {
    const card = await classifyObjection(
      { prospectWindow: "hmm peut-être plus tard" },
      {
        model: {} as never,
        generate: vi.fn().mockResolvedValue({
          object: {
            objectionDetected: true,
            objectionClass: "not_the_right_time",
            prospectQuote: "peut-être plus tard",
            confidence: 0.4,
          },
        }) as never,
      },
    );
    expect(card).toBeNull();
  });

  it("swallows LLM errors and returns null", async () => {
    const card = await classifyObjection(
      { prospectWindow: "trop cher" },
      {
        model: {} as never,
        generate: vi.fn().mockRejectedValue(new Error("anthropic 500")) as never,
      },
    );
    expect(card).toBeNull();
  });
});
