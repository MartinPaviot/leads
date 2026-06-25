/**
 * Spec 36 (T11, ICP plan B) — run the Apollo TAM build and PERSIST it through the
 * canonical layer. The tam-builder skill stays pure (returns a scored list); this
 * orchestrator writes companies via upsertAccount(provider="apollo") and the
 * persona via upsertContact(provider="apollo", companyId), mirroring
 * sourceFromSalesNav. Apollo supplies the funding filter the Elevay ICP needs
 * (seed+Series-A raised <2y) that Sales-Nav can't; both providers converge on the
 * same canonical rows (dedup by domain / normalized linkedin_url / email), so the
 * sourced contacts' linkedin_url then matches the seat's relations → warm-path graph.
 *
 * Pure mappers are unit-tested; the loop + Apollo/DB calls are integration glue.
 */

import { tamBuilderHandler } from "@/skills/enrichment/tam-builder/handler";
import type { TamBuilderInput, TamBuilderOutput } from "@/skills/enrichment/tam-builder/schema";
import { upsertAccount, upsertContact, type UpsertAccountInput, type UpsertContactInput } from "@/db/canonical/upsert";
import { linkedinPath } from "@/db/canonical/identity";

const APOLLO = "apollo";

type TamCompany = TamBuilderOutput["companies"][number];
type TamPerson = TamBuilderOutput["watchlist"][number];

/** Hard funding-stage gate (Apollo can't filter stage server-side, so post-filter
 * on the returned latest_funding_stage). Empty list = no gate. Pure. */
export function passesFundingStage(fundingStage: string | null, requireStages: string[]): boolean {
  if (requireStages.length === 0) return true;
  if (!fundingStage) return false;
  const s = fundingStage.toLowerCase();
  return requireStages.some((r) => s.includes(r.toLowerCase()));
}

/** Map a scored TAM company to a canonical account upsert (provider=apollo). Pure. */
export function tamCompanyToAccountInput(c: TamCompany): UpsertAccountInput {
  return {
    name: c.name,
    domain: c.domain ?? undefined,
    industry: c.industry ?? undefined,
    provider: APOLLO,
    vendorIds: { apollo: c.apolloId },
  };
}

/** Map a watchlist person to a canonical contact upsert (provider=apollo),
 * normalizing linkedin_url on write so it dedups with Sales-Nav + matches
 * relations (cohabitation fix #3). Pure. */
export function tamPersonToContactInput(p: TamPerson, companyId: string | undefined): UpsertContactInput {
  return {
    email: p.email ?? undefined,
    linkedinUrl: (linkedinPath(p.linkedinUrl) ?? undefined) || undefined,
    firstName: p.firstName ?? undefined,
    lastName: p.lastName ?? undefined,
    title: p.title ?? undefined,
    companyId,
    provider: APOLLO,
    vendorIds: { apollo: p.apolloId },
  };
}

export interface BuildAndPersistTamOptions {
  /** Hard funding-stage filter, e.g. ["seed","series a"]. Empty = no gate. */
  requireFundingStages?: string[];
}

export interface BuildAndPersistTamResult {
  companiesFound: number;
  accountsUpserted: number;
  contactsUpserted: number;
  contactsSkippedNoIdentity: number;
}

/**
 * Run the TAM build, post-filter by funding stage, and persist canonically.
 * Accounts first (so contacts can link by companyId via the shared Apollo domain).
 */
export async function buildAndPersistTam(
  tenantId: string,
  input: TamBuilderInput,
  opts: BuildAndPersistTamOptions = {},
): Promise<BuildAndPersistTamResult> {
  const requireStages = opts.requireFundingStages ?? [];
  const out = await tamBuilderHandler(input, { tenantId, dryRun: false });

  const domainToCompanyId = new Map<string, string>();
  let accountsUpserted = 0;
  for (const company of out.companies) {
    if (!company.domain) continue;
    if (!passesFundingStage(company.fundingStage, requireStages)) continue;
    const acc = await upsertAccount(tenantId, tamCompanyToAccountInput(company));
    if (acc?.id) {
      domainToCompanyId.set(company.domain, acc.id);
      accountsUpserted++;
    }
  }

  let contactsUpserted = 0;
  let contactsSkippedNoIdentity = 0;
  for (const person of out.watchlist) {
    // The person belongs to a company; only persist if that company survived the
    // funding gate (its domain is in the map).
    const companyId = person.companyDomain ? domainToCompanyId.get(person.companyDomain) : undefined;
    if (person.companyDomain && !companyId) continue; // company filtered out
    const input2 = tamPersonToContactInput(person, companyId);
    if (!input2.email && !input2.linkedinUrl) {
      contactsSkippedNoIdentity++;
      continue;
    }
    await upsertContact(tenantId, input2);
    contactsUpserted++;
  }

  return {
    companiesFound: out.companies.length,
    accountsUpserted,
    contactsUpserted,
    contactsSkippedNoIdentity,
  };
}
