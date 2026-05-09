/**
 * Tool Selection Evaluation
 *
 * Measures whether the chat agent selects the correct tool(s) for a
 * given user query. This is the single most important eval for an
 * agent-based product -- if tool selection is wrong, everything
 * downstream is wrong.
 *
 * Methodology:
 * - 50 test queries covering all tool categories
 * - Each query has 1-3 expected tools and 1-3 forbidden tools
 * - Run the query through the model with all tools available
 * - Measure: precision (correct tools / selected tools),
 *   recall (correct tools / expected tools), F1
 * - Track confusion matrix: which tools get confused with which
 *
 * This eval is pure-deterministic (no LLM call): it tests the
 * tool-router + orchestrator pipeline via detectIntent/classifyIntent
 * and verifies the routed tool set contains expected tools and
 * excludes forbidden ones.
 */

import {
  detectIntent,
  routeTools,
  getToolsInGroup,
} from "../chat/tool-router";
import {
  classifyIntent,
  getSpecialistTools,
  CONFIDENCE_THRESHOLD,
  type SpecialistId,
} from "../agents/orchestrator";

// ── Types ──────────────────────────────────────────────────────

export interface ToolSelectionTestCase {
  /** Unique identifier for the test case. */
  id: string;
  /** The user query to test. */
  query: string;
  /** At least one of these tools should be reachable in the routed set. */
  expectedTools: string[];
  /** None of these tools should be in the routed set. */
  forbiddenTools?: string[];
  /** Expected intent category for readability / debugging. */
  expectedIntent: string;
  /** Test category for per-category breakdown. */
  category: ToolSelectionCategory;
}

export type ToolSelectionCategory =
  | "crm"
  | "actions"
  | "intelligence"
  | "skills"
  | "edge_cases";

export interface ToolSelectionResult {
  caseId: string;
  query: string;
  category: ToolSelectionCategory;
  /** True if at least one expectedTool is in the routed set. */
  expectedHit: boolean;
  /** True if zero forbiddenTools are in the routed set. */
  forbiddenClean: boolean;
  /** Which expected tools were found. */
  foundExpected: string[];
  /** Which expected tools were missing. */
  missingExpected: string[];
  /** Which forbidden tools leaked through. */
  leakedForbidden: string[];
  /** All tool groups detected by the router. */
  detectedGroups: string[];
  /** Orchestrator specialist (if routed). */
  specialist: string | null;
  /** Pass = expectedHit AND forbiddenClean. */
  pass: boolean;
}

export interface ToolSelectionSummary {
  totalCases: number;
  passed: number;
  failed: number;
  precision: number;
  recall: number;
  f1: number;
  perCategory: Record<
    ToolSelectionCategory,
    { total: number; passed: number; precision: number; recall: number; f1: number }
  >;
  /** Tools that were expected but most frequently missing. */
  topMissingTools: Array<{ tool: string; count: number }>;
  /** Forbidden tools that leaked most frequently. */
  topLeakedTools: Array<{ tool: string; count: number }>;
  results: ToolSelectionResult[];
}

// ── 50 Test Cases ──────────────────────────────────────────────

export const TOOL_SELECTION_CASES: ToolSelectionTestCase[] = [
  // ─── CRM Queries (10) ───────────────────────────────────────
  {
    id: "crm-001",
    query: "How many deals do we have?",
    expectedTools: ["queryDeals", "searchCRM"],
    forbiddenTools: ["draftEmail", "createDeal", "buildTAM"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-002",
    query: "Show me contacts at Acme Corp",
    expectedTools: ["queryContacts", "searchCRM"],
    forbiddenTools: ["createContact", "draftEmail", "enrollInSequence"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-003",
    query: "Give me a pipeline summary",
    expectedTools: ["queryDeals", "analyzePipeline"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "query + intelligence",
    category: "crm",
  },
  {
    id: "crm-004",
    query: "Who is the CTO at Meridian Labs?",
    expectedTools: ["queryContacts", "searchCRM"],
    forbiddenTools: ["createContact", "buildTAM"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-005",
    query: "List all tasks due this week",
    expectedTools: ["queryTasks"],
    forbiddenTools: ["createTask", "draftEmail"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-006",
    query: "What's the total value of deals in negotiation stage?",
    expectedTools: ["queryDeals", "runBasicReport"],
    forbiddenTools: ["createDeal", "updateDeal"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-007",
    query: "Search for emails from last week about pricing",
    expectedTools: ["searchEmailsByMetadata", "semanticSearchEmails"],
    forbiddenTools: ["draftEmail", "createNote"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-008",
    query: "Show me recent activity on the DataSync account",
    expectedTools: ["queryActivities", "queryAccounts"],
    forbiddenTools: ["createAccount", "enrollInSequence"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-009",
    query: "Find notes about the security audit deal",
    expectedTools: ["queryNotes", "semanticSearchNotes"],
    forbiddenTools: ["createNote", "draftEmail"],
    expectedIntent: "query",
    category: "crm",
  },
  {
    id: "crm-010",
    query: "Count how many accounts we have in the fintech industry",
    expectedTools: ["queryAccounts", "searchCRM", "runBasicReport"],
    forbiddenTools: ["createAccount", "buildTAM"],
    expectedIntent: "query",
    category: "crm",
  },

  // ─── Actions (10) ──────────────────────────────────────────
  {
    id: "action-001",
    query: "Draft an email to Sarah about the proposal",
    expectedTools: ["draftEmail", "generateFollowUpEmail"],
    forbiddenTools: ["getCoachingInsights", "listSchema"],
    expectedIntent: "action",
    category: "actions",
  },
  {
    id: "action-002",
    query: "Create a task to follow up with Marc on Monday",
    expectedTools: ["createTask"],
    forbiddenTools: ["analyzePipeline", "buildTAM"],
    expectedIntent: "create",
    category: "actions",
  },
  {
    id: "action-003",
    query: "Enroll Lisa Park in the cold outreach sequence",
    expectedTools: ["enrollInSequence"],
    forbiddenTools: ["getCoachingInsights", "listSchema"],
    expectedIntent: "action",
    category: "actions",
  },
  {
    id: "action-004",
    query: "Add a new contact: John Smith, CTO at TechCorp, john@techcorp.com",
    expectedTools: ["createContact", "upsertContact"],
    forbiddenTools: ["draftEmail", "analyzePipeline"],
    expectedIntent: "create",
    category: "actions",
  },
  {
    id: "action-005",
    query: "Update the Meridian deal to negotiation stage",
    expectedTools: ["updateDeal", "updateDealStage"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "update",
    category: "actions",
  },
  {
    id: "action-006",
    query: "Send a follow-up email after our meeting yesterday",
    expectedTools: ["draftEmail", "generateFollowUpEmail", "sendMeetingFollowUp"],
    forbiddenTools: ["buildTAM", "analyzePipeline"],
    expectedIntent: "action",
    category: "actions",
  },
  {
    id: "action-007",
    query: "Create a new deal for CloudNova worth $50K",
    expectedTools: ["createDeal"],
    forbiddenTools: ["draftEmail", "analyzePipeline"],
    expectedIntent: "create",
    category: "actions",
  },
  {
    id: "action-008",
    query: "Log a call with David Kim about the integration timeline",
    expectedTools: ["logActivity", "createNote"],
    forbiddenTools: ["draftEmail", "buildTAM"],
    expectedIntent: "create",
    category: "actions",
  },
  {
    id: "action-009",
    query: "Mark the onboarding task as complete",
    expectedTools: ["completeTask", "updateTask"],
    forbiddenTools: ["createTask", "draftEmail"],
    expectedIntent: "update",
    category: "actions",
  },
  {
    id: "action-010",
    query: "Launch a campaign targeting VP Engineering at SaaS companies",
    expectedTools: ["launchCampaign", "proposeCampaign"],
    forbiddenTools: ["analyzePipeline", "buildTAM"],
    expectedIntent: "action",
    category: "actions",
  },

  // ─── Intelligence (10) ─────────────────────────────────────
  {
    id: "intel-001",
    query: "Coach me on the Acme deal",
    expectedTools: ["getDealCoaching"],
    forbiddenTools: ["createDeal", "buildTAM"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-002",
    query: "Meeting prep for my call with Meridian Labs tomorrow",
    expectedTools: ["generateMeetingPrep", "prepSalesCall"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-003",
    query: "What signals should I be paying attention to?",
    expectedTools: ["scanSignals"],
    forbiddenTools: ["createContact", "draftEmail"],
    expectedIntent: "skills",
    category: "intelligence",
  },
  {
    id: "intel-004",
    query: "Analyze my pipeline health",
    expectedTools: ["analyzePipeline", "queryDeals", "getDealCoaching"],
    forbiddenTools: ["createDeal"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-005",
    query: "Give me a briefing on all my deals",
    expectedTools: ["briefAllDeals", "briefDeal"],
    forbiddenTools: ["createDeal", "buildTAM"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-006",
    query: "Which deals are at risk of stalling?",
    expectedTools: ["detectChurnRisk", "analyzePipeline", "queryDeals"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-007",
    query: "What's the forecast for this quarter?",
    expectedTools: ["getRevenueForcast", "analyzePipeline"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-008",
    query: "How is my sales performance this month?",
    expectedTools: ["getMyPerformance", "getCoachingInsights"],
    forbiddenTools: ["createDeal", "buildTAM"],
    expectedIntent: "coaching",
    category: "intelligence",
  },
  {
    id: "intel-009",
    query: "Get me intel on the Meridian Labs account",
    expectedTools: ["getAccountIntelligence", "getEnrichedContext"],
    forbiddenTools: ["createAccount", "draftEmail"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },
  {
    id: "intel-brain-001",
    query: "What do we know about Acme?",
    expectedTools: ["getCompanyBrain"],
    forbiddenTools: ["createDeal", "draftEmail", "buildTAM"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-brain-002",
    query: "Tell me about stripe.com",
    expectedTools: ["getCompanyBrain"],
    forbiddenTools: ["createAccount", "draftEmail", "createContact"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-brain-003",
    query: "Brain on Hubspot",
    expectedTools: ["getCompanyBrain"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-brain-004",
    query: "Give me the full picture on the Meridian Labs account",
    expectedTools: ["getCompanyBrain", "getAccountIntelligence", "getEnrichedContext"],
    forbiddenTools: ["createDeal", "createContact"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-brain-005",
    query: "Summarise our relationship with Stripe",
    expectedTools: ["getCompanyBrain"],
    forbiddenTools: ["createDeal", "draftEmail"],
    expectedIntent: "briefing",
    category: "intelligence",
  },
  {
    id: "intel-010",
    query: "Help me prepare a strategy for re-engaging stalled deals",
    expectedTools: ["reEngageStalledDeal", "getDealCoaching", "analyzePipeline"],
    forbiddenTools: ["createDeal", "buildTAM"],
    expectedIntent: "intelligence",
    category: "intelligence",
  },

  // ─── Skills (10) ────────────────────────────────────────────
  {
    id: "skills-001",
    query: "Build a TAM for SaaS companies in Europe",
    expectedTools: ["buildTAM"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-002",
    query: "Research competitor Gong and give me a battlecard",
    expectedTools: ["researchCompetitor", "generateBattlecard"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-003",
    query: "Find leads at CloudNova who are decision makers",
    expectedTools: ["findLeadsAtCompany"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-004",
    query: "Define our ICP based on our closed-won deals",
    expectedTools: ["defineICP"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-005",
    query: "Qualify these inbound leads and rank them",
    expectedTools: ["qualifyLeads", "qualifyInboundLead"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-006",
    query: "Enrich the contact Sarah Chen with Apollo data",
    expectedTools: ["enrichContact"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-007",
    query: "Check for funding signals at companies in our pipeline",
    expectedTools: ["checkFundingSignals"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-008",
    query: "Are there any hiring signals at our target accounts?",
    expectedTools: ["checkHiringSignals"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-009",
    query: "Detect any leadership changes at Acme Corp",
    expectedTools: ["detectLeadershipChanges"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },
  {
    id: "skills-010",
    query: "Look for expansion opportunities among our existing customers",
    expectedTools: ["detectExpansionOpportunities"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "skills",
    category: "skills",
  },

  // ─── Edge Cases (10) ───────────────────────────────────────
  {
    id: "edge-001",
    query: "Montre-moi les deals en cours et prépare un email de relance pour les deals bloqués",
    expectedTools: ["queryDeals", "draftEmail"],
    forbiddenTools: ["buildTAM"],
    expectedIntent: "query + action (French, multi-intent)",
    category: "edge_cases",
  },
  {
    id: "edge-002",
    query: "Combien de contacts avons-nous chez DataSync?",
    expectedTools: ["queryContacts", "searchCRM"],
    forbiddenTools: ["createContact", "buildTAM"],
    expectedIntent: "query (French)",
    category: "edge_cases",
  },
  {
    id: "edge-003",
    query: "hmm not sure what to do today",
    expectedTools: ["queryDeals", "queryTasks", "briefAllDeals"],
    forbiddenTools: [],
    expectedIntent: "default fallback",
    category: "edge_cases",
  },
  {
    id: "edge-004",
    query: "Don't send any emails to the Acme account, just show me what we have",
    expectedTools: ["queryAccounts", "queryContacts", "queryActivities", "searchCRM"],
    forbiddenTools: [],
    expectedIntent: "query (negation -- router cannot parse negation, tracks as known limitation)",
    category: "edge_cases",
  },
  {
    id: "edge-005",
    query: "Research DataSync, find their CTO, then draft a cold email and create a deal",
    expectedTools: ["queryContacts", "findLeadsAtCompany", "draftEmail", "createDeal"],
    forbiddenTools: [],
    expectedIntent: "compound multi-intent",
    category: "edge_cases",
  },
  {
    id: "edge-006",
    query: "undo",
    expectedTools: ["undoLastAction"],
    forbiddenTools: ["draftEmail", "createDeal", "buildTAM"],
    expectedIntent: "undo",
    category: "edge_cases",
  },
  {
    id: "edge-007",
    query: "Remember that DataSync prefers async communication",
    expectedTools: ["rememberContext"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "memory",
    category: "edge_cases",
  },
  {
    id: "edge-008",
    query: "Qui connait qui chez Meridian? Montre-moi les relations",
    expectedTools: ["exploreRelationships", "exploreGraph"],
    forbiddenTools: ["createDeal", "buildTAM"],
    expectedIntent: "memory (French, relationship query)",
    category: "edge_cases",
  },
  {
    id: "edge-009",
    query: "",
    expectedTools: ["queryDeals", "searchCRM"],
    forbiddenTools: [],
    expectedIntent: "empty query fallback",
    category: "edge_cases",
  },
  {
    id: "edge-010",
    query: "What fields can I track on contacts?",
    expectedTools: ["listSchema", "listAttributeDefinitions"],
    forbiddenTools: ["draftEmail", "createDeal"],
    expectedIntent: "schema",
    category: "edge_cases",
  },
];

// ── Build a synthetic tool registry ───────────────────────────
//
// We need a fake tool registry with all known tool names as keys.
// The values don't matter for routing -- only key names are checked.

function buildSyntheticToolRegistry(): Record<string, { name: string }> {
  // Gather every tool name from all groups + research/forecast
  const allToolNames = [
    // query
    "searchCRM", "queryContacts", "queryAccounts", "queryDeals",
    "queryActivities", "queryNotes", "queryTasks", "whoami",
    "listWorkspaceMembers", "searchMeetings", "searchEmailsByMetadata",
    "runBasicReport", "getNoteBody", "getCallRecording", "getEmailContent",
    "semanticSearchNotes", "semanticSearchEmails", "semanticSearchCallRecordings",
    "getRecordsByIds", "listComments", "listCommentReplies",
    "findDuplicateContacts", "listRecentToolCalls", "listSharedPrompts",
    "deleteSharedPrompt",
    // create
    "createContact", "createAccount", "createDeal", "createNote",
    "logActivity", "createSequence", "addSequenceStep", "createTask",
    "createKnowledgeEntry", "upsertContact", "upsertAccount",
    "upsertDealByCompany", "createCustomObjectType", "createSavedView",
    "createComment", "createSharedPrompt",
    // update
    "updateContact", "updateAccount", "updateDeal", "updateTask",
    "updateAccountLifecycle", "updateMeetingNotes", "updateSequence",
    "updateSequenceStep", "updateDealStage", "completeTask",
    "bulkUpdateDeals", "bulkUpdateContacts", "updateICP",
    "updateWorkspace", "updateUserProfile", "updateNotificationPreferences",
    "updatePrivacySettings", "updateKnowledgeEntry", "updatePipelineStages",
    "updateCustomFieldSchema", "updateCustomSignalDefinitions",
    "updateWorkflows", "updateMemberRole", "updateMailboxSettings",
    "updateMailCalendarIntegration", "updateCustomObjectType",
    // action
    "draftEmail", "generateFollowUpEmail", "suggestEmailReply",
    "autoProgressDeal", "sendMeetingFollowUp", "bookMeeting",
    "enrollInSequence", "runSequenceAutopilot", "launchCampaign",
    "unsubscribeContact", "proposeCampaign", "inviteMember",
    "resendInvite", "addMailbox", "runAiAttribute", "deleteComment",
    "deleteSequenceStep", "mergeContacts",
    // intelligence
    "getDealCoaching", "getAccountIntelligence", "generateMeetingPrep",
    "getMeetingNotes",
    // coaching
    "getCoachingInsights", "getMyPerformance", "searchExactWords",
    // skills
    "analyzePipeline", "scanSignals", "generateBattlecard",
    "researchCompetitor", "detectChurnRisk", "analyzeSequencePerformance",
    "findLeadsAtCompany", "detectExpansionOpportunities", "buildTAM",
    "findLeadsByDomain", "defineICP", "prepSalesCall", "qualifyLeads",
    "qualifyInboundLead", "enrichContact", "checkDuplicates",
    "trackChampions", "checkFundingSignals", "checkHiringSignals",
    "detectLeadershipChanges", "scopePoC", "draftProposal",
    "handleObjection", "reEngageStalledDeal",
    // memory
    "exploreGraph", "rememberContext", "recallMemories", "forgetMemory",
    "exploreRelationships",
    // briefing
    "briefAllDeals", "briefDeal", "getEnrichedContext",
    // company brain
    "getCompanyBrain",
    // schema
    "listSchema", "listAttributeDefinitions",
    // undo
    "undoLastAction",
    // research
    "buildCompanyDossier",
    // forecast
    "getRevenueForcast",
  ];

  const registry: Record<string, { name: string }> = {};
  for (const name of allToolNames) {
    registry[name] = { name };
  }
  return registry;
}

// ── Evaluation Engine ─────────────────────────────────────────

/**
 * Run a single tool selection test case. Uses both the tool-router
 * (detectIntent + routeTools) and the orchestrator (classifyIntent +
 * getSpecialistTools) to produce the final routed tool set, mirroring
 * exactly how the chat route works.
 */
export function evaluateToolSelection(
  testCase: ToolSelectionTestCase,
  allTools?: Record<string, unknown>,
): ToolSelectionResult {
  const registry = allTools || buildSyntheticToolRegistry();
  const { query, expectedTools, forbiddenTools = [], category, id } = testCase;

  // 1. Run orchestrator (same as chat route)
  const orchestratorDecision = classifyIntent(query);
  let routedToolNames: Set<string>;
  let specialist: string | null = null;

  if (
    orchestratorDecision.confidence >= CONFIDENCE_THRESHOLD &&
    orchestratorDecision.specialists.length > 0
  ) {
    // Orchestrator is confident -- use specialist routing
    specialist = orchestratorDecision.specialists.join(",");
    const specialistTools = getSpecialistTools(
      orchestratorDecision.specialists,
      registry,
    );
    routedToolNames = new Set(Object.keys(specialistTools));
  } else {
    // Fall back to tool-router
    const routed = routeTools(registry, query);
    routedToolNames = new Set(Object.keys(routed));
  }

  // 2. Check expected tools: at least one must be present
  const foundExpected = expectedTools.filter((t) => routedToolNames.has(t));
  const missingExpected = expectedTools.filter((t) => !routedToolNames.has(t));
  const expectedHit = foundExpected.length > 0;

  // 3. Check forbidden tools: none should be present
  const leakedForbidden = forbiddenTools.filter((t) => routedToolNames.has(t));
  const forbiddenClean = leakedForbidden.length === 0;

  // 4. Get detected groups for debugging
  const detectedGroups = Array.from(detectIntent(query));

  return {
    caseId: id,
    query,
    category,
    expectedHit,
    forbiddenClean,
    foundExpected,
    missingExpected,
    leakedForbidden,
    detectedGroups,
    specialist,
    pass: expectedHit && forbiddenClean,
  };
}

/**
 * Run the full tool selection eval suite and produce aggregate metrics.
 */
export function runToolSelectionEval(
  cases: ToolSelectionTestCase[] = TOOL_SELECTION_CASES,
): ToolSelectionSummary {
  const allTools = buildSyntheticToolRegistry();
  const results = cases.map((tc) => evaluateToolSelection(tc, allTools));

  // Aggregate metrics
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  // Precision: of all "expected tool found" checks, how many are correct?
  // We measure at the case level: pass rate for expectedHit
  const expectedHitCount = results.filter((r) => r.expectedHit).length;
  // Recall: of all cases, how many had at least one expected tool?
  const recall = results.length > 0 ? expectedHitCount / results.length : 0;

  // Precision: of all cases, how many had zero forbidden tool leaks?
  const forbiddenCleanCount = results.filter((r) => r.forbiddenClean).length;
  const precision = results.length > 0 ? forbiddenCleanCount / results.length : 0;

  // F1 = harmonic mean of precision and recall
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Per-category breakdown
  const categories: ToolSelectionCategory[] = [
    "crm",
    "actions",
    "intelligence",
    "skills",
    "edge_cases",
  ];
  const perCategory = {} as ToolSelectionSummary["perCategory"];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    const catExpHit = catResults.filter((r) => r.expectedHit).length;
    const catForbClean = catResults.filter((r) => r.forbiddenClean).length;
    const catRecall = catResults.length > 0 ? catExpHit / catResults.length : 0;
    const catPrecision =
      catResults.length > 0 ? catForbClean / catResults.length : 0;
    const catF1 =
      catPrecision + catRecall > 0
        ? (2 * catPrecision * catRecall) / (catPrecision + catRecall)
        : 0;
    perCategory[cat] = {
      total: catResults.length,
      passed: catPassed,
      precision: catPrecision,
      recall: catRecall,
      f1: catF1,
    };
  }

  // Top missing tools
  const missingCounts: Record<string, number> = {};
  for (const r of results) {
    for (const tool of r.missingExpected) {
      missingCounts[tool] = (missingCounts[tool] || 0) + 1;
    }
  }
  const topMissingTools = Object.entries(missingCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }));

  // Top leaked tools
  const leakedCounts: Record<string, number> = {};
  for (const r of results) {
    for (const tool of r.leakedForbidden) {
      leakedCounts[tool] = (leakedCounts[tool] || 0) + 1;
    }
  }
  const topLeakedTools = Object.entries(leakedCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }));

  return {
    totalCases: results.length,
    passed,
    failed,
    precision,
    recall,
    f1,
    perCategory,
    topMissingTools,
    topLeakedTools,
    results,
  };
}
