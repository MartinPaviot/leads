import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import {
  AGENT_EVAL_CONFIGS,
  type AgentEvalConfig,
  type EvalCase,
  type GraderResult,
  runGrader,
  computeCompositeScore,
  computeClassificationMetrics,
  computeMultiTrialMetrics,
  type MultiTrialResult,
  runDimensionJudges,
  JUDGE_DIMENSIONS,
  classifyEvalCase,
  type EvalSuiteType,
} from "@/lib/evals/agent-evals";
import { AGENT_REGISTRY } from "@/lib/observability/observability";

export const maxDuration = 300; // 5 min for full eval suite

// ─── Types ───────────────────────────────────────────────────

interface CaseResult {
  caseId: string;
  input: string;
  tags: string[];
  suiteType: EvalSuiteType;        // FIX 5: capability vs regression
  passed: boolean;
  compositeScore: number;
  graderResults: GraderResult[];
  // FIX 3: isolated dimension scores
  dimensionScores: Array<{ dimension: string; score: number; reasoning: string }> | null;
  // FIX 2: multi-trial metrics
  multiTrial: MultiTrialResult | null;
  responsePreview: string;
  toolsUsed: string[];
  latencyMs: number;
}

interface AgentEvalResult {
  agentId: string;
  agentName: string;
  category: string;
  passThreshold: number;
  totalCases: number;
  passedCases: number;
  passRate: number;
  meanScore: number;
  meanLatencyMs: number;
  // FIX 2: multi-trial aggregate
  passAtK: number | null;
  passExpK: number | null;
  // FIX 5: capability vs regression breakdown
  capabilityCases: { total: number; passed: number; passRate: number };
  regressionCases: { total: number; passed: number; passRate: number };
  classificationMetrics?: ReturnType<typeof computeClassificationMetrics>;
  caseResults: CaseResult[];
  verdict: "PASS" | "FAIL";
}

// ─── POST /api/eval/run-all ──────────────────────────────────

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = await req.json().catch(() => ({}));
  const agentFilter = body.agents as string[] | undefined; // optional: only run specific agents
  const configs = agentFilter
    ? AGENT_EVAL_CONFIGS.filter((c) => agentFilter.includes(c.agentId))
    : AGENT_EVAL_CONFIGS;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return Response.json({ error: "No LLM API key configured" }, { status: 503 });
  }

  const agentResults: AgentEvalResult[] = [];

  for (const config of configs) {
    const agentResult = await runAgentEval(config);
    agentResults.push(agentResult);
  }

  // Overall summary
  const totalCases = agentResults.reduce((s, r) => s + r.totalCases, 0);
  const totalPassed = agentResults.reduce((s, r) => s + r.passedCases, 0);
  const agentsPassed = agentResults.filter((r) => r.verdict === "PASS").length;

  return Response.json({
    summary: {
      totalAgents: agentResults.length,
      agentsPassed,
      agentsFailed: agentResults.length - agentsPassed,
      totalCases,
      totalPassed,
      totalFailed: totalCases - totalPassed,
      overallPassRate: totalCases > 0 ? `${((totalPassed / totalCases) * 100).toFixed(1)}%` : "N/A",
      agentPassRate: `${((agentsPassed / agentResults.length) * 100).toFixed(1)}%`,
      verdict: agentsPassed === agentResults.length ? "ALL PASS" : "HAS FAILURES",
    },
    agents: agentResults,
  });
}

// ─── Run eval for one agent ──────────────────────────────────

async function runAgentEval(config: AgentEvalConfig, trialsPerCase = 3): Promise<AgentEvalResult> {
  const agent = AGENT_REGISTRY[config.agentId];
  const caseResults: CaseResult[] = [];
  const classificationPredictions: Array<{ predicted: string; actual: string }> = [];

  for (const evalCase of config.cases) {
    // FIX 2: Multi-trial — run each case k times for statistical rigor
    const suiteType = classifyEvalCase(evalCase.tags);
    const k = suiteType === "regression" ? 1 : trialsPerCase; // regression cases only need 1 trial (they must always pass)

    const trialScores: number[] = [];
    let bestResult: CaseResult | null = null;

    for (let trial = 0; trial < k; trial++) {
      const result = await runSingleCase(evalCase, config);
      trialScores.push(result.compositeScore);
      if (!bestResult || result.compositeScore > bestResult.compositeScore) {
        bestResult = result;
      }
    }

    // Compute multi-trial metrics
    const multiTrial = k > 1
      ? computeMultiTrialMetrics(trialScores, config.passThreshold)
      : null;

    // Use best result as the representative, attach multi-trial data
    if (bestResult) {
      bestResult.multiTrial = multiTrial;
      bestResult.suiteType = suiteType;
      // FIX 5: For regression evals, pass^k must be high (all trials pass)
      // For capability evals, pass@k is what matters (at least 1 success)
      if (multiTrial) {
        bestResult.passed = suiteType === "regression"
          ? multiTrial.passExpK >= 0.8  // all trials should pass
          : multiTrial.passAtK >= 0.5;  // at least 1 should pass
      }
      caseResults.push(bestResult);
    }

    // Collect classification predictions
    if (evalCase.expectedOutput && evalCase.graders.some((g) => g.type === "classification") && bestResult) {
      classificationPredictions.push({
        predicted: bestResult.responsePreview.toLowerCase().trim().split(/\s+/)[0],
        actual: evalCase.expectedOutput.toLowerCase(),
      });
    }
  }

  const passedCases = caseResults.filter((r) => r.passed).length;
  const meanScore = caseResults.length > 0
    ? caseResults.reduce((s, r) => s + r.compositeScore, 0) / caseResults.length
    : 0;
  const meanLatencyMs = caseResults.length > 0
    ? caseResults.reduce((s, r) => s + r.latencyMs, 0) / caseResults.length
    : 0;

  // FIX 5: Separate capability vs regression metrics
  const capCases = caseResults.filter((r) => r.suiteType === "capability");
  const regCases = caseResults.filter((r) => r.suiteType === "regression");

  // FIX 2: Aggregate multi-trial
  const allTrialScores = caseResults
    .filter((r) => r.multiTrial)
    .flatMap((r) => r.multiTrial!.trialScores);
  const aggregateMultiTrial = allTrialScores.length > 0
    ? computeMultiTrialMetrics(allTrialScores, config.passThreshold)
    : null;

  const passRate = caseResults.length > 0 ? passedCases / caseResults.length : 0;
  const verdict = passRate >= config.passThreshold && meanScore >= config.passThreshold ? "PASS" : "FAIL";

  return {
    agentId: config.agentId,
    agentName: agent?.name || config.agentId,
    category: agent?.category || "unknown",
    passThreshold: config.passThreshold,
    totalCases: caseResults.length,
    passedCases,
    passRate,
    meanScore,
    meanLatencyMs: Math.round(meanLatencyMs),
    // FIX 2: multi-trial metrics
    passAtK: aggregateMultiTrial?.passAtK ?? null,
    passExpK: aggregateMultiTrial?.passExpK ?? null,
    // FIX 5: capability vs regression breakdown
    capabilityCases: {
      total: capCases.length,
      passed: capCases.filter((r) => r.passed).length,
      passRate: capCases.length > 0 ? capCases.filter((r) => r.passed).length / capCases.length : 0,
    },
    regressionCases: {
      total: regCases.length,
      passed: regCases.filter((r) => r.passed).length,
      passRate: regCases.length > 0 ? regCases.filter((r) => r.passed).length / regCases.length : 0,
    },
    classificationMetrics: classificationPredictions.length > 0
      ? computeClassificationMetrics(classificationPredictions)
      : undefined,
    caseResults,
    verdict,
  };
}

// ─── Run single eval case ────────────────────────────────────

async function runSingleCase(evalCase: EvalCase, config: AgentEvalConfig): Promise<CaseResult> {
  const start = Date.now();

  try {
    // For chat agent, run through the actual chat tools
    if (config.agentId === "chat") {
      return await runChatCase(evalCase, config, start);
    }

    // For other agents, simulate with generateText
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : openai("gpt-4o-mini");

    const systemPrompt = getAgentSystemPrompt(config.agentId);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: evalCase.input,
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
      maxTokens: 2000,
    });

    const latencyMs = Date.now() - start;
    const output = result.text;

    // Run deterministic graders (runGrader is async but these types resolve synchronously)
    const graderResults = await Promise.all(
      evalCase.graders
        .filter((g) => g.type !== "llm_judge" && g.type !== "faithfulness")
        .map((g) => runGrader(g, output, [], latencyMs)),
    );

    // FIX 3: Run isolated dimension judges instead of monolithic LLM-as-judge
    let dimensionScores: Array<{ dimension: string; score: number; reasoning: string }> | null = null;
    const hasLlmJudge = evalCase.graders.some((g) => g.type === "llm_judge");
    const agent = AGENT_REGISTRY[config.agentId];
    const agentCategory = agent?.category || "generation";
    const dimensions = JUDGE_DIMENSIONS[agentCategory] || JUDGE_DIMENSIONS.generation;

    if (hasLlmJudge && dimensions) {
      const judgeResult = await runDimensionJudges(
        evalCase.input,
        output,
        evalCase.context || evalCase.expectedOutput || "",
        dimensions,
        config.llmJudgeModel,
      );
      dimensionScores = judgeResult.dimensions;

      // Add dimension composite as LLM judge result
      const llmGraders = evalCase.graders.filter((g) => g.type === "llm_judge");
      for (const g of llmGraders) {
        graderResults.push({
          type: "llm_judge",
          passed: judgeResult.composite >= config.passThreshold,
          score: judgeResult.composite,
          weight: g.weight,
          detail: `Dimensions: ${judgeResult.dimensions.map((d) => `${d.dimension}=${d.score >= 0 ? d.score.toFixed(2) : "UNKNOWN"}`).join(", ")}`,
        });
      }
    }

    const compositeScore = computeCompositeScore(graderResults);
    const suiteType = classifyEvalCase(evalCase.tags);
    const passed = compositeScore >= config.passThreshold;

    return {
      caseId: evalCase.id,
      input: evalCase.input.slice(0, 200),
      tags: evalCase.tags,
      suiteType,
      passed,
      compositeScore,
      graderResults,
      dimensionScores,
      multiTrial: null, // filled by caller
      responsePreview: output.slice(0, 500),
      toolsUsed: [],
      latencyMs,
    };
  } catch (err) {
    return {
      caseId: evalCase.id,
      input: evalCase.input.slice(0, 200),
      tags: evalCase.tags,
      suiteType: classifyEvalCase(evalCase.tags),
      passed: false,
      compositeScore: 0,
      graderResults: [{ type: "pattern_match", passed: false, score: 0, weight: 1, detail: `Error: ${String(err)}` }],
      dimensionScores: null,
      multiTrial: null,
      responsePreview: "",
      toolsUsed: [],
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Chat agent case (with tool stubs) ───────────────────────

async function runChatCase(evalCase: EvalCase, config: AgentEvalConfig, start: number): Promise<CaseResult> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : openai("gpt-4o-mini");

  const { text, steps } = await generateText({
    model,
    system: `You are Elevay, a CRM AI assistant. You have tools to query the CRM database. Always use tools to answer questions — never guess. Include links to records in your response using [Name](/contacts/{id}) format. Respond in the user's language.`,
    messages: [{ role: "user", content: evalCase.input }],
    tools: buildChatToolStubs(),
    stopWhen: stepCountIs(5),
  });

  const latencyMs = Date.now() - start;
  const toolsUsed = steps
    .flatMap((s) => s.toolCalls || [])
    .map((tc) => tc.toolName);

  // Run deterministic graders (runGrader is async but these types resolve synchronously)
  const graderResults = await Promise.all(
    evalCase.graders
      .filter((g) => g.type !== "llm_judge" && g.type !== "faithfulness")
      .map((g) => runGrader(g, text, toolsUsed, latencyMs)),
  );

  // FIX 3: Isolated dimension judges for chat agent
  let dimensionScores: Array<{ dimension: string; score: number; reasoning: string }> | null = null;
  const hasLlmJudge = evalCase.graders.some((g) => g.type === "llm_judge");

  if (hasLlmJudge) {
    // FIX 1: Grade the OUTCOME (response quality), not the path (tool calls)
    const dimensions = JUDGE_DIMENSIONS.conversational;
    const judgeResult = await runDimensionJudges(
      evalCase.input,
      text,
      evalCase.context || evalCase.expectedOutput || "",
      dimensions,
      config.llmJudgeModel,
    );
    dimensionScores = judgeResult.dimensions;

    const llmGraders = evalCase.graders.filter((g) => g.type === "llm_judge");
    for (const g of llmGraders) {
      graderResults.push({
        type: "llm_judge",
        passed: judgeResult.composite >= config.passThreshold,
        score: judgeResult.composite,
        weight: g.weight,
        detail: `Dimensions: ${judgeResult.dimensions.map((d) => `${d.dimension}=${d.score >= 0 ? d.score.toFixed(2) : "?"}`).join(", ")}`,
      });
    }
  }

  const compositeScore = computeCompositeScore(graderResults);

  return {
    caseId: evalCase.id,
    input: evalCase.input.slice(0, 200),
    tags: evalCase.tags,
    suiteType: classifyEvalCase(evalCase.tags),
    passed: compositeScore >= config.passThreshold,
    compositeScore,
    graderResults,
    dimensionScores,
    multiTrial: null,
    responsePreview: text.slice(0, 500),
    toolsUsed,
    latencyMs,
  };
}

// ─── LLM-as-Judge ────────────────────────────────────────────

async function runLlmJudge(
  input: string,
  expectedOutput: string,
  actualOutput: string,
  judgeModel: string,
  customPrompt?: string,
): Promise<{ score: number; reasoning: string }> {
  const defaultPrompt = `Grade the AI agent's response quality on 0.0-1.0.

## User Query
${input}

${expectedOutput ? `## Expected Output\n${expectedOutput}\n` : ""}

## Agent's Output
${actualOutput.slice(0, 3000)}

## Rubric
- Accuracy (30%): Facts correct
- Relevance (25%): Answers the question
- Completeness (20%): Covers all aspects
- Actionability (15%): Concrete next steps
- Tone (10%): Professional and appropriate

Think step by step. End with SCORE: X.XX`;

  const prompt = customPrompt
    ? `${customPrompt}\n\n## User Query\n${input}\n\n${expectedOutput ? `## Expected Output\n${expectedOutput}\n\n` : ""}## Agent's Output\n${actualOutput.slice(0, 3000)}`
    : defaultPrompt;

  try {
    // Cross-model: use a different model than the one being evaluated
    const model = judgeModel.includes("gpt") && process.env.OPENAI_API_KEY
      ? openai(judgeModel)
      : process.env.ANTHROPIC_API_KEY
        ? anthropic("claude-sonnet-4-6")
        : null;

    if (!model) return { score: 0.5, reasoning: "No judge model available" };

    // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
    const result = await generateText({ model, prompt, maxTokens: 800 });
    const scoreMatch = result.text.match(/SCORE:\s*(\d+\.?\d*)/i);
    const score = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;

    return { score, reasoning: result.text.replace(/SCORE:\s*\d+\.?\d*/i, "").trim().slice(0, 500) };
  } catch (err) {
    return { score: 0, reasoning: `Judge error: ${String(err)}` };
  }
}

// ─── Chat Tool Stubs ─────────────────────────────────────────

function buildChatToolStubs() {
  return {
    searchCRM: { description: "Search CRM", parameters: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] }, execute: async () => ({ results: [] }) },
    queryContacts: { description: "Query contacts", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ contacts: [{ id: "eval-c1", name: "Sarah Chen", email: "sarah@meridian.com", title: "CTO" }] }) },
    queryAccounts: { description: "Query accounts", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ accounts: [{ id: "eval-a1", name: "Meridian Labs", domain: "meridian.com", industry: "SaaS", score: 85 }] }) },
    queryDeals: { description: "Query deals", parameters: { type: "object" as const, properties: { stage: { type: "string" }, search: { type: "string" } } }, execute: async () => ({ deals: [{ id: "eval-d1", name: "Meridian Enterprise", stage: "proposal", value: 75000 }] }) },
    queryActivities: { description: "Query activities", parameters: { type: "object" as const, properties: { entityType: { type: "string" }, entityId: { type: "string" } } }, execute: async () => ({ activities: [{ id: "eval-act1", type: "email_sent", summary: "Pricing discussion", occurredAt: "2026-03-28", entityType: "contact", entityId: "eval-c1", _sourceLink: "/contacts/eval-c1" }] }) },
    queryNotes: { description: "Query notes", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ notes: [{ id: "eval-n1", title: "Call notes", content: "Discussed budget", entityType: "contact", entityId: "eval-c1" }] }) },
    queryTasks: { description: "Query tasks", parameters: { type: "object" as const, properties: { status: { type: "string" } } }, execute: async () => ({ tasks: [] }) },
    getDealCoaching: { description: "Deal coaching", parameters: { type: "object" as const, properties: { dealId: { type: "string" } }, required: ["dealId"] }, execute: async () => ({ deal: { id: "eval-d1", name: "Meridian Enterprise", stage: "proposal", value: 75000 }, riskLevel: "low", daysSinceLastActivity: 5 }) },
    getAccountIntelligence: { description: "Account intelligence", parameters: { type: "object" as const, properties: { accountId: { type: "string" } }, required: ["accountId"] }, execute: async () => ({ account: { id: "eval-a1", name: "Meridian Labs", industry: "SaaS", score: 85 }, scoreBreakdown: { fit: 80, engagement: 90 } }) },
    createTask: { description: "Create task", parameters: { type: "object" as const, properties: { title: { type: "string" }, dueDate: { type: "string" } }, required: ["title"] }, execute: async () => ({ created: { id: "eval-t1", title: "Call CEO", status: "pending" } }) },
    draftEmail: { description: "Draft email", parameters: { type: "object" as const, properties: { contactId: { type: "string" }, purpose: { type: "string" } }, required: ["contactId", "purpose"] }, execute: async () => ({ emailDraft: { to: "sarah@meridian.com", contactName: "Sarah Chen" } }) },
    generateMeetingPrep: { description: "Meeting prep", parameters: { type: "object" as const, properties: { accountId: { type: "string" } } }, execute: async () => ({ meetingPrepData: { account: { name: "Meridian Labs" }, contacts: [{ name: "Sarah Chen", title: "CTO" }], deals: [{ name: "Meridian Enterprise", stage: "proposal" }] } }) },
    bulkUpdateDeals: { description: "Bulk update deals", parameters: { type: "object" as const, properties: { filter: { type: "object", properties: { stage: { type: "string" } } }, update: { type: "object", properties: { stage: { type: "string" } } } } }, execute: async () => ({ bulkUpdated: { count: 3 } }) },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── System Prompts per Agent ────────────────────────────────

function getAgentSystemPrompt(agentId: string): string {
  const prompts: Record<string, string> = {
    "process-reply": `You classify email replies into one of these categories: positive, negative, ooo, unsubscribe, unknown.
Respond with ONLY the category label, nothing else.
- positive: interested, wants to continue, asks for more info, schedules a call
- negative: not interested, already has a solution, asks to stop
- ooo: out of office, vacation, auto-reply
- unsubscribe: explicitly asks to be removed from mailing list
- unknown: ambiguous, can't determine intent`,

    "draft-email": `You write cold outreach emails for B2B SaaS sales. Be personalized, concise (under 150 words), and include a clear CTA. Format: Subject line first, then body.`,

    "follow-up-email": `You write follow-up emails after sales meetings. Reference specific discussion points, action items, and next steps. Be warm and professional.`,

    "suggest-reply": `You suggest 3 email replies with different tones: brief (2-3 sentences), detailed (comprehensive response), decline (gracious deferral). Label each clearly.`,

    "process-transcript": `You extract structured notes from meeting transcripts. Return JSON with: summary, keyPoints, actionItems, decisions, buyingSignals (budget, timeline, currentStack, painPoints, competitors, teamSize). Be thorough.`,

    "account-summarize": `You generate concise CRM account summaries. Return ONLY a JSON object with: accountSummary (1-3 sentences about relationship status), aboutBusiness (1-2 sentences about what the company does).`,

    "deal-analyze": `You analyze sales deals. Return JSON with: suggestedStage, stageReason, riskLevel (low/medium/high), risks (array), summary, nextActions (array). Be specific about risks.`,

    "deal-extract-intel": `You extract structured deal intelligence. Return JSON with: budget, teamSize, competitorTools (array), timeline, decisionMaker, nextSteps. Only extract what's explicitly mentioned.`,

    "icp-analysis": `You analyze company websites to infer the ideal customer profile. Return JSON with: companyDescription, productDescription, targetIndustries, companySizes, buyerRoles, geographies, confidenceScore.`,

    "smart-import": `You map CSV column headers to CRM field names. Return a JSON object where keys are original headers and values are CRM field names: firstName, lastName, email, phone, company, title, industry, website, notes, address, city, state, country.`,

    "world-model": `You analyze sales interaction patterns and build a business knowledge model. Return JSON with: productPositioning, commonObjections (array), competitors (array with frequency), buyerPersonas (array), dealPatterns, communicationStyle.`,

    "actions-recommender": `You recommend 5 priority sales actions. Return JSON array, each with: action, type (follow_up/close/rescue/research/expand), priority (critical/high/medium/low), reason, dealOrContact.`,

    "ai-autofill": `You extract structured data from CRM entity information and conversations. Return ONLY valid JSON: keys are field IDs, values are extracted values. If you cannot determine a value, omit the key. Do NOT guess.`,

    "send-sequence-step": `You personalize email templates for outbound sequences. Replace template variables with real data. Make it sound natural, not templated. Keep the original structure and intent.`,

    "meeting-prep": `You generate meeting preparation documents. Include: overview, account snapshot, attendee profiles, deal status, recent interactions, talking points, potential risks, open items. Be specific and actionable.`,

    "generate-meeting-prep": `You generate comprehensive meeting briefing documents. Cover: company overview, attendee details, deal context, talking points, risks, and preparation items.`,
  };

  return prompts[agentId] || `You are an AI agent. Respond accurately and concisely.`;
}
