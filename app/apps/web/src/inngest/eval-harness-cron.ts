/**
 * Weekly eval-harness cron (Sprint-1 audit follow-up).
 *
 * Runs every Monday 02:00 UTC (after retention purge at 03:00 — but
 * eval-harness reads, never writes user data, so order is loose).
 * For each registered suite, executes all cases and writes one
 * aggregate row to `eval_runs`. The admin dashboard reads from there.
 *
 * The list of suites is intentionally maintained inline rather than
 * via a discovery mechanism. Easier to audit, harder to forget that
 * "this surface should also be eval'd" — code reviews surface it
 * when a new surface lands.
 */

import { inngest } from "./client";
import { runCitationParserEval } from "@/lib/evals/suites/citation-parser.eval";
import { runEmbeddingDriftEval } from "@/lib/evals/suites/embedding-drift.eval";
import { runDealBriefingEval } from "@/lib/evals/suites/deal-briefing.eval";
import { runChurnRiskEval } from "@/lib/evals/suites/churn-risk.eval";
import { runInboundQualificationEval } from "@/lib/evals/suites/inbound-qualification.eval";
import { runTranscriptCoachingEval } from "@/lib/evals/suites/transcript-coaching.eval";
import { logger } from "@/lib/observability/logger";

export const weeklyEvalHarness = inngest.createFunction(
  {
    id: "weekly-eval-harness",
    name: "Weekly LLM eval harness",
    retries: 0, // single shot per week — re-runs would double-write rows
    triggers: [{ cron: "TZ=UTC 0 2 * * 1" }], // Mondays 02:00 UTC
  },
  async ({ step }: { step: any }) => {
    const summaries: Array<{ surfaceId: string; passed: number; total: number }> = [];

    // Each suite gets its own `step.run` so a failure in one doesn't
    // skip the others, and Inngest's UI shows per-suite timing.
    const out1 = await step.run("citation-parser-eval", async () => {
      const s = await runCitationParserEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out1);

    // Sprint-3 : embedding drift canary. Skipped automatically when
    // OPENAI_API_KEY is missing (the embed call throws and the
    // harness counts cases as errored — not pass, not fail).
    const out2 = await step.run("embedding-drift-eval", async () => {
      const s = await runEmbeddingDriftEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out2);

    // Sprint-3 part 2 — schema-contract suites for the four
    // structured-output surfaces. Each validates that the Zod
    // contract still accepts canonical valid shapes and rejects
    // common drift patterns. No LLM call required ; suites run
    // in milliseconds even on the cron worker.
    const out3 = await step.run("deal-briefing-eval", async () => {
      const s = await runDealBriefingEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out3);

    const out4 = await step.run("churn-risk-eval", async () => {
      const s = await runChurnRiskEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out4);

    const out5 = await step.run("inbound-qualification-eval", async () => {
      const s = await runInboundQualificationEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out5);

    const out6 = await step.run("transcript-coaching-eval", async () => {
      const s = await runTranscriptCoachingEval();
      return { surfaceId: s.surfaceId, passed: s.casesPassed, total: s.casesTotal };
    });
    summaries.push(out6);

    logger.info("weekly-eval-harness: complete", { summaries });
    return { suitesRun: summaries.length, summaries };
  },
);
