// @vitest-environment node
//
// Live integration for the agent_run store (spec 04, AC3). Proves logging +
// idempotency lookup against Postgres. Gated: AGENT_DB_TEST=1 with DATABASE_URL
// on a dev DB. Throwaway tenant cleaned up.
//
//   AGENT_DB_TEST=1 DATABASE_URL=<localdev> pnpm test agent/.*integration
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { tenants, agentRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbLogRun, dbFindRun } from "../default-deps";
import type { AgentRunRow } from "../types";

const RUN = process.env.AGENT_DB_TEST === "1";

describe.runIf(RUN)("agent_run store (live)", () => {
  it("logs a run, finds it by requestId, and is idempotent on (tenant, requestId)", async () => {
    const [t] = await db.insert(tenants).values({ name: "agent-test" }).returning({ id: tenants.id });
    const ws = t.id;
    const row: AgentRunRow = {
      tenantId: ws, kind: "demo", requestId: "req-1", input: { q: "hi" }, toolsCalled: ["searchAccounts"],
      output: { ok: true }, inputTokens: 10, outputTokens: 5, latencyMs: 42, evalPassed: true, evalReason: null, evalScore: 0.9,
    };
    try {
      await dbLogRun(row);
      const found = await dbFindRun(ws, "req-1");
      expect(found?.output).toEqual({ ok: true });
      expect(found?.toolsCalled).toEqual(["searchAccounts"]);
      expect(found?.evalPassed).toBe(true);

      // Idempotent — a second log with the same requestId does not duplicate.
      await dbLogRun({ ...row, output: { ok: false } });
      const rows = await db.select({ id: agentRuns.id, output: agentRuns.output }).from(agentRuns).where(eq(agentRuns.tenantId, ws));
      expect(rows.length).toBe(1);
      expect(rows[0].output).toEqual({ ok: true }); // first write wins
    } finally {
      await db.delete(agentRuns).where(eq(agentRuns.tenantId, ws));
      await db.delete(tenants).where(eq(tenants.id, ws));
    }
  });
});
