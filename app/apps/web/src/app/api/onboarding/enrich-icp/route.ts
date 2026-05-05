import { getAuthContext } from "@/lib/auth/auth-utils";
import { runSkill } from "@/skills/runner";
import { icpIdentificationSkill } from "@/skills/scoring/icp-identification";

/**
 * Enrich ICP using Apollo data during onboarding.
 * Called in parallel with analyze-website to get real company data
 * (funding, employee count, industry) alongside the website scraping.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain } = await req.json();
  if (!domain) {
    return Response.json({ error: "domain required" }, { status: 400 });
  }

  const result = await runSkill(icpIdentificationSkill, {
    companyDomain: domain,
  }, { tenantId: authCtx.tenantId, dryRun: false });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  return Response.json(result.data);
}
