import type { ReactorContext, AgentTrigger } from "./types";

const TRIGGER_DESCRIPTIONS: Record<AgentTrigger, string> = {
  email_opened: "A prospect opened an email you sent",
  email_replied: "A prospect replied to an email you sent",
  email_bounced: "An email you sent bounced (undeliverable)",
  email_clicked: "A prospect clicked a link in an email you sent",
  signal_detected: "A buying signal was detected on a target company",
  deal_stale: "A deal has had no activity for over 7 days",
  meeting_completed: "A meeting with a prospect just ended",
  contact_enriched: "A contact was just enriched with new data",
  sequence_completed: "A contact finished all steps in a sequence",
  inbound_email: "A new inbound email arrived (not a reply to outbound)",
  deal_stage_changed: "A deal moved to a new stage",
  daily_sweep: "Daily review of this deal (no recent events triggered evaluation)",
};

export function buildDecisionSystemPrompt(): string {
  return `You are the autonomous decision engine for a GTM agent helping a founder with sales.

Your job: given an event that just happened and the full context of the entity involved, decide what action(s) to take.

Rules:
- Be decisive. If the right action is clear, take it. Don't default to "hold" out of caution.
- Prefer action over inaction. A follow-up sent 1 day early is better than a deal that goes cold.
- Consider the entity's current strategy and past actions to avoid contradicting prior decisions.
- If a contact is already in an active sequence, don't send ad-hoc follow-ups that could conflict.
- If an email just bounced, don't try to re-send — flag the issue.
- Match action intensity to signal strength: a funding round may justify outreach, a single email open does not. Most signals are weak — prefer "hold" (observe) over a reflexive one-shot action.
- Deals (opportunities) are created ONLY when a discovery call is booked, and updated ONLY from transcript/email analysis. NEVER create or advance a deal from a signal, an open, or a reply — that is not your job.
- Never take destructive actions (delete records, cancel sequences) without explicit user request.

Available actions:
- send_followup: Send a follow-up email. Params: { subject?, tone? }
- draft_reply: Draft a reply to an inbound email. Params: { tone?, urgency? }
- create_task: Create a task for the founder. Params: { title, dueInDays? }
- enroll_sequence: Enroll a contact in an outbound sequence. Params: { sequenceType? }
- alert_founder: Send a notification to the founder. Params: { severity, message }
- research_company: Trigger deep research on a company. Params: {}
- enrich_contact: Trigger contact enrichment. Params: {}
- hold: Do nothing for now. Params: { reason }

Respond ONLY with valid JSON matching this schema:
{
  "actions": [{ "type": "<action>", "params": {}, "expectedOutcome": "<what you expect to happen>" }],
  "reasoning": "<why you chose these actions>",
  "confidence": <0.0-1.0>
}`;
}

export function buildDecisionUserPrompt(
  trigger: AgentTrigger,
  context: ReactorContext,
  policyBlock?: string,
): string {
  const parts: string[] = [];

  parts.push(`## Event\n${TRIGGER_DESCRIPTIONS[trigger]}`);

  parts.push(`\n## Entity\n- Type: ${context.entity.type}\n- Name: ${context.entity.label}`);
  const entityData = context.entity.data;
  if (entityData.stage) parts.push(`- Deal stage: ${entityData.stage}`);
  if (entityData.score) parts.push(`- Score: ${entityData.score}/100`);
  if (entityData.industry) parts.push(`- Industry: ${entityData.industry}`);
  if (entityData.title) parts.push(`- Title: ${entityData.title}`);
  if (entityData.email) parts.push(`- Email: ${entityData.email}`);

  if (context.recentActivities.length > 0) {
    parts.push("\n## Recent Activity (last 10)");
    for (const a of context.recentActivities) {
      const dir = a.direction ? ` [${a.direction}]` : "";
      const sent = a.sentiment ? ` (${a.sentiment})` : "";
      parts.push(`- ${a.occurredAt}: ${a.type}${dir}${sent} — ${a.summary}`);
    }
  }

  if (context.activeSequences.length > 0) {
    parts.push("\n## Active Sequences");
    for (const s of context.activeSequences) {
      parts.push(`- ${s.sequenceName}: step ${s.currentStep}, status=${s.status}`);
    }
  }

  if (context.signals.length > 0) {
    parts.push("\n## Signals");
    for (const s of context.signals) {
      parts.push(`- ${s.type}: ${JSON.stringify(s.value)}`);
    }
  }

  if (context.workItem) {
    parts.push(`\n## Current Agent Strategy\n- Strategy: ${context.workItem.strategy}`);
    parts.push(`- Priority: ${context.workItem.priority}`);
    if (context.workItem.nextAction) parts.push(`- Planned next action: ${context.workItem.nextAction}`);
  }

  if (context.pastActions.length > 0) {
    parts.push("\n## Past Agent Actions");
    for (const a of context.pastActions) {
      parts.push(`- ${a.createdAt}: ${a.actionType} (${a.status}) — ${a.reasoning}`);
    }
  }

  if (Object.keys(context.triggerMetadata).length > 0) {
    parts.push(`\n## Event Details\n${JSON.stringify(context.triggerMetadata, null, 2)}`);
  }

  // The workspace's own outcome history (what trigger→action combos have
  // actually worked), injected right before the decision so it's fresh in
  // context. Advisory — the approval guardrails still decide what runs.
  if (policyBlock) {
    parts.push(`\n${policyBlock}`);
  }

  parts.push("\n## Decision\nWhat action(s) should be taken? Respond with JSON only.");

  return parts.join("\n");
}
