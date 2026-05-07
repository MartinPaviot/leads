import { db } from "@/db";
import { autonomyConfig, outboundEmails } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { GateResult, ActionType, AutonomyConfig, EscalationRule, EscalationCondition } from "./types";
import { buildDefaultConfig, getEffectivePermission, DELAY_BY_ACTION } from "./autonomy-defaults";

interface ActionContext {
  actionType: ActionType;
  tenantId: string;
  prospectDomain?: string;
  prospectEmail?: string;
  replyContent?: string;
  dealValue?: number;
  prospectSeniority?: string;
  retryCount?: number;
  isInNetwork?: boolean;
}

export async function gateAction(context: ActionContext): Promise<GateResult> {
  const config = await loadAutonomyConfig(context.tenantId);

  // 1. Check guardrails (hard limits)
  const guardrailViolation = await checkGuardrails(context, config);
  if (guardrailViolation) return guardrailViolation;

  // 2. Check escalation rules
  const escalation = checkEscalationRules(context, config.guardrails.alwaysEscalateWhen);
  if (escalation) return escalation;

  // 3. Apply permission level
  const permission = getEffectivePermission(context.actionType, config);

  switch (permission) {
    case "manual":
    case "ask":
      return { status: "queued_for_approval", reason: `Permission "${permission}" requires approval` };

    case "delayed": {
      const delay = DELAY_BY_ACTION[context.actionType] || 2 * 60 * 60 * 1000;
      return { status: "delayed", delay, reason: `Sending in ${Math.round(delay / 60000)} minutes (cancel window)` };
    }

    case "auto":
    case "auto_with_log":
    case "auto_with_notification":
    case "auto_stop":
    case "auto_if_preapproved":
    case "auto_if_icp_match":
      return { status: "execute" };

    case "draft_only":
      return { status: "queued_for_approval", reason: "Draft-only mode: user must send manually" };

    default:
      return { status: "queued_for_approval", reason: "Unknown permission, defaulting to approval" };
  }
}

async function loadAutonomyConfig(tenantId: string): Promise<AutonomyConfig> {
  const [row] = await db
    .select()
    .from(autonomyConfig)
    .where(eq(autonomyConfig.tenantId, tenantId))
    .limit(1);

  if (!row) return buildDefaultConfig();

  return {
    level: row.level as AutonomyConfig["level"],
    permissions: row.permissions as AutonomyConfig["permissions"],
    guardrails: row.guardrails as AutonomyConfig["guardrails"],
    brand: row.brand as AutonomyConfig["brand"],
  };
}

async function checkGuardrails(
  context: ActionContext,
  config: AutonomyConfig
): Promise<GateResult | null> {
  const { guardrails } = config;

  // Check neverContact list
  if (context.prospectDomain && guardrails.neverContact.length > 0) {
    const blocked = guardrails.neverContact.some((domain) =>
      context.prospectDomain!.toLowerCase().includes(domain.toLowerCase()) ||
      (context.prospectEmail && context.prospectEmail.toLowerCase().includes(domain.toLowerCase()))
    );
    if (blocked) {
      return { status: "blocked", reason: `Prospect domain "${context.prospectDomain}" is in the never-contact list`, guardrailId: "neverContact" };
    }
  }

  // Check daily email limit
  if (context.actionType === "coldEmailSend" || context.actionType === "replyPositive" || context.actionType === "replyObjection") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, context.tenantId),
          gte(outboundEmails.sentAt, today)
        )
      );

    if (Number(count) >= guardrails.maxEmailsPerDay) {
      return { status: "blocked", reason: `Daily email limit reached (${guardrails.maxEmailsPerDay})`, guardrailId: "maxEmailsPerDay" };
    }
  }

  return null;
}

function checkEscalationRules(
  context: ActionContext,
  rules: EscalationRule[]
): Promise<GateResult> | GateResult | null {
  for (const rule of rules) {
    if (matchesCondition(context, rule.condition)) {
      return {
        status: "queued_for_approval",
        reason: `Escalation rule: ${rule.label}`,
        escalationRuleId: rule.id,
      };
    }
  }
  return null;
}

function matchesCondition(context: ActionContext, condition: EscalationCondition): boolean {
  switch (condition.type) {
    case "deal_value_above":
      return (context.dealValue || 0) > condition.threshold;

    case "prospect_seniority":
      return !!context.prospectSeniority && condition.levels.includes(context.prospectSeniority);

    case "reply_contains":
      return !!context.replyContent && condition.keywords.some((kw) =>
        context.replyContent!.toLowerCase().includes(kw.toLowerCase())
      );

    case "reply_sentiment":
      // Simplified: check for negative keywords
      if (condition.sentiment === "angry") {
        return !!context.replyContent && /unsubscribe|stop|remove|spam|angry|wtf|terrible/i.test(context.replyContent);
      }
      return false;

    case "prospect_in_network":
      return !!context.isInNetwork;

    case "retry_count_above":
      return (context.retryCount || 0) > condition.count;

    case "competitor_mentioned":
      return !!context.replyContent && /competitor|alternative|using|switched/i.test(context.replyContent);

    default:
      return false;
  }
}
