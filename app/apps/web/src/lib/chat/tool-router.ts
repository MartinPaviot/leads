/**
 * Dynamic tool routing -- instead of sending all ~160 tools on every request,
 * detect the user's intent and only include relevant tool groups.
 *
 * Groups:
 * - query (always included): searchCRM, queryContacts, queryAccounts, queryDeals, etc.
 * - create: createContact, createAccount, createDeal, createNote, etc.
 * - update: updateContact, updateAccount, updateDeal, etc.
 * - action: draftEmail, enrollInSequence, launchCampaign, etc.
 * - intelligence: getDealCoaching, getAccountIntelligence, generateMeetingPrep, etc.
 * - skills: analyzePipeline, scanSignals, buildTAM, etc. (pro-tier)
 * - memory: exploreGraph, rememberContext, recallMemories
 * - briefing: briefAllDeals, briefDeal, getEnrichedContext
 * - schema: listSchema, listAttributeDefinitions
 * - coaching: getCoachingInsights, getMyPerformance, searchExactWords
 * - undo: undoLastAction
 *
 * Intent detection (fast, no LLM):
 * - "show me" / "list" / "how many" / "search" -> query + briefing
 * - "create" / "add" / "new" -> query + create
 * - "update" / "change" / "set" -> query + update
 * - "send" / "email" / "draft" / "sequence" -> query + action
 * - "analyze" / "coach" / "brief" -> query + intelligence + briefing + coaching
 * - "build TAM" / "find leads" / "research" -> query + skills
 * - "remember" / "memory" / "forget" -> query + memory
 * - "undo" / "revert" -> query + undo
 * - default (unclear intent) -> query + intelligence + action (most common combo)
 */

// ── Tool group definitions ─────────────────────────────────────

/**
 * Maps each tool name to its group. Built from the actual tool files:
 * query.ts, create.ts, update.ts, action.ts, intelligence.ts, skills.ts,
 * memory.ts, briefing.ts, schema.ts, coaching.ts, undo.ts, research.ts,
 * forecast.ts, stakeholder.ts, workflow.ts, brain.ts, enrichment.ts,
 * calls.ts, navigation.ts, read-gaps.ts, knowledge.ts, code-execution.ts,
 * import.ts.
 *
 * INVARIANT: every tool returned by buildAllChatTools MUST be mapped here
 * (and identically in orchestrator.ts TOOL_GROUP_MAP). The drift-guard test
 * (tool-routing-drift-guard.test.ts) enforces this — filterToolsByGroups
 * fail-opens on unmapped tools, so an unmapped tool silently ships every turn.
 */
const TOOL_GROUPS: Record<string, string> = {
  // query (query.ts)
  searchCRM: "query",
  queryContacts: "query",
  queryAccounts: "query",
  queryDeals: "query",
  queryActivities: "query",
  queryNotes: "query",
  queryTasks: "query",
  whoami: "query",
  listWorkspaceMembers: "query",
  searchMeetings: "query",
  searchEmailsByMetadata: "query",
  runBasicReport: "query",
  getCallList: "query",
  proposeCallSprint: "query",
  getKnowledge: "query",
  getNoteBody: "query",
  getCallRecording: "query",
  getEmailContent: "query",
  semanticSearchNotes: "query",
  semanticSearchEmails: "query",
  semanticSearchCallRecordings: "query",
  getRecordsByIds: "query",
  listComments: "query",
  listCommentReplies: "query",
  findDuplicateContacts: "query",
  listRecentToolCalls: "query",
  listSharedPrompts: "query",
  deleteSharedPrompt: "query",
  // navigation + command layer (navigation.ts) — always available so the
  // chat can drive the UI (jump to a record, open a view, open the composer)
  // from any surface.
  openRecord: "query",
  openListView: "query",
  composeEmail: "query",
  // page actions (page-actions.ts) — listPageActions discovers what the current
  // page can do (read, always-available like the command layer); invokePageAction
  // emits the directive (an "action" so the action-intent router includes it).
  listPageActions: "query",
  invokePageAction: "action",
  // read-gap tools (read-gaps.ts)
  querySequences: "query",
  getMailboxHealth: "query",
  queryProposals: "query",

  // create (create.ts)
  createContact: "create",
  createAccount: "create",
  createDeal: "create",
  createNote: "create",
  logActivity: "create",
  createSequence: "create",
  addSequenceStep: "create",
  createTask: "create",
  createKnowledgeEntry: "create",
  upsertContact: "create",
  upsertAccount: "create",
  upsertDealByCompany: "create",
  createCustomObjectType: "create",
  createSavedView: "create",
  createComment: "create",
  createSharedPrompt: "create",

  // update (update.ts)
  updateContact: "update",
  updateAccount: "update",
  updateDeal: "update",
  updateTask: "update",
  updateAccountLifecycle: "update",
  updateMeetingNotes: "update",
  updateSequence: "update",
  updateSequenceStep: "update",
  updateDealStage: "update",
  completeTask: "update",
  bulkUpdateDeals: "update",
  bulkUpdateContacts: "update",
  updateICP: "update",
  updateWorkspace: "update",
  updateUserProfile: "update",
  updateNotificationPreferences: "update",
  updatePrivacySettings: "update",
  updateKnowledgeEntry: "update",
  updatePipelineStages: "update",
  updateCustomFieldSchema: "update",
  updateCustomSignalDefinitions: "update",
  updateWorkflows: "update",
  updateMemberRole: "update",
  updateMailboxSettings: "update",
  updateMailCalendarIntegration: "update",
  updateCustomObjectType: "update",

  // action (action.ts)
  draftEmail: "action",
  generateFollowUpEmail: "action",
  suggestEmailReply: "action",
  autoProgressDeal: "action",
  sendMeetingFollowUp: "action",
  bookMeeting: "action",
  enrollInSequence: "action",
  runSequenceAutopilot: "action",
  launchCampaign: "action",
  unsubscribeContact: "action",
  proposeCampaign: "action",
  inviteMember: "action",
  resendInvite: "action",
  addMailbox: "action",
  runAiAttribute: "action",
  deleteComment: "action",
  deleteSequenceStep: "action",
  mergeContacts: "action",
  applyCallSprint: "action",
  enrichCallSprint: "action",

  // intelligence (intelligence.ts)
  getDealCoaching: "intelligence",
  getAccountIntelligence: "intelligence",
  generateMeetingPrep: "intelligence",
  getMeetingNotes: "intelligence",
  getBuyerIntentScore: "intelligence",
  getDealsAtRisk: "intelligence",
  getWinLossAnalysis: "intelligence",
  // research (research.ts)
  buildCompanyDossier: "intelligence",
  // forecast (forecast.ts) — NB export name is misspelled "Forcast"; do not rename here
  getRevenueForcast: "intelligence",
  // stakeholder (stakeholder.ts)
  mapDealStakeholders: "intelligence",

  // coaching (coaching.ts)
  getCoachingInsights: "coaching",
  getMyPerformance: "coaching",
  searchExactWords: "coaching",
  searchTranscripts: "coaching",

  // skills (skills.ts)
  analyzePipeline: "skills",
  scanSignals: "skills",
  generateBattlecard: "skills",
  researchCompetitor: "skills",
  detectChurnRisk: "skills",
  analyzeSequencePerformance: "skills",
  findLeadsAtCompany: "skills",
  detectExpansionOpportunities: "skills",
  buildTAM: "skills",
  findLeadsByDomain: "skills",
  defineICP: "skills",
  prepSalesCall: "skills",
  qualifyLeads: "skills",
  qualifyInboundLead: "skills",
  enrichContact: "skills",
  enrichAccount: "skills",
  findContactMobile: "skills",
  checkDuplicates: "skills",
  trackChampions: "skills",
  checkFundingSignals: "skills",
  checkHiringSignals: "skills",
  detectLeadershipChanges: "skills",
  scopePoC: "skills",
  draftProposal: "skills",
  handleObjection: "skills",
  reEngageStalledDeal: "skills",
  listProposalTemplates: "skills",
  fillProposal: "skills",
  runCustomSkill: "skills",
  listCustomSkills: "skills",
  forkSkill: "skills",

  // import (import.ts)
  analyzeCSVForImport: "action",
  executeImport: "action",

  // code execution (code-execution.ts)
  executeCode: "intelligence",

  // workflow (workflow.ts) — NL automation config
  createWorkflow: "update",
  listWorkflows: "update",
  deleteWorkflow: "update",

  // memory (memory.ts)
  exploreGraph: "memory",
  rememberContext: "memory",
  recallMemories: "memory",
  forgetMemory: "memory",
  exploreRelationships: "memory",

  // briefing (briefing.ts)
  briefAllDeals: "briefing",
  briefDeal: "briefing",
  getEnrichedContext: "briefing",

  // company brain (brain.ts)
  getCompanyBrain: "briefing",
  getContactBrain: "briefing",
  getDealBrain: "briefing",

  // schema (schema.ts)
  listSchema: "schema",
  listAttributeDefinitions: "schema",

  // undo (undo.ts)
  undoLastAction: "undo",
};

// ── Intent patterns ──────────────────────────────────────────

interface IntentPattern {
  /** Regex patterns to match against the lowercased user message. */
  patterns: RegExp[];
  /** Tool groups to include when this intent is detected. */
  groups: string[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Undo / revert
  {
    patterns: [/\bundo\b/, /\brevert\b/, /\broll\s*back\b/],
    groups: ["undo"],
  },

  // Memory operations + graph reasoning
  {
    patterns: [
      /\bremember\b/, /\bmemory\b/, /\bforget\b/, /\brecall\b/, /\bgraph\b/,
      /\bconnect(?:ed|ion|ions)?\b/, /\brelat(?:ed|ionship|ionships)\b/,
      /\bintroduc(?:e|tion)\b/, /\bshared\b/, /\bmutual\b/,
      /\bhow\s+(?:is|are)\s+\w+\s+(?:related|connected)\b/,
      /\bwho\s+(?:can|knows|works)\b/,
      /\bpath\s+(?:to|from|between)\b/,
    ],
    groups: ["memory"],
  },

  // Briefing / status
  {
    patterns: [
      /\bbrief\b/,
      /\bbrief(?:ing|s)\b/,
      /\bstatus\b/,
      /\bmorning\s+brief\b/,
      /\bupdate\s+me\b/,
      /\bwhat'?s\s+happening\b/,
      /\bwhat\s+do\s+we\s+know\s+about\b/,
      /\bfull\s+picture\b/,
      /\bbrain\s+on\b/,
      /\bsummari[sz]e\s+(?:our\s+)?relationship\b/,
    ],
    groups: ["briefing", "intelligence"],
  },

  // Read / search / query
  {
    patterns: [
      /\bshow\s+me\b/,
      /\blist\b/,
      /\bhow\s+many\b/,
      /\bsearch\b/,
      /\bfind\b/,
      /\blook\s*up\b/,
      /\bwho\s+is\b/,
      /\bwhat\s+is\b/,
      /\btell\s+me\s+about\b/,
      /\bget\b/,
      /\breport\b/,
      /\bcount\b/,
    ],
    groups: ["briefing"],
  },

  // Creation
  {
    patterns: [
      /\bcreate\b/,
      /\badd\b/,
      /\bnew\b/,
      /\bregister\b/,
      /\bimport\b/,
      /\blog\b/,
      /\bsave\b/,
    ],
    groups: ["create"],
  },

  // Update / modify
  {
    patterns: [
      /\bupdate\b/,
      /\bchange\b/,
      /\bset\b/,
      /\bmodif(?:y|ied)\b/,
      /\bedit\b/,
      /\brename\b/,
      /\bmove\b/,
      /\bcomplete\b/,
      /\bmark\b/,
      /\bclose\b/,
      /\bconfig(?:ure)?\b/,
      /\bsettings?\b/,
    ],
    groups: ["update"],
  },

  // Email / outreach actions
  {
    patterns: [
      /\bsend\b/,
      /\bemail\b/,
      /\bdraft\b/,
      /\bwrite\b/,
      /\bfollow[\s-]*up\b/,
      /\breply\b/,
      /\bsequence\b/,
      /\bcampaign\b/,
      /\bsprint\b/,
      /\benroll\b/,
      /\boutreach\b/,
      /\binvite\b/,
      /\bunsubscribe\b/,
      /\bmailbox\b/,
    ],
    groups: ["action"],
  },

  // Analysis / coaching / intelligence
  {
    patterns: [
      /\banalyz(?:e|is)\b/,
      /\bcoach\b/,
      /\badvice\b/,
      /\bhelp\s+(?:me\s+)?with\b/,
      /\bstrateg(?:y|ize)\b/,
      /\binsights?\b/,
      /\bperformance\b/,
      /\bforecast\b/,
      /\bpipeline\b/,
      /\bhealth\b/,
      /\bscore\b/,
      /\bprep(?:are)?\b/,
      /\bmeeting\s+prep\b/,
    ],
    groups: ["intelligence", "coaching", "briefing"],
  },

  // Skills / research / advanced
  {
    patterns: [
      /\bbuild\s+tam\b/,
      /\btam\b/,
      /\bfind\s+leads\b/,
      /\bresearch\b/,
      /\benrich\b/,
      /\bmobile\b/,
      /\bphone\s*number\b/,
      /\bcell\b/,
      /\bqualify\b/,
      /\bicp\b/,
      /\bbattlecard\b/,
      /\bcompetitor\b/,
      /\bchurn\b/,
      /\bexpansion\b/,
      /\bsignal(?:s)?\b/,
      /\bfunding\b/,
      /\bhiring\b/,
      /\bleadership\b/,
      /\bduplicate\b/,
      /\bchampion\b/,
      /\bproposal\b/,
      /\bobjection\b/,
      /\bstalled\b/,
      /\bpoc\b/,
    ],
    groups: ["skills"],
  },

  // Schema
  {
    patterns: [/\bschema\b/, /\bfields?\b/, /\battributes?\b/, /\bcolumns?\b/],
    groups: ["schema"],
  },
];

// ── Default groups for unclear intent ───────────────────────

/** When no intent is detected, include these groups. This covers the
 *  most common conversational patterns: querying data, getting
 *  intelligence, and taking action. ~40-50 tools instead of ~160. */
const DEFAULT_GROUPS = new Set(["query", "intelligence", "action", "briefing"]);

/** Groups always included regardless of detected intent. */
const ALWAYS_INCLUDED = new Set(["query"]);

// ── Public API ──────────────────────────────────────────────

/**
 * Route tools based on user message intent. Returns a filtered subset
 * of the full tool registry, keeping the response lean for the LLM.
 *
 * @param allTools - Full tool registry from buildAllChatTools
 * @param userMessage - The user's latest message text
 * @returns Filtered tool subset matching the detected intent
 */
export function routeTools<T extends Record<string, unknown>>(
  allTools: T,
  userMessage: string,
): T {
  const detectedGroups = detectIntent(userMessage);
  return filterToolsByGroups(allTools, detectedGroups);
}

/**
 * Detect which tool groups are relevant for a given message.
 * Exported for testing.
 */
export function detectIntent(message: string): Set<string> {
  const lower = message.toLowerCase().trim();

  if (!lower) return new Set(DEFAULT_GROUPS);

  const groups = new Set(ALWAYS_INCLUDED);
  let matched = false;

  for (const intent of INTENT_PATTERNS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(lower)) {
        for (const group of intent.groups) {
          groups.add(group);
        }
        matched = true;
        break; // one pattern match per intent is enough
      }
    }
  }

  // If nothing matched, use the default set
  if (!matched) {
    DEFAULT_GROUPS.forEach((g) => groups.add(g));
  }

  return groups;
}

/**
 * Filter tools to only include those in the specified groups.
 * Tools not in the TOOL_GROUPS map are always included (unknown/new tools).
 */
function filterToolsByGroups<T extends Record<string, unknown>>(
  allTools: T,
  groups: Set<string>,
): T {
  const filtered: Record<string, unknown> = {};

  for (const [name, tool] of Object.entries(allTools)) {
    const group = TOOL_GROUPS[name];

    // Unknown tools (not in the group map) are always included to
    // prevent accidentally dropping newly added tools before the
    // router is updated.
    if (!group || groups.has(group)) {
      filtered[name] = tool;
    }
  }

  return filtered as T;
}

/**
 * Get the group name for a tool. Useful for debugging and admin UI.
 */
export function getToolGroup(toolName: string): string | undefined {
  return TOOL_GROUPS[toolName];
}

/**
 * Get all tool names in a group. Useful for debugging.
 */
export function getToolsInGroup(group: string): string[] {
  return Object.entries(TOOL_GROUPS)
    .filter(([, g]) => g === group)
    .map(([name]) => name);
}

/**
 * All tool names mapped in TOOL_GROUPS. Exported for the drift-guard test
 * (CLE-01) so both routing maps' key sets can be compared without importing
 * the AI-heavy tool registry.
 */
export function getRoutedToolNames(): string[] {
  return Object.keys(TOOL_GROUPS);
}

/**
 * Get routing stats for observability.
 */
export function getRoutingStats(
  allTools: Record<string, unknown>,
  userMessage: string,
): {
  totalTools: number;
  routedTools: number;
  droppedTools: number;
  detectedGroups: string[];
  reductionPercent: number;
} {
  const groups = detectIntent(userMessage);
  const routed = routeTools(allTools, userMessage);
  const totalTools = Object.keys(allTools).length;
  const routedCount = Object.keys(routed).length;

  return {
    totalTools,
    routedTools: routedCount,
    droppedTools: totalTools - routedCount,
    detectedGroups: Array.from(groups),
    reductionPercent: totalTools > 0
      ? Math.round(((totalTools - routedCount) / totalTools) * 100)
      : 0,
  };
}
