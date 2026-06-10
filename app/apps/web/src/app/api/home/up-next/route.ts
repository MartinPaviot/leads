import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { agentActions, agentReactions } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { GET as getSummary } from "@/app/api/dashboard/summary/route";
import {
  buildNeedsYou,
  buildLedger,
  buildEngineLine,
  type ReplyInput,
  type ApprovalInput,
  type DealRiskInput,
  type MeetingInput,
  type TaskInput,
  type ReactionInput,
  type EngineMetrics,
} from "@/lib/home/up-next";

/**
 * `/api/home/up-next` — the founder's morning briefing in one read.
 *
 * Merges LIVE sources only (inbox replies, scheduled agent actions, live at-risk
 * deals, today's meetings, due tasks) into a single ranked "Needs you" queue,
 * plus a synthesised autonomy ledger and one honest engine-health line. Each lane
 * degrades to empty independently and the route never throws (mirrors
 * /api/home/hydrate). See _specs/up-next-redesign/.
 */
export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const [replies, approvals, summary, reactions] = await Promise.all([
      loadReplies(authCtx.tenantId),
      loadApprovals(authCtx.tenantId),
      loadSummary(),
      loadReactions(authCtx.tenantId),
    ]);

    const dealsAtRisk: DealRiskInput[] = (summary?.founderMetrics?.dealsAtRisk ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage ?? null,
      value: d.value ?? null,
      daysSilent: d.daysSilent ?? 0,
    }));
    const meetings: MeetingInput[] = (summary?.todayMeetings ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      time: m.time,
    }));
    const tasks: TaskInput[] = (summary?.todayTasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      overdue: !!t.overdue,
      account: t.account ?? null,
      entityType: null,
      entityId: null,
    }));

    const items = buildNeedsYou({ replies, approvals, dealsAtRisk, meetings, tasks });
    const ledger = buildLedger(reactions);

    const fm = summary?.founderMetrics;
    const metrics: EngineMetrics = {
      totalAccounts: fm?.totalAccounts ?? 0,
      activeDeals: fm?.activeDeals ?? 0,
      totalContacts: fm?.totalContacts ?? 0,
      emailsSent7d: fm?.emailsSent7d ?? 0,
      pipelineValue: fm?.pipelineValue ?? 0,
      winRate: fm?.winRate ?? null,
    };
    const engine = buildEngineLine(metrics);

    return Response.json({
      hero: items[0] ?? null,
      items,
      ledger,
      engine,
      greeting: summary?.greeting ?? "Welcome back",
      firstName: summary?.firstName ?? null,
      generatedAt: new Date().toISOString(),
    });
  });
}

// ── Lane loaders (each degrades to [] on failure) ───────────────────

async function loadReplies(tenantId: string): Promise<ReplyInput[]> {
  try {
    const [{ loadConversationRows }, { buildConversations }] = await Promise.all([
      import("@/lib/inbox/load"),
      import("@/lib/inbox/conversations"),
    ]);
    const { inbound, outbound, triage } = await loadConversationRows(tenantId);
    const conversations = buildConversations({ inbound, outbound, triage });
    return conversations
      .filter((c) => c.lane === "attention")
      .slice(0, 25)
      .map((c) => ({
        conversationKey: c.key,
        contactId: c.contactId,
        subject: c.subject,
        fromAddress: c.fromAddress,
        reason: c.reason,
        priority: c.priority,
        lastInboundAt: c.lastInboundAt,
      }));
  } catch {
    return [];
  }
}

async function loadApprovals(tenantId: string): Promise<ApprovalInput[]> {
  try {
    const rows = await db
      .select({
        id: agentActions.id,
        actionType: agentActions.actionType,
        payload: agentActions.payload,
        createdAt: agentActions.createdAt,
      })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.tenantId, tenantId),
          eq(agentActions.status, "scheduled"),
          isNull(agentActions.reversedAt),
        ),
      )
      .orderBy(desc(agentActions.createdAt))
      .limit(25);

    return rows.map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const amount =
        num(p.amount) ?? num(p.value) ?? num(p.dealValue) ?? null;
      const entityLabel =
        str(p.entityLabel) ??
        str(p.contactName) ??
        str(p.companyName) ??
        str(p.dealName) ??
        null;
      return {
        id: r.id,
        actionType: r.actionType,
        reasoning: str(p.reasoning),
        entityType: str(p.entityType),
        entityId: str(p.entityId),
        entityLabel,
        confidence: num(p.confidence),
        amount,
        createdAt: r.createdAt ? new Date(r.createdAt as unknown as string).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}

async function loadReactions(tenantId: string): Promise<ReactionInput[]> {
  try {
    const rows = await db
      .select({
        trigger: agentReactions.trigger,
        contextSnapshot: agentReactions.contextSnapshot,
        actionsTaken: agentReactions.actionsTaken,
        actionsDeferred: agentReactions.actionsDeferred,
      })
      .from(agentReactions)
      .where(eq(agentReactions.tenantId, tenantId))
      .orderBy(desc(agentReactions.createdAt))
      .limit(40);
    return rows.map((r) => ({
      trigger: r.trigger,
      entityLabel: str((r.contextSnapshot as Record<string, unknown> | null)?.entityLabel) ?? null,
      actionsTaken: r.actionsTaken ?? 0,
      actionsDeferred: r.actionsDeferred ?? 0,
    }));
  } catch {
    return [];
  }
}

interface SummaryShape {
  greeting?: string;
  firstName?: string;
  founderMetrics?: {
    pipelineValue?: number;
    activeDeals?: number;
    totalContacts?: number;
    totalAccounts?: number;
    emailsSent7d?: number;
    winRate?: number | null;
    dealsAtRisk?: Array<{ id: string; name: string; stage: string | null; value: number | null; daysSilent: number }>;
  };
  todayMeetings?: Array<{ id: string; title: string; time: string }>;
  todayTasks?: Array<{ id: string; title: string; account: string | null; overdue: boolean }>;
}

async function loadSummary(): Promise<SummaryShape | null> {
  try {
    const res = await getSummary();
    if (!res.ok) return null;
    return (await res.json()) as SummaryShape;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
