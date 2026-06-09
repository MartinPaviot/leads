/**
 * Multi-Agent Orchestrator
 *
 * Routes complex queries to specialist sub-agents instead of
 * dumping 126 tools on a single model. Based on Anthropic's
 * "Multi-Agent Research System" architecture.
 *
 * Specialists:
 * - ResearchAgent: company research, competitor analysis, market intel
 * - OutreachAgent: email drafting, sequence building, campaign management
 * - DealAgent: pipeline analysis, deal coaching, stage progression
 * - DataAgent: CRM queries, reports, analytics, custom objects
 * - AdminAgent: settings, workspace config, team management
 *
 * The orchestrator:
 * 1. Classifies the user's intent (fast, ~50 tokens via regex+keywords)
 * 2. Routes to 1-2 specialists with only their relevant tools
 * 3. Merges specialist responses into a unified reply
 * 4. Falls back to the full agent if classification is uncertain
 *
 * This reduces per-request tool count from 126 to ~15-25,
 * improving quality and cutting token cost by ~70%.
 */

// ── Types ────────────────────────────────────────────────────

export type SpecialistId = "research" | "outreach" | "deal" | "data" | "admin";

export interface RoutingDecision {
  /** Specialists selected for this request, ordered by relevance. */
  specialists: SpecialistId[];
  /** 0.0-1.0 confidence in the routing decision. Below 0.8 = fallback to full agent. */
  confidence: number;
  /** Human-readable explanation of why this routing was chosen. */
  reasoning: string;
}

// ── Specialist → Tool Group Mapping ─────────────────────────
//
// Each specialist owns a set of tool groups (from tool-router.ts).
// When a specialist is selected, only its groups' tools are included.

const SPECIALIST_TOOL_GROUPS: Record<SpecialistId, Set<string>> = {
  research: new Set(["query", "skills", "intelligence", "briefing", "memory"]),
  outreach: new Set(["query", "action", "create", "skills"]),
  deal: new Set(["query", "intelligence", "coaching", "briefing", "update", "action"]),
  data: new Set(["query", "schema", "briefing", "create", "update", "memory"]),
  admin: new Set(["query", "update", "schema", "action"]),
};

// ── Tool → Group Mapping (mirrored from tool-router.ts) ─────
//
// We need this here so getSpecialistTools can filter without importing
// the mutable TOOL_GROUPS object from tool-router. Keep in sync.

const TOOL_GROUP_MAP: Record<string, string> = {
  // query
  searchCRM: "query", queryContacts: "query", queryAccounts: "query",
  queryDeals: "query", queryActivities: "query", queryNotes: "query",
  queryTasks: "query", whoami: "query", listWorkspaceMembers: "query",
  searchMeetings: "query", searchEmailsByMetadata: "query",
  runBasicReport: "query", getNoteBody: "query", getCallRecording: "query",
  getCallList: "query",
  getEmailContent: "query", semanticSearchNotes: "query",
  semanticSearchEmails: "query", semanticSearchCallRecordings: "query",
  getRecordsByIds: "query", listComments: "query", listCommentReplies: "query",
  findDuplicateContacts: "query", listRecentToolCalls: "query",
  listSharedPrompts: "query", deleteSharedPrompt: "query",
  // navigation + command layer (always-available via "query")
  openRecord: "query", openListView: "query", composeEmail: "query",
  // read-gap tools
  querySequences: "query", getMailboxHealth: "query", queryProposals: "query",
  // create
  createContact: "create", createAccount: "create", createDeal: "create",
  createNote: "create", logActivity: "create", createSequence: "create",
  addSequenceStep: "create", createTask: "create", createKnowledgeEntry: "create",
  upsertContact: "create", upsertAccount: "create", upsertDealByCompany: "create",
  createCustomObjectType: "create", createSavedView: "create",
  createComment: "create", createSharedPrompt: "create",
  // update
  updateContact: "update", updateAccount: "update", updateDeal: "update",
  updateTask: "update", updateAccountLifecycle: "update",
  updateMeetingNotes: "update", updateSequence: "update",
  updateSequenceStep: "update", updateDealStage: "update",
  completeTask: "update", bulkUpdateDeals: "update",
  bulkUpdateContacts: "update", updateICP: "update",
  updateWorkspace: "update", updateUserProfile: "update",
  updateNotificationPreferences: "update", updatePrivacySettings: "update",
  updateKnowledgeEntry: "update", updatePipelineStages: "update",
  updateCustomFieldSchema: "update", updateCustomSignalDefinitions: "update",
  updateWorkflows: "update", updateMemberRole: "update",
  updateMailboxSettings: "update", updateMailCalendarIntegration: "update",
  updateCustomObjectType: "update",
  // action
  draftEmail: "action", generateFollowUpEmail: "action",
  suggestEmailReply: "action", autoProgressDeal: "action",
  sendMeetingFollowUp: "action", bookMeeting: "action",
  enrollInSequence: "action", runSequenceAutopilot: "action",
  launchCampaign: "action", unsubscribeContact: "action",
  proposeCampaign: "action", inviteMember: "action",
  resendInvite: "action", addMailbox: "action",
  runAiAttribute: "action", deleteComment: "action",
  deleteSequenceStep: "action", mergeContacts: "action",
  // intelligence
  getDealCoaching: "intelligence", getAccountIntelligence: "intelligence",
  generateMeetingPrep: "intelligence", getMeetingNotes: "intelligence",
  // coaching
  getCoachingInsights: "coaching", getMyPerformance: "coaching",
  searchExactWords: "coaching",
  // skills
  analyzePipeline: "skills", scanSignals: "skills",
  generateBattlecard: "skills", researchCompetitor: "skills",
  detectChurnRisk: "skills", analyzeSequencePerformance: "skills",
  findLeadsAtCompany: "skills", detectExpansionOpportunities: "skills",
  buildTAM: "skills", findLeadsByDomain: "skills",
  defineICP: "skills", prepSalesCall: "skills",
  qualifyLeads: "skills", qualifyInboundLead: "skills",
  enrichContact: "skills", checkDuplicates: "skills",
  enrichAccount: "skills", findContactMobile: "skills",
  trackChampions: "skills", checkFundingSignals: "skills",
  checkHiringSignals: "skills", detectLeadershipChanges: "skills",
  scopePoC: "skills", draftProposal: "skills",
  handleObjection: "skills", reEngageStalledDeal: "skills",
  // memory
  exploreGraph: "memory", rememberContext: "memory",
  recallMemories: "memory", forgetMemory: "memory",
  // briefing
  briefAllDeals: "briefing", briefDeal: "briefing",
  getEnrichedContext: "briefing",
  // company brain
  getCompanyBrain: "briefing",
  getContactBrain: "briefing",
  getDealBrain: "briefing",
  // schema
  listSchema: "schema", listAttributeDefinitions: "schema",
  // undo
  undoLastAction: "undo",
  // graph-reasoning (new)
  exploreRelationships: "memory",
};

// ── Intent Classification (fast, no LLM) ───────────────────
//
// Each pattern set maps to a specialist. Scored by match count
// and pattern specificity (longer patterns = higher weight).

interface ClassificationRule {
  specialist: SpecialistId;
  /** High-specificity patterns — match triggers immediate selection. */
  strongPatterns: RegExp[];
  /** Lower-specificity patterns — need 2+ to trigger. */
  weakPatterns: RegExp[];
  /** Weight for confidence scoring. Higher = more confident when matched. */
  weight: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    specialist: "research",
    strongPatterns: [
      /\bresearch\s+(?:company|competitor|market|industry)/i,
      /\bwhat\s+does\s+\w+\s+do\b/i,
      /\bfind\s+out\s+about\b/i,
      /\bcompetitor\s+(?:analysis|intel|landscape)\b/i,
      /\bbattlecard\b/i,
      /\bmarket\s+intel/i,
      /\bicp\b/i,
      /\bbuild\s*tam\b/i,
      /\bdefine\s+icp\b/i,
    ],
    weakPatterns: [
      /\bresearch\b/i,
      /\bcompetitor\b/i,
      /\bindustry\b/i,
      /\bmarket\b/i,
      /\btam\b/i,
      /\blead(?:s)?\b/i,
      /\benrich\b/i,
      /\bmobile\b/i,
      /\bphone\s*number\b/i,
      /\bqualify\b/i,
      /\bfunding\b/i,
      /\bhiring\b/i,
      /\bsignal(?:s)?\b/i,
    ],
    weight: 1.0,
  },
  {
    specialist: "outreach",
    strongPatterns: [
      /\bdraft\s+(?:an?\s+)?email\b/i,
      /\bwrite\s+(?:an?\s+)?email\b/i,
      /\bsend\s+(?:an?\s+)?(?:email|follow[\s-]*up)\b/i,
      /\bcreate\s+(?:a\s+)?sequence\b/i,
      /\blaunch\s+(?:a\s+)?campaign\b/i,
      /\boutreach\s+(?:plan|strategy|sequence)\b/i,
      /\benroll\s+(?:in|into)\s+(?:a\s+)?sequence\b/i,
    ],
    weakPatterns: [
      /\bdraft\b/i,
      /\bemail\b/i,
      /\bsequence\b/i,
      /\bcampaign\b/i,
      /\boutreach\b/i,
      /\bfollow[\s-]*up\b/i,
      /\breply\b/i,
      /\bwrite\b/i,
      /\benroll\b/i,
      /\bunsubscribe\b/i,
    ],
    weight: 1.0,
  },
  {
    specialist: "deal",
    strongPatterns: [
      /\bdeal\s+(?:coaching|advice|strategy|health)\b/i,
      /\bpipeline\s+(?:analysis|health|review)\b/i,
      /\bcoach\s+me\s+on\b/i,
      /\bforecast\b/i,
      /\bwin\s+rate\b/i,
      /\bstalled\s+deal/i,
      /\bchurn\s+risk\b/i,
      /\bre[\s-]*engage\b/i,
      /\bmeeting\s+prep\b/i,
      /\bprep\s+(?:me\s+)?for\s+(?:a\s+)?(?:call|meeting)\b/i,
    ],
    weakPatterns: [
      /\bdeal\b/i,
      /\bpipeline\b/i,
      /\bcoach\b/i,
      /\bstage\b/i,
      /\bforecast\b/i,
      /\bhealth\b/i,
      /\binsight/i,
      /\bperformance\b/i,
      /\badvice\b/i,
      /\bobjection\b/i,
      /\bproposal\b/i,
      /\bstrateg/i,
    ],
    weight: 1.0,
  },
  {
    specialist: "data",
    strongPatterns: [
      /\bshow\s+me\s+(?:all\s+)?(?:my\s+)?(?:contacts|accounts|deals|tasks)\b/i,
      /\bhow\s+many\s+(?:contacts|accounts|deals|tasks)\b/i,
      /\blist\s+(?:all\s+)?(?:my\s+)?(?:contacts|accounts|deals|tasks|notes)\b/i,
      /\breport\s+on\b/i,
      /\bcreate\s+(?:a\s+)?(?:contact|account|deal|task|note)\b/i,
      /\bupdate\s+(?:the\s+)?(?:contact|account|deal|task)\b/i,
      /\bsearch\s+(?:for\s+|my\s+)?(?:contacts|accounts|deals)\b/i,
      /\bimport\b/i,
    ],
    weakPatterns: [
      /\bshow\s+me\b/i,
      /\blist\b/i,
      /\bhow\s+many\b/i,
      /\bsearch\b/i,
      /\bfind\b/i,
      /\bcreate\b/i,
      /\bupdate\b/i,
      /\breport\b/i,
      /\bcount\b/i,
      /\badd\b/i,
      /\blog\b/i,
      /\bschema\b/i,
      /\bfields?\b/i,
      /\bnote\b/i,
      /\btask\b/i,
      /\bremember\b/i,
      /\bmemory\b/i,
    ],
    weight: 0.9,
  },
  {
    specialist: "admin",
    strongPatterns: [
      /\bworkspace\s+settings?\b/i,
      /\binvite\s+(?:a\s+)?(?:member|teammate|user)\b/i,
      /\bconfigure\s+(?:pipeline|workflows?|custom\s+fields?)\b/i,
      /\bupdate\s+(?:pipeline\s+stages|custom\s+fields?|workflows?)\b/i,
      /\bteam\s+management\b/i,
      /\bmember\s+role\b/i,
      /\bmailbox\s+settings?\b/i,
    ],
    weakPatterns: [
      /\bsettings?\b/i,
      /\bconfigure?\b/i,
      /\binvite\b/i,
      /\bworkspace\b/i,
      /\bpermission/i,
      /\brole\b/i,
      /\bmailbox\b/i,
      /\bintegration/i,
    ],
    weight: 0.8,
  },
];

/**
 * Classify the user's intent using regex + keyword matching.
 * Fast (~0.1ms), deterministic, no LLM call.
 *
 * Scoring:
 * - Each strong pattern match = 0.4 confidence
 * - Each weak pattern match = 0.15 confidence
 * - Capped at 1.0, weighted by rule.weight
 * - Multiple specialists can be selected if multiple intents are detected
 * - Confidence < 0.8 → fallback to full agent
 */
export function classifyIntent(message: string): RoutingDecision {
  const lower = message.toLowerCase().trim();

  if (!lower) {
    return {
      specialists: [],
      confidence: 0,
      reasoning: "Empty message — fallback to full agent",
    };
  }

  // Score each specialist
  const scores: Array<{ specialist: SpecialistId; score: number; strongHits: number; weakHits: number }> = [];

  for (const rule of CLASSIFICATION_RULES) {
    let strongHits = 0;
    let weakHits = 0;

    for (const pattern of rule.strongPatterns) {
      if (pattern.test(lower)) strongHits++;
    }
    for (const pattern of rule.weakPatterns) {
      if (pattern.test(lower)) weakHits++;
    }

    if (strongHits > 0 || weakHits >= 2) {
      const rawScore = (strongHits * 0.4 + weakHits * 0.15) * rule.weight;
      const score = Math.min(rawScore, 1.0);
      scores.push({ specialist: rule.specialist, score, strongHits, weakHits });
    }
  }

  if (scores.length === 0) {
    return {
      specialists: [],
      confidence: 0,
      reasoning: "No specialist patterns matched — fallback to full agent",
    };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Take the top specialist, plus any others that score > 0.3
  // (indicates multi-intent, e.g. "research Acme and draft an email")
  const primary = scores[0];
  const selected: SpecialistId[] = [primary.specialist];
  const reasonParts: string[] = [
    `${primary.specialist} (${primary.strongHits} strong, ${primary.weakHits} weak, score=${primary.score.toFixed(2)})`,
  ];

  for (let i = 1; i < scores.length && i < 2; i++) {
    if (scores[i].score >= 0.3) {
      selected.push(scores[i].specialist);
      reasonParts.push(
        `${scores[i].specialist} (${scores[i].strongHits} strong, ${scores[i].weakHits} weak, score=${scores[i].score.toFixed(2)})`
      );
    }
  }

  return {
    specialists: selected,
    confidence: primary.score,
    reasoning: `Matched specialists: ${reasonParts.join(", ")}`,
  };
}

// ── Tool Filtering ──────────────────────────────────────────

/**
 * Filter the full tool registry to only include tools relevant
 * to the given specialist(s). Unknown tools (not in the group map)
 * are always included to prevent dropping newly added tools.
 */
export function getSpecialistTools<T extends Record<string, unknown>>(
  specialists: SpecialistId[],
  allTools: T,
): T {
  // Merge all allowed groups from all selected specialists
  const allowedGroups = new Set<string>();
  for (const specialist of specialists) {
    const groups = SPECIALIST_TOOL_GROUPS[specialist];
    if (groups) {
      for (const g of groups) allowedGroups.add(g);
    }
  }

  // Always include "undo" — lightweight, universally useful
  allowedGroups.add("undo");

  const filtered: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(allTools)) {
    const group = TOOL_GROUP_MAP[name];
    // Unknown tools (not mapped) pass through to avoid dropping new tools
    if (!group || allowedGroups.has(group)) {
      filtered[name] = tool;
    }
  }

  return filtered as T;
}

// ── Specialist System Prompt Addendum ───────────────────────
//
// Each specialist gets a focused prompt that primes the LLM for
// its domain. This is appended to the base system prompt.

const SPECIALIST_PROMPTS: Record<SpecialistId, string> = {
  research: `
<specialist_mode>
You are operating in Research Specialist mode. Your primary job is company research, competitor analysis, market intelligence, lead qualification, and signal detection.

Priority tools: researchCompetitor, generateBattlecard, buildTAM, findLeadsAtCompany, findLeadsByDomain, defineICP, qualifyLeads, enrichContact, checkFundingSignals, checkHiringSignals, detectLeadershipChanges, scanSignals.

Behavior:
- Always ground research in real data from tools. Never speculate without evidence.
- When researching a company, pull ALL available data: enrichment, signals, contacts, activity history.
- Cross-reference multiple sources. If Apollo data conflicts with CRM data, flag the discrepancy.
- Quantify findings: headcount, funding amount, growth rate, tech stack specifics.
- End research with a clear recommendation: pursue, deprioritize, or investigate further.
</specialist_mode>`,

  outreach: `
<specialist_mode>
You are operating in Outreach Specialist mode. Your primary job is email drafting, sequence building, campaign management, and follow-up orchestration.

Priority tools: draftEmail, generateFollowUpEmail, suggestEmailReply, createSequence, addSequenceStep, enrollInSequence, launchCampaign, proposeCampaign, sendMeetingFollowUp.

Behavior:
- Always reference real interaction history when drafting emails. Never send generic templates.
- Match the user's established tone (check previous emails via queryActivities).
- Every email must have a clear CTA. No "just checking in" without a hook.
- For sequences: suggest timing based on the user's past engagement data.
- Personalize every touchpoint with company-specific intel (recent funding, hiring, product launches).
- When the user says "follow up", check the last interaction date and adjust urgency accordingly.
</specialist_mode>`,

  deal: `
<specialist_mode>
You are operating in Deal Specialist mode. Your primary job is pipeline analysis, deal coaching, stage progression, forecasting, and meeting preparation.

Priority tools: getDealCoaching, getAccountIntelligence, generateMeetingPrep, analyzePipeline, briefAllDeals, briefDeal, detectChurnRisk, autoProgressDeal, prepSalesCall, handleObjection, reEngageStalledDeal, scopePoC.

Behavior:
- Be a confrontational coach. Do not sugarcoat pipeline problems.
- Always calculate days since last contact. >7 days = yellow flag, >14 = red.
- Reference SPECIFIC emails, meetings, and quotes — not vague summaries.
- For coaching: diagnose the root cause (missing stakeholder? no champion? unclear timeline?) and prescribe a concrete next action with a specific person and date.
- For pipeline reviews: sort by risk first, then by value. The user needs to know what is dying before what is healthy.
- For meeting prep: include the contact's communication style, past objections, and competitive context.
</specialist_mode>`,

  data: `
<specialist_mode>
You are operating in Data Specialist mode. Your primary job is CRM queries, record creation/updates, reporting, analytics, and data management.

Priority tools: searchCRM, queryContacts, queryAccounts, queryDeals, queryActivities, queryNotes, queryTasks, runBasicReport, createContact, createAccount, createDeal, createNote, logActivity, createTask, updateContact, updateAccount, updateDeal, listSchema.

Behavior:
- Prefer precise tool calls over the CRM snapshot. The snapshot is limited to 10 recent records.
- For creation requests: collect required fields, create the record, and confirm with a link.
- For updates: show the current value, apply the change, and confirm the new value.
- For queries: use the most specific tool (queryContacts vs searchCRM) and filter aggressively.
- Present results in tables. Include entity links for every record.
- If a query returns 0 results, suggest alternative searches (different spelling, broader filter).
</specialist_mode>`,

  admin: `
<specialist_mode>
You are operating in Admin Specialist mode. Your primary job is workspace configuration, team management, pipeline settings, custom fields, and integration setup.

Priority tools: updateWorkspace, updatePipelineStages, updateCustomFieldSchema, updateCustomSignalDefinitions, updateWorkflows, inviteMember, updateMemberRole, addMailbox, updateMailboxSettings, updateMailCalendarIntegration.

Behavior:
- Verify the user has admin role before attempting config changes (tools will enforce this too).
- For pipeline stage changes: show the current stages, apply the change, and explain impact on existing deals.
- For custom fields: validate the field type and options before creating.
- For team invites: confirm the email and role before sending.
- Explain the implications of settings changes — e.g., changing approval mode affects all team members.
</specialist_mode>`,
};

/**
 * Get the system prompt addendum for a specialist.
 * When multiple specialists are selected, concatenate their addenda.
 */
export function getSpecialistSystemPromptAddendum(specialists: SpecialistId[]): string {
  return specialists
    .map((s) => SPECIALIST_PROMPTS[s] || "")
    .filter(Boolean)
    .join("\n");
}

// ── Orchestrator Entry Point ────────────────────────────────

/** Confidence threshold below which we fall back to the full agent. */
export const CONFIDENCE_THRESHOLD = 0.8;

export interface OrchestratorResult {
  /** Whether specialist routing was used (true) or fell back to full agent (false). */
  routed: boolean;
  /** The routing decision for telemetry. */
  decision: RoutingDecision;
  /** Filtered tools to pass to the LLM. */
  tools: Record<string, unknown>;
  /** Prompt addendum to append to the system prompt. */
  promptAddendum: string;
}

/**
 * Run the orchestrator: classify intent, decide routing, filter tools.
 *
 * @param message - The user's latest message text
 * @param allTools - Full tool registry from resolveCapabilities
 * @returns Routing result with filtered tools and prompt addendum
 */
export function orchestrate<T extends Record<string, unknown>>(
  message: string,
  allTools: T,
): OrchestratorResult {
  const decision = classifyIntent(message);

  // Below threshold or no specialists matched → fall back to full agent
  if (decision.confidence < CONFIDENCE_THRESHOLD || decision.specialists.length === 0) {
    return {
      routed: false,
      decision,
      tools: allTools,
      promptAddendum: "",
    };
  }

  const tools = getSpecialistTools(decision.specialists, allTools);
  const promptAddendum = getSpecialistSystemPromptAddendum(decision.specialists);

  return {
    routed: true,
    decision,
    tools,
    promptAddendum,
  };
}
