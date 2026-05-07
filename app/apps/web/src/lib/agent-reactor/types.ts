export type AgentTrigger =
  | "email_opened"
  | "email_replied"
  | "email_bounced"
  | "email_clicked"
  | "signal_detected"
  | "deal_stale"
  | "meeting_completed"
  | "contact_enriched"
  | "sequence_completed"
  | "inbound_email"
  | "deal_stage_changed"
  | "daily_sweep";

export interface AgentReactEventData {
  tenantId: string;
  trigger: AgentTrigger;
  entityType: "contact" | "company" | "deal" | "email";
  entityId: string;
  metadata: Record<string, unknown>;
  deduplicationKey: string;
  firedAt: string;
}

export interface ReactorContext {
  entity: {
    type: string;
    id: string;
    label: string;
    data: Record<string, unknown>;
  };
  recentActivities: Array<{
    type: string;
    summary: string;
    occurredAt: string;
    direction?: string;
    sentiment?: string;
  }>;
  activeSequences: Array<{
    sequenceName: string;
    currentStep: number;
    totalSteps: number;
    status: string;
  }>;
  signals: Array<{
    type: string;
    value: unknown;
  }>;
  pastActions: Array<{
    actionType: string;
    reasoning: string;
    createdAt: string;
    status: string;
  }>;
  workItem: {
    strategy: string;
    nextAction: string | null;
    priority: string;
  } | null;
  icp: {
    industries: string[];
    sizes: string[];
    roles: string[];
    geographies: string[];
  };
  triggerMetadata: Record<string, unknown>;
}

export type AgentActionType =
  | "send_followup"
  | "draft_reply"
  | "advance_deal"
  | "create_task"
  | "create_deal"
  | "enroll_sequence"
  | "alert_founder"
  | "research_company"
  | "enrich_contact"
  | "hold";

export interface AgentDecision {
  actions: AgentDecisionAction[];
  reasoning: string;
  confidence: number;
}

export interface AgentDecisionAction {
  type: AgentActionType;
  params: Record<string, unknown>;
  expectedOutcome: string;
}

export const HEURISTIC_DECISIONS: Partial<Record<AgentTrigger, AgentDecision>> = {
  email_opened: {
    actions: [],
    reasoning: "Email opened — tracked, no action needed",
    confidence: 1.0,
  },
  email_bounced: {
    actions: [
      { type: "alert_founder", params: { severity: "high" }, expectedOutcome: "Founder aware of deliverability issue" },
    ],
    reasoning: "Email bounced — alerting founder about deliverability issue",
    confidence: 0.9,
  },
  deal_stale: {
    actions: [
      { type: "create_task", params: { title: "Follow up on stale deal" }, expectedOutcome: "Task created for deal follow-up" },
    ],
    reasoning: "Deal stale >7 days — creating follow-up task",
    confidence: 0.8,
  },
  signal_detected: {
    actions: [
      { type: "create_deal", params: { stage: "lead" }, expectedOutcome: "New lead-stage deal created from signal" },
    ],
    reasoning: "Signal detected on company without deal — creating lead",
    confidence: 0.7,
  },
  meeting_completed: {
    actions: [
      { type: "create_task", params: { title: "Send meeting follow-up", dueInDays: 1 }, expectedOutcome: "Follow-up task created for tomorrow" },
    ],
    reasoning: "Meeting completed — creating next-day follow-up task",
    confidence: 0.8,
  },
};
