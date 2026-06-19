import { describe, expect, it } from "vitest";
import { evaluateSequenceQuality } from "@/lib/agents/sequence-generator";
import { getMethodology } from "@/lib/scoring/outbound-methodologies";
import type { ProspectContext } from "@/lib/context/prospect-context";

/**
 * §19 relevance lint (OUT-02): the evaluator must block personal
 * trivia masquerading as personalization. Minimal ctx — the lint
 * only reads company name + contact first name.
 */
const ctx = {
  contact: { firstName: "Marie", fullName: "Marie Dupont" },
  company: { name: "Acme" },
} as unknown as ProspectContext;

const methodology = getMethodology("director");

function seq(body: string): string {
  return JSON.stringify({
    sequenceName: "test",
    sequenceReasoning: "test",
    steps: [
      {
        stepNumber: 1,
        subject: "quick thought",
        body,
        delayDays: 0,
        purpose: "open",
      },
    ],
  });
}

describe("evaluateSequenceQuality — §19 relevance lint", () => {
  it("passes a clean, business-grounded body", async () => {
    const r = await evaluateSequenceQuality(
      seq("Marie, Acme's three open data roles usually mean pipeline reliability is biting. How are you absorbing that load today?"),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(true);
  });

  it("blocks a team chant ('Go Chiefs')", async () => {
    const r = await evaluateSequenceQuality(
      seq("Saw you're in Kansas City — Go Chiefs! Anyway Marie, Acme might like our finance automation."),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(false);
    expect(r.feedback).toContain("irrelevant personal reference");
  });

  it("blocks sports fandom ('fan of the Niners')", async () => {
    const r = await evaluateSequenceQuality(
      seq("Big fan of the Niners too, Marie. Acme should look at our tooling."),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(false);
  });

  it("blocks hometown references", async () => {
    const r = await evaluateSequenceQuality(
      seq("Saw you're from Lyon, Marie — beautiful city. Acme could use our product."),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(false);
  });

  it("blocks alma mater references", async () => {
    const r = await evaluateSequenceQuality(
      seq("Fellow alum here, Marie. Acme and our product are a natural fit."),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(false);
  });

  it("does not false-positive on 'go beyond' phrasing", async () => {
    const r = await evaluateSequenceQuality(
      seq("Marie, teams at Acme's stage rarely go beyond systems that worked at 20 people. What breaks first for you?"),
      ctx,
      methodology,
    );
    expect(r.pass).toBe(true);
  });
});
