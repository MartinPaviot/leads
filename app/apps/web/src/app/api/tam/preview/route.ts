import { withAuthRLS } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { personaIcpToCriteria, type PersonaIcp } from "@/lib/icp/flat-to-criteria";
import { listAvailableDiscoverySources } from "@/lib/discovery/registry";

/**
 * POST /api/tam/preview
 *
 * Evidence-backed targeting preview — the "is this really the target I
 * typed?" check. Given the current NL/persona ICP (flat shape, same as
 * /api/tam/estimate), runs each AVAILABLE discovery source and returns a
 * SAMPLE of real matching companies per source, so the user can SEE the
 * target before sourcing — and compare Apollo's fuzzy keyword match
 * against the registries' exact NAF match side by side.
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const rl = await checkRateLimit("llm", authCtx.userId);
    if (rl) return rl;

    const body = (await req.json().catch(() => ({}))) as PersonaIcp;
    const criteria = personaIcpToCriteria(body);
    if (criteria.length === 0) {
      return Response.json({
        sources: [],
        criteria: [],
        note: "Describe a target first",
      });
    }

    const sources = listAvailableDiscoverySources();
    const results = await Promise.all(
      sources.map(async (s) => {
        try {
          const candidates = await s.search({
            tenantId: authCtx.tenantId,
            icpName: "preview",
            criteria,
            limit: 6,
          });
          return {
            source: s.name,
            sample: candidates.slice(0, 5).map((c) => ({
              name: c.name,
              domain: c.domain,
              industry: c.industry,
            })),
            more: candidates.length > 5,
          };
        } catch (e) {
          return {
            source: s.name,
            sample: [],
            error: (e as Error)?.message?.slice(0, 140) ?? "failed",
          };
        }
      }),
    );

    return Response.json({
      sources: results,
      criteria: criteria.map((c) => ({
        field: c.fieldKey,
        op: c.operator,
        value: c.value,
      })),
    });
  });
}
