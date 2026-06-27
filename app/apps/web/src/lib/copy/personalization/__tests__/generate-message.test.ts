import { describe, it, expect, vi } from "vitest";
import {
  generateMessage,
  assembleBody,
  brandViolations,
  recipientBenefitViolations,
  personalizationViolations,
  type GenerateMessageDeps,
  type Citation,
  type PersonalizationAgentResult,
  type PersonalizationAgentInput,
} from "../generate-message";

const evidence: Citation[] = [
  { id: "e1", fact: "raised a $4M seed in May", source: "techcrunch", confidence: 0.9, url: "https://tc/x" },
  { id: "e2", fact: "hiring 3 AEs", source: "careers", confidence: 0.4 }, // below floor
];

const baseDeps = (over: Partial<GenerateMessageDeps> = {}): GenerateMessageDeps => ({
  assets: { positioning: "We help seed startups", offer: "Done-for-you outbound", cta: "Worth a 15-min call?" },
  voice: { banned: ["leverage"], frFormality: "vouvoiement" },
  evidence,
  lang: "en",
  segmentLine: "Seed founders we work with cut SDR cost in half.",
  ...over,
});

const goodAgent = (line: string, citedIds: string[], subject?: string) =>
  vi.fn(async (_input: PersonalizationAgentInput): Promise<PersonalizationAgentResult> => ({ evalPassed: true, value: { line, subject, citedIds } }));

describe("assembleBody — AC1 deterministic assembly", () => {
  it("joins positioning + offer + personalization + CTA, skipping blanks", () => {
    expect(assembleBody({ positioning: "P", cta: "C" }, "PERSONAL")).toBe("P\n\nPERSONAL\n\nC");
  });
});

describe("brandViolations — AC5 brand rules", () => {
  it("flags banned words and em-dashes always", () => {
    expect(brandViolations("We leverage AI", ["leverage"])).toContain("leverage");
    expect(brandViolations("value—now", [])).toContain("—");
    expect(brandViolations("clean and direct", [])).toEqual([]);
  });
});

describe("generateMessage — AC1 grounded happy path", () => {
  it("produces a high-personalization message citing only the used evidence", async () => {
    const runAgent = goodAgent("Saw you raised your seed in May, congrats.", ["e1"], "Quick idea");
    const msg = await generateMessage(baseDeps({ runAgent }));
    expect(msg.personalization_level).toBe("high");
    expect(msg.flags).toEqual([]);
    expect(msg.evidence.map((e) => e.id)).toEqual(["e1"]);
    expect(msg.subject).toBe("Quick idea");
    expect(msg.body).toContain("Saw you raised your seed");
    expect(msg.body).toContain("We help seed startups"); // assembled with assets
    expect(runAgent).toHaveBeenCalledOnce();
  });

  it("flags `no-body` when there are no copy assets and no grounded line (empty body)", async () => {
    // No assets + no usable evidence + no segment line → assembleBody yields "".
    // This is the live-tenant reality (copy_asset_block empty) — must be flagged.
    const msg = await generateMessage(baseDeps({ assets: {}, evidence: [], segmentLine: "" }));
    expect(msg.body.trim()).toBe("");
    expect(msg.flags).toContain("no-body");
    expect(msg.flags).toContain("low-personalization");
  });

  it("does NOT flag `no-body` when assets produce a non-empty body", async () => {
    // Assets present but no evidence → fallback assembles a (generic) body from assets.
    const msg = await generateMessage(baseDeps({ evidence: [], segmentLine: "" }));
    expect(msg.body.trim().length).toBeGreaterThan(0);
    expect(msg.flags).not.toContain("no-body");
  });

  it("normalizes an empty/whitespace model subject to undefined so the cutover falls back to the legacy subject (no blank-subject clobber)", async () => {
    // The cutover sites do `engine.subject ?? legacySubject`. `??` only catches
    // null/undefined, so a "" model subject would clobber a good legacy subject
    // with a blank line. The engine must hand back undefined for empty/whitespace.
    expect((await generateMessage(baseDeps({ runAgent: goodAgent("Grounded line.", ["e1"], "") }))).subject).toBeUndefined();
    expect((await generateMessage(baseDeps({ runAgent: goodAgent("Grounded line.", ["e1"], "   ") }))).subject).toBeUndefined();
    // A real subject is trimmed, never blanked.
    expect((await generateMessage(baseDeps({ runAgent: goodAgent("Grounded line.", ["e1"], "  Quick idea  ") }))).subject).toBe("Quick idea");
  });

  it("only passes sufficient-confidence evidence to the agent (AC1 retrieval floor)", async () => {
    const runAgent = goodAgent("Grounded line about the seed.", ["e1"]);
    await generateMessage(baseDeps({ runAgent }));
    const passed = runAgent.mock.calls[0][0].evidence.map((e: Citation) => e.id);
    expect(passed).toEqual(["e1"]); // e2 (0.4) filtered out
  });
});

describe("generateMessage — AC2 never invent, segment fallback", () => {
  it("no sufficient-confidence evidence → segment fallback, flagged, no agent call", async () => {
    const runAgent = goodAgent("x", ["e1"]);
    const msg = await generateMessage(baseDeps({ evidence: [evidence[1]], runAgent })); // only the 0.4 one
    expect(msg.personalization_level).toBe("low");
    expect(msg.flags).toEqual(expect.arrayContaining(["low-personalization", "no-evidence"]));
    expect(msg.evidence).toEqual([]);
    expect(msg.body).toContain("Seed founders we work with"); // segment line, not invented
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("no agent configured → segment fallback", async () => {
    const msg = await generateMessage(baseDeps({ runAgent: undefined }));
    expect(msg.personalization_level).toBe("low");
    expect(msg.flags).toContain("no-agent");
  });

  it("agent cites a fact we did not supply → fallback (never ship a fabricated cite)", async () => {
    const runAgent = goodAgent("I saw your Series B.", ["ghost"]);
    const msg = await generateMessage(baseDeps({ runAgent }));
    expect(msg.personalization_level).toBe("low");
    expect(msg.flags).toEqual(expect.arrayContaining(["eval-failed-fallback", "uncited-evidence"]));
  });

  it("agent returns a claim with no citation → fallback", async () => {
    const runAgent = goodAgent("You seem like a great fit.", []);
    expect((await generateMessage(baseDeps({ runAgent }))).flags).toContain("no-citation");
  });

  it("a failed eval → non-result → fallback", async () => {
    const runAgent = vi.fn(async (): Promise<PersonalizationAgentResult> => ({ evalPassed: false, value: { line: "grounded", citedIds: ["e1"] }, reason: "judge failed" }));
    expect((await generateMessage(baseDeps({ runAgent }))).flags).toContain("eval-failed-fallback");
  });

  it("an agent throw → fallback", async () => {
    const runAgent = vi.fn(async (): Promise<PersonalizationAgentResult> => { throw new Error("model down"); });
    expect((await generateMessage(baseDeps({ runAgent }))).flags).toContain("agent-error");
  });
});

describe("generateMessage — AC5 brand + AC3 vouvoiement", () => {
  it("an em-dash in the grounded line → fallback (no em-dashes)", async () => {
    const runAgent = goodAgent("You raised in May—nice timing.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent }));
    expect(msg.personalization_level).toBe("low");
    expect(msg.flags.some((f) => f.startsWith("brand:"))).toBe(true);
  });

  it("a banned word → fallback", async () => {
    const runAgent = goodAgent("We leverage your seed raise.", ["e1"]);
    expect((await generateMessage(baseDeps({ runAgent }))).flags.some((f) => f.startsWith("brand:"))).toBe(true);
  });

  it("AC3: informal FR pronoun under vouvoiement → fallback", async () => {
    const runAgent = goodAgent("Vu que tu as levé en mai, parlons-en.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent, lang: "fr" }));
    expect(msg.flags).toContain("fr-informal");
  });

  it("AC3: formal FR (vouvoiement) grounded line passes", async () => {
    const runAgent = goodAgent("Vu que vous avez leve en mai, parlons-en.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent, lang: "fr" }));
    expect(msg.personalization_level).toBe("high");
  });
});

describe("generateMessage — AC3 role + AC4 winning formats passed through", () => {
  it("forwards roleClass + winningFormats to the agent and echoes role on the message", async () => {
    const runAgent = goodAgent("Grounded line.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent, roleClass: "decision-maker", winningFormats: ["3-sentence-PS"] }));
    expect(msg.roleClass).toBe("decision-maker");
    const input = runAgent.mock.calls[0][0];
    expect(input.roleClass).toBe("decision-maker");
    expect(input.winningFormats).toEqual(["3-sentence-PS"]);
  });
});

describe("personalizationViolations — unit", () => {
  it("clean grounded line → no violations", () => {
    expect(personalizationViolations({ line: "Saw your seed raise.", citedIds: ["e1"] }, [evidence[0]], { voice: { banned: [], frFormality: "vouvoiement" }, lang: "en" })).toEqual([]);
  });
  it("a seller-brag line is rejected via personalizationViolations", () => {
    const r = personalizationViolations({ line: "We're the #1 platform on the market.", citedIds: ["e1"] }, [evidence[0]], { voice: { banned: [], frFormality: "vouvoiement" }, lang: "en" });
    expect(r).toContain("seller-benefit");
  });
});

describe("recipientBenefitViolations — Monaco recipient-benefit floor", () => {
  it("congrats on a raise ALONE is clean (no funding-pitch)", () => {
    expect(recipientBenefitViolations("Saw you raised your seed in May, congrats.", "en")).toEqual([]);
    expect(recipientBenefitViolations("Félicitations pour la levée.", "fr")).toEqual([]);
  });
  it("funding mention + a sales push in the same line → funding-pitch", () => {
    expect(recipientBenefitViolations("You raised a Series A — book a demo of our product.", "en")).toContain("funding-pitch");
    expect(recipientBenefitViolations("Vous avez levé, découvrez notre offre.", "fr")).toContain("funding-pitch");
  });
  it("self-referential brags → seller-benefit (FR + EN)", () => {
    expect(recipientBenefitViolations("We are the leader in outbound.", "en")).toContain("seller-benefit");
    expect(recipientBenefitViolations("La meilleure solution du marché.", "fr")).toContain("seller-benefit");
    expect(recipientBenefitViolations("Notre produit est numéro 1.", "fr")).toContain("seller-benefit");
    expect(recipientBenefitViolations("The only platform you'll need.", "en")).toContain("seller-benefit");
  });
  it("a normal recipient-benefit line is clean", () => {
    expect(recipientBenefitViolations("Voici comment couvrir ce rôle pendant le recrutement.", "fr")).toEqual([]);
    expect(recipientBenefitViolations("Here's one idea you can apply this week.", "en")).toEqual([]);
  });

  // Regression: FUNDING_MENTION must NOT trip on these common non-funding words
  // (they were causing good copy to be wrongly rejected via the AND-gate).
  it("does NOT flag funding-pitch on leverage/level/seed-data/generic-raise + a sales push", () => {
    expect(recipientBenefitViolations("Leverage our platform to cut costs.", "en")).toEqual([]);
    expect(recipientBenefitViolations("Level up with our tool.", "en")).toEqual([]);
    expect(recipientBenefitViolations("We will seed your account in our platform.", "en")).toEqual([]);
    expect(recipientBenefitViolations("This will raise our product's value.", "en")).toEqual([]);
  });

  it("still flags real funding terms + a sales push (no recall lost)", () => {
    expect(recipientBenefitViolations("Félicitations pour la levée, découvrez notre offre.", "fr")).toContain("funding-pitch");
    expect(recipientBenefitViolations("You raised a Series A — book a demo of our product.", "en")).toContain("funding-pitch");
    expect(recipientBenefitViolations("Post seed round, buy our tool.", "en")).toContain("funding-pitch");
  });

  // Regression: SALES_PUSH verb stems (achet/souscri/abonn) must fire (the
  // trailing \b previously made them dead → funding-pitch false negatives).
  it("catches the verb-stem sales push after a funding mention", () => {
    expect(recipientBenefitViolations("Après votre levée, pensez à acheter.", "fr")).toContain("funding-pitch");
    expect(recipientBenefitViolations("Suite à votre levée, abonnez-vous.", "fr")).toContain("funding-pitch");
  });

  // Regression: "the leader OF X" / "your best Y" describe the RECIPIENT → not a brag.
  it("does NOT flag recipient role/compliment references", () => {
    expect(recipientBenefitViolations("As the leader of growth at Acme, you set the pace.", "en")).toEqual([]);
    expect(recipientBenefitViolations("Vous êtes le leader de votre équipe.", "fr")).toEqual([]);
    expect(recipientBenefitViolations("Congrats on shipping your best product to date.", "en")).toEqual([]);
  });

  it("still flags genuine self-referential brags", () => {
    expect(recipientBenefitViolations("We're the leader in the market.", "en")).toContain("seller-benefit");
    expect(recipientBenefitViolations("Try the best tool on the market.", "en")).toContain("seller-benefit");
  });
});

describe("generateMessage — recipient-benefit floor falls back", () => {
  it("a seller-brag grounded line → segment fallback (not shipped)", async () => {
    const runAgent = goodAgent("We are the best tool on the market.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent }));
    expect(msg.personalization_level).toBe("low");
    expect(msg.flags).toEqual(expect.arrayContaining(["eval-failed-fallback", "seller-benefit"]));
  });
  it("a funding-pitch grounded line → segment fallback", async () => {
    const runAgent = goodAgent("You raised your seed, buy our product.", ["e1"]);
    const msg = await generateMessage(baseDeps({ runAgent }));
    expect(msg.flags).toContain("funding-pitch");
  });
});
