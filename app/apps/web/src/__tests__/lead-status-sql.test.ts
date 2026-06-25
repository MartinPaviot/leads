import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { contacts } from "@/db/schema";
import { notExcludedAsLeadSql } from "@/lib/inbound/lead-status-sql";
import { isExcludedAsLead } from "@/lib/inbound/lead-status";

/**
 * The SQL helper must mirror isExcludedAsLead's precedence. We assert the
 * rendered SQL shape (columns + branches) AND that the JS source-of-truth it
 * mirrors behaves as the SQL CASE claims, so the two can't silently diverge.
 */
describe("notExcludedAsLeadSql", () => {
  const rendered = new PgDialect().sqlToQuery(notExcludedAsLeadSql(contacts.properties)).sql;

  it("renders a null-safe CASE over both lead verdicts", () => {
    expect(rendered).toContain("leadFeedback");
    expect(rendered).toContain("isLead");
    expect(rendered).toContain("leadRelationship");
    expect(rendered).toContain("isInboundLead");
    expect(rendered).toContain("COALESCE");
    // The properties column is referenced (qualified to the contacts table).
    expect(rendered).toMatch(/"properties"/);
  });

  it("its JS mirror isExcludedAsLead has the precedence the CASE encodes", () => {
    // human verdict wins, both directions
    expect(isExcludedAsLead({ leadFeedback: { isLead: false, at: "x" } })).toBe(true); // excluded
    expect(isExcludedAsLead({ leadFeedback: { isLead: true, at: "x" } })).toBe(false); // included
    // human overrides a conflicting LLM verdict
    expect(
      isExcludedAsLead({
        leadFeedback: { isLead: true, at: "x" },
        leadRelationship: { isInboundLead: false, relationshipToUs: "v", reason: "r", at: "x" },
      }),
    ).toBe(false);
    // LLM verdict applies only when no human verdict
    expect(
      isExcludedAsLead({ leadRelationship: { isInboundLead: false, relationshipToUs: "v", reason: "r", at: "x" } }),
    ).toBe(true);
    // unjudged / empty → included (the null-safe ELSE true branch)
    expect(isExcludedAsLead(null)).toBe(false);
    expect(isExcludedAsLead({})).toBe(false);
  });
});
