import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { anthropic } from "@/lib/ai/ai-provider";
import { generateText, stepCountIs } from "ai";

export const maxDuration = 120;

// Eval test cases for the chat AI
const EVAL_CASES = [
  // === CONTACT LOOKUP ===
  {
    id: "contact-lookup-1",
    category: "contact_lookup",
    query: "Tell me about Sarah Chen",
    graders: [
      { type: "contains_link", pattern: /\[.*?\]\(\/contacts\/[a-z0-9-]+\)/ },
      { type: "no_hallucination", forbidden: ["I don't have", "I cannot", "no data"] },
      { type: "uses_tool", toolName: "queryContacts" },
    ],
  },
  {
    id: "contact-lookup-2",
    category: "contact_lookup",
    query: "Find all contacts at Meridian Labs",
    graders: [
      { type: "uses_tool", toolName: "queryContacts" },
      { type: "contains_link", pattern: /\[.*?\]\(\/contacts\/[a-z0-9-]+\)/ },
    ],
  },

  // === DEAL COACHING ===
  {
    id: "deal-coaching-1",
    category: "deal_coaching",
    query: "Which deals are at risk?",
    graders: [
      { type: "uses_tool", toolName: "queryDeals" },
      { type: "mentions_risk", pattern: /risk|stall|ghost|inactive|days?\s*(since|without)/i },
      { type: "contains_link", pattern: /\[.*?\]\(\/opportunities\/[a-z0-9-]+\)/ },
    ],
  },
  {
    id: "deal-coaching-2",
    category: "deal_coaching",
    query: "Give me coaching on my best deal",
    graders: [
      { type: "uses_tool", toolName: "getDealCoaching" },
      { type: "mentions_specific_data", pattern: /\$[\d,]+|\d+\s*days?|stage/i },
    ],
  },

  // === ACCOUNT INTELLIGENCE ===
  {
    id: "account-intel-1",
    category: "account_intelligence",
    query: "Why should I focus on our highest-scored account?",
    graders: [
      { type: "uses_tool", toolName: "getAccountIntelligence" },
      { type: "mentions_specific_data", pattern: /score|industry|funding|employees|technology/i },
      { type: "contains_link", pattern: /\[.*?\]\(\/accounts\/[a-z0-9-]+\)/ },
    ],
  },

  // === PIPELINE STATUS ===
  {
    id: "pipeline-1",
    category: "pipeline",
    query: "What's my pipeline looking like?",
    graders: [
      { type: "uses_tool", toolName: "queryDeals" },
      { type: "mentions_specific_data", pattern: /\$[\d,]+|deal|pipeline|stage/i },
    ],
  },
  {
    id: "pipeline-2",
    category: "pipeline",
    query: "How many deals do I have in proposal stage?",
    graders: [
      { type: "uses_tool", toolName: "queryDeals" },
      { type: "mentions_number", pattern: /\d+\s*(deal|opportunit)/i },
    ],
  },

  // === ACTION BIAS ===
  {
    id: "action-1",
    category: "action_bias",
    query: "Follow up with my most recent contact",
    graders: [
      { type: "uses_tool", toolName: "queryContacts" },
      { type: "drafts_or_acts", pattern: /draft|email|subject|Hi |Dear |task|follow.?up/i },
    ],
  },

  // === MULTI-LANGUAGE ===
  {
    id: "lang-fr",
    category: "multi_language",
    query: "Montre-moi mes deals en cours",
    graders: [
      { type: "uses_tool", toolName: "queryDeals" },
      { type: "responds_in_language", pattern: /[àâäéèêëïîôùûüçœ]|les|des|mes|voici|avec/i },
    ],
  },
  {
    id: "lang-es",
    category: "multi_language",
    query: "Muéstrame mis contactos más recientes",
    graders: [
      { type: "uses_tool", toolName: "queryContacts" },
      { type: "responds_in_language", pattern: /[áéíóúñ¿¡]|los|las|tus|con|recientes/i },
    ],
  },

  // === CITATION QUALITY ===
  {
    id: "citation-1",
    category: "citations",
    query: "When was my last interaction with any contact?",
    graders: [
      { type: "uses_tool", toolName: "queryActivities" },
      { type: "contains_link", pattern: /\[.*?\]\(\/(contacts|accounts|opportunities)\/[a-z0-9-]+\)/ },
      { type: "mentions_date", pattern: /\d{4}-\d{2}-\d{2}|January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}/i },
    ],
  },

  // === EMPTY/EDGE CASES ===
  {
    id: "honest-1",
    category: "honesty",
    query: "Tell me about a company called XYZ_NONEXISTENT_CORP_12345",
    graders: [
      { type: "admits_missing", pattern: /not found|no (results?|data|records?|match)|couldn'?t find|don'?t have|does not exist/i },
    ],
  },

  // === TASK CREATION ===
  {
    id: "task-1",
    category: "task_creation",
    query: "Remind me to call the CEO of our top account tomorrow",
    graders: [
      { type: "uses_tool", toolName: "createTask" },
    ],
  },

  // === MEETING PREP ===
  {
    id: "meeting-prep-1",
    category: "meeting_prep",
    query: "Prepare me for a meeting with our biggest deal's account",
    graders: [
      { type: "uses_tool", toolName: "generateMeetingPrep" },
      { type: "mentions_specific_data", pattern: /talking point|agenda|objection|history|key.*point/i },
    ],
  },

  // === BULK OPERATIONS ===
  {
    id: "bulk-1",
    category: "bulk_operations",
    query: "Move all deals in lead stage to qualification",
    graders: [
      { type: "uses_tool", toolName: "bulkUpdateDeals" },
    ],
  },

  // === NOTES ===
  {
    id: "notes-1",
    category: "notes",
    query: "Show me any notes I've taken",
    graders: [
      { type: "uses_tool", toolName: "queryNotes" },
    ],
  },
];

interface GraderResult {
  type: string;
  passed: boolean;
  detail?: string;
}

function runGraders(
  response: string,
  toolCalls: string[],
  graders: Array<{ type: string; toolName?: string; pattern?: RegExp; forbidden?: string[] }>
): GraderResult[] {
  return graders.map((g) => {
    switch (g.type) {
      case "contains_link":
        return { type: g.type, passed: g.pattern!.test(response), detail: g.pattern!.test(response) ? "Link found" : "No CRM link in response" };
      case "no_hallucination":
        return { type: g.type, passed: !g.forbidden!.some((f) => response.toLowerCase().includes(f.toLowerCase())), detail: "Checked for hallucination markers" };
      case "uses_tool":
        return { type: g.type, passed: toolCalls.includes(g.toolName!), detail: `Expected ${g.toolName}, got [${toolCalls.join(",")}]` };
      case "mentions_risk":
      case "mentions_specific_data":
      case "mentions_number":
      case "mentions_date":
      case "responds_in_language":
      case "drafts_or_acts":
      case "admits_missing":
        return { type: g.type, passed: g.pattern!.test(response), detail: g.pattern!.test(response) ? "Pattern matched" : `Pattern /${g.pattern!.source}/ not found` };
      default:
        return { type: g.type, passed: false, detail: "Unknown grader type" };
    }
  });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = await req.json().catch(() => ({}));
  const caseIds = body.cases as string[] | undefined;
  const casesToRun = caseIds
    ? EVAL_CASES.filter((c) => caseIds.includes(c.id))
    : EVAL_CASES;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY required for eval" }, { status: 503 });
  }

  const results: Array<{
    id: string;
    category: string;
    query: string;
    passed: boolean;
    graderResults: GraderResult[];
    toolsUsed: string[];
    responsePreview: string;
    latencyMs: number;
  }> = [];

  for (const testCase of casesToRun) {
    const start = Date.now();
    try {
      const { text, steps } = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        system: `You are Elevay, a CRM AI assistant. You have tools to query the CRM database. Always use tools to answer questions — never guess. Include links to records in your response using [Name](/contacts/{id}) format. Respond in the user's language.`,
        messages: [{ role: "user", content: testCase.query }],
        tools: {
          // Minimal tool stubs that return empty results for eval
          searchCRM: { description: "Search CRM", parameters: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] }, execute: async () => ({ results: [] }) },
          queryContacts: { description: "Query contacts", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ contacts: [{ id: "eval-c1", name: "Sarah Chen", email: "sarah@meridian.com", title: "CTO" }] }) },
          queryAccounts: { description: "Query accounts", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ accounts: [{ id: "eval-a1", name: "Meridian Labs", domain: "meridian.com", industry: "SaaS", score: 85 }] }) },
          queryDeals: { description: "Query deals", parameters: { type: "object" as const, properties: { stage: { type: "string" }, search: { type: "string" } } }, execute: async () => ({ deals: [{ id: "eval-d1", name: "Meridian Enterprise", stage: "proposal", value: 75000 }] }) },
          queryActivities: { description: "Query activities", parameters: { type: "object" as const, properties: { entityType: { type: "string" }, entityId: { type: "string" } } }, execute: async () => ({ activities: [{ id: "eval-act1", type: "email_sent", summary: "Pricing discussion", occurredAt: "2026-03-28", entityType: "contact", entityId: "eval-c1", _sourceLink: "/contacts/eval-c1" }] }) },
          queryNotes: { description: "Query notes", parameters: { type: "object" as const, properties: { search: { type: "string" } } }, execute: async () => ({ notes: [{ id: "eval-n1", title: "Call notes", content: "Discussed budget", entityType: "contact", entityId: "eval-c1" }] }) },
          queryTasks: { description: "Query tasks", parameters: { type: "object" as const, properties: { status: { type: "string" } } }, execute: async () => ({ tasks: [] }) },
          getDealCoaching: { description: "Deal coaching", parameters: { type: "object" as const, properties: { dealId: { type: "string" } }, required: ["dealId"] }, execute: async () => ({ deal: { id: "eval-d1", name: "Meridian Enterprise", stage: "proposal", value: 75000 }, contact: { id: "eval-c1", name: "Sarah Chen", title: "CTO" }, company: { id: "eval-a1", name: "Meridian Labs", score: 85 }, recentActivities: [{ type: "email_sent", summary: "Pricing follow-up", date: "2026-03-28" }], daysSinceLastActivity: 5, riskLevel: "low" }) },
          getAccountIntelligence: { description: "Account intelligence", parameters: { type: "object" as const, properties: { accountId: { type: "string" } }, required: ["accountId"] }, execute: async () => ({ account: { id: "eval-a1", name: "Meridian Labs", industry: "SaaS", score: 85 }, scoreBreakdown: { fit: 80, engagement: 90, fitReasons: ["SaaS industry match", "50-200 employees"] }, signals: { technologies: ["React", "AWS"], funding: "$15M" }, contacts: [{ id: "eval-c1", name: "Sarah Chen", title: "CTO" }], deals: [{ id: "eval-d1", name: "Meridian Enterprise", stage: "proposal", value: 75000 }] }) },
          createTask: { description: "Create task", parameters: { type: "object" as const, properties: { title: { type: "string" }, dueDate: { type: "string" } }, required: ["title"] }, execute: async () => ({ created: { id: "eval-t1", title: "Call CEO", status: "pending" } }) },
          createContact: { description: "Create contact", parameters: { type: "object" as const, properties: { firstName: { type: "string" } } }, execute: async () => ({ created: { id: "eval-c2", name: "New Contact" } }) },
          createDeal: { description: "Create deal", parameters: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] }, execute: async () => ({ created: { id: "eval-d2", name: "New Deal" } }) },
          draftEmail: { description: "Draft email", parameters: { type: "object" as const, properties: { contactId: { type: "string" }, purpose: { type: "string" } }, required: ["contactId", "purpose"] }, execute: async () => ({ emailDraft: { to: "sarah@meridian.com", contactName: "Sarah Chen", purpose: "follow-up" } }) },
          generateMeetingPrep: { description: "Meeting prep", parameters: { type: "object" as const, properties: { accountId: { type: "string" } } }, execute: async () => ({ meetingPrepData: { account: { name: "Meridian Labs" }, contacts: [{ name: "Sarah Chen", title: "CTO" }], deals: [{ name: "Meridian Enterprise", stage: "proposal" }] } }) },
          bulkUpdateDeals: { description: "Bulk update deals", parameters: { type: "object" as const, properties: { filter: { type: "object", properties: { stage: { type: "string" } } }, update: { type: "object", properties: { stage: { type: "string" } } } } }, execute: async () => ({ bulkUpdated: { count: 3 } }) },
        } as any,
        stopWhen: stepCountIs(5),
      });

      const toolsUsed = steps
        .flatMap((s) => s.toolCalls || [])
        .map((tc) => tc.toolName);

      const graderResults = runGraders(text, toolsUsed, testCase.graders);
      const passed = graderResults.every((g) => g.passed);

      results.push({
        id: testCase.id,
        category: testCase.category,
        query: testCase.query,
        passed,
        graderResults,
        toolsUsed,
        responsePreview: text.slice(0, 300),
        latencyMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        query: testCase.query,
        passed: false,
        graderResults: [{ type: "error", passed: false, detail: String(err) }],
        toolsUsed: [],
        responsePreview: "",
        latencyMs: Date.now() - start,
      });
    }
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const passRate = results.length > 0 ? (totalPassed / results.length * 100).toFixed(1) : "0";

  return Response.json({
    summary: {
      total: results.length,
      passed: totalPassed,
      failed: totalFailed,
      passRate: `${passRate}%`,
      byCategory: Object.fromEntries(
        [...new Set(results.map((r) => r.category))].map((cat) => {
          const catResults = results.filter((r) => r.category === cat);
          return [cat, {
            total: catResults.length,
            passed: catResults.filter((r) => r.passed).length,
          }];
        })
      ),
    },
    results,
  });
}
