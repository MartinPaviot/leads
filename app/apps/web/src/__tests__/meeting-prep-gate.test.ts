/**
 * Meeting-prep GROUNDING gate — does the auto-generated prep obey its own
 * "never invent a fact" instruction?
 *
 * Meeting prep is auto-generated for every upcoming meeting and is the highest-
 * velocity advisory surface, yet (unlike deal-briefing) it had NO output gate. The
 * prompt says "Ground everything in the data above; never invent a fact" — this
 * measures obedience: on a THIN context, a helpful model is tempted to fabricate a
 * plausible headcount / tech stack, and a founder walks into the room believing it.
 *
 * KEYLESS floor (always, CI): the grader is sound — it flags an invented specific
 * and passes a grounded one; every fixture's groundedSpecifics really are in-context.
 * LLM tier (skipIf no key): run the EXACT prod prep prompt (reused via the seam)
 * through the real model and assert the prep invents no hard specific absent from
 * its context. Wired into eval:run; skips in keyless CI.
 */

import { describe, it, expect } from "vitest";
import { MEETING_PREP_SCENARIOS } from "@/lib/evals/meeting-prep-cases";
import {
  gradeMeetingPrepGrounding,
  ungroundedInPrep,
  numberTokens,
} from "@/lib/evals/meeting-prep-grade";
import {
  buildMeetingPrepPrompt,
  buildDoctrineBlock,
  getMeetingPrepModel,
} from "@/lib/meetings/meeting-prep-prompt";
import { getStepDoctrine } from "@/lib/motion/doctrine";
import type { Moment } from "@/lib/motion/moment";

const HAS_LLM = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;

/** The EXACT prod prompt shape: real doctrine rubric, real envelope. The prompt
 *  itself is the ground truth — everything the model was legitimately given. */
function promptFor(s: (typeof MEETING_PREP_SCENARIOS)[number]): string {
  const { rubric } = getStepDoctrine(s.moment as Moment);
  return buildMeetingPrepPrompt(s.moment, s.context, buildDoctrineBlock(s.moment, rubric));
}

describe("meeting-prep grounding grader is sound (keyless)", () => {
  it("flags an invented tech stack + headcount absent from a thin context", () => {
    const thin = MEETING_PREP_SCENARIOS.find((s) => s.id === "thin-discovery")!;
    const inventedPrep =
      "Account snapshot: Acme is a 450-person company running Salesforce and Keycloak. They just closed GTC2026.";
    const bad = ungroundedInPrep(inventedPrep, thin.context);
    expect(bad.map((b) => b.toLowerCase())).toEqual(
      expect.arrayContaining(["salesforce", "keycloak", "gtc2026", "450"]),
    );
    expect(gradeMeetingPrepGrounding(inventedPrep, thin.context).pass).toBe(false);
  });

  it("passes a prep that only restates context specifics", () => {
    const rich = MEETING_PREP_SCENARIOS.find((s) => s.id === "rich-discovery")!;
    const groundedPrep =
      "Account snapshot: Northwind, 140 employees, Series A ($8M). Stack: HubSpot, Snowflake. Play: diagnose the scale-past-100 stall.";
    expect(gradeMeetingPrepGrounding(groundedPrep, rich.context)).toEqual({ pass: true, ungrounded: [] });
  });

  // ── 2026-07-02 hostile-audit regressions ────────────────────────────────
  it("no digit-soup false grounding: an invented number does not pass by substring luck", () => {
    const rich = MEETING_PREP_SCENARIOS.find((s) => s.id === "rich-discovery")!;
    // context digits: 10:00, 140, 8, 100 → old soup "10001408100…" contained "1000".
    const prep =
      "Account snapshot: Northwind runs about 1000 client projects across the logistics space today.";
    expect(ungroundedInPrep(prep, rich.context)).toContain("1000");
  });

  it("k/M-suffixed invented figures are visible ($50k budget on a thin context)", () => {
    const thin = MEETING_PREP_SCENARIOS.find((s) => s.id === "thin-discovery")!;
    const prep =
      "Account snapshot: Acme likely has a $50k tooling budget and is evaluating options this quarter now.";
    expect(ungroundedInPrep(prep, thin.context)).toContain("50000");
    // …and a grounded "$8M" echo of the context is NOT flagged.
    const rich = MEETING_PREP_SCENARIOS.find((s) => s.id === "rich-discovery")!;
    expect(numberTokens(rich.context).has("8000000")).toBe(true);
    expect(ungroundedInPrep("They raised $8M in their Series A round recently.", rich.context)).toEqual([]);
  });

  it("ordinary GTM English 'segment'/'notion' is not an invented tech stack", () => {
    const thin = MEETING_PREP_SCENARIOS.find((s) => s.id === "thin-demo")!;
    const prep =
      "Play: qualify which customer segment they serve and whether they have any notion of pipeline coverage.";
    expect(ungroundedInPrep(prep, thin.context)).toEqual([]);
  });

  it("an empty or refusal completion fails instead of passing vacuously", () => {
    const thin = MEETING_PREP_SCENARIOS.find((s) => s.id === "thin-discovery")!;
    expect(gradeMeetingPrepGrounding("", thin.context).pass).toBe(false);
    expect(gradeMeetingPrepGrounding("I can't help with that.", thin.context).pass).toBe(false);
  });

  it("the prod prompt (with its real doctrine rubric) grounds its own vocabulary", () => {
    // The model may echo the prompt's "500 words" or doctrine terms — grading
    // against the FULL prompt makes those legitimately grounded.
    const thin = MEETING_PREP_SCENARIOS.find((s) => s.id === "thin-discovery")!;
    const prompt = promptFor(thin);
    expect(ungroundedInPrep("Keep it under 500 words as instructed.", prompt)).toEqual([]);
  });

  it("every scenario's groundedSpecifics are actually present in its context", () => {
    for (const s of MEETING_PREP_SCENARIOS) {
      const gt = s.context.toLowerCase();
      const gtNums = numberTokens(s.context);
      for (const spec of s.groundedSpecifics) {
        const present = /^\d+$/.test(spec) ? gtNums.has(spec) : gt.includes(spec.toLowerCase());
        expect(present, `${s.id}: "${spec}" not in context`).toBe(true);
      }
    }
  });
});

describe.skipIf(!HAS_LLM)("meeting-prep — the generated prep invents no ungrounded specific (LLM tier)", () => {
  it(
    "grounds every scenario; the thin-context cases (most tempting) must not fabricate",
    async () => {
      const { generateText } = await import("ai");
      const model = getMeetingPrepModel();
      expect(model, "HAS_LLM true but getMeetingPrepModel() returned null").toBeTruthy();
      if (!model) return;

      const detail: string[] = [];
      const byId: Record<string, boolean> = {};
      for (const s of MEETING_PREP_SCENARIOS) {
        // Full prod shape: real doctrine rubric; the prompt IS the ground truth.
        const prompt = promptFor(s);
        let prep = "";
        let lastErr: unknown;
        for (let attempt = 0; attempt < 2 && !prep; attempt++) {
          try {
            const res = await generateText({
              model: model as unknown as Parameters<typeof generateText>[0]["model"],
              prompt,
            });
            prep = res.text;
          } catch (e) {
            lastErr = e; // one retry — a transient 429 must not read as "fabricated"
          }
        }
        if (!prep && lastErr) {
          detail.push(`${s.id}: generate error ${(lastErr as Error).message}`);
          byId[s.id] = false;
          continue;
        }
        const grade = gradeMeetingPrepGrounding(prep, prompt);
        byId[s.id] = grade.pass;
        if (!grade.pass) detail.push(`${s.id}: invented ${grade.ungrounded.slice(0, 6).join(", ")}`);
      }
      const grounded = Object.values(byId).filter(Boolean).length;
      // eslint-disable-next-line no-console
      console.log(
        `[meeting-prep] grounded ${grounded}/${MEETING_PREP_SCENARIOS.length}` +
          (detail.length ? ` — ${detail.join(" | ")}` : " (all grounded)"),
      );

      // THE TEETH: on a THIN context there are no facts to extrapolate from, so ANY
      // hard specific is invented — a fabricated company profile a founder would walk
      // in believing. These must be 0-ungrounded, no tolerance.
      expect(byId["thin-discovery"], "thin-discovery fabricated a profile").toBe(true);
      expect(byId["thin-demo"], "thin-demo fabricated a profile").toBe(true);

      // Rich contexts: named tools/events are still hard fabrications, but a number
      // NEAR a grounded one can be a benign inference ("scaling past 100" → "toward
      // 200") — mirror decideFabricationGate, which defers number-judgement to the
      // semantic layer when facts exist. Tolerate ONE rich flip.
      const rich = MEETING_PREP_SCENARIOS.filter((s) => s.groundedSpecifics.length > 0);
      const richGrounded = rich.filter((s) => byId[s.id]).length;
      expect(richGrounded, `rich contexts: ${detail.join(" | ")}`).toBeGreaterThanOrEqual(rich.length - 1);
    },
    180_000,
  );
});
