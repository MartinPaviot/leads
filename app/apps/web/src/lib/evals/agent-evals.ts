/**
 * Agent Eval Definitions — Golden datasets and graders for each of the 25 agents.
 *
 * Each agent type has specialized eval criteria:
 * - Conversational: trajectory (tool sequence), response quality, citations
 * - Classification: precision, recall, F1 per class
 * - Extraction: field-level accuracy, schema compliance
 * - Generation: relevance, faithfulness, tone, actionability
 * - Background: completion rate, data quality
 */

// ─── Types ───────────────────────────────────────────────────

export type GraderType =
  | "pattern_match"       // regex test on output
  | "forbidden_pattern"   // output must NOT match
  | "tool_used"           // specific tool was called
  | "tool_sequence"       // tools were called in order
  | "json_schema"         // output is valid JSON matching schema
  | "field_accuracy"      // specific fields extracted correctly
  | "classification"      // correct class label
  | "llm_judge"           // LLM-as-judge scoring
  | "faithfulness"        // grounded in provided context
  | "contains_all"        // output contains all required strings
  | "word_count"          // output within word count bounds
  | "latency_check"       // completed within time budget
  | "cost_check";         // within cost budget

export interface Grader {
  type: GraderType;
  weight: number;           // 0.0-1.0, used for composite scoring
  config: Record<string, unknown>;
}

export interface EvalCase {
  id: string;
  input: string;
  expectedOutput?: string;
  context?: string;
  tags: string[];
  graders: Grader[];
}

export interface AgentEvalConfig {
  agentId: string;
  description: string;
  cases: EvalCase[];
  passThreshold: number;       // minimum score to pass (0.0-1.0)
  llmJudgeModel: string;       // model used for LLM-as-judge grading
  llmJudgePrompt?: string;     // custom judge prompt for this agent type
}

// ─── Grader Execution ────────────────────────────────────────

export interface GraderResult {
  type: GraderType;
  passed: boolean;
  score: number;       // 0.0-1.0
  weight: number;
  detail: string;
}

export function runGrader(
  grader: Grader,
  output: string,
  toolCalls: string[],
  latencyMs?: number,
  cost?: number,
): GraderResult {
  const { type, weight, config } = grader;

  switch (type) {
    case "pattern_match": {
      const pattern = new RegExp(config.pattern as string, (config.flags as string) || "i");
      const passed = pattern.test(output);
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: passed ? "Pattern matched" : `Pattern /${config.pattern}/ not found` };
    }

    case "forbidden_pattern": {
      const pattern = new RegExp(config.pattern as string, (config.flags as string) || "i");
      const passed = !pattern.test(output);
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: passed ? "No forbidden patterns" : `Forbidden pattern found: /${config.pattern}/` };
    }

    case "tool_used": {
      const toolName = config.toolName as string;
      const passed = toolCalls.includes(toolName);
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: `Expected ${toolName}, got [${toolCalls.join(",")}]` };
    }

    case "tool_sequence": {
      const expected = config.sequence as string[];
      let seqIdx = 0;
      for (const tc of toolCalls) {
        if (seqIdx < expected.length && tc === expected[seqIdx]) seqIdx++;
      }
      const passed = seqIdx === expected.length;
      return { type, passed, score: seqIdx / expected.length, weight, detail: `${seqIdx}/${expected.length} tools in sequence` };
    }

    case "json_schema": {
      try {
        JSON.parse(output);
        return { type, passed: true, score: 1.0, weight, detail: "Valid JSON" };
      } catch {
        return { type, passed: false, score: 0.0, weight, detail: "Invalid JSON" };
      }
    }

    case "field_accuracy": {
      const expectedFields = config.fields as Record<string, string>;
      let matched = 0;
      const total = Object.keys(expectedFields).length;
      try {
        const parsed = JSON.parse(output);
        for (const [key, expected] of Object.entries(expectedFields)) {
          const actual = String(parsed[key] || "").toLowerCase();
          if (actual.includes(String(expected).toLowerCase())) matched++;
        }
      } catch {
        return { type, passed: false, score: 0.0, weight, detail: "Could not parse output for field check" };
      }
      const score = total > 0 ? matched / total : 0;
      return { type, passed: score >= 0.7, score, weight, detail: `${matched}/${total} fields correct` };
    }

    case "classification": {
      const expectedClass = (config.expectedClass as string).toLowerCase();
      const actual = output.toLowerCase().trim();
      const passed = actual.includes(expectedClass);
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: `Expected class: ${expectedClass}, got: ${actual.slice(0, 50)}` };
    }

    case "contains_all": {
      const required = config.strings as string[];
      const found = required.filter((s) => output.toLowerCase().includes(s.toLowerCase()));
      const score = required.length > 0 ? found.length / required.length : 0;
      return { type, passed: score >= 0.8, score, weight, detail: `${found.length}/${required.length} required strings found` };
    }

    case "word_count": {
      const words = output.split(/\s+/).length;
      const min = (config.min as number) || 0;
      const max = (config.max as number) || Infinity;
      const passed = words >= min && words <= max;
      return { type, passed, score: passed ? 1.0 : 0.5, weight, detail: `${words} words (expected ${min}-${max})` };
    }

    case "latency_check": {
      const maxMs = config.maxMs as number;
      const passed = (latencyMs || 0) <= maxMs;
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: `${latencyMs}ms (max ${maxMs}ms)` };
    }

    case "cost_check": {
      const maxCost = config.maxCost as number;
      const passed = (cost || 0) <= maxCost;
      return { type, passed, score: passed ? 1.0 : 0.0, weight, detail: `$${cost?.toFixed(4)} (max $${maxCost})` };
    }

    case "llm_judge":
    case "faithfulness":
      // These are handled separately via async LLM calls
      return { type, passed: true, score: 0.5, weight, detail: "Requires async LLM grading" };

    default:
      return { type, passed: false, score: 0.0, weight, detail: `Unknown grader type: ${type}` };
  }
}

/**
 * Compute composite score from multiple grader results.
 */
export function computeCompositeScore(results: GraderResult[]): number {
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return 0;
  return results.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight;
}

// ─── Per-Agent Eval Configs ──────────────────────────────────

export const AGENT_EVAL_CONFIGS: AgentEvalConfig[] = [
  // === 1. CHAT AGENT ===
  {
    agentId: "chat",
    description: "Main conversational GTM copilot",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `You are evaluating a CRM AI sales assistant. Grade on:
- Accuracy (30%): Facts correct, data matches CRM records
- Relevance (25%): Directly answers the question asked
- Completeness (20%): Covers all aspects of the query
- Actionability (15%): Provides concrete next steps
- Tone (10%): Professional, concise, sales-appropriate
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "chat-contact-lookup",
        input: "Tell me about Sarah Chen",
        tags: ["contact_lookup", "tool_use", "citations"],
        graders: [
          { type: "tool_used", weight: 0.3, config: { toolName: "queryContacts" } },
          { type: "pattern_match", weight: 0.3, config: { pattern: "\\[.*?\\]\\(\\/contacts\\/[a-z0-9-]+\\)" } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "I don't have|I cannot|no data" } },
          { type: "llm_judge", weight: 0.2, config: {} },
        ],
      },
      {
        id: "chat-deal-coaching",
        input: "Which deals are at risk?",
        tags: ["deal_coaching", "tool_use", "risk_analysis"],
        graders: [
          { type: "tool_used", weight: 0.3, config: { toolName: "queryDeals" } },
          { type: "pattern_match", weight: 0.2, config: { pattern: "risk|stall|ghost|inactive|days?\\s*(since|without)" } },
          { type: "pattern_match", weight: 0.2, config: { pattern: "\\[.*?\\]\\(\\/opportunities\\/[a-z0-9-]+\\)" } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
      {
        id: "chat-pipeline-status",
        input: "What's my pipeline looking like?",
        tags: ["pipeline", "tool_use", "data_accuracy"],
        graders: [
          { type: "tool_used", weight: 0.3, config: { toolName: "queryDeals" } },
          { type: "pattern_match", weight: 0.3, config: { pattern: "\\$[\\d,]+|deal|pipeline|stage" } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "chat-meeting-prep",
        input: "Prepare me for a meeting with our biggest deal's account",
        tags: ["meeting_prep", "tool_use", "completeness"],
        graders: [
          { type: "tool_used", weight: 0.3, config: { toolName: "generateMeetingPrep" } },
          { type: "contains_all", weight: 0.3, config: { strings: ["talking point", "account", "deal"] } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "chat-honest-missing",
        input: "Tell me about a company called XYZ_NONEXISTENT_CORP_12345",
        tags: ["honesty", "no_hallucination"],
        graders: [
          { type: "pattern_match", weight: 0.5, config: { pattern: "not found|no (results?|data|records?|match)|couldn'?t find|don'?t have|does not exist" } },
          { type: "forbidden_pattern", weight: 0.5, config: { pattern: "XYZ_NONEXISTENT.*is a|XYZ_NONEXISTENT.*was founded|Their revenue" } },
        ],
      },
      {
        id: "chat-french",
        input: "Montre-moi mes deals en cours",
        tags: ["multi_language", "french"],
        graders: [
          { type: "tool_used", weight: 0.3, config: { toolName: "queryDeals" } },
          { type: "pattern_match", weight: 0.4, config: { pattern: "[àâäéèêëïîôùûüçœ]|les|des|mes|voici|avec" } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
      {
        id: "chat-task-creation",
        input: "Remind me to call the CEO of our top account tomorrow",
        tags: ["task_creation", "tool_use"],
        graders: [
          { type: "tool_used", weight: 0.6, config: { toolName: "createTask" } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "chat-bulk-ops",
        input: "Move all deals in lead stage to qualification",
        tags: ["bulk_operations", "tool_use"],
        graders: [
          { type: "tool_used", weight: 0.6, config: { toolName: "bulkUpdateDeals" } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "chat-no-filler",
        input: "Show me my contacts",
        tags: ["personality", "no_filler"],
        graders: [
          { type: "tool_used", weight: 0.2, config: { toolName: "queryContacts" } },
          { type: "forbidden_pattern", weight: 0.4, config: { pattern: "Great question|Sure,? I can|Absolutely|Let me|Of course|I'd be happy to" } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "chat-proactive-intelligence",
        input: "Show me the details on our deal with the highest value",
        tags: ["proactive", "deal_coaching"],
        graders: [
          { type: "tool_used", weight: 0.2, config: { toolName: "queryDeals" } },
          { type: "pattern_match", weight: 0.3, config: { pattern: "---|\\.\\.\\.also|worth noting|also notice|you might want" } },
          { type: "llm_judge", weight: 0.5, config: {} },
        ],
      },
    ],
  },

  // === 2. PROCESS REPLY (Classification) ===
  {
    agentId: "process-reply",
    description: "Email reply classification (positive/negative/ooo/unsubscribe)",
    passThreshold: 0.85,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "reply-positive-1",
        input: "Thanks for reaching out! I'd love to schedule a call next week to discuss further.",
        expectedOutput: "positive",
        tags: ["classification", "positive"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "positive" } }],
      },
      {
        id: "reply-positive-2",
        input: "This sounds interesting. Can you send me a pricing deck?",
        expectedOutput: "positive",
        tags: ["classification", "positive"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "positive" } }],
      },
      {
        id: "reply-negative-1",
        input: "Not interested, please don't contact me again.",
        expectedOutput: "negative",
        tags: ["classification", "negative"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "negative" } }],
      },
      {
        id: "reply-negative-2",
        input: "We already have a solution in place and aren't looking to change. Thanks anyway.",
        expectedOutput: "negative",
        tags: ["classification", "negative"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "negative" } }],
      },
      {
        id: "reply-ooo-1",
        input: "I am currently out of the office until April 15th with limited access to email. For urgent matters, please contact jane@acme.com.",
        expectedOutput: "ooo",
        tags: ["classification", "ooo"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "ooo" } }],
      },
      {
        id: "reply-unsubscribe-1",
        input: "Please remove me from your mailing list.",
        expectedOutput: "unsubscribe",
        tags: ["classification", "unsubscribe"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "unsubscribe" } }],
      },
      {
        id: "reply-ambiguous-1",
        input: "Let me think about it and get back to you.",
        expectedOutput: "positive",
        tags: ["classification", "edge_case"],
        graders: [{ type: "classification", weight: 1.0, config: { expectedClass: "positive" } }],
      },
    ],
  },

  // === 3. SMART IMPORT (Classification) ===
  {
    agentId: "smart-import",
    description: "CSV column mapping to CRM fields",
    passThreshold: 0.85,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "import-standard-headers",
        input: JSON.stringify(["First Name", "Last Name", "Email", "Company", "Phone", "Job Title"]),
        expectedOutput: JSON.stringify({ "First Name": "firstName", "Last Name": "lastName", "Email": "email", "Company": "company", "Phone": "phone", "Job Title": "title" }),
        tags: ["column_mapping", "standard"],
        graders: [
          { type: "json_schema", weight: 0.3, config: {} },
          { type: "field_accuracy", weight: 0.7, config: { fields: { "First Name": "firstName", "Last Name": "lastName", "Email": "email" } } },
        ],
      },
      {
        id: "import-french-headers",
        input: JSON.stringify(["Prenom", "Nom", "Courriel", "Entreprise", "Telephone", "Poste"]),
        tags: ["column_mapping", "french", "edge_case"],
        graders: [
          { type: "json_schema", weight: 0.4, config: {} },
          { type: "field_accuracy", weight: 0.6, config: { fields: { "Prenom": "firstName", "Nom": "lastName", "Courriel": "email" } } },
        ],
      },
    ],
  },

  // === 4. DRAFT EMAIL (Generation) ===
  {
    agentId: "draft-email",
    description: "Cold outreach email generation",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this cold outreach email on:
- Personalization (30%): Uses specific prospect/company details, not generic
- Value proposition (25%): Clear benefit to the recipient
- Brevity (20%): Under 150 words, gets to the point
- Call-to-action (15%): Clear, specific next step
- Tone (10%): Professional but human, not salesy or robotic
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "email-cold-saas",
        input: JSON.stringify({ contactName: "Sarah Chen", title: "CTO", company: "Meridian Labs", industry: "SaaS", signals: ["Series A", "hiring engineers"] }),
        tags: ["cold_email", "saas"],
        graders: [
          { type: "contains_all", weight: 0.3, config: { strings: ["Sarah", "Meridian"] } },
          { type: "word_count", weight: 0.2, config: { min: 30, max: 200 } },
          { type: "pattern_match", weight: 0.2, config: { pattern: "Subject:" } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
      {
        id: "email-cold-minimal-context",
        input: JSON.stringify({ contactName: "John Doe", title: "CEO", company: "Acme Inc" }),
        tags: ["cold_email", "minimal_context"],
        graders: [
          { type: "contains_all", weight: 0.3, config: { strings: ["John", "Acme"] } },
          { type: "word_count", weight: 0.2, config: { min: 20, max: 200 } },
          { type: "llm_judge", weight: 0.5, config: {} },
        ],
      },
    ],
  },

  // === 5. FOLLOW-UP EMAIL ===
  {
    agentId: "follow-up-email",
    description: "Post-meeting follow-up email generation",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this follow-up email on:
- Action items (35%): References specific items discussed in the meeting
- Personalization (25%): Feels like it was written by someone who was in the meeting
- Next steps (20%): Clear action items and timeline
- Tone (20%): Warm, professional, not boilerplate
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "followup-after-demo",
        input: JSON.stringify({ meetingNotes: "Demo'd the product. Sarah liked the reporting feature. Budget concern — need approval from CFO. Next step: send pricing by Friday.", contactName: "Sarah Chen", company: "Meridian Labs" }),
        tags: ["follow_up", "demo"],
        graders: [
          { type: "contains_all", weight: 0.3, config: { strings: ["Sarah", "pricing", "Friday"] } },
          { type: "word_count", weight: 0.2, config: { min: 40, max: 300 } },
          { type: "llm_judge", weight: 0.5, config: {} },
        ],
      },
    ],
  },

  // === 6. SUGGEST REPLY ===
  {
    agentId: "suggest-reply",
    description: "Reply suggestions with 3 tones",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "reply-to-pricing-question",
        input: JSON.stringify({ email: "Hi, can you send me your pricing? We're evaluating tools this quarter.", contactName: "Mike Ross", context: "Demo last week, interested in pro plan" }),
        tags: ["suggest_reply", "pricing"],
        graders: [
          { type: "pattern_match", weight: 0.3, config: { pattern: "brief|detailed|decline" } },
          { type: "contains_all", weight: 0.3, config: { strings: ["pricing", "Mike"] } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
    ],
  },

  // === 7. PROCESS TRANSCRIPT (Extraction) ===
  {
    agentId: "process-transcript",
    description: "Meeting transcript structured note extraction",
    passThreshold: 0.75,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this meeting transcript extraction on:
- Completeness (40%): All key points, action items, and decisions captured
- Accuracy (30%): Extracted info matches what was actually said
- Structure (20%): Well-organized, no duplication
- Signal extraction (10%): Buying signals correctly identified
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "transcript-sales-call",
        input: "Sarah: We're currently using Salesforce but it's too complex for our team of 5. Mike: What's your budget? Sarah: Around $500 per month. We need something up and running by Q3. Mike: Our Pro plan is $299/month. Sarah: That sounds good. Can you send a proposal to our CEO, David Kim? Mike: Absolutely. I'll have it over by Friday.",
        expectedOutput: JSON.stringify({ summary: "Sales call with Meridian Labs", actionItems: ["Send proposal to David Kim by Friday"], buyingSignals: { budget: "$500/month", timeline: "Q3", currentStack: "Salesforce", teamSize: "5" } }),
        tags: ["extraction", "sales_call", "buying_signals"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "contains_all", weight: 0.4, config: { strings: ["proposal", "Friday", "David", "500", "Salesforce"] } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
    ],
  },

  // === 8. ACCOUNT SUMMARIZE ===
  {
    agentId: "account-summarize",
    description: "Account summary generation",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "account-summary-active",
        input: JSON.stringify({ company: "Meridian Labs", industry: "SaaS", contacts: 3, deals: 1, recentActivity: "Pricing follow-up sent 2 days ago", dealStage: "proposal", dealValue: 75000 }),
        tags: ["summarization", "active_account"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "contains_all", weight: 0.3, config: { strings: ["Meridian", "proposal"] } },
          { type: "word_count", weight: 0.2, config: { min: 20, max: 200 } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 9. DEAL ANALYSIS (Extraction) ===
  {
    agentId: "deal-analyze",
    description: "Deal analysis with stage recommendation",
    passThreshold: 0.75,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "deal-stalled-analysis",
        input: JSON.stringify({ deal: "Meridian Enterprise", stage: "proposal", value: 75000, daysSinceLastActivity: 21, activities: ["Demo 3 weeks ago", "Follow-up email ignored"], contacts: [{ name: "Sarah Chen", title: "CTO" }] }),
        tags: ["deal_analysis", "stalled", "risk"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "pattern_match", weight: 0.3, config: { pattern: "risk|stall|at.risk|attention|urgent" } },
          { type: "contains_all", weight: 0.2, config: { strings: ["21 days", "follow-up"] } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 10. DEAL INTELLIGENCE EXTRACTION ===
  {
    agentId: "deal-extract-intel",
    description: "Structured deal intelligence extraction from notes",
    passThreshold: 0.75,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "extract-intel-meeting",
        input: "Meeting notes: Budget is $50k, team of 12 developers. Currently using Jira and Linear. Timeline: need to decide by end of Q2. Decision maker is VP Eng David Kim. Next step: technical review next Thursday. Competitors: also evaluating Monday.com.",
        tags: ["extraction", "deal_intel"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "contains_all", weight: 0.5, config: { strings: ["50k", "12", "Jira", "Q2", "David Kim", "Monday"] } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 11. ICP ANALYSIS (Extraction) ===
  {
    agentId: "icp-analysis",
    description: "Website analysis to infer ideal customer profile",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "icp-saas-website",
        input: JSON.stringify({ title: "Acme - Project Management for Startups", metaDescription: "Simple project management built for teams of 5-50", headings: ["For startups", "Pricing starts at $29/mo", "Trusted by 500+ teams"], bodyText: "Built for fast-moving startup teams...", pricingSignals: ["$29/mo", "$99/mo", "Enterprise"] }),
        tags: ["icp_inference", "saas"],
        graders: [
          { type: "json_schema", weight: 0.3, config: {} },
          { type: "contains_all", weight: 0.3, config: { strings: ["startup", "project management"] } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
    ],
  },

  // === 12. WORLD MODEL (Extraction) ===
  {
    agentId: "world-model",
    description: "Business knowledge model from interactions",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "world-model-patterns",
        input: JSON.stringify({ interactions: ["5 demos this month, 3 in SaaS, 2 in fintech", "Common objection: pricing too high vs Salesforce", "Best close rate: companies with 10-50 employees", "Top competitor mentioned: HubSpot (4x), Pipedrive (2x)"] }),
        tags: ["world_model", "patterns"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "contains_all", weight: 0.4, config: { strings: ["SaaS", "pricing", "HubSpot", "10-50"] } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
    ],
  },

  // === 13. ACTIONS RECOMMENDER (Generation) ===
  {
    agentId: "actions-recommender",
    description: "Priority action recommendations",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade these action recommendations on:
- Specificity (35%): Actions reference specific deals/contacts, not generic advice
- Priority logic (25%): Critical items first, actionable ordering
- Feasibility (20%): Each action is something the user can do today
- Coverage (20%): Mix of follow-ups, closes, rescues, research
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "actions-mixed-pipeline",
        input: JSON.stringify({ deals: [{ name: "Meridian", stage: "proposal", value: 75000, daysSinceActivity: 21 }, { name: "Apex", stage: "negotiation", value: 120000, daysSinceActivity: 2 }], contacts: 45, companies: 20, sequenceEnrollments: 15 }),
        tags: ["actions", "pipeline"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "contains_all", weight: 0.3, config: { strings: ["Meridian", "Apex"] } },
          { type: "pattern_match", weight: 0.2, config: { pattern: "critical|high|urgent|follow.up" } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 14. AI AUTOFILL (Extraction) ===
  {
    agentId: "ai-autofill",
    description: "Custom field auto-fill from conversation history",
    passThreshold: 0.75,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "autofill-from-emails",
        input: JSON.stringify({
          entity: { name: "Sarah Chen", email: "sarah@meridian.com" },
          conversations: ["Email: Discussed their team of 15 engineers using React and Node.js", "Call notes: Budget approved for Q3, looking at $500/mo plans"],
          fields: [
            { id: "team_size", label: "Team Size", type: "number" },
            { id: "tech_stack", label: "Tech Stack", type: "text" },
            { id: "budget", label: "Budget", type: "text" },
          ],
        }),
        tags: ["autofill", "extraction"],
        graders: [
          { type: "json_schema", weight: 0.3, config: {} },
          { type: "field_accuracy", weight: 0.7, config: { fields: { team_size: "15", tech_stack: "React", budget: "500" } } },
        ],
      },
    ],
  },

  // === 15. MEETING PREP API ===
  {
    agentId: "meeting-prep",
    description: "Meeting briefing document generation",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this meeting prep document on:
- Completeness (30%): Covers attendees, account context, deal status, talking points
- Actionability (30%): Specific talking points, not generic
- Data accuracy (20%): Numbers, names, dates are correct
- Conciseness (20%): Gets to the point, well-structured
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "prep-proposal-meeting",
        input: JSON.stringify({ account: "Meridian Labs", attendees: [{ name: "Sarah Chen", title: "CTO" }], deal: { name: "Meridian Enterprise", stage: "proposal", value: 75000 }, recentActivities: ["Demo 2 weeks ago", "Pricing email sent last week"] }),
        tags: ["meeting_prep", "proposal_stage"],
        graders: [
          { type: "contains_all", weight: 0.4, config: { strings: ["Sarah Chen", "CTO", "Meridian", "proposal", "75,000"] } },
          { type: "pattern_match", weight: 0.2, config: { pattern: "talking point|agenda|discuss|objective" } },
          { type: "word_count", weight: 0.1, config: { min: 100, max: 1500 } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 16. GENERATE MEETING PREP (Inngest) ===
  {
    agentId: "generate-meeting-prep",
    description: "Background meeting prep generation",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: "bg-prep-basic",
        input: JSON.stringify({ meetingTitle: "Q2 Planning Call", account: "Meridian Labs", contacts: ["Sarah Chen"], deals: [{ name: "Meridian Enterprise", value: 75000 }] }),
        tags: ["meeting_prep", "background"],
        graders: [
          { type: "contains_all", weight: 0.4, config: { strings: ["Meridian", "Sarah", "75,000"] } },
          { type: "word_count", weight: 0.2, config: { min: 50, max: 1500 } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
    ],
  },

  // === 17. SEND SEQUENCE STEP ===
  {
    agentId: "send-sequence-step",
    description: "Sequence email personalization",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this personalized sequence email on:
- Personalization (40%): Uses specific contact/company details naturally
- Template adherence (30%): Follows the original template structure and intent
- Naturalness (20%): Doesn't feel templated or robotic
- Brevity (10%): Appropriate length for cold/nurture email
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "sequence-step-cold",
        input: JSON.stringify({ template: "Hi {{firstName}}, I noticed {{company}} is {{signal}}. We help teams like yours {{value_prop}}. Worth a 15-min call?", contact: { firstName: "Sarah", company: "Meridian Labs" }, signals: ["hiring engineers", "Series A"] }),
        tags: ["sequence", "personalization"],
        graders: [
          { type: "contains_all", weight: 0.3, config: { strings: ["Sarah", "Meridian"] } },
          { type: "word_count", weight: 0.2, config: { min: 20, max: 150 } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "\\{\\{.*?\\}\\}" } }, // no unresolved template vars
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 18. GENERATE SEQUENCE (Full outreach sequence generation) ===
  {
    agentId: "generate-sequence",
    description: "5-step cold outreach sequence generation with methodology framework",
    passThreshold: 0.7,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade this outbound email sequence on:
- Personalization (30%): Each email references specific company/contact facts, not generic templates
- Methodology adherence (20%): Follows the assigned framework (BASHO, Challenger, etc.)
- Variety (20%): Each step has a genuinely different angle — no repeated value props
- Conciseness (15%): Emails are within word limits, punchy, no filler
- Anti-patterns (15%): No "I hope this finds you well", "I noticed that", "Just wanted to", exclamation marks
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "sequence-csuite-funding",
        input: JSON.stringify({
          contact: { fullName: "Marie Laurent", title: "CEO", seniority: "c_suite" },
          company: { name: "DataPulse", industry: "Developer Tools", size: "51-100" },
          signal: { type: "funding", title: "Series B $25M" },
          methodology: "BASHO",
        }),
        tags: ["sequence", "c_suite", "basho", "funding"],
        graders: [
          { type: "contains_all", weight: 0.2, config: { strings: ["Marie", "DataPulse"] } },
          { type: "word_count", weight: 0.1, config: { min: 100, max: 800 } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "I hope this finds you|I noticed that|Just wanted to|I'd love to|!!!" } },
          { type: "pattern_match", weight: 0.1, config: { pattern: "Series B|25M|funding|scale" } },
          { type: "llm_judge", weight: 0.4, config: {} },
        ],
      },
      {
        id: "sequence-vp-hiring",
        input: JSON.stringify({
          contact: { fullName: "Laura Martinez", title: "VP Sales", seniority: "vp" },
          company: { name: "CloudStack", industry: "SaaS", size: "101-200" },
          signal: { type: "hiring", title: "Hiring 8 SDRs" },
          methodology: "Challenger",
        }),
        tags: ["sequence", "vp", "challenger", "hiring"],
        graders: [
          { type: "contains_all", weight: 0.2, config: { strings: ["Laura", "CloudStack"] } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "I hope this finds you|I noticed that|Just wanted to" } },
          { type: "pattern_match", weight: 0.1, config: { pattern: "SDR|hiring|scaling|team" } },
          { type: "llm_judge", weight: 0.5, config: {} },
        ],
      },
      {
        id: "sequence-manager-minimal",
        input: JSON.stringify({
          contact: { fullName: "Rachel Kim", title: "Sales Manager", seniority: "manager" },
          company: { name: "LogiTech Solutions", industry: "Logistics", size: "51-100" },
          signal: null,
          methodology: "Product-Led",
        }),
        tags: ["sequence", "manager", "product_led", "no_signal"],
        graders: [
          { type: "contains_all", weight: 0.2, config: { strings: ["Rachel", "LogiTech"] } },
          { type: "word_count", weight: 0.1, config: { min: 80, max: 700 } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "I hope this finds you|I noticed that" } },
          { type: "llm_judge", weight: 0.5, config: {} },
        ],
      },
    ],
  },

  // === 19. DETECT SIGNALS (Signal interpretation from Apollo data) ===
  {
    agentId: "detect-signals",
    description: "Interpret Apollo enrichment data into buying signals",
    passThreshold: 0.75,
    llmJudgeModel: "gpt-4o-mini",
    llmJudgePrompt: `Grade these buying signal interpretations on:
- Evidence-grounded (40%): Each signal directly references a specific fact from the input
- Business relevance (30%): Signals are genuinely useful for sales outreach timing
- No fabrication (30%): Nothing invented beyond what the facts support
Score 0.0-1.0. End with SCORE: X.XX`,
    cases: [
      {
        id: "signals-series-a-hiring",
        input: JSON.stringify({
          company: "TechFlow",
          facts: ["Total funding: $15M Series A", "Employee count: 45", "Founded: 2021", "Technologies: React, Node.js, AWS", "Industry: Developer Tools"],
        }),
        tags: ["signals", "funding", "tech"],
        graders: [
          { type: "json_schema", weight: 0.2, config: {} },
          { type: "pattern_match", weight: 0.3, config: { pattern: "funding|Series A|15M|scale|growth" } },
          { type: "forbidden_pattern", weight: 0.2, config: { pattern: "IPO|acquisition|layoff" } },
          { type: "llm_judge", weight: 0.3, config: {} },
        ],
      },
    ],
  },

  // === 20-27: Non-LLM agents (background/sync) — simplified evals ===
  ...(["enrich-company", "enrich-contact", "calendar-sync", "sync-emails", "cron-email-sync", "google-oauth-connected", "auto-meeting-prep", "execute-workflow"] as const).map((agentId) => ({
    agentId,
    description: `Background agent: ${agentId}`,
    passThreshold: 0.8,
    llmJudgeModel: "gpt-4o-mini",
    cases: [
      {
        id: `${agentId}-health-check`,
        input: "health_check",
        tags: ["health", "background"],
        graders: [
          { type: "latency_check" as GraderType, weight: 0.5, config: { maxMs: 30000 } },
          { type: "cost_check" as GraderType, weight: 0.5, config: { maxCost: 0.01 } },
        ],
      },
    ],
  })),
];

// ─── Classification Metrics (Precision / Recall / F1) ────────

export interface ClassificationMetrics {
  accuracy: number;
  perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  macroF1: number;
  confusionMatrix: Record<string, Record<string, number>>;
}

export function computeClassificationMetrics(
  predictions: Array<{ predicted: string; actual: string }>,
): ClassificationMetrics {
  const classes = [...new Set(predictions.flatMap((p) => [p.predicted, p.actual]))];
  const confusionMatrix: Record<string, Record<string, number>> = {};

  for (const c of classes) {
    confusionMatrix[c] = {};
    for (const c2 of classes) confusionMatrix[c][c2] = 0;
  }

  let correct = 0;
  for (const { predicted, actual } of predictions) {
    if (!confusionMatrix[actual]) confusionMatrix[actual] = {};
    confusionMatrix[actual][predicted] = (confusionMatrix[actual][predicted] || 0) + 1;
    if (predicted === actual) correct++;
  }

  const perClass: ClassificationMetrics["perClass"] = {};
  let totalF1 = 0;

  for (const cls of classes) {
    const tp = confusionMatrix[cls]?.[cls] || 0;
    const fp = predictions.filter((p) => p.predicted === cls && p.actual !== cls).length;
    const fn = predictions.filter((p) => p.actual === cls && p.predicted !== cls).length;
    const support = predictions.filter((p) => p.actual === cls).length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClass[cls] = { precision, recall, f1, support };
    totalF1 += f1;
  }

  return {
    accuracy: predictions.length > 0 ? correct / predictions.length : 0,
    perClass,
    macroF1: classes.length > 0 ? totalF1 / classes.length : 0,
    confusionMatrix,
  };
}

// ============================================================
// FIX 1: Grade OUTCOMES, not paths
// Anthropic: "Don't grade the path. Grade what the agent produced."
// ============================================================

export type OutcomeGraderType =
  | "outcome_entity_created"    // verify entity was created in DB
  | "outcome_entity_updated"    // verify entity was updated
  | "outcome_contains_data"     // output contains data from context (not hallucinated)
  | "outcome_answers_question"; // output actually answers the user's question

export interface OutcomeGrader {
  type: OutcomeGraderType;
  weight: number;
  config: Record<string, unknown>;
}

/**
 * Grade based on the outcome (what the agent produced), not the path (which tools it called).
 * Per Anthropic: "Support partial credit — an agent correctly identifying a problem
 * but failing a step is better than a blanket failure score."
 */
export function runOutcomeGrader(
  grader: OutcomeGrader,
  output: string,
  context: string,
  environmentState?: Record<string, unknown>,
): GraderResult {
  const { type, weight, config } = grader;

  switch (type) {
    case "outcome_contains_data": {
      // Verify output contains data that exists in the context (not hallucinated)
      const requiredDataPoints = config.dataPoints as string[];
      const found = requiredDataPoints.filter((dp) =>
        output.toLowerCase().includes(dp.toLowerCase())
      );
      const score = requiredDataPoints.length > 0 ? found.length / requiredDataPoints.length : 0;
      return {
        type: "pattern_match",
        passed: score >= 0.6, // partial credit
        score,
        weight,
        detail: `${found.length}/${requiredDataPoints.length} data points from context found in output`,
      };
    }

    case "outcome_answers_question": {
      // Does the output actually address the input question?
      // This is a lightweight heuristic; LLM-as-judge handles the nuance
      const hasContent = output.trim().length > 20;
      const isNotRefusal = !/^(I'm sorry|I cannot|I don't know|Error)/i.test(output);
      const score = hasContent && isNotRefusal ? 1.0 : 0.0;
      return {
        type: "pattern_match",
        passed: score > 0,
        score,
        weight,
        detail: hasContent ? "Output contains substantive content" : "Output is empty or a refusal",
      };
    }

    case "outcome_entity_created":
    case "outcome_entity_updated": {
      // Check environment state for entity changes
      if (!environmentState) {
        return { type: "pattern_match", passed: true, score: 0.5, weight, detail: "No environment state to verify (sandbox mode)" };
      }
      const entityExists = environmentState[config.entityKey as string] !== undefined;
      return {
        type: "pattern_match",
        passed: entityExists,
        score: entityExists ? 1.0 : 0.0,
        weight,
        detail: entityExists ? "Entity found in environment state" : "Entity not found",
      };
    }

    default:
      return { type: "pattern_match", passed: false, score: 0, weight, detail: `Unknown outcome grader: ${type}` };
  }
}

// ============================================================
// FIX 2: Multi-trial with pass@k / pass^k
// Anthropic: "Non-determinism requires multiple trials."
// ============================================================

export interface MultiTrialResult {
  /** Probability of at least 1 success in k trials */
  passAtK: number;
  /** Probability of ALL k trials succeeding */
  passExpK: number;
  /** Raw per-trial success rate */
  perTrialRate: number;
  /** Individual trial scores */
  trialScores: number[];
  /** Number of trials run */
  k: number;
  /** Mean score across trials */
  meanScore: number;
  /** Standard error of the mean */
  sem: number;
}

export function computeMultiTrialMetrics(trialScores: number[], threshold: number): MultiTrialResult {
  const k = trialScores.length;
  const successes = trialScores.filter((s) => s >= threshold).length;
  const perTrialRate = k > 0 ? successes / k : 0;

  const meanScore = k > 0 ? trialScores.reduce((a, b) => a + b, 0) / k : 0;

  // Standard error of the mean (for statistical rigor per Anthropic)
  const variance = k > 1
    ? trialScores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / (k - 1)
    : 0;
  const sem = Math.sqrt(variance / k);

  return {
    passAtK: 1 - Math.pow(1 - perTrialRate, k),    // P(at least 1 success)
    passExpK: Math.pow(perTrialRate, k),              // P(all succeed)
    perTrialRate,
    trialScores,
    k,
    meanScore,
    sem,
  };
}

// ============================================================
// FIX 3: Isolated dimension judges
// Anthropic: "Grade each dimension with an isolated LLM-as-judge
// rather than using one to grade all dimensions."
// ============================================================

export interface DimensionJudge {
  dimension: string;
  weight: number;
  rubric: string;
}

export const JUDGE_DIMENSIONS: Record<string, DimensionJudge[]> = {
  conversational: [
    { dimension: "accuracy", weight: 0.30, rubric: "Are the facts in the response correct? Does the data match what was provided in the context? Score 0.0-1.0." },
    { dimension: "relevance", weight: 0.25, rubric: "Does the response directly answer the question that was asked? Is there unnecessary tangential information? Score 0.0-1.0." },
    { dimension: "completeness", weight: 0.20, rubric: "Does the response cover all aspects of the query? Are there important details missing? Score 0.0-1.0." },
    { dimension: "actionability", weight: 0.15, rubric: "Does the response provide concrete, useful next steps the user can take? Score 0.0-1.0." },
    { dimension: "tone", weight: 0.10, rubric: "Is the tone professional, concise, and appropriate for a sales context? Score 0.0-1.0." },
  ],
  generation: [
    { dimension: "personalization", weight: 0.30, rubric: "Does the output use specific details about the recipient/context, not generic filler? Score 0.0-1.0." },
    { dimension: "value_proposition", weight: 0.25, rubric: "Is there a clear benefit communicated to the reader? Score 0.0-1.0." },
    { dimension: "conciseness", weight: 0.20, rubric: "Is the output appropriately brief without missing key information? Score 0.0-1.0." },
    { dimension: "call_to_action", weight: 0.15, rubric: "Is there a clear, specific next step? Score 0.0-1.0." },
    { dimension: "naturalness", weight: 0.10, rubric: "Does it sound human-written, not robotic or templated? Score 0.0-1.0." },
  ],
  extraction: [
    { dimension: "completeness", weight: 0.35, rubric: "Were all extractable fields captured? Are any obvious items missing? Score 0.0-1.0." },
    { dimension: "accuracy", weight: 0.35, rubric: "Are the extracted values correct and matching the source text? Score 0.0-1.0." },
    { dimension: "no_hallucination", weight: 0.20, rubric: "Are there any values that were NOT in the source text but appear in the extraction? If hallucinated data exists, score 0.0. Score 0.0-1.0." },
    { dimension: "structure", weight: 0.10, rubric: "Is the output well-structured and consistently formatted? Score 0.0-1.0." },
  ],
  classification: [
    { dimension: "correctness", weight: 0.80, rubric: "Is the classification label correct given the input? Score 1.0 for correct, 0.0 for incorrect." },
    { dimension: "confidence", weight: 0.20, rubric: "Is the classification clear and unambiguous, or is the model hedging? Score 0.0-1.0." },
  ],
};

/**
 * Run isolated dimension judges — one LLM call per dimension.
 * Returns individual dimension scores + weighted composite.
 *
 * FIX 6 included: Each judge prompt includes an "Unknown" escape hatch.
 */
export async function runDimensionJudges(
  input: string,
  output: string,
  context: string,
  dimensions: DimensionJudge[],
  judgeModel: string,
): Promise<{ dimensions: Array<{ dimension: string; score: number; reasoning: string }>; composite: number }> {
  const { generateText } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { openai } = await import("@ai-sdk/openai");

  const model = judgeModel.includes("gpt") && process.env.OPENAI_API_KEY
    ? openai(judgeModel)
    : process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : null;

  if (!model) {
    return { dimensions: [], composite: 0.5 };
  }

  const results: Array<{ dimension: string; score: number; weight: number; reasoning: string }> = [];

  // Run each dimension judge in parallel for speed
  const judgePromises = dimensions.map(async (dim) => {
    const prompt = `You are evaluating ONE specific dimension of an AI agent's output.

<dimension>${dim.dimension}</dimension>
<rubric>${dim.rubric}</rubric>

<user_input>${input.slice(0, 500)}</user_input>

${context ? `<context>${context.slice(0, 500)}</context>` : ""}

<agent_output>${output.slice(0, 1500)}</agent_output>

Think step by step in <thinking> tags.
If you cannot evaluate this dimension due to insufficient information, output <result>UNKNOWN</result>.
Otherwise, output your score in <result>X.XX</result> tags (0.00 to 1.00).`;

    try {
      const result = await generateText({
        model,
        prompt,
        // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
        maxTokens: 400,
      });

      const text = result.text;

      // FIX 6: Handle "Unknown" escape hatch
      if (text.includes("<result>UNKNOWN</result>")) {
        return { dimension: dim.dimension, score: -1, weight: dim.weight, reasoning: "Insufficient information to evaluate" };
      }

      const scoreMatch = text.match(/<result>(\d+\.?\d*)<\/result>/);
      const score = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;
      const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
      const reasoning = thinkingMatch ? thinkingMatch[1].trim().slice(0, 200) : "";

      return { dimension: dim.dimension, score, weight: dim.weight, reasoning };
    } catch {
      return { dimension: dim.dimension, score: 0.5, weight: dim.weight, reasoning: "Judge error" };
    }
  });

  const judgeResults = await Promise.all(judgePromises);

  // Filter out UNKNOWN results and reweight
  const validResults = judgeResults.filter((r) => r.score >= 0);
  const totalWeight = validResults.reduce((sum, r) => sum + r.weight, 0);
  const composite = totalWeight > 0
    ? validResults.reduce((sum, r) => sum + r.score * r.weight, 0) / totalWeight
    : 0.5;

  return {
    dimensions: judgeResults.map((r) => ({
      dimension: r.dimension,
      score: r.score,
      reasoning: r.reasoning,
    })),
    composite,
  };
}

// ============================================================
// FIX 5: Capability vs Regression eval separation
// Anthropic: "Capability evals start at low pass rate (hill to climb).
// Regression evals must maintain near-100% pass rate."
// ============================================================

export type EvalSuiteType = "capability" | "regression";

export interface EvalSuiteConfig {
  type: EvalSuiteType;
  /** Capability: expect low pass rate, track improvement. Regression: alert on any drop */
  passThreshold: number;
  /** For regression: if pass rate drops below this from previous run, it's a regression */
  regressionAlertThreshold: number;
}

export const EVAL_SUITE_DEFAULTS: Record<EvalSuiteType, EvalSuiteConfig> = {
  capability: {
    type: "capability",
    passThreshold: 0.5, // aspirational — hill to climb
    regressionAlertThreshold: 0, // no regression alerts for capability evals
  },
  regression: {
    type: "regression",
    passThreshold: 0.9, // must stay high
    regressionAlertThreshold: 0.05, // alert if drops more than 5%
  },
};

/**
 * Classify an eval case as capability or regression.
 * Auto-generated from production failures = regression.
 * Hand-written aspirational cases = capability.
 */
export function classifyEvalCase(tags: string[]): EvalSuiteType {
  if (tags.includes("regression") || tags.includes("auto-generated")) return "regression";
  return "capability";
}
