/**
 * GET /api/onboarding/icp-prefill — pre-fill suggestion for Phase 1.
 *
 * P0-3 task 3.8. The wizard fires this on mount of phase 1 if the
 * user hasn't already filled in industry / size / buyerPersona —
 * the response gives a suggested ICP that the founder can accept
 * verbatim or edit.
 *
 * Resolution order :
 *   1. Read the founder's email from `users.email`.
 *   2. Strip the domain ; reject free-mail (gmail / outlook / etc.)
 *      so we don't synthesise a useless ICP for personal accounts.
 *   3. Look up `companies` by domain in the same tenant — if found,
 *      pull industry + size from that row.
 *   4. Resolve a vertical playbook from whatever industry text we
 *      have (or the company description as a fallback).
 *   5. Compose the suggestion via the pure helper.
 *
 * The route never throws on missing data — it falls back to
 * playbook-driven defaults so the founder always gets a non-empty
 * pre-fill they can edit.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { users, companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  buildIcpPrefill,
  domainToCompanyName,
  extractDomain,
  type CompanyForPrefill,
} from "@/lib/onboarding/icp-prefill";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Fetch the user's email so we can resolve the company domain.
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        eq(users.id, authCtx.appUserId),
        eq(users.tenantId, authCtx.tenantId),
      ),
    )
    .limit(1);

  const email = user?.email ?? null;
  const domain = extractDomain(email);

  // 2) Look up the company row in this tenant when we have a domain.
  let company: CompanyForPrefill | null = null;
  if (domain) {
    const [row] = await db
      .select({
        name: companies.name,
        domain: companies.domain,
        industry: companies.industry,
        size: companies.size,
        description: companies.description,
      })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, authCtx.tenantId),
          eq(companies.domain, domain),
        ),
      )
      .limit(1);

    if (row) {
      company = row;
    } else {
      // No company row yet — synth a minimal one from the domain so
      // the suggestion still feels personalised. Industry stays
      // null so the playbook resolver picks a default.
      company = {
        name: domainToCompanyName(domain),
        domain,
        industry: null,
        size: null,
        description: null,
      };
    }
  }

  // 3) Compose the suggestion. Pure helper handles every fallback.
  const suggestion = buildIcpPrefill(company);

  return Response.json({
    suggestion,
    /** Surface the resolved domain so the UI can show "From your
     *  company on file (acme.io)" — confirming where the values
     *  came from is just as important as the values themselves. */
    derivedFromDomain: domain,
    derivedFromCompany: company !== null,
  });
}
