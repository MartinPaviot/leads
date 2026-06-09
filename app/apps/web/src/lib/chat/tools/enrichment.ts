import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { loadCompanyRow, enrichOneCompany } from "@/lib/enrichment/enrich-company-row";
import {
  ENRICHMENT_CRITERIA,
  BASE_CRITERIA_KEYS,
  getCriterion,
  type EnrichmentCriterion,
} from "@/lib/providers/company-enrichment/criteria";
import { enqueueFullEnrichForContacts } from "@/lib/integrations/fullenrich-enqueue";

/**
 * Enrichment tools — wire the chat into the SAME live providers the
 * Accounts "Enrich" UI and the Contacts "Find mobile" action use:
 *  - enrichAccount  → the company-enrichment waterfall (Apollo + the
 *    keyless EU/CH/FR providers SIRENE/Pappers/Zefix, geo-sorted, then
 *    LLM fallback), persisted via enrichOneCompany.
 *  - findContactMobile → FullEnrich's async EU mobile+email pass.
 * Both perform the real action — they are not proposal-only cards.
 */
export function buildEnrichmentTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    enrichAccount: makeTool({
      description:
        `Enrich an ACCOUNT/company with real firmographics from the provider waterfall (Apollo + keyless SIRENE/Pappers for FR, Zefix for CH, geo-sorted by domain, LLM fallback). Fills missing industry, size, revenue, description, location, founding year, funding, technologies — only the requested criteria, never overwriting existing values — and persists them. Use when the user says "enrich this account/company", "fill in the firmographics for X", "what industry/size is this company". Returns a precise per-criterion outcome (filled / already-present / not-found).`,
      inputSchema: z.object({
        accountId: z.string().describe("The account/company id to enrich"),
        criteria: z
          .array(z.string())
          .optional()
          .describe(
            `Specific firmographic criteria to fill. Allowed keys: ${ENRICHMENT_CRITERIA.map((c) => c.key).join(", ")}. Omit to fill the base set (${BASE_CRITERIA_KEYS.join(", ")}).`,
          ),
      }),
      execute: async (input) => {
        const company = await loadCompanyRow(input.accountId, tenantId);
        if (!company) return { error: "Account not found" };

        const keys = input.criteria && input.criteria.length > 0 ? input.criteria : [...BASE_CRITERIA_KEYS];
        const requestedCriteria = keys
          .map((k) => getCriterion(k))
          .filter((c): c is EnrichmentCriterion => Boolean(c));
        if (requestedCriteria.length === 0) {
          return { error: `No valid criteria. Allowed: ${ENRICHMENT_CRITERIA.map((c) => c.key).join(", ")}` };
        }

        const outcome = await enrichOneCompany({ company, requestedCriteria, tenantId });
        return {
          accountId: company.id,
          accountName: company.name,
          status: outcome.status,
          provider: outcome.provider,
          criteria: outcome.criteria.map((c) => ({ field: c.label, outcome: c.outcome, value: c.value })),
        };
      },
    }),

    findContactMobile: makeTool({
      description:
        `Find a contact's mobile phone (and verified email) via FullEnrich — the deeper EU/FR/CH pass that runs when Apollo/Kaspr/Lusha missed a number. ASYNC: this fires the request and the mobile/email lands on the contact when results arrive (usually under a minute), so confirm it's "in progress" rather than reporting a number immediately. Needs first+last name + a company (or a LinkedIn URL) on the contact. Use when the user asks "find their mobile", "get a phone number for X", "find a cell for this contact".`,
      inputSchema: z.object({
        contactIds: z
          .array(z.string())
          .min(1)
          .describe("One or more contact ids to find mobiles for (cap 100)"),
      }),
      execute: async (input) => {
        const baseUrl =
          process.env.FULLENRICH_CALLBACK_BASE_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://www.elevay.dev";
        const result = await enqueueFullEnrichForContacts({
          tenantId,
          contactIds: input.contactIds,
          baseUrl,
        });
        if (!result.ok) return { error: result.error };
        return {
          async: true,
          requested: result.requested,
          skipped: result.skipped,
          message:
            `Requested mobile + email enrichment for ${result.requested} contact${result.requested === 1 ? "" : "s"} via FullEnrich. Results land on the contact${result.requested === 1 ? "" : "s"} when they arrive — typically within a minute.`,
        };
      },
    }),
  };
}
