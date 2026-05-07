import { z } from "zod";

export const signalScannerInputSchema = z.object({
  companyIds: z.array(z.string()).min(1).max(200).describe("Elevay company IDs to scan for signals"),
  signalTypes: z.array(z.enum([
    "hiring",
    "funding",
    "leadership_change",
    "tech_adoption",
    "expansion",
    "engagement_spike",
    "deal_stall",
    "competitor_mention",
  ])).default(["hiring", "funding", "engagement_spike", "deal_stall"]),
  lookbackDays: z.number().min(1).max(90).default(30),
});

export type SignalScannerInput = z.infer<typeof signalScannerInputSchema>;

const signalSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  signalType: z.string(),
  title: z.string(),
  description: z.string(),
  strength: z.enum(["high", "medium", "low"]),
  detectedAt: z.string(),
  dataSource: z.string(),
  // MONACO-PARITY-01 additions — fully optional for back-compat with
  // existing callers/tests. New emit paths populate them; the
  // confidence-state classifier in `lib/signals/confidence-state.ts`
  // turns them into the 4-state UI badge.
  /** Cited URL evidence, e.g. a LinkedIn post or news article. Null
   *  for property-derived signals (funding from Apollo) where the
   *  source is internal data, not a public link. */
  sourceUrl: z.string().url().nullable().optional(),
  /** LLM-reported confidence 0-1 for signals where the LLM emitted
   *  the candidate. Null for rule-based signals (engagement spike,
   *  property thresholds) that are deterministic. */
  confidence: z.number().min(0).max(1).nullable().optional(),
  /** Result of running `verifySignalUrl` against `sourceUrl`. Null
   *  when no URL was cited. The downstream classifier combines this
   *  with `confidence` to produce the 4-state badge. */
  verificationStatus: z
    .enum(["verified", "unverified"])
    .nullable()
    .optional(),
});

export const signalScannerOutputSchema = z.object({
  totalCompaniesScanned: z.number(),
  totalSignalsDetected: z.number(),
  signals: z.array(signalSchema),
  companiesWithSignals: z.number(),
});

export type SignalScannerOutput = z.infer<typeof signalScannerOutputSchema>;
