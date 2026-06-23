// @vitest-environment node
//
// Live integration for the Postgres orchestration store (spec 03, AC2/AC5).
// Proves the run + gate lifecycle and decide-idempotency against Postgres.
// Gated: ORCH_DB_TEST=1 with DATABASE_URL on a dev DB. Inngest send is mocked so
// the test exercises only persistence. Throwaway tenant cleaned up.
//
//   ORCH_DB_TEST=1 DATABASE_URL=<localdev> pnpm test orchestration/.*integration
import { describe, it, expect, vi } from "vitest";

vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

import { db } from "@/db";
import { tenants, workflowRuns, approvalGates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dbOrchestrationStore as store } from "../db-store";

const RUN = process.env.ORCH_DB_TEST === "1";

describe.runIf(RUN)("DbOrchestrationStore (live)", () => {
  it("tracks run state + current_module and decides a gate idempotently", async () => {
    const [t] = await db.insert(tenants).values({ name: "orch-test" }).returning({ id: tenants.id });
    const ws = t.id;
    try {
      const runId = await store.createRun({ tenantId: ws, kind: "demo", payload: { a: 1 } });
      expect((await store.getRun(runId))?.state).toBe("running");

      await store.setCurrentModule(runId, "enrich");
      await store.setRunState(runId, "blocked");
      const r = await store.getRun(runId);
      expect(r).toEqual({ state: "blocked", currentModule: "enrich" });

      const gateId = await store.createGate({ tenantId: ws, runId, kind: "review", payload: { subject: "hi" } });
      expect((await store.getGate(gateId))?.decision).toBeNull();

      const first = await store.decideGate(gateId, { type: "edit", editedPayload: { subject: "edited" }, decidedBy: "u1" });
      expect(first.type).toBe("edit");
      const stored = await store.getGate(gateId);
      expect(stored?.decision?.type).toBe("edit");
      expect(stored?.decision?.editedPayload).toEqual({ subject: "edited" });

      // Idempotent — a second decision does not override the first.
      const second = await store.decideGate(gateId, { type: "reject" });
      expect(second.type).toBe("edit");
    } finally {
      await db.delete(approvalGates).where(eq(approvalGates.tenantId, ws));
      await db.delete(workflowRuns).where(eq(workflowRuns.tenantId, ws));
      await db.delete(tenants).where(eq(tenants.id, ws));
    }
  });
});
