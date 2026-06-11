import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, deals, companies, contacts, calls } from "@/db/schema";
import { and, eq, isNull, desc, inArray } from "drizzle-orm";
import { GET as getSummary } from "@/app/api/dashboard/summary/route";
import { conversationKeyFor } from "@/lib/inbox/conversations";
import {
  buildNeedsYou,
  buildKpis,
  buildActualites,
  aggregateOpens,
  groupAdds,
  formatCallDuration,
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

/** Call outcomes worth a feed line. Data-hygiene outcomes (no_answer, busy,
 *  wrong_number, do_not_call, failed) are dialing noise, not news. */
const FEED_CALL_OUTCOMES = [
  "meeting_booked",
  "connected",
  "callback_requested",
  "not_interested",
  "voicemail_left",
  "gatekeeper",
] as const;
const CALL_OUTCOME_LABEL: Record<(typeof FEED_CALL_OUTCOMES)[number], string> = {
  meeting_booked: "Meeting booked",
  connected: "Connected",
  callback_requested: "Callback requested",
  not_interested: "Not interested",
  voicemail_left: "Voicemail left",
  gatekeeper: "Gatekeeper",
};

const capWord = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function loadActualites(tenantId: string): Promise<Actualite[]> {
  try {
    const [acts, opens, dealEvents, recentCalls, recentCompanies, recentContacts] = await Promise.all([
      // Inbound / milestone events on contacts: replies, meetings, forms.
      db
        .select({
          id: activities.id,
          activityType: activities.activityType,
          summary: activities.summary,
          occurredAt: activities.occurredAt,
          entityType: activities.entityType,
          entityId: activities.entityId,
          threadId: activities.threadId,
          metadata: activities.metadata,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, tenantId),
            isNull(activities.deletedAt),
            inArray(activities.activityType, [
              "email_received",
              "email_replied",
              "meeting_scheduled",
              "meeting_completed",
              "form_submitted",
            ]),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(15),
      // Email opens — the pixel writes the FIRST open of each outbound email.
      db
        .select({ id: activities.id, entityId: activities.entityId, occurredAt: activities.occurredAt })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, tenantId),
            isNull(activities.deletedAt),
            eq(activities.activityType, "email_opened"),
            eq(activities.entityType, "contact"),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(30),
      // Deal lifecycle EVENTS (created / stage changed / won / lost) — the
      // real thing, written by the progression engine, chat tools and
      // auto-progress. Replaces the old deals.updatedAt proxy, which surfaced
      // any technical UPDATE as "news" without saying what changed.
      db
        .select({
          id: activities.id,
          activityType: activities.activityType,
          entityId: activities.entityId,
          occurredAt: activities.occurredAt,
          metadata: activities.metadata,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, tenantId),
            isNull(activities.deletedAt),
            eq(activities.entityType, "deal"),
            inArray(activities.activityType, ["deal_created", "deal_stage_changed", "deal_won", "deal_lost"]),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(10),
      // Call Mode calls with a meaningful outcome.
      db
        .select({
          id: calls.id,
          contactId: calls.contactId,
          outcome: calls.outcome,
          durationSec: calls.durationSec,
          summary: calls.summary,
          startedAt: calls.startedAt,
        })
        .from(calls)
        .where(and(eq(calls.tenantId, tenantId), inArray(calls.outcome, [...FEED_CALL_OUTCOMES])))
        .orderBy(desc(calls.startedAt))
        .limit(8),
      // Adds fetch a wider window (25) so bulk imports group honestly instead
      // of showing 6 arbitrary rows of a 100-row import.
      db
        .select({ id: companies.id, name: companies.name, sourceSystem: companies.sourceSystem, createdAt: companies.createdAt })
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt), isNull(companies.excludedReason)))
        .orderBy(desc(companies.createdAt))
        .limit(25),
      db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          sourceSystem: contacts.sourceSystem,
          createdAt: contacts.createdAt,
        })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt)))
        .orderBy(desc(contacts.createdAt))
        .limit(25),
    ]);

    // Resolve every referenced contact name in ONE query (acts + opens + calls).
    const contactIds = [
      ...new Set([
        ...acts.filter((a) => a.entityType === "contact" && a.entityId).map((a) => a.entityId as string),
        ...opens.map((o) => o.entityId).filter((id): id is string => !!id),
        ...recentCalls.map((c) => c.contactId).filter((id): id is string => !!id),
      ]),
    ];
    const nameMap = new Map<string, string>();
    if (contactIds.length) {
      const rs = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.id, contactIds)));
      for (const c of rs) {
        const n = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
        if (n) nameMap.set(c.id, n);
      }
    }

    // Resolve deal names; events on deleted deals are DROPPED — never surface
    // dead targets (delete-restore coherence).
    const dealIds = [...new Set(dealEvents.map((d) => d.entityId).filter((id): id is string => !!id))];
    const dealNameMap = new Map<string, string>();
    if (dealIds.length) {
      const rs = await db
        .select({ id: deals.id, name: deals.name })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), isNull(deals.deletedAt), inArray(deals.id, dealIds)));
      for (const d of rs) dealNameMap.set(d.id, d.name);
    }

    const iso = (d: unknown): string | null => (d ? new Date(d as string).toISOString() : null);
    const items: Actualite[] = [];

    for (const a of acts) {
      const who = a.entityType === "contact" && a.entityId ? nameMap.get(a.entityId) ?? null : null;
      const href = a.entityType === "contact" && a.entityId ? `/contacts/${a.entityId}` : null;
      if (a.activityType === "email_received" || a.activityType === "email_replied") {
        // email_received rows ARE inbox conversations (same key derivation) —
        // deep-link straight to the thread. email_replied isn't an inbox seed,
        // so it keeps the contact fiche.
        const replyHref =
          a.activityType === "email_received"
            ? `/inbox?conversation=${encodeURIComponent(
                conversationKeyFor({
                  threadId: a.threadId,
                  contactId: a.entityType === "contact" ? a.entityId : null,
                  id: a.id,
                }),
              )}`
            : href;
        items.push({ id: `act:${a.id}`, kind: "reply", title: who ? `${who} replied` : "Reply received", detail: a.summary ?? null, at: iso(a.occurredAt), href: replyHref });
      } else if (a.activityType === "form_submitted") {
        const source = (a.metadata as Record<string, unknown> | null)?.source;
        items.push({
          id: `act:${a.id}`,
          kind: "form",
          title: who ? `${who} submitted a form` : "Inbound form submitted",
          detail: typeof source === "string" && source ? `via ${source}` : a.summary ?? null,
          at: iso(a.occurredAt),
          href,
        });
      } else if (a.activityType === "meeting_scheduled") {
        items.push({ id: `act:${a.id}`, kind: "meeting_booked", title: who ? `Call booked · ${who}` : "Call booked", detail: a.summary ?? null, at: iso(a.occurredAt), href: href ?? "/meetings" });
      } else {
        items.push({ id: `act:${a.id}`, kind: "meeting_done", title: a.summary || (who ? `Call ended · ${who}` : "Call ended"), detail: null, at: iso(a.occurredAt), href: href ?? "/meetings" });
      }
    }

    items.push(
      ...aggregateOpens(
        opens.map((o) => ({
          id: o.id,
          contactId: o.entityId,
          name: o.entityId ? nameMap.get(o.entityId) ?? null : null,
          at: iso(o.occurredAt),
        })),
      ),
    );

    for (const d of dealEvents) {
      const name = d.entityId ? dealNameMap.get(d.entityId) : undefined;
      if (!name) continue; // deal deleted since the event — skip
      const href = `/opportunities/${d.entityId}`;
      const at = iso(d.occurredAt);
      if (d.activityType === "deal_won") {
        items.push({ id: `act:${d.id}`, kind: "deal_won", title: name, detail: "Deal won", at, href });
      } else if (d.activityType === "deal_lost") {
        items.push({ id: `act:${d.id}`, kind: "deal_lost", title: name, detail: "Deal lost", at, href });
      } else if (d.activityType === "deal_created") {
        items.push({ id: `act:${d.id}`, kind: "deal", title: name, detail: "Deal created", at, href });
      } else {
        const meta = (d.metadata ?? {}) as Record<string, unknown>;
        const from = typeof meta.oldStage === "string" ? meta.oldStage : null;
        const to = typeof meta.newStage === "string" ? meta.newStage : null;
        items.push({
          id: `act:${d.id}`,
          kind: "deal",
          title: name,
          detail: from && to ? `${capWord(from)} → ${capWord(to)}` : "Stage updated",
          at,
          href,
        });
      }
    }

    for (const c of recentCalls) {
      const who = nameMap.get(c.contactId) ?? null;
      const outcome = c.outcome as (typeof FEED_CALL_OUTCOMES)[number] | null;
      const parts = [outcome ? CALL_OUTCOME_LABEL[outcome] : null, formatCallDuration(c.durationSec), c.summary || null];
      items.push({
        id: `call:${c.id}`,
        kind: "call",
        title: who ? `Call · ${who}` : "Call",
        detail: parts.filter(Boolean).join(" · ") || null,
        at: iso(c.startedAt),
        href: `/contacts/${c.contactId}`,
      });
    }

    items.push(
      ...groupAdds(
        recentCompanies.map((c) => ({ id: c.id, name: c.name, sourceSystem: c.sourceSystem, at: iso(c.createdAt) })),
        "account",
        3,
        25,
      ),
      ...groupAdds(
        recentContacts.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Contact",
          sourceSystem: c.sourceSystem,
          at: iso(c.createdAt),
        })),
        "contact",
        3,
        25,
      ),
    );

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
