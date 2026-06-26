import { describe, it, expect } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { sql, eq } from "drizzle-orm";
import { sequenceEnrollments, sequences, deals } from "@/db/schema";
import { weeklyEnrollmentWhere, openDealValueSql, openDealCountSql } from "../_summary-metrics";

// Pure SQL generation (no DB connection): asserts the route's tenant-scoping and
// deal-stage semantics directly on the helpers the route uses.
const qb = new QueryBuilder();

function enrollmentSql(where: ReturnType<typeof weeklyEnrollmentWhere>): string {
  return qb
    .select({ count: sql<number>`count(*)::int` })
    .from(sequenceEnrollments)
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(where)
    .toSQL()
    .sql.toLowerCase();
}

describe("dashboard summary — tenant scoping + deal-stage semantics", () => {
  it("weekly enrollment count is confined to the tenant via the sequences join (closes the cross-tenant leak)", () => {
    const text = enrollmentSql(weeklyEnrollmentWhere("t1", new Date("2026-06-01")));
    expect(text).toContain('"sequences"'); // the join that makes tenant scoping possible
    expect(text).toContain("tenant_id"); // the tenant predicate — the fix
    expect(text).toContain("enrolled_at");
  });

  it("prev-week variant keeps the tenant scope and adds the upper bound", () => {
    const text = enrollmentSql(
      weeklyEnrollmentWhere("t1", new Date("2026-05-25"), new Date("2026-06-01"))
    );
    expect(text).toContain("tenant_id");
    // both gte + lte bounds present
    expect((text.match(/enrolled_at/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("pipeline value excludes terminal won/lost deals", () => {
    const text = qb.select({ x: openDealValueSql }).from(deals).toSQL().sql.toLowerCase();
    expect(text).toContain("case when");
    expect(text).toContain("'won'");
    expect(text).toContain("'lost'");
    expect(text).toContain("sum(");
  });

  it("active-deal count excludes terminal won/lost deals", () => {
    const text = qb.select({ x: openDealCountSql }).from(deals).toSQL().sql.toLowerCase();
    expect(text).toContain("case when");
    expect(text).toContain("'won'");
    expect(text).toContain("'lost'");
  });
});
