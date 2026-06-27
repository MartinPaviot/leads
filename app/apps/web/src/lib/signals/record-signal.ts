/**
 * Record a buying signal on companies.properties.signals[] — the array the
 * priority-score cron reads (signal-score-daily.ts `bestMultiplierForCompany`).
 *
 * Without this, the signal-detector skills (funding-signal-monitor,
 * job-posting-intent, …) produced findings but never wrote the array the
 * scorer consumes, so detected signals never lifted priority_score. This is
 * the single write point that closes that gap.
 *
 * `detectedAt` drives freshness (lib/signals/freshness.ts): a signal past its
 * type's TTL stops boosting the score. The signal `type` keys into the tenant's
 * outcome-attribution multiplier table (lib/scoring/signal-outcomes.ts).
 */

import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { filterFreshSignals } from "./freshness";

export type SignalStrength = "high" | "medium" | "low";

/**
 * Who the signal is ABOUT / who to contact (Monaco: the signal names the person —
 * the post author, the hiring manager, the warm connection — because they are
 * top-of-mind and it serves THEM). All fields best-effort; the autopilot resolves
 * this to an existing CRM contact (`lib/autopilot/signal-person.ts`) and routes the
 * outreach to them instead of the top-seniority default. No field present → the
 * signal is company-level (e.g. funding) and the score-best contact is used.
 */
export type SignalPerson = {
  /** Exact CRM contact id — the strongest hint (the producer already resolved one). */
  contactId?: string;
  name?: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
};

export type SignalEntry = {
  /** Signal type — must match a key in SIGNAL_TTL_DAYS / the multiplier table. */
  type: string;
  /** ISO timestamp; drives freshness decay. */
  detectedAt: string;
  strength?: SignalStrength;
  /** Where it came from (e.g. "apollo", "engagement") — provenance only. */
  source?: string;
  /** Who to contact for this signal (Monaco signal→person). Optional. */
  person?: SignalPerson;
};

/** A person hint is usable only if it carries at least one identifying field. */
export function hasAnyHint(p: SignalPerson | null | undefined): boolean {
  return !!p && !!(p.contactId || p.email || p.linkedinUrl || p.name);
}

/**
 * The person to contact for a company, taken from the FRESHEST signal that names
 * one (a signal with no usable `person` is skipped). Pure. Returns null when no
 * signal carries a person → caller falls back to the score-best contact.
 */
export function personFromSignals(
  signals: SignalEntry[] | null | undefined,
  now: Date = new Date(),
): SignalPerson | null {
  if (!Array.isArray(signals)) return null;
  // Only a FRESH signal may route — a stale hint (e.g. a >30-day hiring signal)
  // must not hijack routing forever, and routing to a person from a signal the
  // draft context would drop is the "stale signal proves automation" failure.
  // Null-TTL structural signals (warm_connection) stay eligible (freshness keeps them).
  const fresh = filterFreshSignals(signals.filter((s) => s && hasAnyHint(s.person)), now);
  if (fresh.length === 0) return null;
  fresh.sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt));
  return fresh[0].person ?? null;
}

/**
 * Pure: upsert a signal by type — the newest entry of a type replaces the
 * prior one (a fresher funding signal supersedes a stale one); all other
 * types are preserved. Append-if-absent. Order-stable for the kept entries.
 */
export function upsertSignalEntry(
  signals: SignalEntry[],
  entry: SignalEntry,
): SignalEntry[] {
  const kept = signals.filter((s) => s.type !== entry.type);
  return [...kept, entry];
}

/**
 * Read → upsert → write `properties.signals[]`, merging ONLY the signals key
 * (`||`) so concurrent property writers (lastKnownFunding, lastKnownEmployeeCount,
 * primaryIcpId, …) are preserved. No-op if the company is gone.
 */
export async function recordCompanySignal(
  tenantId: string,
  companyId: string,
  entry: SignalEntry,
): Promise<void> {
  const [row] = await db
    .select({ properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.id, companyId)));
  if (!row) return;

  const props = (row.properties as Record<string, unknown> | null) ?? {};
  const current = Array.isArray(props.signals)
    ? (props.signals as SignalEntry[])
    : [];
  const next = upsertSignalEntry(current, entry);
  const patch = JSON.stringify({ signals: next });

  await db
    .update(companies)
    .set({
      properties: sql`COALESCE(${companies.properties}, '{}'::jsonb) || ${patch}::jsonb`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(companies.tenantId, tenantId), eq(companies.id, companyId)));
}
