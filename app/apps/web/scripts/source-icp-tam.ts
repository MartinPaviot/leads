/**
 * Source an ICP's TAM into a tenant, end-to-end, using the SAME
 * per-company pipeline the /api/tam/build route uses — but with no
 * 300s serverless limit, so it can fully source a 500+ TAM. After
 * sourcing it fills the multi-ICP fit matrix via recomputeTenant.
 *
 * Mirrors api/tam/build/route.ts (ICP mode) setup exactly.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/source-icp-tam.ts <tenantId> "<ICP name>" [targetCount] [maxPages]
 * Example (smoke):
 *   tsx --env-file=.env.local scripts/source-icp-tam.ts 47dca783-... "Scale-up Tech / SaaS B2B" 12 1
 */
import { db, companies, icps, icpCriteria } from "../src/db";
import { and, eq, isNull } from "drizzle-orm";
import { icpToStrategy, icpToSignalIcp } from "../src/lib/icp/icp-to-tam";
import type { Criterion } from "../src/lib/icp/criteria-engine";
import {
  searchOrganizations,
  isApolloAvailable,
} from "../src/lib/integrations/apollo-client";
import {
  getTenantSettings,
  parseSizeRange,
  parseRoleKeywords,
} from "../src/lib/config/tenant-settings";
import { runPerCompanyPipeline } from "../src/lib/tam-stream/per-company";
import type { SignalContext } from "../src/lib/tam-stream/signals/types";
import { initSummary, type TamEvent } from "../src/lib/tam-stream/events";
import { recomputeTenant } from "../src/inngest/icp-fit-recompute";

const APOLLO_PAGE_SIZE = 100;
const MAX_CONCURRENT = 6;

function mapSenioritiesForApollo(labels: string[]): string[] {
  return labels
    .map((s) => s.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_").replace(/[^a-z_]/g, ""))
    .filter(Boolean);
}

function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (run) run();
  };
  return function limited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = async () => {
        active++;
        try { resolve(await fn()); } catch (e) { reject(e); }
        finally { active--; next(); }
      };
      queue.push(exec);
      next();
    });
  };
}

async function main() {
  const tenantId = process.argv[2];
  const icpName = process.argv[3];
  const targetCount = Math.max(1, Math.min(1000, Number(process.argv[4] ?? 300)));
  const maxPages = Math.max(1, Math.min(10, Number(process.argv[5] ?? 6)));
  if (!tenantId || !icpName) {
    console.error('usage: <tenantId> "<ICP name>" [targetCount] [maxPages]');
    process.exit(1);
  }
  if (!isApolloAvailable()) { console.error("APOLLO_API_KEY not configured"); process.exit(1); }

  const [icp] = await db
    .select({ id: icps.id, name: icps.name })
    .from(icps)
    .where(and(eq(icps.name, icpName), eq(icps.tenantId, tenantId)))
    .limit(1);
  if (!icp) { console.error(`ICP "${icpName}" not found for tenant ${tenantId}`); process.exit(1); }

  const critRows = await db.select().from(icpCriteria).where(eq(icpCriteria.icpId, icp.id));
  const criteria: Criterion[] = critRows.map((r) => ({
    id: r.id, fieldKey: r.fieldKey, operator: r.operator as Criterion["operator"],
    value: r.value, weight: r.weight, isRequired: r.isRequired,
  }));

  const strategy = icpToStrategy(icp.name, criteria);
  if (!strategy) { console.error("ICP has no Apollo-sourceable criteria"); process.exit(1); }
  const icpSignalIcp = icpToSignalIcp(criteria);

  const settings = await getTenantSettings(tenantId);
  const ownDomain = settings.companyDomain
    ? settings.companyDomain.toLowerCase().replace(/^www\./, "") : null;

  const existing = await db
    .select({ domain: companies.domain }).from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt))).limit(5000);
  const existingDomains = new Set(
    existing.map((c) => c.domain?.toLowerCase()).filter((d): d is string => Boolean(d)),
  );
  const tenantInvestors = new Set(
    (settings.companyInvestors ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  const signalCtx: SignalContext = {
    tenantId, tenantInvestors,
    icp: icpSignalIcp ?? { industries: settings.targetIndustries, sizeRange: parseSizeRange(settings) ?? undefined, geographies: settings.targetGeographies },
    now: new Date(),
    companyModel: ((settings as Record<string, unknown>).companyModel as never) ?? null,
  };
  const targetTitles = parseRoleKeywords(settings);
  const targetSeniorities = mapSenioritiesForApollo(settings.targetSeniorities ?? []);

  const summary = initSummary();
  let errors = 0;
  const send = (e: TamEvent) => {
    if (e.type === "company.inserted") {
      if (summary.companiesInserted % 25 === 0)
        console.log(`  …inserted=${summary.companiesInserted} skipped=${summary.companiesSkipped} errors=${errors}`);
    } else if (e.type === "error" && (e.stage === "insert" || e.stage.startsWith("apollo"))) {
      errors++;
      if (errors <= 5) console.log(`  [err ${e.stage}] ${e.message}`);
    }
  };

  console.log(`Sourcing "${icp.name}" → tenant ${tenantId} (target=${targetCount}, maxPages=${maxPages})`);
  console.log("Apollo params:", JSON.stringify(strategy.filters));

  const work: Promise<void>[] = [];
  const limiter = createLimiter(MAX_CONCURRENT);
  for (let page = 1; page <= maxPages; page++) {
    if (summary.companiesInserted + work.length >= targetCount) break;
    const res = await searchOrganizations({ ...strategy.filters, page, per_page: APOLLO_PAGE_SIZE });
    summary.companiesFound += res.organizations.length;
    if (page === 1) console.log(`  Apollo total_entries=${res.pagination.total_entries}`);
    if (res.organizations.length === 0) break;
    for (const org of res.organizations) {
      if (summary.companiesInserted + work.length >= targetCount) break;
      work.push(limiter(() => runPerCompanyPipeline({
        search: org, tenantId, strategyLabel: strategy.label, ctx: signalCtx,
        existingDomains, ownDomain, targetTitles, targetSeniorities, send, summary,
      })));
    }
    if (res.organizations.length < APOLLO_PAGE_SIZE) break;
  }
  await Promise.allSettled(work);
  console.log(`Sourced: inserted=${summary.companiesInserted} skipped=${summary.companiesSkipped} contacts=${summary.contactsFound} errors=${errors}`);

  console.log("Recomputing fit matrix…");
  const r = await recomputeTenant(tenantId);
  console.log(`Recompute: companies=${r.companies} icps=${r.icps} cells=${r.cells}`);

  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
