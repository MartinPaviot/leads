/**
 * Eval Runner — Automated agent evaluation pipeline.
 *
 * Following Anthropic's best practices:
 * - Cross-model grading (different model grades than the one being evaluated)
 * - Reasoning-then-score pattern for LLM judges
 * - Regression detection (compare to previous runs)
 * - Per-tag breakdown for granular quality tracking
 */

import { db } from "@/db";
import { evalDatasets, evalCases, evalRuns, evalResults } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────

export interface EvalSummary {
  passRate: number;
  meanScore: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  meanLatencyMs: number;
  perTagScores: Record<string, { mean: number; count: number; passRate: number }>;
  regressions: Array<{ caseId: string; input: string; previousScore: number; currentScore: number }>;
}

// ─── Run Eval ─────────────────────────────────────────────────

export async function runEval(
  runId: string,
  datasetId: string,
  tenantId: string,
): Promise<EvalSummary> {
  // Mark run as running
  await db.update(evalRuns).set({ status: "running" }).where(eq(evalRuns.id, runId));

  try {
    // Get the run config
    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, runId)).limit(1);
    if (!run) throw new Error("Run not found");

    // Get all cases for this dataset
    const cases = await db.select().from(evalCases)
      .where(eq(evalCases.datasetId, datasetId));

    if (cases.length === 0) {
      const summary: EvalSummary = {
        passRate: 0, meanScore: 0, totalCases: 0, passedCases: 0,
        failedCases: 0, meanLatencyMs: 0, perTagScores: {}, regressions: [],
      };
      await db.update(evalRuns).set({
        status: "completed",
        summary: summary as unknown as Record<string, unknown>,
        completedAt: new Date(),
      }).where(eq(evalRuns.id, runId));
      return summary;
    }

    // Get previous run for regression detection
    const [previousRun] = await db.select().from(evalRuns)
      .where(and(
        eq(evalRuns.tenantId, tenantId),
        eq(evalRuns.datasetId, datasetId),
        eq(evalRuns.status, "completed"),
      ))
      .orderBy(desc(evalRuns.createdAt))
      .limit(1);

    const previousResults = previousRun
      ? await db.select().from(evalResults).where(eq(evalResults.runId, previousRun.id))
      : [];
    const previousScoreByCase = new Map(
      previousResults.map(r => [r.caseId, r.score || 0])
    );

    // Run each case
    const results: Array<{
      caseId: string;
      input: string;
      output: string;
      score: number;
      pass: boolean;
      reasoning: string;
      latencyMs: number;
      toolCallsCount: number;
      tags: string[];
    }> = [];

    for (const evalCase of cases) {
      const startTime = Date.now();

      // Step 1: Get agent output
      const agentOutput = await getAgentOutput(evalCase.input, evalCase.context || "", tenantId);
      const latencyMs = Date.now() - startTime;

      // Step 2: Grade with LLM-as-judge (cross-model)
      const gradeResult = await gradeWithLLM(
        evalCase.input,
        evalCase.expectedOutput || "",
        agentOutput.text,
        run.graderModel,
      );

      const pass = gradeResult.score >= 0.7; // Anthropic threshold

      // Save result
      await db.insert(evalResults).values({
        runId,
        caseId: evalCase.id,
        agentOutput: agentOutput.text,
        score: gradeResult.score,
        pass,
        graderReasoning: gradeResult.reasoning,
        latencyMs,
        toolCallsCount: agentOutput.toolCallsCount,
        metadata: { toolCalls: agentOutput.toolCalls },
      });

      results.push({
        caseId: evalCase.id,
        input: evalCase.input,
        output: agentOutput.text,
        score: gradeResult.score,
        pass,
        reasoning: gradeResult.reasoning,
        latencyMs,
        toolCallsCount: agentOutput.toolCallsCount,
        tags: (evalCase.tags || []) as string[],
      });
    }

    // Compute summary
    const passedCases = results.filter(r => r.pass).length;
    const totalScores = results.map(r => r.score);
    const meanScore = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
    const meanLatencyMs = results.reduce((a, r) => a + r.latencyMs, 0) / results.length;

    // Per-tag breakdown
    const perTagScores: Record<string, { scores: number[]; passes: number }> = {};
    for (const r of results) {
      for (const tag of r.tags) {
        if (!perTagScores[tag]) perTagScores[tag] = { scores: [], passes: 0 };
        perTagScores[tag].scores.push(r.score);
        if (r.pass) perTagScores[tag].passes++;
      }
    }

    const perTagSummary: Record<string, { mean: number; count: number; passRate: number }> = {};
    for (const [tag, data] of Object.entries(perTagScores)) {
      perTagSummary[tag] = {
        mean: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        count: data.scores.length,
        passRate: data.passes / data.scores.length,
      };
    }

    // Regression detection
    const regressions: EvalSummary["regressions"] = [];
    for (const r of results) {
      const prevScore = previousScoreByCase.get(r.caseId);
      if (prevScore !== undefined && prevScore >= 0.7 && r.score < 0.7) {
        regressions.push({
          caseId: r.caseId,
          input: r.input.slice(0, 100),
          previousScore: prevScore,
          currentScore: r.score,
        });
      }
    }

    const summary: EvalSummary = {
      passRate: passedCases / results.length,
      meanScore,
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
      meanLatencyMs,
      perTagScores: perTagSummary,
      regressions,
    };

    await db.update(evalRuns).set({
      status: "completed",
      summary: summary as unknown as Record<string, unknown>,
      completedAt: new Date(),
    }).where(eq(evalRuns.id, runId));

    return summary;
  } catch (error) {
    await db.update(evalRuns).set({ status: "failed" }).where(eq(evalRuns.id, runId));
    throw error;
  }
}

// ─── Agent Output ─────────────────────────────────────────────

async function getAgentOutput(
  input: string,
  context: string,
  tenantId: string,
): Promise<{ text: string; toolCalls: unknown[]; toolCallsCount: number }> {
  // Call the chat API internally to get agent response
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          ...(context ? [{ id: "ctx", role: "system", parts: [{ type: "text", text: context }] }] : []),
          { id: "eval", role: "user", parts: [{ type: "text", text: input }] },
        ],
      }),
    });

    // Parse the AI SDK v6 UI-message stream (SSE). The chat route now returns
    // `toUIMessageStreamResponse()`, so the body is a sequence of `data: {json}`
    // events rather than raw text — extract the `text-delta` pieces to
    // reconstruct the assistant's plain-text answer for grading.
    const reader = res.body?.getReader();
    let fullText = "";
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // keep the (possibly incomplete) tail
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload) as { type?: string; delta?: string; textDelta?: string };
              if (obj.type === "text-delta") fullText += obj.delta ?? obj.textDelta ?? "";
            } catch {
              // Non-JSON keepalive / comment line — ignore.
            }
          }
        }
      }
    }

    return { text: fullText, toolCalls: [], toolCallsCount: 0 };
  } catch (err) {
    return { text: `[Error: ${String(err)}]`, toolCalls: [], toolCallsCount: 0 };
  }
}

// ─── LLM-as-Judge Grader ──────────────────────────────────────

async function gradeWithLLM(
  input: string,
  expectedOutput: string,
  actualOutput: string,
  graderModel: string,
): Promise<{ score: number; reasoning: string }> {
  const prompt = `You are an evaluation judge for an AI sales assistant (CRM agent).

## Task
Grade the agent's response quality on a scale of 0.0 to 1.0.

## User Query
${input}

## Expected Output (reference)
${expectedOutput || "(No specific expected output — grade on general quality, relevance, and helpfulness)"}

## Agent's Actual Output
${actualOutput.slice(0, 3000)}

## Grading Rubric
Score each dimension 0.0-1.0, then compute weighted average:
- **Accuracy** (30%): Are facts correct? Does it match expected output if provided?
- **Relevance** (25%): Does it answer the actual question asked?
- **Completeness** (20%): Does it cover all aspects of the query?
- **Actionability** (15%): Does it provide concrete, useful next steps?
- **Tone** (10%): Professional, concise, appropriate for a sales context?

## Instructions
1. Think through each dimension carefully
2. Provide your reasoning
3. End with EXACTLY this format on the last line:
   SCORE: X.XX

Example: SCORE: 0.85`;

  try {
    let resultText: string;

    // Cross-model grading: if grader is OpenAI, use OpenAI; else use Anthropic
    if (graderModel.includes("gpt") && process.env.OPENAI_API_KEY) {
      const { openai } = await import("@ai-sdk/openai");
      const { generateText } = await import("ai");
      const result = await generateText({ model: openai(graderModel), prompt });
      resultText = result.text;
    } else if (process.env.ANTHROPIC_API_KEY) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      const { generateText } = await import("ai");
      const result = await generateText({ model: anthropic(graderModel), prompt });
      resultText = result.text;
    } else {
      return { score: 0.5, reasoning: "No grader model available" };
    }

    // Extract score from response
    const scoreMatch = resultText.match(/SCORE:\s*(\d+\.?\d*)/i);
    const score = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;
    const reasoning = resultText.replace(/SCORE:\s*\d+\.?\d*/i, "").trim();

    return { score, reasoning };
  } catch (err) {
    return { score: 0, reasoning: `Grading failed: ${String(err)}` };
  }
}
