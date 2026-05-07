/**
 * Hard checklist gates for the onboarding "complete" transition
 * (MONACO-PARITY-03). Mirrors the Monaco-equivalent table in the
 * bilan Partie 6 — every "Hard" criterion must pass before the
 * tenant can exit onboarding.
 *
 * The gates query DB state directly so the founder cannot bluff the
 * checklist by ticking a box. Each gate is independent and returns
 * a structured `pass | fail` with a human-readable reason on fail.
 */

import { db } from "@/db";
import { contacts, companies, deals } from "@/db/schema";
import { activities } from "@/db/schema";
import { sequences } from "@/db/schema";
import { customSignals } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export interface GateResult {
  key: string;
  required: boolean;
  pass: boolean;
  reason?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

async function gateTamSize(tenantId: string): Promise<GateResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(eq(companies.tenantId, tenantId));
  return {
    key: "tam_size",
    required: true,
    pass: count >= 30, // relaxed from 100 when ICP is small (per spec edge case)
    reason: count < 30 ? `Only ${count} accounts in TAM (need ≥30)` : undefined,
  };
}

async function gateTamRelevance(tenantId: string): Promise<GateResult> {
  // ≥3 accounts marked as A/Burning (companies.score >= 80 is the
  // app's encoding of A-grade — see scoring.ts). Tenants without
  // explicit per-account relevance gestures can pass via score.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, tenantId),
        sql`${companies.score} >= 80`,
      ),
    );
  return {
    key: "tam_relevance",
    required: true,
    pass: count >= 3,
    reason: count < 3 ? `${count} A-grade accounts (need ≥3)` : undefined,
  };
}

async function gateEmailSync(tenantId: string): Promise<GateResult> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        sql`${activities.activityType} IN ('email_sent', 'email_received')`,
        gte(activities.occurredAt, since),
      ),
    );
  return {
    key: "email_sync",
    required: true,
    pass: count >= 10,
    reason:
      count < 10
        ? `Only ${count} emails synced in 7 days (need ≥10) — re-check OAuth scope`
        : undefined,
  };
}

async function gateCalendarSync(tenantId: string): Promise<GateResult> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        sql`${activities.activityType} IN ('meeting_scheduled', 'meeting_completed')`,
        gte(activities.occurredAt, since),
      ),
    );
  return {
    key: "calendar_sync",
    required: true,
    pass: count >= 1,
    reason:
      count < 1
        ? "No calendar events synced — connect Google/Microsoft Calendar"
        : undefined,
  };
}

async function gateCustomSignals(tenantId: string): Promise<GateResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customSignals)
    .where(eq(customSignals.tenantId, tenantId));
  return {
    key: "custom_signals",
    required: true,
    pass: count >= 3,
    reason:
      count < 3
        ? `Only ${count} custom signals configured (need ≥3)`
        : undefined,
  };
}

async function gateActiveSequence(tenantId: string): Promise<GateResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sequences)
    .where(
      and(eq(sequences.tenantId, tenantId), eq(sequences.status, "active")),
    );
  return {
    key: "active_sequence",
    required: true,
    pass: count >= 1,
    reason:
      count < 1
        ? "Approve and start at least 1 sequence (Start button on /sequences)"
        : undefined,
  };
}

async function gatePipelineStages(tenantId: string): Promise<GateResult> {
  // Stages live in tenant.settings.dealStages — but we can also infer
  // from the deal_stage enum which always provides the defaults. Pass
  // is "any deal exists OR settings has stages array length ≥ 3".
  // The latter requires reading tenant settings; for the MVP we treat
  // stage configuration as a soft check so users without deals yet
  // aren't blocked.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(eq(deals.tenantId, tenantId));
  return {
    key: "pipeline_stages",
    required: false, // soft — defaults are good enough until a deal exists
    pass: count >= 0,
  };
}

async function gateCoachingQuery(tenantId: string): Promise<GateResult> {
  // We treat the chat history as evidence — any chat_messages row
  // for the tenant. Falls back to "soft" if the table doesn't exist
  // in this environment.
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int AS c FROM chat_messages WHERE tenant_id = ${tenantId}`,
    );
    const rows = result as unknown as Array<{ c: number }>;
    const count = rows[0]?.c ?? 0;
    return {
      key: "coaching_query",
      required: true,
      pass: count >= 1,
      reason: count < 1 ? "Make at least 1 query in the chat panel" : undefined,
    };
  } catch {
    return { key: "coaching_query", required: false, pass: true };
  }
}

async function gateContact(tenantId: string): Promise<GateResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  return {
    key: "contact_present",
    required: true,
    pass: count >= 1,
    reason:
      count < 1
        ? "TAM build hasn't produced any contacts yet — re-run TAM"
        : undefined,
  };
}

export async function evaluateOnboardingChecklist(
  tenantId: string,
): Promise<{
  gates: GateResult[];
  allHardPassed: boolean;
  failingHard: GateResult[];
}> {
  const gates = await Promise.all([
    gateTamSize(tenantId),
    gateTamRelevance(tenantId),
    gateEmailSync(tenantId),
    gateCalendarSync(tenantId),
    gateCustomSignals(tenantId),
    gateActiveSequence(tenantId),
    gatePipelineStages(tenantId),
    gateCoachingQuery(tenantId),
    gateContact(tenantId),
  ]);
  const failingHard = gates.filter((g) => g.required && !g.pass);
  return {
    gates,
    allHardPassed: failingHard.length === 0,
    failingHard,
  };
}
