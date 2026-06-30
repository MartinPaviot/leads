// @vitest-environment node
//
// Live DB integration test for reserveDailyViews — the atomic single-UPDATE cap
// is where a jsonb_set nested-path no-op bug once hid (silently defeating the
// cap), so the SQL itself needs a real-schema test, not just live-verification.
// Gated: runs only when LINKEDIN_VIEW_BUDGET_DB_TEST=1 and DATABASE_URL points at
// a dev DB. Creates a throwaway tenant + seat and deletes them in finally. The
// pure dailyViewCap() parsing is covered by view-budget.test.ts.
//
//   LINKEDIN_VIEW_BUDGET_DB_TEST=1 DATABASE_URL=<localdev> pnpm test view-budget.integration
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { tenants, linkedinAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reserveDailyViews } from "../view-budget";

const RUN = process.env.LINKEDIN_VIEW_BUDGET_DB_TEST === "1";

describe.runIf(RUN)("reserveDailyViews (live DB)", () => {
  it("atomically caps per UTC day, persists spent, and fail-closes a missing seat", async () => {
    const [tenant] = await db.insert(tenants).values({ name: "li-view-budget-test" }).returning({ id: tenants.id });
    const seatUid = "view-budget-test-uid-" + tenant.id;
    const [seat] = await db
      .insert(linkedinAccount)
      .values({ tenantId: tenant.id, userId: "u-test", unipileAccountId: seatUid, status: "connected" })
      .returning({ id: linkedinAccount.id });
    try {
      // cap=4, amount=2 → true, true, then exhausted (false). The cap applies on
      // the first probe too (fresh-day branch still checks amount ≤ cap).
      expect(await reserveDailyViews(seatUid, 2, 4)).toBe(true);
      expect(await reserveDailyViews(seatUid, 2, 4)).toBe(true);
      expect(await reserveDailyViews(seatUid, 2, 4)).toBe(false);

      const [row] = await db
        .select({ hd: linkedinAccount.healthDetail })
        .from(linkedinAccount)
        .where(eq(linkedinAccount.id, seat.id));
      expect((row?.hd as { viewBudget?: { day?: string; spent?: number } })?.viewBudget?.spent).toBe(4);

      // amount > cap on a fresh seat must be refused (no overshoot).
      const other = "view-budget-test-uid2-" + tenant.id;
      const [seat2] = await db
        .insert(linkedinAccount)
        .values({ tenantId: tenant.id, userId: "u-test-2", unipileAccountId: other, status: "connected" })
        .returning({ id: linkedinAccount.id });
      expect(await reserveDailyViews(other, 10, 4)).toBe(false);
      await db.delete(linkedinAccount).where(eq(linkedinAccount.id, seat2.id));

      // A seat that doesn't exist fails closed (no spend against an unknown id).
      expect(await reserveDailyViews("no-such-seat-xyz", 1, 99)).toBe(false);
    } finally {
      await db.delete(linkedinAccount).where(eq(linkedinAccount.tenantId, tenant.id));
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
    }
  });
});
