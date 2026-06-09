import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies, icps, icpCriteria } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { icpToStrategy, icpToSignalIcp } from "@/lib/icp/icp-to-tam";
import {
  flatFiltersToHardApollo,
  applyHardFiltersToStrategies,
} from "@/lib/icp/flat-filters-to-apollo";
import type { Criterion } from "@/lib/icp/criteria-engine";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";
import {
  searchOrganizations,
  isApolloAvailable,
  type OrgSearchParams,
} from "@/lib/integrations/apollo-client";
import {
  getTenantSettings,
  deriveTargetRoles,
  parseSizeRange,
  parseRoleKeywords,
} from "@/lib/config/tenant-settings";
import { getTenantKnowledge, formatKnowledgeBlock } from "@/lib/knowledge/get-tenant-knowledge";
import { sizesToApolloRanges } from "@/lib/config/icp-constants";
import { runPerCompanyPipeline } from "@/lib/tam-stream/per-company";
import { inngest } from "@/inngest/client";
import type { SignalContext } from "@/lib/tam-stream/signals/types";
import {
  initSummary,
  type BuildRequest,
  type TamEvent,
} from "@/lib/tam-stream/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Apollo rate-limits aggressively; 6 concurrent per-company pipelines
// (each fires ~5 Apollo requests: enrich + people-search + anything
// the signals need) keeps us comfortably under the practical ceiling
// while preserving a sense of continuous flow in the UI.
const MAX_CONCURRENT_PIPELINES = 6;

const DEFAULT_TARGET_COUNT = 300;
const DEFAULT_STRATEGY_COUNT = 4;
// 6 pages × 100 = up to 600 orgs per strategy. ICP mode runs a single
// strategy, so this is what lets one ICP build reach a 500+ TAM
// (e.g. ICP-1 ≈ 544 reachable) rather than capping at 300. Bounded by
// `targetCount` and the 300s maxDuration — very large TAMs should be
// sourced via scripts/source-icp-tam.ts which has no time limit.
const MAX_PAGES_PER_STRATEGY = 6;
const APOLLO_PAGE_SIZE = 100;

// ── LLM strategy schema ──────────────────────────────────────────
// Expanded vs the /api/tam route to include signal-grade filters
// (funding date range, hiring counts, job titles) so a strategy can
// already bias the result toward high-signal accounts before signals
// are re-computed per-row.

// NOTE: `z.array(...).min(N).max(M)` with N > 1 maps to JSON Schema
// `minItems/maxItems` values > 1, which Anthropic's structured-output
// endpoint rejects ("For 'array' type, 'minItems' values other than
// 0 or 1 are not supported"). We enforce the count with a
// `length >= 1` schema + an instruction in the prompt + a
// server-side `slice(0, strategyCount)` after generation.
const searchStrategySchema = z.object({
  strategies: z.array(
    z.object({
      label: z.string().describe(
        "Short label like 'Direct ICP fit', 'Recent-funded adjacent', 'Actively hiring'",
      ),
      reasoning: z.string().describe(
        "One sentence: why this angle fits the user's business",
      ),
      filters: z.object({
        organization_num_employees_ranges: z.array(z.string()).describe(
          "Apollo ranges like '51,200'. Always include at least one range.",
        ),
        organization_locations: z.array(z.string()).optional(),
        q_organization_keyword_tags: z.array(z.string()).optional().describe(
          "Business-domain keywords, not generic ('developer tools', not 'tech').",
        ),
        currently_using_any_of_technology_uids: z
          .array(z.string())
          .optional()
          .describe(
            "Only when strongly relevant (e.g. selling Kubernetes monitoring → 'kubernetes').",
          ),
        revenue_range: z
          .object({ min: z.number().optional(), max: z.number().optional() })
          .optional(),
        latest_funding_date_range: z
          .object({
            min: z
              .string()
              .optional()
              .describe("ISO date, e.g. '2025-10-01' for last ~6 months"),
            max: z.string().optional(),
          })
          .optional()
          .describe(
            "Use for 'recent funding' plays — companies with runway to spend.",
          ),
        organization_num_jobs_range: z
          .object({
            min: z.number().optional(),
            max: z.number().optional(),
          })
          .optional()
          .describe(
            "Use `{ min: 1 }` or `{ min: 5 }` for hiring-intent plays.",
          ),
        q_organization_job_titles: z
          .array(z.string())
          .optional()
          .describe(
            "Job titles actively being recruited. Use when the buyer persona is hiring-adjacent (e.g. 'data engineer' for a data-platform seller).",
          ),
      }),
    }),
  ),
});

// ── Handler ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  if (!isApolloAvailable()) {
    return new Response(
      JSON.stringify({ error: "Apollo API key not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return new Response(
      JSON.stringify({ error: "No LLM API key configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as BuildRequest;
  const targetCount = Math.max(
    10,
    Math.min(1000, body.targetCount ?? DEFAULT_TARGET_COUNT),
  );
  const strategyCount = Math.max(
    2,
    Math.min(6, body.strategyCount ?? DEFAULT_STRATEGY_COUNT),
  );

  // The abort controller for server-side abort propagation. When the
  // client disconnects, the stream's `cancel` callback aborts this.
  const abortController = new AbortController();

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const jobId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventCount = 0;
      const send = (event: TamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          eventCount++;
          if (process.env.NODE_ENV !== "production") {
            const summary =
              event.type === "company.inserted"
                ? `${event.company.name} (${event.company.domain ?? "no-domain"})`
                : event.type === "signal.computed"
                  ? `${event.key}=${event.payload.value}`
                  : event.type === "strategy.generated"
                    ? `${event.strategies.length} strategies`
                    : event.type === "error"
                      ? `${event.stage}: ${event.message}`
                      : "";
            console.log(`[tam-stream ${jobId.slice(0, 8)}] send #${eventCount} ${event.type} ${summary}`);
          }
        } catch (err) {
          console.warn(`[tam-stream ${jobId.slice(0, 8)}] enqueue failed (client gone?)`, (err as Error)?.message);
        }
      };

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", ts: new Date().toISOString() });
      }, 15_000);

      const summary = initSummary();

      try {
        console.log(`[tam-stream ${jobId.slice(0, 8)}] start — tenant=${authCtx.tenantId} target=${targetCount}`);
        // Emit hello immediately so the client knows we're alive
        // before we block on settings/DB/LLM. Having a signal this
        // early makes the UI feel instant and also lets us diagnose
        // "did events reach the client at all?" without waiting for
        // the full pipeline.
        send({
          type: "hello",
          jobId,
          tenantId: authCtx.tenantId,
          startedAt: new Date(startedAt).toISOString(),
        });

        // ── Context ──
        const settings = await getTenantSettings(authCtx.tenantId);
        const ownDomain = settings.companyDomain
          ? settings.companyDomain.toLowerCase().replace(/^www\./, "")
          : null;

        // Pre-load every domain already in the tenant so we skip
        // duplicates. Cap at 5K — beyond that the dedup set is
        // pointless (we'll be inserting rare net-new anyway).
        const existing = await db
          .select({ domain: companies.domain })
          .from(companies)
          .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
          .limit(5000);
        const existingDomains = new Set(
          existing
            .map((c) => c.domain?.toLowerCase())
            .filter((d): d is string => Boolean(d)),
        );

        const tenantInvestors = new Set(
          (settings.companyInvestors ?? [])
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );

        const companyModel = (settings as Record<string, unknown>).companyModel as
          import("@/lib/scoring/company-model-trainer").CompanyScoringModel | null | undefined;

        // ── Multi-ICP sourcing (Phase 3) ──
        // When the request names an ICP, source from its criteria
        // (translated to Apollo params) instead of the LLM planner over
        // flat settings. We load it here so the signal context below
        // can reflect the ICP's firmographics too.
        let icpStrategy: ReturnType<typeof icpToStrategy> = null;
        let icpSignalIcp: ReturnType<typeof icpToSignalIcp> | null = null;
        let icpName: string | null = null;
        if (body.icpId) {
          const [icp] = await db
            .select({ id: icps.id, name: icps.name })
            .from(icps)
            .where(and(eq(icps.id, body.icpId), eq(icps.tenantId, authCtx.tenantId), isNull(icps.deletedAt)))
            .limit(1);
          if (!icp) {
            send({
              type: "error",
              stage: "icp.load",
              message: "ICP not found for this tenant",
              recoverable: false,
            });
            return;
          }
          const critRows = await db
            .select()
            .from(icpCriteria)
            .where(eq(icpCriteria.icpId, icp.id));
          const criteria: Criterion[] = critRows.map((r) => ({
            id: r.id,
            fieldKey: r.fieldKey,
            operator: r.operator as Criterion["operator"],
            value: r.value,
            weight: r.weight,
            isRequired: r.isRequired,
          }));
          icpStrategy = icpToStrategy(icp.name, criteria);
          if (!icpStrategy) {
            send({
              type: "error",
              stage: "icp.translate",
              message: `ICP "${icp.name}" has no Apollo-sourceable criteria (add industry / size / geo / tech / funding / hiring criteria).`,
              recoverable: false,
            });
            return;
          }
          icpSignalIcp = icpToSignalIcp(criteria);
          icpName = icp.name;
        }

        const signalCtx: SignalContext = {
          tenantId: authCtx.tenantId,
          tenantInvestors,
          icp: icpSignalIcp ?? {
            industries: settings.targetIndustries,
            sizeRange: parseSizeRange(settings) ?? undefined,
            geographies: settings.targetGeographies,
          },
          now: new Date(),
          companyModel: companyModel ?? null,
        };

        const targetTitles = parseRoleKeywords(settings);
        const targetSeniorities = mapSenioritiesForApollo(
          settings.targetSeniorities ?? [],
        );

        console.log(`[tam-stream ${jobId.slice(0, 8)}] context loaded — existingDomains=${existingDomains.size} investors=${tenantInvestors.size} industries=${settings.targetIndustries?.length ?? 0}`);

        // ── Plan strategies ──
        // ICP mode: a single deterministic strategy from the ICP's
        // criteria — no LLM, we source exactly what the founder defined.
        // Legacy mode: the LLM planner over the tenant's flat settings.
        const strategies = icpStrategy
          ? [icpStrategy]
          : await planStrategies({
              model,
              tenantId: authCtx.tenantId,
              settings,
              strategyCount,
            });
        if (icpName) {
          console.log(`[tam-stream ${jobId.slice(0, 8)}] ICP mode — sourcing for "${icpName}"`);
        }

        // ── UI facet overrides (accounts-list sector/geography) ──
        // Narrow every strategy to the picked industries/geographies so
        // the same filters the user reads in the accounts table can be
        // "called into Apollo" to source exactly that slice. Geographies
        // replace the strategy's own locations (the filter is the intent);
        // industries are unioned into the keyword tags.
        const ov = body.apolloOverrides;
        const hasOverrides = !!ov && ((ov.industries?.length ?? 0) > 0 || (ov.geographies?.length ?? 0) > 0);
        const effectiveStrategies = hasOverrides
          ? strategies.map((s: { label: string; reasoning: string; filters: OrgSearchParams }) => ({
              ...s,
              filters: {
                ...s.filters,
                ...(ov!.geographies?.length ? { organization_locations: ov!.geographies } : {}),
                ...(ov!.industries?.length
                  ? {
                      q_organization_keyword_tags: Array.from(
                        new Set([...(s.filters.q_organization_keyword_tags ?? []), ...ov!.industries]),
                      ),
                    }
                  : {}),
              },
            }))
          : strategies;
        if (hasOverrides) {
          console.log(`[tam-stream ${jobId.slice(0, 8)}] apollo overrides — industries=${ov!.industries?.join("|") ?? "-"} geographies=${ov!.geographies?.join("|") ?? "-"}`);
        }

        // ── Legacy-mode settings hard filters ──
        // In ICP mode the criteria already define the search exactly, so
        // we leave it untouched. In legacy mode (no icpId — e.g. the
        // accounts "Find more accounts" tenant-wide build) we layer the
        // tenant's explicit Settings → ICP filters (revenue / tech /
        // funding / exclude-geo / hiring) onto every LLM strategy, and
        // union the tenant keywords, so the same filters the user set are
        // honored here too. Single source of truth: flatFiltersToHardApollo.
        const settingsHard = icpStrategy
          ? {}
          : flatFiltersToHardApollo({
              excludeGeographies: settings.excludeGeographies,
              technologies: settings.targetTechnologies,
              revenueMin: settings.targetRevenueMin,
              revenueMax: settings.targetRevenueMax,
              fundingRecencyDays: settings.fundingRecencyDays,
              totalFundingMin: settings.totalFundingMin,
              totalFundingMax: settings.totalFundingMax,
              minJobOpenings: settings.minJobOpenings,
              hiringTitles: settings.hiringTitles,
            });
        const settingsKeywords = icpStrategy ? [] : (settings.targetKeywords ?? []);
        const finalStrategies = applyHardFiltersToStrategies(
          effectiveStrategies,
          settingsHard,
          settingsKeywords,
        );
        if (Object.keys(settingsHard).length > 0 || settingsKeywords.length > 0) {
          console.log(`[tam-stream ${jobId.slice(0, 8)}] legacy settings filters — keys=${Object.keys(settingsHard).join("|") || "-"} keywords=${settingsKeywords.length}`);
        }

        summary.strategiesRun = strategies.length;
        send({
          type: "strategy.generated",
          strategies: strategies.map((s: { label: string; reasoning: string }) => ({
            label: s.label,
            reasoning: s.reasoning,
          })),
        });

        // ── Execute strategies with a concurrency limiter ──
        const allPerCompanyWork: Promise<void>[] = [];
        const limiter = createLimiter(MAX_CONCURRENT_PIPELINES);

        outer: for (const strategy of finalStrategies) {
          if (abortController.signal.aborted) break;

          let added = 0;
          let skipped = 0;

          for (let page = 1; page <= MAX_PAGES_PER_STRATEGY; page++) {
            if (abortController.signal.aborted) break outer;
            if (summary.companiesInserted >= targetCount) break outer;

            let result;
            try {
              result = await searchOrganizations({
                ...strategy.filters,
                page,
                per_page: APOLLO_PAGE_SIZE,
              });
            } catch (err) {
              send({
                type: "error",
                stage: `apollo.search:${strategy.label}`,
                message: (err as Error)?.message ?? "apollo search failed",
                recoverable: true,
              });
              break;
            }

            summary.companiesFound += result.organizations.length;
            send({
              type: "search.progress",
              strategyLabel: strategy.label,
              page,
              foundSoFar: result.organizations.length,
            });

            if (result.organizations.length === 0) break;

            for (const org of result.organizations) {
              if (abortController.signal.aborted) break outer;
              if (summary.companiesInserted + allPerCompanyWork.length >= targetCount) {
                break outer;
              }

              const work = limiter(() =>
                runPerCompanyPipeline({
                  search: org,
                  tenantId: authCtx.tenantId,
                  strategyLabel: strategy.label,
                  ctx: signalCtx,
                  existingDomains,
                  ownDomain,
                  targetTitles,
                  targetSeniorities,
                  send,
                  summary,
                  abortSignal: abortController.signal,
                }).then(() => {
                  // `summary.companiesInserted` is mutated inside the
                  // pipeline when it actually emits `company.inserted`.
                  // That's our accurate counter.
                  const after = summary.companiesInserted;
                  if (after > 0 && after % 10 === 0) {
                    // Lightweight progress pulse every 10 inserts so
                    // the progress bar animates smoothly even when
                    // the pipelines are busy computing signals.
                    send({
                      type: "search.progress",
                      strategyLabel: strategy.label,
                      page,
                      foundSoFar: after,
                    });
                  }
                }),
              );
              allPerCompanyWork.push(work);
              added++;
            }

            // Short-circuit pagination on a partial page (no more data).
            if (result.organizations.length < APOLLO_PAGE_SIZE) break;
          }

          send({
            type: "strategy.complete",
            label: strategy.label,
            added,
            skipped,
          });
        }

        await Promise.allSettled(allPerCompanyWork);

        // Fill the multi-ICP fit matrix for the freshly-sourced rows.
        // The per-company pipeline writes companies.score (legacy) but
        // NOT company_icp_fit — that matrix (and the ICP card's "N
        // companies fit") is only populated by the recompute job. Fire
        // it now so a build is immediately reflected on the ICP.
        if (summary.companiesInserted > 0) {
          inngest
            .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
            .catch(() => {});
        }

        summary.durationMs = Date.now() - startedAt;
        console.log(`[tam-stream ${jobId.slice(0, 8)}] done — inserted=${summary.companiesInserted} skipped=${summary.companiesSkipped} aBurning=${summary.aBurningCount} duration=${summary.durationMs}ms`);
        send({ type: "done", summary });
      } catch (err) {
        console.error(`[tam-stream ${jobId.slice(0, 8)}] FAILED`, err);
        send({
          type: "error",
          stage: "build",
          message: (err as Error)?.message ?? "build failed",
          recoverable: false,
        });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by cancel().
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Planner
// ─────────────────────────────────────────────────────────────────

async function planStrategies(args: {
  model: ReturnType<typeof anthropic> | ReturnType<typeof openai>;
  tenantId: string;
  settings: Awaited<ReturnType<typeof getTenantSettings>>;
  strategyCount: number;
}) {
  const { model, tenantId, settings, strategyCount } = args;

  const apolloSizeExamples = settings.targetCompanySizes?.length
    ? sizesToApolloRanges(settings.targetCompanySizes).join(", ")
    : "";

  const knowledgeEntries = await getTenantKnowledge(tenantId);
  const knowledgeBlock = formatKnowledgeBlock(knowledgeEntries);

  const businessContext = [
    settings.onboardingCompanyName && `Company: ${settings.onboardingCompanyName}`,
    settings.productDescription && `Product: ${settings.productDescription}`,
    settings.salesMotion && `Sales motion: ${settings.salesMotion}`,
    settings.primaryChallenge && `Primary challenge: ${settings.primaryChallenge}`,
    settings.targetIndustries?.length &&
      `Target industries: ${settings.targetIndustries.join(", ")}`,
    settings.targetCompanySizes?.length &&
      `Target company sizes: ${settings.targetCompanySizes.join(", ")}`,
    settings.targetGeographies?.length &&
      `Target geographies: ${settings.targetGeographies.join(", ")}`,
    // BUG-WS0-008: derive targetRoles at read time
    deriveTargetRoles(settings) && `Buyer personas: ${deriveTargetRoles(settings)}`,
    knowledgeBlock && `Knowledge base:\n${knowledgeBlock}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Date windows for signal-biased strategies.
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { object } = await tracedGenerateObject({
    model,
    schema: searchStrategySchema,
    prompt: `You are a sales intelligence expert planning an Apollo.io TAM search.

Generate ${strategyCount} diverse search strategies for this business. Each strategy produces one Apollo query. Together they maximize coverage while keeping each angle distinct.

BUSINESS CONTEXT:
${businessContext}

AVAILABLE SIGNAL-GRADE FILTERS (use where relevant):
- latest_funding_date_range.min = "${sixMonthsAgo.toISOString().slice(0, 10)}" → recently-funded
- latest_funding_date_range.min = "${twelveMonthsAgo.toISOString().slice(0, 10)}" → funded in last year
- organization_num_jobs_range.min = 1 → actively hiring
- organization_num_jobs_range.min = 5 → hiring in volume (expansion)
- q_organization_job_titles = ["role A", "role B"] → hiring for specific roles

APOLLO RULES:
- Employee ranges use "min,max": "1,10", "11,20", "21,50", "51,100", "101,200", "201,500", "501,1000", "1001,2000", "2001,5000", "5001,10000", "10001,"
${apolloSizeExamples ? `- User's selected sizes: ${apolloSizeExamples} — base the direct-fit strategy on these, vary adjacents` : ""}
- Locations are free text: country, US state, or city names
- Keywords must be specific to the business (not "saas" alone unless the domain is literally "saas tooling")

STRATEGY DESIGN:
1. Direct fit — exact ICP match on firmographics
2. Recent-funded adjacent — adjacent industries/sizes that just raised (budget to spend)
3. Actively hiring — target ICP size, with organization_num_jobs_range.min set, to catch expansion moments
4. Signal-role — if the buyer persona maps to a hireable role, use q_organization_job_titles
(add more angles only if they're genuinely distinct)

Generate ${strategyCount} strategies now.`,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
    _trace: {
      agentId: "tam-stream-planner",
      tenantId,
      inputPreview: "Plan signal-aware TAM search strategies",
    },
  });

  type StrategyOut = (typeof object.strategies)[number];
  return object.strategies.slice(0, strategyCount).map((s: StrategyOut) => ({
    label: s.label,
    reasoning: s.reasoning,
    filters: s.filters as OrgSearchParams,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Lightweight concurrency limiter. Mirrors p-limit's API without a
 * dependency — returns a wrapper that resolves when the inner
 * function has run and completed. */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= maxConcurrent) return;
    const run = queue.shift();
    if (run) run();
  };

  return function limited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          active--;
          next();
        }
      };
      queue.push(exec);
      next();
    });
  };
}

/** The Apollo people-search endpoint expects seniority slugs like
 * "c_suite", not the UI's "C-Suite". Apollo's slug convention is
 * lowercase snake_case; spaces and hyphens collapse to underscores. */
function mapSenioritiesForApollo(labels: string[]): string[] {
  return labels
    .map((s) =>
      s
        .toLowerCase()
        .replace(/-/g, "_")
        .replace(/\s+/g, "_")
        .replace(/[^a-z_]/g, ""),
    )
    .filter(Boolean);
}
