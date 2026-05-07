import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import type { SkillRunOptions } from "@/skills/types";
import type { InvestorOverlapInput, InvestorOverlapOutput } from "./schema";

/**
 * Normalise investor names so "Founders Fund", "founders fund", and
 * "FOUNDERS FUND, LLC" all match. Strip legal suffixes and casing so the
 * overlap check is resilient to Apollo / user free-text variance.
 */
function normaliseInvestor(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(ventures?|partners?|capital|management|fund[s]?|llc|inc|ltd|co|llp)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Read the investor list for a single company. We look in three places,
 * in order of trust: explicit user override on `properties.investors`,
 * Apollo's `funding_rounds` array (when we've enriched through the
 * organizations endpoint), and — as last-ditch fallback — a comma-
 * separated blob on `properties.investorList`. Any of these may be
 * missing; callers tolerate an empty array.
 */
function readCompanyInvestors(props: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(props.investors)) {
    for (const v of props.investors) if (typeof v === "string") out.push(v);
  }
  if (Array.isArray(props.funding_rounds)) {
    for (const round of props.funding_rounds) {
      if (round && typeof round === "object") {
        const lead = (round as { lead_investor?: unknown }).lead_investor;
        if (typeof lead === "string") out.push(lead);
        const participants = (round as { investors?: unknown }).investors;
        if (Array.isArray(participants)) {
          for (const v of participants) if (typeof v === "string") out.push(v);
        }
      }
    }
  }
  if (typeof props.investorList === "string") {
    for (const part of props.investorList.split(",")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

export async function investorOverlapHandler(
  input: InvestorOverlapInput,
  options: SkillRunOptions,
): Promise<InvestorOverlapOutput> {
  const settings = await getTenantSettings(options.tenantId);
  const tenantInvestors = (settings.companyInvestors ?? []).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );

  if (tenantInvestors.length === 0) {
    // No cap-table declared → no overlap possible. Return cleanly
    // rather than raise so the chat flow can tell the user "add your
    // investors under Settings → Workspace to unlock this signal."
    return {
      tenantInvestorCount: 0,
      companiesScanned: 0,
      companiesWithOverlap: 0,
      matches: [],
    };
  }

  const tenantNormalised = new Set(tenantInvestors.map(normaliseInvestor));

  const conditions = [eq(companies.tenantId, options.tenantId)];
  if (input.companyIds && input.companyIds.length > 0) {
    conditions.push(inArray(companies.id, input.companyIds));
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      properties: companies.properties,
    })
    .from(companies)
    .where(and(...conditions));

  const matches: InvestorOverlapOutput["matches"] = [];
  let scanned = 0;

  for (const row of rows) {
    scanned++;
    const props = (row.properties ?? {}) as Record<string, unknown>;

    // Skip already-stamped rows unless caller asked to force a re-scan.
    // The stamp is written back onto `properties.investorOverlap` so a
    // re-run is a cheap O(1) check instead of re-parsing funding_rounds.
    const prior = props.investorOverlap as
      | { scannedAt?: string; commonInvestors?: string[] }
      | undefined;
    if (prior?.scannedAt && !input.force) {
      if (prior.commonInvestors && prior.commonInvestors.length > 0) {
        matches.push({
          companyId: row.id,
          companyName: row.name,
          commonInvestors: prior.commonInvestors,
          strength: Math.min(1, prior.commonInvestors.length / tenantInvestors.length),
        });
      }
      continue;
    }

    const companyInvestors = readCompanyInvestors(props);
    if (companyInvestors.length === 0) continue;

    const common: string[] = [];
    for (const raw of companyInvestors) {
      if (tenantNormalised.has(normaliseInvestor(raw))) {
        if (!common.includes(raw)) common.push(raw);
      }
    }

    // Stamp every scanned row — even zero-match ones — so the next cron
    // doesn't redo the normalisation. An empty array plus a timestamp
    // records "we looked, nothing to find."
    await db
      .update(companies)
      .set({
        properties: {
          ...props,
          investorOverlap: {
            scannedAt: new Date().toISOString(),
            commonInvestors: common,
            tenantInvestorCount: tenantInvestors.length,
          },
        },
      })
      .where(eq(companies.id, row.id));

    if (common.length > 0) {
      matches.push({
        companyId: row.id,
        companyName: row.name,
        commonInvestors: common,
        strength: Math.min(1, common.length / tenantInvestors.length),
      });
    }
  }

  matches.sort((a, b) => b.commonInvestors.length - a.commonInvestors.length);

  return {
    tenantInvestorCount: tenantInvestors.length,
    companiesScanned: scanned,
    companiesWithOverlap: matches.length,
    matches,
  };
}
