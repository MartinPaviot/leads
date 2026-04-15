/**
 * Shared type for workflow definitions. Lives here (rather than in
 * the route file) because Next.js 15 rejects non-handler exports
 * from route.ts files at build time, and the inngest worker imports
 * this type via `@/lib/workflow-types`.
 */

export interface WorkflowDef {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type:
      | "deal_stage_changed"
      | "contact_created"
      | "email_received"
      | "task_due"
      | "schedule"
      | "deal_won"
      | "deal_lost"
      | "score_changed"
      | "enrichment_completed"
      | "sequence_reply_received"
      | "meeting_completed"
      | "account_created";
    conditions?: Record<string, string>;
    schedule?: string;
  };
  actions: Array<{
    type:
      | "send_notification"
      | "create_task"
      | "send_email"
      | "call_webhook"
      | "update_field"
      | "ai_action"
      | "enroll_sequence"
      | "assign_owner"
      | "add_tag";
    params: Record<string, string>;
  }>;
  createdAt: string;
  lastRunAt?: string;
  runCount: number;
}
