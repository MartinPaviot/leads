import { inngest } from "./client";
import { buildDossier } from "@/lib/research/dossier-builder";
import logger from "@/lib/observability/logger";

/**
 * Inngest function for asynchronous dossier generation.
 *
 * Triggered by POST /api/research/dossier or by the chat tool
 * `buildCompanyDossier`. Runs the full dossier pipeline in the
 * background so the user's request returns immediately.
 */
export const generateDossier = inngest.createFunction(
  {
    id: "generate-dossier",
    name: "Generate Company Research Dossier",
    retries: 2,
    onFailure: async ({ error, event }) => {
      logger.error(
        `[DEAD LETTER] generate-dossier failed for ${(event as any).data?.companyNameOrDomain}:`,
        { error: error.message },
      );
    },
    triggers: [{ event: "research/build-dossier" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { companyNameOrDomain: string; tenantId: string } };
    step: any;
  }) => {
    const { companyNameOrDomain, tenantId } = event.data;

    const dossier = await step.run("build-dossier", async () => {
      return buildDossier(companyNameOrDomain, tenantId);
    });

    return {
      company: dossier.company.name,
      domain: dossier.company.domain,
      icpFitScore: dossier.icpFit.score,
      leadershipCount: dossier.leadership.length,
      sourcesCount: dossier.sources.length,
      generatedAt: dossier.generatedAt,
    };
  },
);
