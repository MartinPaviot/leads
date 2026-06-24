// @vitest-environment node
//
// Live integration test for the canonical upsert path (spec 00, AC1/AC3/AC4/AC6
// end-to-end against a real Postgres). Gated: runs only when CANONICAL_DB_TEST=1
// and DATABASE_URL points at a dev DB. Creates a throwaway tenant and deletes it
// (+ its rows) in a finally block. The pure unit tests cover the logic; this
// proves the SQL (identity merge, vendor side map, precedence recompute) is real.
//
//   CANONICAL_DB_TEST=1 DATABASE_URL=<localdev> pnpm test upsert.integration
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { tenants, companies, accountFieldSource } from "@/db/schema";
import { eq } from "drizzle-orm";
import { upsertAccount } from "../upsert";
import { WorkspaceScopeError } from "../scoped";

const RUN = process.env.CANONICAL_DB_TEST === "1";

describe.runIf(RUN)("canonical upsert (live)", () => {
  it("creates, merges by registry id, applies provider precedence, isolates vendor ids", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "canonical-test-tenant" })
      .returning({ id: tenants.id });

    try {
      // 1. First write from a vendor (apollo).
      const a = await upsertAccount(tenant.id, {
        name: "Acme",
        domain: "acme-canon-test.fr",
        siren: "552 100 554",
        industry: "software",
        provider: "apollo",
        vendorIds: { apollo: "apollo-123" },
      });
      expect(a.identityKey).toBe("fr:552100554");
      expect((a.vendorIds as Record<string, string>).apollo).toBe("apollo-123");
      expect(a.industry).toBe("software");
      const cf1 = a.canonicalFields as Record<string, { value: unknown; provider: string }>;
      expect(cf1.name.value).toBe("Acme");
      expect(cf1.name.provider).toBe("apollo");

      // 2. Second write from manual, matched by SIREN → MERGE, not duplicate.
      const b = await upsertAccount(tenant.id, {
        siren: "552100554",
        name: "Acme Corporation",
        provider: "manual",
      });
      expect(b.id).toBe(a.id); // same record (AC3 merge)
      const cf2 = b.canonicalFields as Record<string, { value: unknown; provider: string }>;
      expect(cf2.name.value).toBe("Acme Corporation"); // manual beats apollo (AC6)
      expect(cf2.name.provider).toBe("manual");
      expect(b.name).toBe("Acme Corporation"); // scalar mirror updated
      expect(b.industry).toBe("software"); // untouched apollo field survives

      // Exactly one company row for this tenant.
      const rows = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenant.id));
      expect(rows.length).toBe(1);

      // 3. AC5 — a write without a workspace is rejected.
      await expect(upsertAccount("", { name: "x" })).rejects.toBeInstanceOf(WorkspaceScopeError);
    } finally {
      await db.delete(accountFieldSource).where(eq(accountFieldSource.tenantId, tenant.id));
      await db.delete(companies).where(eq(companies.tenantId, tenant.id));
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
    }
  });
});
