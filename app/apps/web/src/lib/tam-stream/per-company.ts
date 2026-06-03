import { db } from "@/db";
import { companies, contacts as contactsTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  enrichOrganization,
  employeeCountToRange,
  revenueToRange,
  type ApolloOrganization,
  type OrgSearchOrganization,
} from "@/lib/integrations/apollo-client";
import { getGrade } from "@/lib/scoring/scoring";
import { scoreCompanyWithModel } from "@/lib/scoring/company-scorer";
import { narrateScoreReasons, type NarrativeInput } from "@/lib/scoring/narrative-reasons";
import { findWarmPathsToCompany } from "@/lib/context/relationship-graph";
import { enrichCompany as waterfallEnrich } from "@/lib/providers/company-enrichment/waterfall";
import { companyContactFinderHandler } from "@/skills/enrichment/company-contact-finder/handler";
import { DEFAULT_SIGNALS } from "@/lib/tam-stream/signals";
import type { SignalContext } from "@/lib/tam-stream/signals/types";
import { verifySources } from "@/lib/tam-stream/verify-source";
import type {
  BuildSummary,
  CompanyCompact,
  ContactCompact,
  EnrichmentPatch,
  ScorePayload,
  SignalKey,
  SignalPayload,
  TamEvent,
  WarmPath,
} from "@/lib/tam-stream/events";

/** Budget for the first signal to resolve before we emit the row
 * anyway. 3000ms is generous — most signals are synchronous once
 * enrichment is done. This is only ever hit when all four signals
 * return `indeterminate` quickly; in that case we want the row
 * on-screen so the user isn't staring at a silent build. */
const FIRST_SIGNAL_BUDGET_MS = 3000;

export interface PerCompanyArgs {
  search: OrgSearchOrganization;
  tenantId: string;
  strategyLabel: string;
  ctx: SignalContext;
  /** Tenant-scoped dedup set. Domains already known (in DB or
   * inserted in the current run) are skipped. The pipeline mutates
   * this set after a successful insert so later strategies don't
   * re-process the same domain. */
  existingDomains: Set<string>;
  ownDomain: string | null;
  /** Decision-maker titles to target in contact discovery. Usually
   * derived from `settings.targetRoles` + default seniority list. */
  targetTitles: string[];
  targetSeniorities: string[];
  send: (event: TamEvent) => void;
  summary: BuildSummary;
  abortSignal?: AbortSignal;
}

/**
 * Processes one Apollo search result end-to-end:
 *   1. dedup (skip duplicates, own domain, abort signal)
 *   2. enrich via Apollo (awaited — signals need richer fields)
 *   3. compute fit score against tenant ICP
 *   4. insert the row into `companies` with score + enrichment
 *   5. run 4 signals in parallel, HEAD-check sources
 *      - first resolved signal rides with company.inserted event
 *      - remaining signals stream as signal.computed events
 *   6. in parallel, discover contacts and compute warm paths
 *   7. persist the final signals bundle to companies.properties
 *
 * Never throws — all failures are absorbed into error events so a
 * single bad company doesn't poison the whole stream. The caller
 * pushes the returned promise into a Promise.allSettled bag so it
 * knows when to emit the terminal `done` event.
 */
export async function runPerCompanyPipeline(args: PerCompanyArgs): Promise<void> {
  const {
    search,
    tenantId,
    strategyLabel,
    ctx,
    existingDomains,
    ownDomain,
    targetTitles,
    targetSeniorities,
    send,
    summary,
    abortSignal,
  } = args;

  if (abortSignal?.aborted) return;

  const domain = extractDomain(search);
  if (!domain) {
    summary.companiesSkipped++;
    return;
  }
  if (ownDomain && domain === ownDomain) {
    summary.companiesSkipped++;
    return;
  }
  if (existingDomains.has(domain)) {
    summary.companiesSkipped++;
    return;
  }
  // Reserve the domain NOW so a sibling strategy processing the
  // same org in parallel doesn't race to a double-insert.
  existingDomains.add(domain);

  // ── 1. Enrich ──
  let enriched: ApolloOrganization | null = null;
  try {
    enriched = await enrichOrganization(domain);
  } catch (err) {
    // Enrichment is best-effort — continue with search fields only.
    send({
      type: "error",
      stage: "enrich",
      message: (err as Error)?.message ?? "enrich failed",
      recoverable: true,
    });
  }

  if (abortSignal?.aborted) return;

  // ── 1b. Waterfall gap-fill (Crunchbase, Hunter) ──
  let waterfallInvestors: string[] = [];
  try {
    const wf = await waterfallEnrich(
      { domain, name: search.name },
      { tenantId },
    );
    if (wf.enriched) {
      waterfallInvestors = wf.data.investors ?? [];
    }
  } catch {
    // Waterfall is best-effort; Apollo data is sufficient.
  }

  if (abortSignal?.aborted) return;

  // ── 2. Score ──
  const props = buildPropsFromApollo(search, enriched, strategyLabel);
  if (waterfallInvestors.length > 0) {
    const existing = (props.investor_names as string[]) ?? [];
    const seen = new Set(existing.map((s) => (s as string).toLowerCase()));
    for (const inv of waterfallInvestors) {
      if (!seen.has(inv.toLowerCase())) {
        existing.push(inv);
        seen.add(inv.toLowerCase());
      }
    }
    props.investor_names = existing;
    props.crunchbase_investors = waterfallInvestors;
  }
  const companyRow = {
    industry: enriched?.industry ?? search.industry ?? null,
    size: inferSizeLabel(enriched, search),
    description: enriched?.description ?? search.description ?? null,
    name: enriched?.name ?? search.name,
    domain,
  };
  const scored = scoreCompanyWithModel(companyRow, props, ctx.icp, ctx.companyModel ?? null);
  const { grade, heat } = getGrade(scored.score);
  const scorePayload: ScorePayload = {
    score: scored.score,
    grade,
    heat,
    reasons: scored.reasons,
  };

  // ── 3. Insert ──
  let companyId: string;
  try {
    const [inserted] = await db
      .insert(companies)
      .values({
        name: companyRow.name,
        domain,
        industry: companyRow.industry,
        size: companyRow.size,
        revenue: enriched ? revenueToRange(enriched.annual_revenue) : null,
        description: companyRow.description,
        score: scored.score,
        scoreReasons: scored.reasons,
        tenantId,
        properties: {
          ...props,
          score_grade: grade,
          score_fit: scored.score,
          score_fit_reasons: scored.reasons,
          score_source: scored.source,
          scored_at: ctx.now.toISOString(),
        },
      })
      .returning({ id: companies.id });
    companyId = inserted.id;
  } catch (err) {
    // Unique-violation or similar — skip silently. Another pipeline
    // in parallel may have inserted the same domain despite our
    // in-memory dedup (race across multiple build invocations).
    summary.companiesSkipped++;
    send({
      type: "error",
      stage: "insert",
      message: (err as Error)?.message ?? "insert failed",
      recoverable: true,
    });
    return;
  }

  const compact: CompanyCompact = {
    id: companyId,
    name: companyRow.name,
    domain,
    industry: companyRow.industry,
    size: companyRow.size,
    logoUrl: search.logo_url ?? null,
    strategyLabel,
  };
  const enrichmentPatch = buildEnrichmentPatch(enriched, search);

  // ── 4. Signals in parallel + emit insert event when first lands ──
  let inserted = false;
  const signalsBySlot: Record<SignalKey, SignalPayload | null> = {
    investor_overlap: null,
    funding_recent: null,
    funding_crunchbase: null,
    hiring_intent: null,
    yc_company: null,
  };

  const emitInserted = (
    initialSignal: { key: SignalKey; payload: SignalPayload } | null,
  ) => {
    if (inserted) return;
    inserted = true;
    send({
      type: "company.inserted",
      company: compact,
      enrichment: enrichmentPatch,
      initialScore: scorePayload,
      initialSignal,
    });
    summary.companiesInserted++;
    if (grade === "A" || grade === "A+") summary.aBurningCount++;
  };

  const safetyTimer = setTimeout(() => {
    if (!inserted) emitInserted(null);
  }, FIRST_SIGNAL_BUDGET_MS);

  const signalPromises = DEFAULT_SIGNALS.map(({ key, detector }) =>
    detector({ search, enriched }, ctx)
      .then(async (raw) => {
        const payload: SignalPayload = {
          ...raw,
          sources: await verifySources(raw.sources),
        };
        signalsBySlot[key] = payload;
        if (payload.value) summary.signalsLit[key]++;

        if (!inserted) {
          clearTimeout(safetyTimer);
          emitInserted({ key, payload });
        } else {
          send({ type: "signal.computed", companyId, key, payload });
        }
      })
      .catch((err: unknown) => {
        send({
          type: "error",
          companyId,
          stage: `signal:${key}`,
          message: (err as Error)?.message ?? "signal failed",
          recoverable: true,
        });
      }),
  );

  // ── 5. Contacts + warm paths in parallel (non-blocking for insert) ──
  const contactsPromise = findSuggestedContacts({
    domain,
    tenantId,
    companyId,
    targetTitles,
    targetSeniorities,
  })
    .then((contactsList) => {
      if (contactsList.length > 0) {
        send({ type: "contacts.found", companyId, contacts: contactsList });
        summary.contactsFound += contactsList.length;
      }
    })
    .catch((err: unknown) => {
      send({
        type: "error",
        companyId,
        stage: "contacts",
        message: (err as Error)?.message ?? "contacts failed",
        recoverable: true,
      });
    });

  const warmPathsPromise = findWarmPathsToCompany({ tenantId, companyId })
    .then((paths) => {
      if (paths.length > 0) {
        const compact: WarmPath[] = paths.map((p) => ({
          viaUserId: p.viaUserId,
          viaUserName: p.viaUserName,
          contactId: p.contactId,
          contactName: p.contactName,
          contactTitle: p.contactTitle,
          strength: p.strength,
        }));
        send({ type: "warm_path.computed", companyId, paths: compact });
        summary.warmPathsFound += compact.length;
      }
    })
    .catch((err: unknown) => {
      send({
        type: "error",
        companyId,
        stage: "warm_path",
        message: (err as Error)?.message ?? "warm_path failed",
        recoverable: true,
      });
    });

  // ── 6. Wait for everything, then persist ──
  await Promise.allSettled([
    ...signalPromises,
    contactsPromise,
    warmPathsPromise,
  ]);
  clearTimeout(safetyTimer);

  // ── 7. Narrative reasons (async, non-blocking for row display) ──
  const signalSummary = Object.entries(signalsBySlot)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ type: k, reason: v!.reason, value: v!.value }));

  const narrativeInput: NarrativeInput = {
    companyName: companyRow.name,
    companyIndustry: companyRow.industry,
    companySize: companyRow.size,
    companyCountry: (props.country as string) ?? null,
    fundingStage: (props.latest_funding_stage as string) ?? null,
    totalFunding: (props.total_funding as number) ?? null,
    fundingRecency: (props.latest_funding_raised_at as string) ?? null,
    investors: (props.investor_names as string[]) ?? [],
    technologies: (props.technologies as string[]) ?? [],
    rawReasons: scored.reasons,
    signals: signalSummary,
    tenantName: null,
    tenantIndustry: ctx.icp?.industries?.[0] ?? null,
    tenantInvestors: [...ctx.tenantInvestors],
    topClientNames: [],
  };

  // TAM_SKIP_NARRATION=1 disables the per-row narration LLM call. The
  // narration is a streaming-UX nicety (prettier score reasons) and is
  // irrelevant to the TAM / fit; bulk backfills (scripts/source-icp-tam)
  // set this so they don't pay one LLM round-trip per company.
  let narrativeReasons = scored.reasons;
  if (process.env.TAM_SKIP_NARRATION !== "1") {
    try {
      narrativeReasons = await narrateScoreReasons(narrativeInput, tenantId);
    } catch {
      // Narrative is best-effort; raw reasons are fine.
    }
  }

  // Re-score event with narrative reasons so the UI updates
  if (narrativeReasons !== scored.reasons) {
    send({
      type: "company.scored",
      companyId,
      score: { score: scored.score, grade, heat, reasons: narrativeReasons },
    });
  }

  // ── 8. Persist signals + narrative to DB ──
  try {
    const patch = JSON.stringify({
      tamSignals: signalsBySlot,
      narrative_reasons: narrativeReasons,
    });
    await db
      .update(companies)
      .set({
        scoreReasons: narrativeReasons,
        properties: sql`COALESCE(${companies.properties}, '{}'::jsonb) || ${patch}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)));
  } catch (err) {
    console.warn(
      `[tam-stream] persist signals+narrative failed for ${companyId}:`,
      (err as Error)?.message,
    );
  }
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function extractDomain(org: OrgSearchOrganization): string | null {
  const raw = org.primary_domain ?? org.website_url;
  if (!raw) return null;
  return (
    raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim() || null
  );
}

function inferSizeLabel(
  enriched: ApolloOrganization | null,
  search: OrgSearchOrganization,
): string | null {
  const count = enriched?.estimated_num_employees ?? search.estimated_num_employees;
  if (!count) return null;
  return employeeCountToRange(count);
}

function buildPropsFromApollo(
  search: OrgSearchOrganization,
  enriched: ApolloOrganization | null,
  strategyLabel: string,
): Record<string, unknown> {
  return {
    source: "tam",
    enrichment_source: enriched ? "apollo" : "apollo_search",
    apollo_id: enriched?.id ?? search.id,
    linkedin_url: enriched?.linkedin_url ?? search.linkedin_url ?? null,
    logo_url: search.logo_url ?? null,
    technologies: enriched?.technology_names ?? search.technology_names ?? [],
    employee_count:
      enriched?.estimated_num_employees ?? search.estimated_num_employees ?? null,
    annual_revenue: enriched?.annual_revenue ?? search.annual_revenue ?? null,
    annual_revenue_printed: enriched?.annual_revenue_printed ?? null,
    total_funding: enriched?.total_funding ?? search.total_funding ?? null,
    total_funding_printed:
      enriched?.total_funding_printed ?? search.total_funding_printed ?? null,
    latest_funding_stage:
      enriched?.latest_funding_stage ?? search.latest_funding_stage ?? null,
    latest_funding_raised_at:
      enriched?.latest_funding_raised_at ?? search.latest_funding_raised_at ?? null,
    investor_names: enriched?.investor_names ?? search.investor_names ?? [],
    num_current_job_openings:
      enriched?.num_current_job_openings ?? search.num_current_job_openings ?? null,
    founded_year: enriched?.founded_year ?? search.founded_year ?? null,
    city: enriched?.city ?? search.city ?? null,
    state: enriched?.state ?? search.state ?? null,
    country: enriched?.country ?? search.country ?? null,
    keywords: enriched?.keywords ?? search.keywords ?? [],
    search_strategy: strategyLabel,
  };
}

function buildEnrichmentPatch(
  enriched: ApolloOrganization | null,
  search: OrgSearchOrganization,
): EnrichmentPatch {
  return {
    industry: enriched?.industry ?? search.industry ?? null,
    size: inferSizeLabel(enriched, search),
    revenue: enriched ? revenueToRange(enriched.annual_revenue) : null,
    description: enriched?.description ?? search.description ?? null,
    technologies: enriched?.technology_names ?? search.technology_names ?? [],
    totalFunding: enriched?.total_funding ?? search.total_funding ?? null,
    totalFundingPrinted:
      enriched?.total_funding_printed ?? search.total_funding_printed ?? null,
    latestFundingStage:
      enriched?.latest_funding_stage ?? search.latest_funding_stage ?? null,
    latestFundingRaisedAt:
      enriched?.latest_funding_raised_at ?? search.latest_funding_raised_at ?? null,
    foundedYear: enriched?.founded_year ?? search.founded_year ?? null,
    country: enriched?.country ?? search.country ?? null,
    city: enriched?.city ?? search.city ?? null,
    state: enriched?.state ?? search.state ?? null,
    linkedinUrl: enriched?.linkedin_url ?? search.linkedin_url ?? null,
    logoUrl: search.logo_url ?? null,
  };
}

/**
 * Discovers up to 3 decision-maker contacts at the company via
 * Apollo people-search, inserts any new ones into `contacts`, and
 * returns the compact payload for the UI.
 *
 * Mirrors the behaviour of `/api/onboarding/find-contacts` but
 * scoped to a single company so it can be invoked during streaming
 * without blocking other companies.
 */
async function findSuggestedContacts(params: {
  domain: string;
  tenantId: string;
  companyId: string;
  targetTitles: string[];
  targetSeniorities: string[];
}): Promise<ContactCompact[]> {
  const { domain, tenantId, companyId, targetTitles, targetSeniorities } = params;

  const result = await companyContactFinderHandler(
    {
      companyDomain: domain,
      targetTitles: targetTitles.length > 0 ? targetTitles : undefined,
      targetSeniorities:
        targetSeniorities.length > 0 ? targetSeniorities : ["c_suite", "vp", "director"],
      minResults: 1,
      maxResults: 3,
    },
    { tenantId, dryRun: false },
  );

  if (!result.contacts || result.contacts.length === 0) return [];

  const inserted: ContactCompact[] = [];

  for (const person of result.contacts) {
    if (!person.email) continue;

    const [existing] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(eq(contactsTable.email, person.email))
      .limit(1);
    if (existing) continue;

    const nameParts = person.name?.split(" ") ?? [];
    try {
      const [row] = await db
        .insert(contactsTable)
        .values({
          tenantId,
          companyId,
          firstName: nameParts[0] ?? null,
          lastName: nameParts.slice(1).join(" ") || null,
          email: person.email,
          title: person.title ?? null,
          properties: {
            enrichment_source: "apollo",
            seniority: person.seniority,
            departments: person.departments,
            linkedin_url: person.linkedinUrl,
            discovered_via: "tam_stream",
          },
        })
        .returning({ id: contactsTable.id });

      inserted.push({
        id: row.id,
        firstName: nameParts[0] ?? null,
        lastName: nameParts.slice(1).join(" ") || null,
        title: person.title ?? null,
        email: person.email,
        seniority: person.seniority ?? null,
      });
    } catch {
      // Unique-violation on email: ignore.
    }
  }

  return inserted;
}
