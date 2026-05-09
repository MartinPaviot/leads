import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchPeople, isApolloAvailable } from "@/lib/integrations/apollo-client";
import { getTenantSettings, deriveTargetRoles } from "@/lib/config/tenant-settings";

/** Derive Apollo seniority filters from targetRoles text (e.g. "VP Engineering, CTO") */
function deriveSeniorities(targetRoles: string): string[] {
  const lower = targetRoles.toLowerCase();
  const seniorities = new Set<string>();

  if (/\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcro\b|\bcmo\b|\bc-suite\b|\bchief\b/.test(lower)) seniorities.add("c_suite");
  if (/\bfounder\b|\bco-founder\b|\bowner\b/.test(lower)) seniorities.add("founder");
  if (/\bvp\b|\bvice president\b/.test(lower)) seniorities.add("vp");
  if (/\bdirector\b|\bhead of\b/.test(lower)) seniorities.add("director");
  if (/\bmanager\b/.test(lower)) seniorities.add("manager");
  if (/\bsenior\b|\blead\b|\bprincipal\b/.test(lower)) seniorities.add("senior");

  return seniorities.size > 0 ? Array.from(seniorities) : ["c_suite", "vp", "director", "founder"];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [company] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, id),
        eq(companies.tenantId, authCtx.tenantId),
        isNull(companies.deletedAt),
      ),
    )
    .limit(1);

  if (!company) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Load tenant ICP for seniority targeting
  const settings = await getTenantSettings(authCtx.tenantId);
  // BUG-WS0-008: derive targetRoles at read time
  const targetRoles = deriveTargetRoles(settings);
  const seniorities = deriveSeniorities(targetRoles);

  // Apollo-only — no LLM fallback for contact suggestions
  if (isApolloAvailable() && company.domain) {
    try {
      const personTitles = targetRoles ? targetRoles.split(/[,;]/).map((r) => r.trim()).filter(Boolean) : undefined;
      const result = await searchPeople({
        q_organization_domains: company.domain,
        person_seniorities: seniorities,
        person_titles: personTitles,
        per_page: 10,
      });

      const suggestions = result.people.map((p) => ({
        name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
        title: p.title || "Unknown",
        email: p.email || null,
        linkedinUrl: p.linkedin_url || null,
        seniority: p.seniority || null,
        departments: p.departments || [],
        city: p.city || null,
        country: p.country || null,
        apolloId: p.id,
        source: "apollo",
        reason: `${p.seniority || "Senior"} ${p.title || "leader"} at ${company.name} — likely involved in purchasing decisions`,
      }));

      return Response.json({ suggestions, source: "apollo" });
    } catch (err) {
      console.warn("Apollo people search failed:", err);
    }
  }

  // No LLM fallback — only return real contacts from Apollo
  return Response.json({
    suggestions: [],
    source: "unavailable",
    message: !isApolloAvailable()
      ? "Apollo API key required for contact suggestions"
      : !company.domain
        ? "No domain available for this account"
        : "Apollo search returned no results",
  });
}
