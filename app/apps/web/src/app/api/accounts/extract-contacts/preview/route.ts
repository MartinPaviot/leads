import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { searchPeople, isApolloAvailable } from "@/lib/integrations/apollo-client";
import { getIcpPersonTargeting } from "@/lib/icp/person-targeting";
import { partitionAccountsForPreview } from "@/lib/accounts/sourcing-preview";

/**
 * POST /api/accounts/extract-contacts/preview  { accountIds: string[] }
 *
 * Dry-run companion to extract-contacts: shows WHO would be sourced before any
 * write, so the user can validate against their ICP and not "partir n'importe
 * où". Returns:
 *   - targeting: the ICP person titles/seniorities that WILL be searched
 *   - summary + accounts: in-ICP / out-of-ICP / unscored / no-domain partition
 *   - samples: a live Apollo sample (exact count + a few real people) for the
 *     top few in-ICP accounts (the hybrid preview)
 *
 * Creates nothing. Gated like the write it precedes (it spends Apollo credits).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const denied = requirePermission(authCtx.role, "contacts:write");
  if (denied) return denied;

  let body: { accountIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const accountIds = Array.isArray(body.accountIds)
    ? body.accountIds.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
  if (accountIds.length === 0) {
    return Response.json({ error: "accountIds array required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      score: companies.score,
    })
    .from(companies)
    .where(
      and(
        eq(companies.tenantId, authCtx.tenantId),
        inArray(companies.id, accountIds),
        isNull(companies.deletedAt),
      ),
    );

  const { accounts, summary, sampleAccountIds } = partitionAccountsForPreview(
    rows.map((r) => ({ id: r.id, name: r.name, domain: r.domain, score: r.score })),
  );

  const targeting = await getIcpPersonTargeting(authCtx.tenantId);
  const apolloAvailable = isApolloAvailable();

  const samples: Array<{
    accountId: string;
    name: string;
    totalFound: number;
    people: Array<{
      firstName: string | null;
      lastName: string | null;
      title: string | null;
      seniority: string | null;
      hasEmail: boolean;
    }>;
  }> = [];

  if (apolloAvailable) {
    const byId = new Map(accounts.map((a) => [a.accountId, a]));
    for (const id of sampleAccountIds) {
      const a = byId.get(id);
      if (!a?.domain) continue;
      try {
        const res = await searchPeople({
          q_organization_domains: a.domain,
          person_titles: targeting.titles,
          person_seniorities: targeting.seniorities,
          per_page: 5,
        });
        samples.push({
          accountId: a.accountId,
          name: a.name,
          totalFound: res.pagination?.total_entries ?? res.people.length,
          people: res.people.slice(0, 5).map((p) => ({
            firstName: p.first_name?.trim() || null,
            lastName: p.last_name?.trim() || null,
            title: p.title?.trim() || null,
            seniority: p.seniority || null,
            hasEmail: !!(
              p.email &&
              !p.email.includes("email_not_unlocked") &&
              !p.email.includes("domain.com")
            ),
          })),
        });
      } catch (err) {
        console.warn(`sourcing-preview: Apollo sample failed for ${a.domain}`, err);
      }
    }
  }

  return Response.json({
    targeting: {
      titles: targeting.titles ?? [],
      seniorities: targeting.seniorities ?? [],
      source: targeting.source,
    },
    summary,
    accounts,
    samples,
    apolloAvailable,
  });
}
