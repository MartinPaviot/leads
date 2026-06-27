/**
 * Continuous Signal Monitor — Campaign Engine 1000x
 *
 * Runs every 4 hours. For each tenant with an active TAM:
 * 1. Re-checks signals on the top 50 companies
 * 2. Detects NEW signals (not previously seen)
 * 3. Triggers campaign actions when strong signals fire
 * 4. Invalidates stale intelligence briefs on new signals
 */

import { inngest } from "./client";
import { db } from "@/db";
import { companies, tenants, sequenceEnrollments, contacts } from "@/db/schema";
import { eq, and, desc, isNotNull, sql, ne } from "drizzle-orm";
import { invalidateBrief, buildIntelligenceBrief } from "@/lib/campaign-engine/build-intelligence-brief";
import { selectStrategy } from "@/lib/campaign-engine/select-strategy";
import { fetchRecentNews } from "@/lib/campaign-engine/sources/news";
import { scrapeJobPostings } from "@/lib/campaign-engine/sources/jobs";
import { getSignalMultipliers } from "@/lib/scoring/signal-outcomes";
import { KAIROS_WEIGHT_THRESHOLD } from "@/lib/scoring/priority-score";

interface DetectedSignal {
  companyId: string;
  tenantId: string;
  signalType: string;
  confidence: "high" | "medium";
  detail: string;
  detectedAt: string;
}

export const signalMonitorCron = inngest.createFunction(
  {
    id: "campaign-engine/signal-monitor",
    name: "Continuous Signal Monitor",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "0 */4 * * *" }], // Every 4 hours
  },
  async ({ step }) => {
    // Get all active tenants
    const activeTenants = await step.run("get-tenants", async () => {
      return db
        .select({ id: tenants.id })
        .from(tenants)
        .limit(50);
    });

    let totalSignals = 0;
    let totalTriggered = 0;

    for (const tenant of activeTenants) {
      const result = await step.run(`monitor-${tenant.id}`, async () => {
        return await monitorTenant(tenant.id);
      });

      totalSignals += result.newSignals;
      totalTriggered += result.triggered;
    }

    return { tenantsChecked: activeTenants.length, totalSignals, totalTriggered };
  }
);

async function monitorTenant(tenantId: string): Promise<{ newSignals: number; triggered: number; accelerated: number }> {
  // Get top 50 companies by score
  const topCompanies = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNotNull(companies.domain)))
    .orderBy(desc(companies.score))
    .limit(50);

  const newSignals: DetectedSignal[] = [];

  // Check each company for new signals (batch in groups of 10 for speed)
  for (let i = 0; i < topCompanies.length; i += 10) {
    const batch = topCompanies.slice(i, i + 10);
    const batchResults = await Promise.allSettled(
      batch.map((company) => checkCompanySignals(company, tenantId))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value.length > 0) {
        newSignals.push(...result.value);
      }
    }
  }

  // Pre-fetch the tenant's outcome-driven signal multipliers once.
  // Used by the B3 kairos accelerator emission below — we only fire
  // `signals/fresh-detected` when the multiplier crosses the threshold.
  // Catch returns null so a multiplier lookup failure can't block
  // signal persistence (which is what this fn is primarily for).
  const tenantMultipliers =
    newSignals.length > 0
      ? await getSignalMultipliers(tenantId).catch(() => null)
      : null;

  // Process new signals
  let triggered = 0;
  let accelerated = 0;
  for (const signal of newSignals) {
    // 1. Update company properties with new signal
    await persistSignal(signal);

    // 2. Invalidate the intelligence brief (force re-research)
    await invalidateBrief(signal.tenantId, signal.companyId).catch(() => {});

    // 3. Check if there's an active enrollment for this company
    // If not, and signal is strong, trigger a new outreach
    if (signal.confidence === "high") {
      const shouldTrigger = await shouldTriggerOutreach(signal);
      if (shouldTrigger) {
        await inngest.send({
          name: "campaign-engine/signal-triggered",
          data: {
            tenantId: signal.tenantId,
            companyId: signal.companyId,
            signalType: signal.signalType,
            signalDetail: signal.detail,
            detectedAt: signal.detectedAt,
          },
        });
        triggered++;
      }

      // B3b — kairos accelerator emission. When the signal's outcome
      // multiplier crosses KAIROS_WEIGHT_THRESHOLD, fan out to every
      // active enrollment at the company via signals/fresh-detected.
      // The consumer (signal-accelerate-cadence.ts) bumps next_step_at
      // to NOW so the cadence reacts before the chronos cron fires.
      if (tenantMultipliers) {
        const mult =
          tenantMultipliers.multipliers[signal.signalType] ?? 1;
        if (mult >= KAIROS_WEIGHT_THRESHOLD) {
          await inngest
            .send({
              name: "signals/fresh-detected",
              data: {
                tenantId: signal.tenantId,
                companyId: signal.companyId,
                signalType: signal.signalType,
                signalFiredAt: signal.detectedAt,
                signalMultiplier: mult,
              },
            })
            .catch(() => {});
          accelerated++;
        }
      }
    }
  }

  return { newSignals: newSignals.length, triggered, accelerated };
}

async function checkCompanySignals(
  company: { id: string; name: string; domain: string | null; properties: unknown },
  tenantId: string
): Promise<DetectedSignal[]> {
  if (!company.domain) return [];

  const props = (company.properties || {}) as Record<string, unknown>;
  const existingSignals = (props.signals || []) as Array<{ type: string; detectedAt?: string }>;
  const existingTypes = new Set(existingSignals.map((s) => s.type));

  const detected: DetectedSignal[] = [];
  const now = new Date().toISOString();

  // Check news for funding/acquisition signals
  try {
    const news = await fetchRecentNews(company.name, 7); // only last 7 days
    for (const item of news) {
      const lower = item.title.toLowerCase();
      // Dedup key is DERIVED from the pushed signalType (not a separate literal):
      // the prior code checked `funding_recent_new` while pushing `funding_recent`,
      // so the guard never matched → the same funding news was re-detected every
      // 4h, re-triggering outreach + the kairos accelerator and appending a
      // duplicate signal entry each pass.
      if (lower.includes("raise") || lower.includes("funding") || lower.includes("series")) {
        const signalType = "funding_recent";
        if (!existingTypes.has(signalType)) {
          detected.push({ companyId: company.id, tenantId, signalType, confidence: "high", detail: item.title, detectedAt: now });
        }
      }
      if (lower.includes("acqui") || lower.includes("merger")) {
        const signalType = "acquisition";
        if (!existingTypes.has(signalType)) {
          detected.push({ companyId: company.id, tenantId, signalType, confidence: "medium", detail: item.title, detectedAt: now });
        }
      }
    }
  } catch { /* non-blocking */ }

  // Check job postings for hiring surge
  try {
    const jobs = await scrapeJobPostings(company.domain);
    if (jobs.length >= 5 && !existingTypes.has("hiring_surge")) {
      detected.push({
        companyId: company.id,
        tenantId,
        signalType: "hiring_surge",
        confidence: "high",
        detail: `${jobs.length} open roles detected (${jobs.slice(0, 3).map(j => j.title).join(", ")})`,
        detectedAt: now,
      });
    }
    // VP/C-level hire = strong signal
    const seniorHires = jobs.filter((j) => j.senioritySignal === "vp_hire" || j.senioritySignal === "c_level_hire");
    if (seniorHires.length > 0 && !existingTypes.has("executive_hire")) {
      detected.push({
        companyId: company.id,
        tenantId,
        signalType: "executive_hire",
        confidence: "high",
        detail: `Hiring: ${seniorHires[0].title}`,
        detectedAt: now,
      });
    }
  } catch { /* non-blocking */ }

  return detected;
}

/**
 * Pure: upsert a monitor signal into a company's signals[] by `type` — a
 * re-fired type REPLACES its prior entry (freshest detail/detectedAt) instead of
 * appending a duplicate, mirroring lib/signals/record-signal.ts upsertSignalEntry.
 * Order-stable for the kept entries. Exported for unit tests.
 */
export function upsertMonitorSignal(
  current: Array<Record<string, unknown>>,
  entry: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const kept = current.filter((s) => s.type !== entry.type);
  return [...kept, entry];
}

async function persistSignal(signal: DetectedSignal): Promise<void> {
  const [company] = await db
    .select({ properties: companies.properties })
    .from(companies)
    .where(eq(companies.id, signal.companyId))
    .limit(1);

  if (!company) return;

  const props = (company.properties || {}) as Record<string, unknown>;
  const current = Array.isArray(props.signals)
    ? (props.signals as Array<Record<string, unknown>>)
    : [];
  const next = upsertMonitorSignal(current, {
    type: signal.signalType,
    confidence: signal.confidence,
    detail: signal.detail,
    detectedAt: signal.detectedAt,
    isNew: true,
  });

  // Merge ONLY the signals key (JSONB ||) so a concurrent property writer
  // (lastKnownFunding, primaryIcpId, …) isn't clobbered by this stale-read write.
  // The previous `{ ...props, signals }` overwrote the WHOLE properties object
  // from a read that could be seconds old — a lost-update on anything written
  // between the read and this set.
  const patch = JSON.stringify({ signals: next });
  await db
    .update(companies)
    .set({
      properties: sql`COALESCE(${companies.properties}, '{}'::jsonb) || ${patch}::jsonb`,
      updatedAt: sql`now()`,
    })
    .where(eq(companies.id, signal.companyId));
}

async function shouldTriggerOutreach(signal: DetectedSignal): Promise<boolean> {
  // Don't trigger if there's already an active enrollment for a contact at this company
  const activeEnrollments = await db
    .select({ id: sequenceEnrollments.id })
    .from(sequenceEnrollments)
    .innerJoin(contacts, eq(contacts.id, sequenceEnrollments.contactId))
    .where(
      and(
        eq(contacts.companyId, signal.companyId),
        eq(contacts.tenantId, signal.tenantId),
        eq(sequenceEnrollments.status, "active")
      )
    )
    .limit(1);

  return activeEnrollments.length === 0;
}

/**
 * Handler for signal-triggered outreach.
 * When a strong signal fires and no active enrollment exists,
 * this function selects the best contact and kicks off the campaign engine.
 */
export const signalTriggeredOutreach = inngest.createFunction(
  {
    id: "campaign-engine/signal-triggered-outreach",
    name: "Signal-Triggered Outreach",
    retries: 2,
    triggers: [{ event: "campaign-engine/signal-triggered" }],
  },
  async ({ event, step }) => {
    const { tenantId, companyId, signalType, signalDetail } = event.data;

    // Find the best contact at this company
    const bestContact = await step.run("find-best-contact", async () => {
      const [contact] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, companyId),
            eq(contacts.tenantId, tenantId),
            isNotNull(contacts.email)
          )
        )
        .orderBy(desc(contacts.score))
        .limit(1);
      return contact;
    });

    if (!bestContact) {
      return { result: "skipped", reason: "No contacts with email at this company" };
    }

    // Build intelligence brief (or refresh if stale)
    await step.run("build-brief", async () => {
      await buildIntelligenceBrief(companyId, tenantId, bestContact.id, { forceRefresh: true });
    });

    // Get strategy recommendation
    const strategy = await step.run("select-strategy", async () => {
      try {
        const candidates = await selectStrategy(companyId, tenantId, bestContact.id);
        return candidates[0] || null;
      } catch {
        return null;
      }
    });

    // Emit to decision engine for content generation
    await inngest.send({
      name: "campaign-engine/event-occurred",
      data: {
        enrollmentId: "", // will need to create enrollment
        tenantId,
        contactId: bestContact.id,
        companyId,
        triggerEvent: "signal_fired",
        metadata: { signalType, signalDetail, strategy: strategy?.strategyId },
      },
    });

    return { result: "triggered", contact: bestContact.id, strategy: strategy?.strategyId, signal: signalType };
  }
);
