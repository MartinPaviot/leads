/**
 * Goal-driven call-campaign orchestration.
 *
 * The spine that turns "this week I want 1000 calls over 5 days" into a
 * self-running daily flow:
 *   - createCallCampaign     : goal -> daily quota + cadence config
 *   - generateDailyCallList  : each morning, build the day's list = retries
 *                              due today + fresh callable prospects, capped
 *                              at the daily quota (the cron calls this)
 *   - getTodaysCallList      : what the call-mode cockpit dials today
 *   - recordCallOutcome...   : feed a call's disposition back into the
 *                              cadence — answered/converted ends it, a
 *                              no-answer reschedules up to maxAttempts over
 *                              windowDays so nobody slips through.
 *
 * Pure data/logic: no telephony or enrichment keys required to run or test
 * it. Live dialing (Twilio) and enrichment (Apollo/Kaspr/Lusha) are wired
 * separately and gated on their own keys.
 */

import { db } from "@/db";
import {
  callCampaigns,
  callCampaignTargets,
  contacts,
  doNotCallList,
} from "@/db/schema";
import { and, eq, lte, sql, desc, isNull, inArray } from "drizzle-orm";
import { ROLE_OBSOLETE_KEY } from "@/lib/contacts/role-status";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

/** Outcomes that END the cadence for a target (we reached a conclusion). */
const OUTCOME_CONVERTED = new Set(["meeting_booked"]);
const OUTCOME_CONNECTED = new Set(["connected"]);
const OUTCOME_DNC = new Set(["do_not_call", "not_interested"]);
const OUTCOME_DEAD = new Set(["wrong_number"]);
/** Outcomes that schedule another attempt (we didn't reach the human). */
const OUTCOME_RETRY = new Set(["no_answer", "busy", "voicemail_left", "gatekeeper", "failed"]);

export function computeDailyQuota(weeklyTarget: number, daysPerWeek: number): number {
  if (weeklyTarget <= 0 || daysPerWeek <= 0) return 0;
  return Math.ceil(weeklyTarget / Math.min(7, daysPerWeek));
}

// ── Any-goal intake ──────────────────────────────────────────────────────
// A salesperson sets ANY objective; we translate it into the one number the
// dialing engine needs — calls per day — via a simple funnel. The engine
// itself is goal-agnostic (it just dials `dailyQuota` and runs the cadence),
// so "1000 calls this week", "book 10 demos this month" and "reach 50
// decision-makers" all reduce to a daily call volume. Rates default to
// conservative cold-call benchmarks and are overridable per campaign (and,
// later, learned from the tenant's real connect/meeting rates).

export type GoalType = "calls" | "connects" | "meetings";
export type GoalWindow = "day" | "week" | "month";

/** Working days in a window when the user doesn't specify days/week. */
const WINDOW_WORKDAYS: Record<GoalWindow, number> = { day: 1, week: 5, month: 22 };
const DEFAULT_CONNECT_RATE = 0.25; // ~1 live connect per 4 dials
const DEFAULT_MEETING_RATE = 0.05; // ~1 meeting booked per 20 dials

export interface GoalSpec {
  type: GoalType;
  target: number;
  window: GoalWindow;
  /** Override working days across the window (e.g. 5). */
  daysPerWeek?: number;
  connectRate?: number;
  meetingRate?: number;
}

/** Effective working days the goal is spread across. */
export function goalDays(goal: GoalSpec): number {
  if (goal.window === "day") return 1;
  if (goal.window === "week") return Math.min(7, Math.max(1, goal.daysPerWeek ?? WINDOW_WORKDAYS.week));
  // month: ~4.3 weeks; respect a custom days/week if given.
  if (goal.daysPerWeek) return Math.max(1, Math.round(goal.daysPerWeek * 4.3));
  return WINDOW_WORKDAYS.month;
}

/**
 * Parse a free-text objective into a structured goal via an LLM, so the
 * onboarding (and chat) can accept "1000 calls this week over 5 days",
 * "book 10 demos this month", "reach 50 decision makers" — any objective —
 * not a fixed form. Returns null if no model/key or the phrase is empty.
 */
export async function parseGoalPhrase(phrase: string, tenantId: string): Promise<GoalSpec | null> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model || !phrase.trim()) return null;
  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({
        type: z.enum(["calls", "connects", "meetings"]),
        target: z.number().int().positive(),
        window: z.enum(["day", "week", "month"]),
        daysPerWeek: z.number().int().min(1).max(7).optional(),
      }),
      prompt: `A salesperson describes their cold-calling objective: "${phrase}".

Extract a structured goal:
- type: "calls" (number of dials to make), "connects" (live conversations reached), or "meetings" (meetings/demos booked). If only a raw number is given, default "calls".
- target: the integer count.
- window: "day", "week", or "month" — the period the target spans. Default "week".
- daysPerWeek: working days to spread across, only if stated (e.g. "over 5 days" -> 5).

Examples:
"1000 calls this week over 5 days" -> {type:"calls",target:1000,window:"week",daysPerWeek:5}
"book 10 demos this month" -> {type:"meetings",target:10,window:"month"}
"reach 50 decision makers" -> {type:"connects",target:50,window:"week"}
"200 a day" -> {type:"calls",target:200,window:"day"}`,
      _trace: { agentId: "call-goal-parse", tenantId, inputPreview: phrase.slice(0, 120) },
    });
    return object as GoalSpec;
  } catch {
    return null;
  }
}

/** Translate any goal into a daily call volume. */
export function dailyCallsForGoal(goal: GoalSpec): number {
  const target = Math.max(0, Math.floor(goal.target));
  if (target === 0) return 0;
  const connectRate = goal.connectRate ?? DEFAULT_CONNECT_RATE;
  const meetingRate = goal.meetingRate ?? DEFAULT_MEETING_RATE;
  const callsNeeded =
    goal.type === "calls" ? target
    : goal.type === "connects" ? Math.ceil(target / Math.max(0.01, connectRate))
    : Math.ceil(target / Math.max(0.001, meetingRate)); // meetings
  return Math.max(1, Math.ceil(callsNeeded / goalDays(goal)));
}

/** Spacing between retries — spread maxAttempts evenly across windowDays. */
function retryGapMs(maxAttempts: number, windowDays: number): number {
  const attempts = Math.max(1, maxAttempts);
  const days = Math.max(1, windowDays);
  return Math.max(60_000, Math.floor((days / attempts) * 86_400_000));
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CreateCampaignArgs {
  tenantId: string;
  ownerId?: string | null;
  name?: string;
  /** Any objective the salesperson sets. */
  goal: GoalSpec;
  maxAttempts?: number;
  windowDays?: number;
  /** ICP/targeting snapshot for top-up (defaults to tenant ICP at run time). */
  targetFilter?: Record<string, unknown>;
}

function describeGoal(goal: GoalSpec): string {
  const noun = goal.type === "calls" ? "calls" : goal.type === "connects" ? "connects" : "meetings";
  const when = goal.window === "day" ? "per day" : goal.window === "week" ? "this week" : "this month";
  return `${goal.target} ${noun} ${when}`;
}

/**
 * Create a goal-driven call campaign (active immediately). Accepts ANY goal
 * (calls / connects / meetings over a day / week / month); the dialing
 * engine only consumes the derived `dailyQuota`, and the full goal is kept
 * in targetFilter.goal for display + progress tracking.
 */
export async function createCallCampaign(args: CreateCampaignArgs) {
  const goal = args.goal;
  const daysPerWeek = Math.min(7, Math.max(1, goal.daysPerWeek ?? (goal.window === "day" ? 1 : 5)));
  const dailyQuota = dailyCallsForGoal(goal);
  const maxAttempts = Math.max(1, args.maxAttempts ?? 8);
  const windowDays = Math.max(1, args.windowDays ?? 15);
  // Display-only weekly figure derived from the daily plan.
  const weeklyTarget =
    goal.type === "calls" && goal.window === "week"
      ? Math.max(0, Math.floor(goal.target))
      : dailyQuota * daysPerWeek;

  const [row] = await db
    .insert(callCampaigns)
    .values({
      tenantId: args.tenantId,
      ownerId: args.ownerId ?? null,
      name: args.name?.trim() || describeGoal(goal),
      status: "active",
      weeklyTarget,
      daysPerWeek,
      dailyQuota,
      maxAttempts,
      windowDays,
      targetFilter: { ...(args.targetFilter ?? {}), goal },
    })
    .returning();
  return row;
}

export interface UpdateCampaignArgs {
  tenantId: string;
  campaignId: string;
  name?: string;
  /** New objective; omit to keep the current goal. */
  goal?: GoalSpec;
  maxAttempts?: number;
  windowDays?: number;
  listFrequency?: "daily" | "weekly";
  workingDays?: number[];
}

/**
 * Update an existing campaign's plan in place — the goal + cadence the rep set
 * at onboarding stay editable later. Tenant-scoped. Recomputes dailyQuota /
 * weeklyTarget when the goal changes and refreshes the targetFilter snapshot
 * (goal / listFrequency / workingDays) that drives top-up + display. The
 * caller regenerates today's list so the new quota takes effect immediately.
 */
export async function updateCallCampaign(args: UpdateCampaignArgs) {
  const [existing] = await db
    .select()
    .from(callCampaigns)
    .where(and(eq(callCampaigns.id, args.campaignId), eq(callCampaigns.tenantId, args.tenantId)))
    .limit(1);
  if (!existing) return null;

  const prevFilter = (existing.targetFilter ?? {}) as Record<string, unknown>;
  const patch: Partial<typeof callCampaigns.$inferInsert> = { updatedAt: new Date() };

  if (args.goal) {
    const goal = args.goal;
    const daysPerWeek = Math.min(7, Math.max(1, goal.daysPerWeek ?? (goal.window === "day" ? 1 : 5)));
    patch.daysPerWeek = daysPerWeek;
    patch.dailyQuota = dailyCallsForGoal(goal);
    patch.weeklyTarget =
      goal.type === "calls" && goal.window === "week"
        ? Math.max(0, Math.floor(goal.target))
        : patch.dailyQuota * daysPerWeek;
  }

  // The onboarding form has no name field, so the name always tracks the goal;
  // refresh it on a goal change unless the caller passes an explicit name.
  if (args.name !== undefined) {
    patch.name = args.name.trim() || existing.name;
  } else if (args.goal) {
    patch.name = describeGoal(args.goal);
  }

  if (args.maxAttempts !== undefined) patch.maxAttempts = Math.max(1, args.maxAttempts);
  if (args.windowDays !== undefined) patch.windowDays = Math.max(1, args.windowDays);

  const nextFilter: Record<string, unknown> = { ...prevFilter };
  if (args.goal) nextFilter.goal = args.goal;
  if (args.listFrequency) nextFilter.listFrequency = args.listFrequency;
  if (Array.isArray(args.workingDays) && args.workingDays.length > 0) nextFilter.workingDays = args.workingDays;
  patch.targetFilter = nextFilter;

  const [row] = await db
    .update(callCampaigns)
    .set(patch)
    .where(and(eq(callCampaigns.id, args.campaignId), eq(callCampaigns.tenantId, args.tenantId)))
    .returning();
  return row ?? null;
}

export interface DailyListResult {
  campaignId: string;
  quota: number;
  retriesDue: number;
  newlyAdded: number;
  listed: number;
  poolExhausted: boolean;
}

/**
 * Build today's call list for one campaign: take the retries due today, then
 * top up with fresh callable prospects until the daily quota is met, and
 * stamp them as listed for today. Idempotent per day (re-running keeps the
 * same list, only filling any shortfall).
 */
export async function generateDailyCallList(
  campaignId: string,
  now: Date = new Date(),
): Promise<DailyListResult> {
  const [campaign] = await db
    .select()
    .from(callCampaigns)
    .where(eq(callCampaigns.id, campaignId))
    .limit(1);
  if (!campaign || campaign.status !== "active") {
    return { campaignId, quota: 0, retriesDue: 0, newlyAdded: 0, listed: 0, poolExhausted: true };
  }
  const tenantId = campaign.tenantId;
  const quota = campaign.dailyQuota || 0;
  const today = dayStr(now);

  // Already-listed-today targets (idempotency) count toward the quota.
  const alreadyListed = await db
    .select({ id: callCampaignTargets.id })
    .from(callCampaignTargets)
    .where(
      and(
        eq(callCampaignTargets.campaignId, campaignId),
        eq(callCampaignTargets.listedOn, today),
        inArray(callCampaignTargets.status, ["queued", "in_progress"]),
      ),
    );
  let listed = alreadyListed.length;

  // 1) Retries / queued targets due now, oldest-due first.
  const due = await db
    .select({ id: callCampaignTargets.id })
    .from(callCampaignTargets)
    .where(
      and(
        eq(callCampaignTargets.campaignId, campaignId),
        eq(callCampaignTargets.status, "queued"),
        lte(callCampaignTargets.nextAttemptAt, now),
        sql`(${callCampaignTargets.listedOn} IS DISTINCT FROM ${today})`,
      ),
    )
    .orderBy(callCampaignTargets.nextAttemptAt)
    .limit(Math.max(0, quota - listed));

  if (due.length > 0) {
    await db
      .update(callCampaignTargets)
      .set({ listedOn: today, updatedAt: now })
      .where(inArray(callCampaignTargets.id, due.map((d) => d.id)));
    listed += due.length;
  }
  const retriesDue = due.length;

  // 2) Top up with fresh, callable, not-yet-targeted contacts (highest score
  //    first). Callable = has a phone and isn't on the DNC list.
  //    Territory exclusivity: exclude any contact already assigned to ANY
  //    ACTIVE campaign in the tenant (not just this one), so two reps never
  //    get the same account in their call lists. A contact frees up once its
  //    owning campaign is no longer active.
  let newlyAdded = 0;
  let poolExhausted = false;
  const topUp = Math.max(0, quota - listed);
  if (topUp > 0) {
    const candidates = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          isNull(contacts.deletedAt),
          sql`${contacts.phone} IS NOT NULL AND ${contacts.phone} <> ''`,
          sql`${contacts.id} NOT IN (
            SELECT t.contact_id FROM call_campaign_targets t
            JOIN call_campaigns cc ON cc.id = t.campaign_id
            WHERE cc.tenant_id = ${tenantId} AND cc.status = 'active'
          )`,
          sql`NOT EXISTS (SELECT 1 FROM do_not_call_list d WHERE d.phone_number = ${contacts.phone} AND (d.tenant_id = ${tenantId} OR d.tenant_id IS NULL))`,
        ),
      )
      .orderBy(desc(contacts.score))
      .limit(topUp);

    if (candidates.length > 0) {
      // onConflictDoNothing backstops the select->insert race between two reps'
      // concurrent list builds (paired with the partial unique index on
      // call_campaign_targets(tenant_id, contact_id) for non-terminal targets).
      const inserted = await db
        .insert(callCampaignTargets)
        .values(
          candidates.map((c) => ({
            campaignId,
            tenantId,
            contactId: c.id,
            status: "queued" as const,
            nextAttemptAt: now,
            listedOn: today,
            addedAt: now,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: callCampaignTargets.id });
      newlyAdded = inserted.length;
      listed += inserted.length;
    }
    poolExhausted = candidates.length < topUp;
  }

  return { campaignId, quota, retriesDue, newlyAdded, listed, poolExhausted };
}

/**
 * Today's call list — what to dial. Call Mode is individualised per user
 * inside a workspace: pass `ownerId` to get only that rep's campaign list.
 * Omit it (e.g. tenant-wide jobs) for every active campaign in the tenant.
 */
export async function getTodaysCallList(tenantId: string, now: Date = new Date(), ownerId?: string) {
  const today = dayStr(now);
  const where = [
    eq(callCampaignTargets.tenantId, tenantId),
    eq(callCampaignTargets.listedOn, today),
    inArray(callCampaignTargets.status, ["queued", "in_progress"]),
    isNull(contacts.deletedAt),
    // Honest freshness: a contact the rep flagged as having left this role
    // drops out of the dial list (don't waste a call on a stale title).
    sql`(${contacts.properties} ->> ${ROLE_OBSOLETE_KEY}) IS NULL`,
  ];
  if (ownerId) where.push(eq(callCampaigns.ownerId, ownerId));
  return db
    .select({
      targetId: callCampaignTargets.id,
      campaignId: callCampaignTargets.campaignId,
      contactId: callCampaignTargets.contactId,
      status: callCampaignTargets.status,
      attemptCount: callCampaignTargets.attemptCount,
      lastOutcome: callCampaignTargets.lastOutcome,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      title: contacts.title,
      companyId: contacts.companyId,
      score: contacts.score,
      lastEnrichedAt: contacts.lastEnrichedAt,
    })
    .from(callCampaignTargets)
    .innerJoin(contacts, eq(contacts.id, callCampaignTargets.contactId))
    // Join the campaign so an owner filter (per-user Call Mode) can apply.
    .innerJoin(callCampaigns, eq(callCampaigns.id, callCampaignTargets.campaignId))
    .where(and(...where))
    .orderBy(desc(contacts.score));
}

export interface RecordOutcomeArgs {
  tenantId: string;
  contactId: string;
  outcome: string;
  occurredAt?: Date;
  /** Scope to one rep's campaign (per-user Call Mode). Omit for tenant-wide. */
  ownerId?: string;
}

/**
 * Feed a call's disposition back into the cadence. Finds the contact's open
 * target in an active campaign and advances its state machine: converted /
 * connected / dnc / dead are terminal; a no-answer reschedules the next
 * attempt unless we've hit maxAttempts or run past windowDays.
 */
export async function recordCallOutcomeForCampaigns(
  args: RecordOutcomeArgs,
): Promise<{ targetId: string; status: string; attemptCount: number; nextAttemptAt: Date | null } | null> {
  const now = args.occurredAt ?? new Date();

  // Open target for this contact, joined to an ACTIVE campaign (most recent).
  const [target] = await db
    .select({
      id: callCampaignTargets.id,
      attemptCount: callCampaignTargets.attemptCount,
      addedAt: callCampaignTargets.addedAt,
      maxAttempts: callCampaigns.maxAttempts,
      windowDays: callCampaigns.windowDays,
    })
    .from(callCampaignTargets)
    .innerJoin(callCampaigns, eq(callCampaigns.id, callCampaignTargets.campaignId))
    .where(
      and(
        eq(callCampaignTargets.tenantId, args.tenantId),
        eq(callCampaignTargets.contactId, args.contactId),
        inArray(callCampaignTargets.status, ["queued", "in_progress"]),
        eq(callCampaigns.status, "active"),
        // Per-user Call Mode: attach the outcome to the calling rep's campaign.
        ...(args.ownerId ? [eq(callCampaigns.ownerId, args.ownerId)] : []),
      ),
    )
    .orderBy(desc(callCampaignTargets.updatedAt))
    .limit(1);

  if (!target) return null;

  const attemptCount = target.attemptCount + 1;
  const o = args.outcome;

  let status: "queued" | "connected" | "converted" | "exhausted" | "dnc";
  let nextAttemptAt: Date | null = null;

  if (OUTCOME_CONVERTED.has(o)) {
    status = "converted";
  } else if (OUTCOME_CONNECTED.has(o)) {
    status = "connected";
  } else if (OUTCOME_DNC.has(o)) {
    status = "dnc";
  } else if (OUTCOME_DEAD.has(o)) {
    status = "exhausted";
  } else if (o === "callback_requested") {
    // They asked us to call back — keep it live, soon.
    status = "queued";
    nextAttemptAt = new Date(now.getTime() + 86_400_000);
  } else if (OUTCOME_RETRY.has(o)) {
    const addedAt = target.addedAt ? new Date(target.addedAt) : now;
    const pastWindow = now.getTime() - addedAt.getTime() >= target.windowDays * 86_400_000;
    if (attemptCount >= target.maxAttempts || pastWindow) {
      status = "exhausted";
    } else {
      status = "queued";
      nextAttemptAt = new Date(now.getTime() + retryGapMs(target.maxAttempts, target.windowDays));
    }
  } else {
    // Unknown outcome — treat as a retry signal but don't lose the target.
    status = "queued";
    nextAttemptAt = new Date(now.getTime() + retryGapMs(target.maxAttempts, target.windowDays));
  }

  await db
    .update(callCampaignTargets)
    .set({
      status,
      attemptCount,
      lastOutcome: o as typeof callCampaignTargets.$inferInsert.lastOutcome,
      lastAttemptAt: now,
      nextAttemptAt,
      // Free it from today's list once handled so it can re-list on its next due day.
      listedOn: null,
      updatedAt: now,
    })
    .where(eq(callCampaignTargets.id, target.id));

  return { targetId: target.id, status, attemptCount, nextAttemptAt };
}
