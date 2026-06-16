/**
 * GET /api/contacts/[id]/score-explain — the "why this grade", on demand.
 *
 * _specs/propensity-scoring A3/A4 surfacing. Read-only, one contact: re-derives
 * the matched ICP criteria via the SAME engine (computeBlendedFit), turns them +
 * reachability into an evidence-cited rationale, and computes a confidence
 * (coverage × freshness). No migration, no hot-path hook — it reads stored
 * artifacts and reuses tested pure cores.
 *
 * v1 omits person_titles (needs the title→persona LLM resolver, not run here),
 * so the rationale leans on firmographics + seniority + reachability; richer
 * real-time signals (with age) come when the propensity blend (Phase B) lands.
 */
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  computeBlendedFit,
  resolvePrimaryIcp,
  type CompanyContext,
} from "@/lib/icp/criteria-engine";
import { buildCompanyContext } from "@/lib/icp/company-context";
import { buildContactContext, CONTACT_SOURCING_ONLY } from "@/lib/scoring/contact-icp-fit";
import { getGrade } from "@/lib/scoring/scoring";
import { assembleScoreExplanation } from "@/lib/scoring/score-factors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  const { id } = await params;

  try {
    const [contact] = await db
      .select({
        id: contacts.id,
        score: contacts.score,
        properties: contacts.properties,
        companyId: contacts.companyId,
        phone: contacts.phone,
        email: contacts.email,
        lastEnrichedAt: contacts.lastEnrichedAt,
      })
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .limit(1);

    if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 });
    if (contact.score == null) {
      return Response.json({ grade: null, rationale: "Not scored yet", confidence: 0, factors: [] });
    }

    // Company context (empty when the contact has no linked company).
    let companyCtx: CompanyContext = {};
    if (contact.companyId) {
      const [company] = await db
        .select({
          industry: companies.industry,
          size: companies.size,
          revenue: companies.revenue,
          properties: companies.properties,
        })
        .from(companies)
        .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
        .limit(1);
      if (company) {
        companyCtx = buildCompanyContext({
          industry: company.industry,
          size: company.size,
          revenue: company.revenue,
          properties: company.properties as Record<string, unknown> | null,
        });
      }
    }
    const ctx = buildContactContext(companyCtx, {
      properties: contact.properties as Record<string, unknown> | null,
    });

    // Resolve the primary ICP: the stored one, else re-resolve over active ICPs.
    const activeIcps = await loadActiveIcps(authCtx.tenantId);
    const stored = contact.properties as { icp_fit?: { primaryIcpId?: string | null } } | null;
    const storedPrimaryId = stored?.icp_fit?.primaryIcpId ?? null;
    let primary = activeIcps.find((i) => i.id === storedPrimaryId);
    if (!primary && activeIcps.length > 0) {
      const cells = activeIcps.map((i) => ({
        icpId: i.id,
        priority: i.priority,
        fitScore: computeBlendedFit(i.criteria, ctx, CONTACT_SOURCING_ONLY).score01,
      }));
      const r = resolvePrimaryIcp(cells);
      primary = r ? activeIcps.find((i) => i.id === r.icpId) : undefined;
    }

    let matchedFieldKeys: string[] = [];
    let coverage = 0;
    if (primary) {
      const fit = computeBlendedFit(primary.criteria, ctx, CONTACT_SOURCING_ONLY);
      coverage = fit.coverage;
      const byId = new Map(primary.criteria.map((c) => [c.id, c]));
      matchedFieldKeys = fit.matched
        .map((cid) => byId.get(cid))
        .filter((c): c is NonNullable<typeof c> => !!c && !c.isRequired)
        .map((c) => c.fieldKey);
    }

    // Reachability facts (real, contact-level).
    const reachability: string[] = [];
    if (contact.phone) reachability.push("reachable");
    else if (contact.email) reachability.push("email on file");
    if (stored && (stored as { network?: unknown }).network === true) {
      reachability.push("in your network");
    }

    const out = assembleScoreExplanation({
      grade: getGrade(contact.score).grade,
      matchedFieldKeys,
      reachability,
      coverage,
      dataDates: [contact.lastEnrichedAt],
    });
    // Shadow propensity (computed by the recompute pass), surfaced for comparison
    // with the fit grade — not the grade itself yet.
    const propensity =
      (contact.properties as { propensity?: { score?: number } } | null)?.propensity?.score ?? null;
    return Response.json({ ...out, propensity });
  } catch (error) {
    console.error("score-explain failed:", error);
    return apiError("INTERNAL_ERROR", "Score explain failed");
  }
}
