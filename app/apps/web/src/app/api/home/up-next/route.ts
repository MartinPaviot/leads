import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, deals, companies, contacts } from "@/db/schema";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { GET as getSummary } from "@/app/api/dashboard/summary/route";
import {
  buildNeedsYou,
  buildKpis,
  buildActualites,
  type ReplyInput,
  type DealRiskInput,
  type MeetingInput,
  type TaskInput,
  type KpiMetrics,
  type Actualite,
} from "@/lib/home/up-next";

/**
 * `/api/home/up-next` — the founder's dashboard in one read: KPIs + a cross-page
 * actualités feed (real events only) + "À faire" (genuine human work). No
 * reflexive agent actions. Each lane degrades to empty independently and the
 * route never throws (mirrors /api/home/hydrate). See _specs/up-next-redesign/.
 */
export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const [replies, summary, actualites] = await Promise.all([
      loadReplies(authCtx.tenantId),
      loadSummary(),
      loadActualites(authCtx.tenantId),
    ]);

    const fm = summary?.founderMetrics;
    const metrics: KpiMetrics = {
      pipelineValue: fm?.pipelineValue ?? 0,
      activeDeals: fm?.activeDeals ?? 0,
      callsBookedWeek: summary?.weekSummary?.meetingsBooked ?? 0,
      callsBookedPrevWeek: summary?.weekSummaryPrev?.meetingsBooked ?? null,
      replies7d: fm?.replies7d ?? 0,
      replyRate: fm?.replyRate ?? null,
      outreach7d: fm?.emailsSent7d ?? 0,
      winRate: fm?.winRate ?? null,
    };

    const dealsAtRisk: DealRiskInput[] = (fm?.dealsAtRisk ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage ?? null,
      value: d.value ?? null,
      daysSilent: d.daysSilent ?? 0,
    }));
    const meetings: MeetingInput[] = (summary?.todayMeetings ?? []).map((m) => ({ id: m.id, title: m.title, time: m.time }));
    const tasks: TaskInput[] = (summary?.todayTasks ?? []).map((t) => ({
      id: t.id, title: t.title, overdue: !!t.overdue, account: t.account ?? null, entityType: null, entityId: null,
    }));

    const todos = buildNeedsYou({ replies, dealsAtRisk, meetings, tasks });

    return Response.json({
      greeting: summary?.greeting ?? "Welcome",
      firstName: summary?.firstName ?? null,
      kpis: buildKpis(metrics),
      actualites,
      todos,
      generatedAt: new Date().toISOString(),
    });
  });
}

// ── À faire: inbound replies needing an answer (inbox attention lane) ─

async function loadReplies(tenantId: string): Promise<ReplyInput[]> {
  try {
    const [{ loadConversationRows }, { buildConversations }] = await Promise.all([
      import("@/lib/inbox/load"),
      import("@/lib/inbox/conversations"),
    ]);
    const { inbound, outbound, triage } = await loadConversationRows(tenantId);
    return buildConversations({ inbound, outbound, triage })
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

// ── Actualités: cross-page real-event feed ──────────────────────────

async function loadActualites(tenantId: string): Promise<Actualite[]> {
  try {
    const [acts, recentDeals, recentCompanies, recentContacts] = await Promise.all([
      db
        .select({
          id: activities.id,
          activityType: activities.activityType,
          summary: activities.summary,
          occurredAt: activities.occurredAt,
          entityType: activities.entityType,
          entityId: activities.entityId,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, tenantId),
            isNull(activities.deletedAt),
            inArray(activities.activityType, ["email_received", "email_replied", "meeting_scheduled", "meeting_completed"]),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(15),
      db
        .select({ id: deals.id, name: deals.name, stage: deals.stage, updatedAt: deals.updatedAt })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
        .orderBy(desc(deals.updatedAt))
        .limit(8),
      db
        .select({ id: companies.id, name: companies.name, createdAt: companies.createdAt })
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt), isNull(companies.excludedReason)))
        .orderBy(desc(companies.createdAt))
        .limit(6),
      db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, createdAt: contacts.createdAt })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
        .orderBy(desc(contacts.createdAt))
        .limit(6),
    ]);

    // Resolve contact names referenced by activities so lines aren't generic.
    const actContactIds = [...new Set(acts.filter((a) => a.entityType === "contact" && a.entityId).map((a) => a.entityId as string))];
    const nameMap = new Map<string, string>();
    if (actContactIds.length) {
      const rs = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, actContactIds)));
      for (const c of rs) {
        const n = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
        if (n) nameMap.set(c.id, n);
      }
    }

    const iso = (d: unknown): string | null => (d ? new Date(d as string).toISOString() : null);
    const items: Actualite[] = [];

    for (const a of acts) {
      const who = a.entityType === "contact" && a.entityId ? nameMap.get(a.entityId) ?? null : null;
      const href = a.entityType === "contact" && a.entityId ? `/contacts/${a.entityId}` : null;
      if (a.activityType === "email_received" || a.activityType === "email_replied") {
        items.push({ id: `act:${a.id}`, kind: "reply", title: who ? `${who} replied` : "Reply received", detail: a.summary ?? null, at: iso(a.occurredAt), href });
      } else if (a.activityType === "meeting_scheduled") {
        items.push({ id: `act:${a.id}`, kind: "meeting_booked", title: who ? `Call booked · ${who}` : "Call booked", detail: a.summary ?? null, at: iso(a.occurredAt), href: href ?? "/meetings" });
      } else {
        items.push({ id: `act:${a.id}`, kind: "meeting_done", title: a.summary || (who ? `Call ended · ${who}` : "Call ended"), detail: null, at: iso(a.occurredAt), href: href ?? "/meetings" });
      }
    }
    for (const d of recentDeals) {
      items.push({ id: `deal:${d.id}`, kind: "deal", title: d.name, detail: d.stage ? `${d.stage} stage` : "opportunity", at: iso(d.updatedAt), href: `/opportunities/${d.id}` });
    }
    for (const c of recentCompanies) {
      items.push({ id: `company:${c.id}`, kind: "account", title: c.name, detail: "account added", at: iso(c.createdAt), href: `/accounts/${c.id}` });
    }
    for (const c of recentContacts) {
      const n = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Contact";
      items.push({ id: `contact:${c.id}`, kind: "contact", title: n, detail: "contact added", at: iso(c.createdAt), href: `/contacts/${c.id}` });
    }

    return buildActualites(items, 12);
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
    emailsSent7d?: number;
    winRate?: number | null;
    replies7d?: number;
    replyRate?: number | null;
    dealsAtRisk?: Array<{ id: string; name: string; stage: string | null; value: number | null; daysSilent: number }>;
  };
  weekSummary?: { meetingsBooked?: number };
  weekSummaryPrev?: { meetingsBooked?: number };
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
