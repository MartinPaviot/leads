/**
 * F001 — Agent Event Loop
 *
 * The agent reactor is an event-driven Inngest function that evaluates
 * every significant CRM event and decides what action(s) to take. It
 * replaces the single 9am cron with a continuous, real-time decision loop.
 *
 * Events flow in via `agent/react`. The reactor:
 *   1. Deduplicates (same event within 60min → skip)
 *   2. Loads entity context (company/contact/deal + activities + sequences + signals)
 *   3. Calls LLM (Haiku for speed) to decide action(s)
 *   4. Falls back to rule-based heuristics if LLM unavailable
 *   5. Dispatches actions through the existing approval mode guardrails
 *   6. Records everything to `agent_reactions` for outcome tracking
 *   7. Updates the agent work item (F002) for persistent state
 */

import { inngest } from "./client";
import { isFeatureEnabled } from "@/lib/config/feature-gate";
import { db } from "@/db";
import {
  agentReactions,
  agentWorkItems,
  agentActions,
  notifications,
  tasks,
  deals,
  activities,
  users,
  autonomyConfig,
} from "@/db/schema";
import { and, eq, gte, notInArray, sql } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { z } from "zod";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  enforceAgentApprovalMode,
  resolveEffectiveMode,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";
import { buildEffectiveThresholdMap } from "@/lib/guardrails/level-behavior";
import { getTrustScore } from "@/lib/campaign-engine/trust-score";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";
import { recordAgentAction, DEFAULT_EMAIL_GRACE_MS } from "@/lib/agents/agent-actions";
import { loadReactorContext } from "@/lib/agent-reactor/context-loader";
import {
  buildDecisionSystemPrompt,
  buildDecisionUserPrompt,
} from "@/lib/agent-reactor/decision-prompt";
import type {
  AgentReactEventData,
  AgentDecision,
  AgentDecisionAction,
  AgentTrigger,
} from "@/lib/agent-reactor/types";
import { HEURISTIC_DECISIONS } from "@/lib/agent-reactor/types";
import { createOutcomeWatcher } from "@/lib/outcomes/create-watcher";
import logger from "@/lib/observability/logger";

const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

const decisionSchema = z.object({
  actions: z.array(
    z.object({
      type: z.enum([
        "send_followup",
        "draft_reply",
        "advance_deal",
        "create_task",
        "create_deal",
        "enroll_sequence",
        "alert_founder",
        "research_company",
        "enrich_contact",
        "hold",
      ]),
      params: z.record(z.string(), z.unknown()),
      expectedOutcome: z.string(),
    }),
  ),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

// ── Main reactor function ────────────────────────────────────

export const agentReactor = inngest.createFunction(
  {
    id: "agent-reactor",
    concurrency: [{ scope: "fn", key: "event.data.tenantId", limit: 5 }],
    throttle: { key: "event.data.tenantId", limit: 60, period: "1h" },
    retries: 1,
    triggers: [{ event: "agent/react" }],
  },
  async ({ event, step }: { event: { data: AgentReactEventData }; step: any }) => {
    if (!isFeatureEnabled(process.env.AGENT_REACTOR_ENABLED)) {
      return { skipped: "AGENT_REACTOR_ENABLED=off" };
    }
    const data = event.data;
    const startMs = Date.now();

    // ── Step 1: Deduplicate ──
    const isDuplicate = await step.run("check-dedup", async () => {
      const since = new Date(Date.now() - DEDUP_WINDOW_MS);
      const [existing] = await db
        .select({ id: agentReactions.id })
        .from(agentReactions)
        .where(
          and(
            eq(agentReactions.tenantId, data.tenantId),
            eq(agentReactions.deduplicationKey, data.deduplicationKey),
            gte(agentReactions.createdAt, since),
          ),
        )
        .limit(1);
      return !!existing;
    });

    if (isDuplicate) {
      logger.info("agent-reactor: deduplicated", {
        tenantId: data.tenantId,
        key: data.deduplicationKey,
      });
      return { skipped: true, reason: "deduplicated" };
    }

    // ── Step 2: Load context ──
    const context = await step.run("load-context", async () => {
      return loadReactorContext(
        data.tenantId,
        data.entityType,
        data.entityId,
        data.metadata,
      );
    });

    // ── Step 3: Decide ──
    const decision = await step.run("decide", async () => {
      const model = getModelForTask("lightweight");
      if (!model) {
        return getHeuristicDecision(data.trigger);
      }

      try {
        const result = await tracedGenerateObject({
          model,
          system: buildDecisionSystemPrompt(),
          prompt: buildDecisionUserPrompt(data.trigger, context),
          schema: decisionSchema,
          temperature: 0.2,
          maxOutputTokens: 1000,
          _trace: {
            agentId: "agent-reactor",
            tenantId: data.tenantId,
            inputPreview: `${data.trigger} on ${data.entityType}:${data.entityId}`,
          },
        });
        return { decision: result.object as AgentDecision, modelUsed: "haiku" };
      } catch (err) {
        logger.warn("agent-reactor: LLM failed, using heuristics", { err });
        return { decision: getHeuristicDecision(data.trigger), modelUsed: "heuristic" };
      }
    });

    // ── Step 4: Dispatch actions ──
    const dispatchResult = await step.run("dispatch", async () => {
      const settings = await getTenantSettings(data.tenantId);

      // CLE-16 §9 — the autonomy LEVEL is authoritative for the effective mode
      // (level → mode + relaxThresholds via resolveEffectiveMode, CLE-10),
      // falling back to the stored agentApprovalMode for row-less tenants. Then
      // fold level/trust/relax + learned thresholds into the ONE map
      // decideAction reads. The builder ceiling-forces excluded outbound/paid
      // classes, so the reactor can never lower an outbound bar. Signature
      // unchanged.
      const [autoRow] = await db
        .select({ level: autonomyConfig.level })
        .from(autonomyConfig)
        .where(eq(autonomyConfig.tenantId, data.tenantId))
        .limit(1);
      const trust = await getTrustScore(data.tenantId);
      const { mode, relaxThresholds } = resolveEffectiveMode({
        settings: settings ?? { agentApprovalMode: "review-each" },
        level: autoRow?.level as AutonomyLevel | undefined,
        trustOverall: trust.overall,
      });
      const learnedThresholds = buildEffectiveThresholdMap({
        learned: settings?.learnedThresholds,
        relaxThresholds,
      });

      // Load admin userId so deferred actions appear in the approval UI
      const [adminUser] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.tenantId, data.tenantId), eq(users.role, "admin")))
        .limit(1);
      const adminUserId = adminUser?.id ?? null;

      let taken = 0;
      let deferred = 0;
      let skipped = 0;

      for (const action of decision.decision.actions) {
        if (action.type === "hold") {
          skipped++;
          continue;
        }

        const guardedAction = mapToGuardedAction(action.type);
        if (!guardedAction) {
          await executeUnguardedAction(data.tenantId, action, data);
          taken++;
          continue;
        }

        const approvalResult = enforceAgentApprovalMode({
          mode,
          action: guardedAction,
          confidence: decision.decision.confidence,
          learnedThresholds,
        });

        if (approvalResult.allowed) {
          await executeAction(data.tenantId, action, data, decision.decision, adminUserId);
          taken++;
        } else {
          await deferAction(data.tenantId, action, data, decision.decision, approvalResult.reason, adminUserId);
          deferred++;
        }
      }

      return { taken, deferred, skipped };
    });

    // ── Step 5: Record reaction ──
    await step.run("record-reaction", async () => {
      await db.insert(agentReactions).values({
        tenantId: data.tenantId,
        trigger: data.trigger,
        entityType: data.entityType,
        entityId: data.entityId,
        deduplicationKey: data.deduplicationKey,
        contextSnapshot: {
          entityLabel: context.entity.label,
          recentActivityCount: context.recentActivities.length,
          activeSequenceCount: context.activeSequences.length,
          signalCount: context.signals.length,
          workItemStrategy: context.workItem?.strategy ?? null,
        },
        decision: decision.decision,
        actionsTaken: dispatchResult.taken,
        actionsDeferred: dispatchResult.deferred,
        actionsSkipped: dispatchResult.skipped,
        processingTimeMs: Date.now() - startMs,
        modelUsed: decision.modelUsed,
      });
    });

    // ── Step 6: Update work item (F002) ──
    await step.run("update-work-item", async () => {
      if (decision.decision.actions.length === 0 || decision.decision.actions.every((a: AgentDecisionAction) => a.type === "hold")) {
        return;
      }

      const primaryAction = decision.decision.actions.find((a: AgentDecisionAction) => a.type !== "hold") ?? decision.decision.actions[0];
      const now = new Date();

      const [existing] = await db
        .select({ id: agentWorkItems.id })
        .from(agentWorkItems)
        .where(
          and(
            eq(agentWorkItems.tenantId, data.tenantId),
            eq(agentWorkItems.entityType, data.entityType),
            eq(agentWorkItems.entityId, data.entityId),
            eq(agentWorkItems.status, "active"),
          ),
        )
        .limit(1);

      const strategy = inferStrategy(data.trigger, primaryAction);
      const priority = inferPriority(decision.decision.confidence, data.trigger);

      if (existing) {
        await db
          .update(agentWorkItems)
          .set({
            strategy,
            strategyReasoning: decision.decision.reasoning,
            strategySetAt: now,
            priority,
            nextAction: primaryAction.type,
            nextActionDetail: primaryAction.expectedOutcome,
            lastEvaluatedAt: now,
            evaluationCount: sql`${agentWorkItems.evaluationCount} + 1`,
            updatedAt: now,
          })
          .where(eq(agentWorkItems.id, existing.id));
      } else {
        await db.insert(agentWorkItems).values({
          tenantId: data.tenantId,
          entityType: data.entityType,
          entityId: data.entityId,
          entityLabel: context.entity.label,
          strategy,
          strategyReasoning: decision.decision.reasoning,
          strategySetAt: now,
          priority,
          nextAction: primaryAction.type,
          nextActionDetail: primaryAction.expectedOutcome,
          lastEvaluatedAt: now,
          evaluationCount: 1,
        });
      }
    });

    return {
      trigger: data.trigger,
      entityType: data.entityType,
      entityId: data.entityId,
      actions: decision.decision.actions.length,
      taken: dispatchResult.taken,
      deferred: dispatchResult.deferred,
      skipped: dispatchResult.skipped,
      processingTimeMs: Date.now() - startMs,
    };
  },
);

// ── Daily sweep for stale deals ──────────────────────────────

export const agentDailySweep = inngest.createFunction(
  {
    id: "agent-daily-sweep",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }: { step: any }) => {
    if (!isFeatureEnabled(process.env.AGENT_REACTOR_ENABLED)) {
      return { skipped: "AGENT_REACTOR_ENABLED=off" };
    }
    const staleDealRows = await step.run("find-stale-deals", async () => {
      // Single query: open deals with no activity in 7d AND no reactor eval in 24h.
      // Window bounds use SQL interval arithmetic, NOT JS `Date` params: a bare
      // `${dateObj}` interpolated into a sql`` template is passed to postgres-js
      // unencoded and throws `ERR_INVALID_ARG_TYPE: Received an instance of Date`
      // at Bind time. That made this query throw on every run, so the sweep never
      // emitted `agent/react` events — the Up-Next feed stayed permanently empty.
      const rows = await db
        .select({ dealId: deals.id, tenantId: deals.tenantId, name: deals.name })
        .from(deals)
        .where(
          and(
            notInArray(deals.stage, ["won", "lost"]),
            sql`NOT EXISTS (
              SELECT 1 FROM ${activities}
              WHERE ${activities.entityType} = 'deal'
                AND ${activities.entityId} = ${deals.id}
                AND ${activities.occurredAt} > now() - interval '7 days'
            )`,
            sql`NOT EXISTS (
              SELECT 1 FROM ${agentReactions}
              WHERE ${agentReactions.tenantId} = ${deals.tenantId}
                AND ${agentReactions.entityType} = 'deal'
                AND ${agentReactions.entityId} = ${deals.id}
                AND ${agentReactions.createdAt} > now() - interval '24 hours'
            )`,
          ),
        )
        .limit(100);

      return rows.map((r) => ({
        deal_id: r.dealId,
        tenant_id: r.tenantId,
        name: r.name ?? "",
      }));
    });

    const events = staleDealRows.map((row: { deal_id: string; tenant_id: string; name: string }) => ({
      name: "agent/react" as const,
      data: {
        tenantId: row.tenant_id,
        trigger: "deal_stale" as AgentTrigger,
        entityType: "deal" as const,
        entityId: row.deal_id,
        metadata: { dealName: row.name },
        deduplicationKey: `deal_stale:deal:${row.deal_id}`,
        firedAt: new Date().toISOString(),
      },
    }));

    if (events.length > 0) {
      await step.sendEvent("fire-stale-events", events);
    }

    return { staleDeals: events.length };
  },
);

// ── Helpers ──────────────────────────────────────────────────

function getHeuristicDecision(trigger: AgentTrigger): AgentDecision {
  return HEURISTIC_DECISIONS[trigger] ?? {
    actions: [{ type: "hold", params: { reason: "no heuristic for this trigger" }, expectedOutcome: "none" }],
    reasoning: `No heuristic defined for trigger "${trigger}" — holding`,
    confidence: 0.5,
  };
}

function mapToGuardedAction(actionType: string): GuardedAction | null {
  const mapping: Record<string, GuardedAction> = {
    send_followup: "email-send",
    draft_reply: "email-reply",
    advance_deal: "deal-stage-change",
    create_task: "task-create",
    create_deal: "contact-create",
    enroll_sequence: "sequence-enrollment",
  };
  return mapping[actionType] ?? null;
}

async function executeAction(
  tenantId: string,
  action: AgentDecisionAction,
  eventData: AgentReactEventData,
  decision: AgentDecision,
  userId?: string | null,
): Promise<void> {
  const graceMs = action.type === "send_followup" || action.type === "draft_reply"
    ? DEFAULT_EMAIL_GRACE_MS
    : 0;

  const { id: actionId } = await recordAgentAction({
    tenantId,
    userId,
    actionType: action.type,
    payload: {
      ...action.params,
      trigger: eventData.trigger,
      entityType: eventData.entityType,
      entityId: eventData.entityId,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      expectedOutcome: action.expectedOutcome,
      source: "agent-reactor",
    },
    graceMs,
  });

  // F003: Create outcome watcher
  await createOutcomeWatcher({
    tenantId,
    actionId,
    entityType: eventData.entityType,
    entityId: eventData.entityId,
    actionType: action.type,
    triggerType: eventData.trigger,
  }).catch(() => {});
}

async function deferAction(
  tenantId: string,
  action: AgentDecisionAction,
  eventData: AgentReactEventData,
  decision: AgentDecision,
  reason: string,
  userId?: string | null,
): Promise<void> {
  await recordAgentAction({
    tenantId,
    userId,
    actionType: action.type,
    payload: {
      ...action.params,
      trigger: eventData.trigger,
      entityType: eventData.entityType,
      entityId: eventData.entityId,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      expectedOutcome: action.expectedOutcome,
      deferralReason: reason,
      source: "agent-reactor",
    },
    // Awaiting the founder's approval — recorded as 'scheduled' with no
    // execution time so it surfaces in the "Needs you" approval lane and is
    // approvable/skippable. (Previously graceMs:0 mis-stamped it 'executed',
    // which hid it from the lane and made approve a no-op.)
    awaitingApproval: true,
    reversibleForMs: 24 * 60 * 60 * 1000,
  });

  const [admin] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin")))
    .limit(1);
  if (admin) {
    await db.insert(notifications).values({
      tenantId,
      userId: admin.id,
      type: "system",
      title: `Agent wants to: ${action.type.replace(/_/g, " ")}`,
      body: `${decision.reasoning} (confidence: ${(decision.confidence * 100).toFixed(0)}%)`,
      entityType: eventData.entityType,
      entityId: eventData.entityId,
    }).catch(() => {});
  }
}

async function executeUnguardedAction(
  tenantId: string,
  action: AgentDecisionAction,
  eventData: AgentReactEventData,
): Promise<void> {
  switch (action.type) {
    case "alert_founder": {
      const [adminUser] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin")))
        .limit(1);
      if (adminUser) {
        await db.insert(notifications).values({
          tenantId,
          userId: adminUser.id,
          type: "system",
          title: (action.params.message as string) ?? "Agent alert",
          body: action.expectedOutcome,
          entityType: eventData.entityType,
          entityId: eventData.entityId,
        }).catch(() => {});
      }
      break;
    }

    case "research_company":
      await inngest.send({
        name: "research-agent/run",
        data: {
          tenantId,
          companyId: eventData.entityId,
          source: "agent-reactor",
        },
      });
      break;

    case "enrich_contact":
      await inngest.send({
        name: "contact/created",
        data: {
          tenantId,
          contactId: eventData.entityId,
          source: "agent-reactor",
        },
      });
      break;
  }
}

function inferStrategy(trigger: AgentTrigger, action: AgentDecisionAction): string {
  if (action.type === "send_followup" || action.type === "enroll_sequence") return "push";
  if (action.type === "draft_reply" && trigger === "email_replied") return "push";
  if (action.type === "research_company" || action.type === "enrich_contact") return "research";
  if (action.type === "create_deal") return "research";
  if (action.type === "advance_deal") return "close";
  if (trigger === "deal_stale") return "re_engage";
  return "monitor";
}

function inferPriority(confidence: number, trigger: AgentTrigger): string {
  if (trigger === "email_replied") return "critical";
  if (trigger === "email_bounced") return "high";
  if (trigger === "signal_detected") return "high";
  if (trigger === "deal_stale" && confidence > 0.7) return "high";
  if (confidence > 0.8) return "high";
  return "medium";
}
