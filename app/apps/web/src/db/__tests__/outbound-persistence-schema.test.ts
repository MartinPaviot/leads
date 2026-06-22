import { describe, it, expect } from "vitest";
import { sequenceDrafts, outboundEmails, personalizationCalibration } from "@/db/schema/outbound";
import { intelligenceBriefs } from "@/db/schema/campaign";

/**
 * Migrations batch (P0-4 / P1-10 / P1-12 / P1-15) — the Drizzle schema must carry
 * the new columns/table so the deferred persistence code compiles + reads them.
 * The matching idempotent SQL is drizzle/manual/outbound-persistence-batch.sql.
 */
describe("outbound persistence batch — schema columns", () => {
  it("intelligence_briefs: firmographics + provenance (P1-10)", () => {
    expect(intelligenceBriefs.firmographics).toBeDefined();
    expect(intelligenceBriefs.firmographicProvenance).toBeDefined();
  });

  it("sequence_drafts: spam_* (P0-4) + quality_score (P1-15)", () => {
    expect(sequenceDrafts.spamScore).toBeDefined();
    expect(sequenceDrafts.spamSeverity).toBeDefined();
    expect(sequenceDrafts.spamWarnings).toBeDefined();
    expect(sequenceDrafts.qualityScore).toBeDefined();
  });

  it("outbound_emails: quality_score (P1-12)", () => {
    expect(outboundEmails.qualityScore).toBeDefined();
  });

  it("personalization_calibration: new table with key columns (P1-12)", () => {
    expect(personalizationCalibration.tenantId).toBeDefined();
    expect(personalizationCalibration.runDate).toBeDefined();
    expect(personalizationCalibration.buckets).toBeDefined();
    expect(personalizationCalibration.correlation).toBeDefined();
  });
});
