/**
 * Tool Selection Monitor
 *
 * Post-hoc analysis of tool selection quality.
 * Runs on traces to detect:
 * 1. Wrong tool called (intent ≠ tool)
 * 2. No tool called when one was expected
 * 3. Excessive tool calls (over-tooling)
 * 4. Tool called with invalid/empty args
 *
 * Can run inline (on each trace) or batch (nightly audit).
 */

import { db } from "@/db";
import { agentTraces } from "@/db/schema";
import { eq, desc, gte, and, sql } from "drizzle-orm";

// ─── Intent-to-Tool Mapping ──────────────────────────────────
// Derived from tool-selection-eval (50 cases, 100% pass rate)

const INTENT_TOOL_MAP: Record<string, string[]> = {
  pipeline: ["analyzePipeline", "queryDeals", "getDealCoaching"],
  contacts: ["queryContacts", "searchCRM"],
  deals: ["queryDeals", "analyzePipeline"],
  email_draft: ["draftEmail", "generateFollowUpEmail"],
  meeting_prep: ["generateMeetingPrep", "prepSalesCall"],
  signals: ["scanSignals", "checkFundingSignals", "checkHiringSignals"],
  enrich: ["enrichContact", "findLeadsAtCompany"],
  sequence: ["enrollInSequence", "launchCampaign", "proposeCampaign"],
  battlecard: ["generateBattlecard", "researchCompetitor"],
  tam: ["buildTAM"],
  coaching: ["getDealCoaching", "getCoachingInsights"],
  task: ["createTask", "queryTasks", "completeTask"],
};

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  { pattern: /pipeline|funnel|stage/i, intent: "pipeline" },
  { pattern: /contact|who is|people at/i, intent: "contacts" },
  { pattern: /deal|opportunity|proposal|negotiat/i, intent: "deals" },
  { pattern: /draft|email|write.*to|send.*email/i, intent: "email_draft" },
  { pattern: /meeting|prep|call.*with|brief/i, intent: "meeting_prep" },
  { pattern: /signal|funding|hiring.*signal|job.*post/i, intent: "signals" },
  { pattern: /enrich|find.*lead|apollo|lookup/i, intent: "enrich" },
  { pattern: /sequence|campaign|outreach|outbound/i, intent: "sequence" },
  { pattern: /battlecard|competitor|vs\s|against/i, intent: "battlecard" },
  { pattern: /TAM|target.*market|build.*list/i, intent: "tam" },
  { pattern: /coach|advice|help.*deal|what.*do/i, intent: "coaching" },
  { pattern: /task|remind|to.?do|follow.?up/i, intent: "task" },
];

// ─── Types ───────────────────────────────────────────────────

export interface ToolSelectionAlert {
  traceId: string;
  userInput: string;
  detectedIntent: string | null;
  expectedTools: string[];
  actualTools: string[];
  alertType: "wrong_tool" | "no_tool" | "over_tooling" | "empty_args";
  severity: "low" | "medium" | "high";
  explanation: string;
}

export interface ToolSelectionReport {
  period: string;
  totalTraces: number;
  tracesWithTools: number;
  alerts: ToolSelectionAlert[];
  alertRate: number;
  topMismatches: Array<{ intent: string; calledInstead: string; count: number }>;
  toolUsageDistribution: Record<string, number>;
}

// ─── Single Trace Analysis ───────────────────────────────────

export function analyzeToolSelection(trace: {
  id: string;
  input: string | null;
  toolCalls: unknown;
  metadata: unknown;
}): ToolSelectionAlert | null {
  const input = trace.input || "";
  const toolCalls = (trace.toolCalls as Array<{ name: string; args?: string }>) || [];
  const actualTools = toolCalls.map((tc) => tc.name);

  if (actualTools.length === 0) return null;

  const detectedIntent = detectUserIntent(input);
  if (!detectedIntent) return null;

  const expectedTools = INTENT_TOOL_MAP[detectedIntent] || [];
  if (expectedTools.length === 0) return null;

  const hasExpectedTool = actualTools.some((t) => expectedTools.includes(t));

  if (!hasExpectedTool) {
    return {
      traceId: trace.id,
      userInput: input.slice(0, 200),
      detectedIntent,
      expectedTools,
      actualTools,
      alertType: "wrong_tool",
      severity: "high",
      explanation: `User intent "${detectedIntent}" expected one of [${expectedTools.join(", ")}] but got [${actualTools.join(", ")}]`,
    };
  }

  if (actualTools.length > 5) {
    return {
      traceId: trace.id,
      userInput: input.slice(0, 200),
      detectedIntent,
      expectedTools,
      actualTools,
      alertType: "over_tooling",
      severity: "medium",
      explanation: `${actualTools.length} tools called for a single intent — possible over-tooling`,
    };
  }

  const hasEmptyArgs = toolCalls.some((tc) => {
    const args = tc.args || "{}";
    return args === "{}" || args === "null" || args === "undefined";
  });
  if (hasEmptyArgs && detectedIntent !== "pipeline") {
    return {
      traceId: trace.id,
      userInput: input.slice(0, 200),
      detectedIntent,
      expectedTools,
      actualTools,
      alertType: "empty_args",
      severity: "low",
      explanation: "Tool called with empty arguments — may indicate unclear intent parsing",
    };
  }

  return null;
}

function detectUserIntent(input: string): string | null {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(input)) return intent;
  }
  return null;
}

// ─── Batch Analysis ──────────────────────────────────────────

export async function runToolSelectionAudit(
  tenantId: string,
  sinceDays: number = 7,
): Promise<ToolSelectionReport> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const traces = await db.select({
    id: agentTraces.id,
    input: agentTraces.input,
    toolCalls: agentTraces.toolCalls,
    metadata: agentTraces.metadata,
  })
    .from(agentTraces)
    .where(and(
      eq(agentTraces.tenantId, tenantId),
      eq(agentTraces.agentId, "chat"),
      gte(agentTraces.createdAt, since),
    ))
    .orderBy(desc(agentTraces.createdAt))
    .limit(500);

  const alerts: ToolSelectionAlert[] = [];
  const toolUsage: Record<string, number> = {};
  let tracesWithTools = 0;

  for (const trace of traces) {
    const traceTools = (trace.toolCalls as Array<{ name: string }>) || [];
    if (traceTools.length > 0) tracesWithTools++;

    for (const tc of traceTools) {
      toolUsage[tc.name] = (toolUsage[tc.name] || 0) + 1;
    }

    const alert = analyzeToolSelection(trace);
    if (alert) alerts.push(alert);
  }

  const mismatches: Record<string, number> = {};
  for (const alert of alerts.filter((a) => a.alertType === "wrong_tool")) {
    const key = `${alert.detectedIntent} → ${alert.actualTools[0]}`;
    mismatches[key] = (mismatches[key] || 0) + 1;
  }

  return {
    period: `Last ${sinceDays} days`,
    totalTraces: traces.length,
    tracesWithTools,
    alerts,
    alertRate: traces.length > 0 ? alerts.length / traces.length : 0,
    topMismatches: Object.entries(mismatches)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([key, count]) => {
        const [intent, tool] = key.split(" → ");
        return { intent, calledInstead: tool, count };
      }),
    toolUsageDistribution: toolUsage,
  };
}
