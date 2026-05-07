export interface IntelligenceBrief {
  id: string;
  tenantId: string;
  companyId: string;
  contactId: string | null;
  websiteSummary: string | null;
  recentNews: NewsItem[];
  jobPostings: JobPosting[];
  techStack: TechEntry[];
  linkedinActivity: LinkedInActivity | null;
  publicContent: PublicContentPiece[];
  competitorDetected: string | null;
  communicationStyle: CommunicationStyle | null;
  painPoints: string[];
  bestAngle: string | null;
  warmthSignals: WarmthSignal[];
  publicContentDepth: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourceErrors: SourceError[];
  researchedAt: string;
  expiresAt: string;
}

export interface NewsItem {
  title: string;
  date: string;
  summary: string;
  url: string;
  relevance: "high" | "medium" | "low";
}

export interface JobPosting {
  title: string;
  department: string | null;
  senioritySignal: string | null;
  url: string | null;
  detectedAt: string;
}

export interface TechEntry {
  tool: string;
  category: string;
  confidence: "high" | "medium" | "low";
}

export interface LinkedInActivity {
  postsPerWeek: number;
  recentTopics: string[];
  tone: "formal" | "casual" | "technical" | "thought-leader";
  lastPostDate: string | null;
}

export interface PublicContentPiece {
  type: "linkedin_post" | "blog_post" | "podcast" | "talk" | "tweet";
  title: string;
  quote: string;
  url: string;
  date: string;
}

export interface CommunicationStyle {
  formality: "formal" | "casual" | "mixed";
  preferredLength: "short" | "medium" | "long";
  tone: string;
}

export interface WarmthSignal {
  type: "mutual_connection" | "shared_community" | "alumni" | "shared_investor" | "past_interaction";
  detail: string;
}

export interface SourceError {
  source: string;
  error: string;
  statusCode?: number;
}

// --- Strategy types ---

export type StrategyType =
  | "warm_intro"
  | "trigger_based"
  | "smykm"
  | "displacement"
  | "value_first"
  | "social_first"
  | "multi_thread"
  | "re_engagement"
  | "event_triggered"
  | "long_game";

export interface StrategyCandidate {
  strategyId: StrategyType;
  score: number;
  reason: string;
  activationFactors: string[];
}

export interface WarmPath {
  distance: number;
  connectorNodeId: string;
  connectorName: string;
  connectorEmail: string | null;
  lastActiveAt: string | null;
  relationshipType: string;
}

export interface PreviousOutreach {
  strategyUsed: StrategyType | null;
  outcome: "no_response" | "replied_positive" | "replied_negative" | "not_now" | "bounced";
  date: string;
  emailsSent: number;
}

// --- Autonomy types ---

export type AutonomyLevel = "copilot" | "guided" | "autonomous" | "strategic";

export type PermissionValue =
  | "manual"
  | "delayed"
  | "auto"
  | "auto_if_preapproved"
  | "auto_if_icp_match"
  | "draft_only"
  | "ask"
  | "auto_with_log"
  | "auto_with_notification"
  | "auto_stop";

export interface PermissionsMap {
  coldEmailSend: PermissionValue;
  replyPositive: PermissionValue;
  replyObjection: PermissionValue;
  replyNegative: PermissionValue;
  warmIntroSend: PermissionValue;
  linkedInActions: PermissionValue;
  newProspectAdd: PermissionValue;
  strategySwitch: PermissionValue;
  sequencePause: PermissionValue;
}

export interface GuardrailsConfig {
  maxEmailsPerDay: number;
  maxNewProspectsPerWeek: number;
  maxEmailsPerProspect: number;
  maxEmailsPerProspectDays: number;
  neverContact: string[];
  alwaysEscalateWhen: EscalationRule[];
  sendWindow: SendWindow;
  language: "auto" | string;
  maxDailySpend: number;
}

export interface SendWindow {
  start: string;
  end: string;
  days: string[];
  timezone: "recipient" | string;
}

export interface EscalationRule {
  id: string;
  condition: EscalationCondition;
  action: "escalate" | "pause" | "stop";
  label: string;
}

export type EscalationCondition =
  | { type: "deal_value_above"; threshold: number }
  | { type: "prospect_seniority"; levels: string[] }
  | { type: "reply_contains"; keywords: string[] }
  | { type: "reply_sentiment"; sentiment: "negative" | "angry" }
  | { type: "prospect_in_network"; degree: number }
  | { type: "retry_count_above"; count: number }
  | { type: "competitor_mentioned" };

export interface BrandConfig {
  writingStyle: string;
  forbiddenWords: string[];
  signatureTemplate: string;
  formalityLevel: "casual" | "professional" | "match_prospect";
}

export interface AutonomyConfig {
  level: AutonomyLevel;
  permissions: PermissionsMap;
  guardrails: GuardrailsConfig;
  brand: BrandConfig;
}

// --- Trust score types ---

export type TrustEventType =
  | "approved_without_edit"
  | "approved_with_minor_edit"
  | "rejected"
  | "email_positive_reply"
  | "email_negative_reply"
  | "meeting_booked"
  | "factual_error"
  | "wrong_person"
  | "escalation_warranted"
  | "escalation_unnecessary";

export interface TrustScoreState {
  overall: number;
  perPlaybook: Record<string, number>;
  perAction: Record<string, number>;
  actionsCount: number;
  approvalsWithoutEdit: number;
  rejections: number;
  trend: "rising" | "stable" | "falling";
  suggestedLevel: AutonomyLevel;
  readyForUpgrade: boolean;
  shouldDowngrade: boolean;
}

// --- Execution gate types ---

export type GateStatus = "execute" | "delayed" | "queued_for_approval" | "blocked";

export interface GateResult {
  status: GateStatus;
  reason?: string;
  delay?: number;
  guardrailId?: string;
  escalationRuleId?: string;
}

export type ActionType = keyof PermissionsMap;
