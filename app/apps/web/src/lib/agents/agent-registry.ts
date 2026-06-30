
// ─── Agent Registry ──────────────────────────────────────────

export type AgentCategory =
  | "conversational"
  | "background"
  | "api"
  | "classification"
  | "extraction"
  | "generation"
  | "rag";

export interface AgentDefinition {
  id: string;
  name: string;
  category: AgentCategory;
  description: string;
  expectedTools?: string[];
  qualityThreshold: number; // minimum acceptable eval score (0.0-1.0)
  maxLatencyMs: number; // alert if p95 exceeds this
  maxCostPerCall: number; // alert if single call exceeds this ($)
  evalSampleRate: number; // 0.0-1.0, fraction of traces to eval online
}

export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // ── Conversational ────────────────────────
  chat: {
    id: "chat",
    name: "Elevay Chat Agent",
    category: "conversational",
    description: "Main GTM copilot — CRM queries, deal coaching, email drafts, task management",
    expectedTools: ["searchCRM", "queryContacts", "queryAccounts", "queryDeals", "queryActivities", "queryNotes"],
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.50,
    evalSampleRate: 0.20,
  },

  // ── Background (Inngest) ──────────────────
  "enrich-company": {
    id: "enrich-company",
    name: "Enrich Company",
    category: "background",
    description: "Enriches company data via Apollo API after creation",
    qualityThreshold: 0.8,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.01,
    evalSampleRate: 0.05,
  },
  "enrich-contact": {
    id: "enrich-contact",
    name: "Enrich Contact",
    category: "background",
    description: "Enriches contact data via Apollo API after creation",
    qualityThreshold: 0.8,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.01,
    evalSampleRate: 0.05,
  },
  "send-sequence-step": {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    category: "generation",
    description: "Personalizes and sends templated sequence emails",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "process-reply": {
    id: "process-reply",
    name: "Process Reply",
    category: "classification",
    description: "Classifies incoming email replies (positive, negative, ooo, unsubscribe)",
    qualityThreshold: 0.85,
    maxLatencyMs: 5000,
    maxCostPerCall: 0.02,
    evalSampleRate: 0.20,
  },
  "ai-autofill": {
    id: "ai-autofill",
    name: "AI Auto-Fill Fields",
    category: "extraction",
    description: "Auto-fills custom fields from conversation history",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.15,
  },
  "calendar-sync": {
    id: "calendar-sync",
    name: "Calendar Sync",
    category: "background",
    description: "Syncs Google/Microsoft calendars every 15 minutes",
    qualityThreshold: 0.9,
    maxLatencyMs: 30000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "auto-meeting-prep": {
    id: "auto-meeting-prep",
    name: "Auto Meeting Prep",
    category: "background",
    description: "Triggers meeting prep generation for upcoming meetings",
    qualityThreshold: 0.8,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "generate-meeting-prep": {
    id: "generate-meeting-prep",
    name: "Generate Meeting Prep",
    category: "generation",
    description: "Generates comprehensive meeting briefing documents",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.15,
  },
  "sync-emails": {
    id: "sync-emails",
    name: "Sync Emails",
    category: "background",
    description: "Syncs Gmail/Outlook emails, auto-creates contacts",
    qualityThreshold: 0.9,
    maxLatencyMs: 60000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "cron-email-sync": {
    id: "cron-email-sync",
    name: "Cron Email Sync",
    category: "background",
    description: "Periodic email sync trigger",
    qualityThreshold: 0.9,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "google-oauth-connected": {
    id: "google-oauth-connected",
    name: "Google OAuth Connected",
    category: "background",
    description: "Triggers initial sync after Google OAuth connection",
    qualityThreshold: 0.9,
    maxLatencyMs: 5000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },
  "execute-workflow": {
    id: "execute-workflow",
    name: "Execute Workflow",
    category: "background",
    description: "User-defined workflow orchestrator (notifications, tasks, webhooks)",
    qualityThreshold: 0.8,
    maxLatencyMs: 15000,
    maxCostPerCall: 0,
    evalSampleRate: 0,
  },

  // ── API Endpoints ─────────────────────────
  "draft-email": {
    id: "draft-email",
    name: "Draft Email",
    category: "generation",
    description: "Drafts cold outreach emails with personalization",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "follow-up-email": {
    id: "follow-up-email",
    name: "Follow-up Email",
    category: "generation",
    description: "Generates follow-up emails based on meeting notes",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "suggest-reply": {
    id: "suggest-reply",
    name: "Reply Suggestion",
    category: "generation",
    description: "Generates 3 reply options with different tones",
    qualityThreshold: 0.7,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.10,
  },
  "inbox-compose-reply": {
    id: "inbox-compose-reply",
    name: "Inbox Reply Composer",
    category: "generation",
    description: "Drafts a complete voice-matched reply to the latest message in an inbox thread",
    qualityThreshold: 0.7,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.05,
    // P3 outcome→learn loop (lib/outcomes/reply-flywheel.ts): a low but
    // non-zero rate is REQUIRED, not just for sampling — eval-functions.ts'
    // and prompt-optimizer-cron.ts's eligibility filters are
    // `evalSampleRate > 0 && maxCostPerCall > 0`, and that's what makes the
    // periodic flywheel cron call curateFewShotExamples (and therefore
    // promoteApprovedCandidates) for this agentId at all. Without this entry,
    // recordFlywheelCandidate's inserts would sit isActive:false forever.
    evalSampleRate: 0.05,
  },
  "meeting-prep": {
    id: "meeting-prep",
    name: "Meeting Prep API",
    category: "generation",
    description: "Generates meeting briefing documents via API",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.10,
  },
  "process-transcript": {
    id: "process-transcript",
    name: "Process Transcript",
    category: "extraction",
    description: "Extracts structured notes from meeting transcripts",
    qualityThreshold: 0.75,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.20,
    evalSampleRate: 0.20,
  },
  "account-summarize": {
    id: "account-summarize",
    name: "Account Summarization",
    category: "generation",
    description: "Auto-generates account summary and about business fields",
    qualityThreshold: 0.7,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.10,
  },
  "deal-analyze": {
    id: "deal-analyze",
    name: "Deal Analysis",
    category: "extraction",
    description: "Analyzes deals and recommends stage progression",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "deal-extract-intel": {
    id: "deal-extract-intel",
    name: "Deal Intelligence Extraction",
    category: "extraction",
    description: "Extracts structured deal intelligence from meeting notes",
    qualityThreshold: 0.75,
    maxLatencyMs: 10000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "icp-analysis": {
    id: "icp-analysis",
    name: "ICP Analysis",
    category: "extraction",
    description: "Analyzes company website to infer ideal customer profile",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.20,
  },
  "build-tam": {
    id: "build-tam",
    name: "Build TAM Strategies",
    category: "extraction",
    description: "Generates 2-4 Apollo organization-search strategies from the tenant's business context + ICP",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
  "onboarding-narrator": {
    id: "onboarding-narrator",
    name: "Onboarding Narrator",
    category: "generation",
    description: "Streams the four-paragraph first-person read-back shown on the product step during onboarding",
    qualityThreshold: 0.7,
    maxLatencyMs: 20000,
    maxCostPerCall: 0.08,
    evalSampleRate: 0.15,
  },
  "generate-sequence": {
    id: "generate-sequence",
    name: "Generate Outreach Sequence",
    category: "generation",
    description: "Generates 5-step cold outreach sequences with methodology framework",
    qualityThreshold: 0.7,
    maxLatencyMs: 30000,
    maxCostPerCall: 0.15,
    evalSampleRate: 0.20,
  },
  "detect-signals": {
    id: "detect-signals",
    name: "Detect Buying Signals",
    category: "extraction",
    description: "Interprets Apollo enrichment data into actionable buying signals",
    qualityThreshold: 0.75,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.15,
  },
  "smart-import": {
    id: "smart-import",
    name: "Smart CSV Import",
    category: "classification",
    description: "AI-powered CSV import with automatic column mapping",
    qualityThreshold: 0.85,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.05,
    evalSampleRate: 0.20,
  },
  "world-model": {
    id: "world-model",
    name: "World Model Generator",
    category: "extraction",
    description: "Builds business knowledge model from accumulated interactions",
    qualityThreshold: 0.7,
    maxLatencyMs: 60000,
    maxCostPerCall: 0.30,
    evalSampleRate: 0.10,
  },
  "actions-recommender": {
    id: "actions-recommender",
    name: "Actions Recommender",
    category: "generation",
    description: "Generates 5 priority actions to close more revenue",
    qualityThreshold: 0.7,
    maxLatencyMs: 15000,
    maxCostPerCall: 0.10,
    evalSampleRate: 0.15,
  },
};
