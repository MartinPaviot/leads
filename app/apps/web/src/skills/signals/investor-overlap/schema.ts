import { z } from "zod";

export const investorOverlapInputSchema = z.object({
  /**
   * Optional subset of companies to score. When omitted, the handler
   * scans all companies in the tenant's TAM that don't already carry a
   * fresh `investorOverlap` stamp.
   */
  companyIds: z.array(z.string()).optional(),
  /**
   * If true, re-run detection even for companies already stamped. Useful
   * when the user updates their own cap table and wants the TAM re-
   * classified without waiting for the next cron.
   */
  force: z.boolean().default(false),
});

export type InvestorOverlapInput = z.infer<typeof investorOverlapInputSchema>;

export const investorOverlapOutputSchema = z.object({
  tenantInvestorCount: z.number(),
  companiesScanned: z.number(),
  companiesWithOverlap: z.number(),
  /**
   * Per-company details for the UI. Ordered by overlap strength (count
   * of matching investors) descending so the table can surface the
   * warmest warm-intro candidates first.
   */
  matches: z.array(z.object({
    companyId: z.string(),
    companyName: z.string(),
    commonInvestors: z.array(z.string()),
    strength: z.number().min(0).max(1),
  })),
});

export type InvestorOverlapOutput = z.infer<typeof investorOverlapOutputSchema>;
