/**
 * Postgres OrchestrationStore (spec 03, AC2/AC5). Persists workflow_runs +
 * approval_gate. decideGate is idempotent (only the first decision sticks) and
 * emits the gate.decided event that resumes the blocked run.
 */
import { db } from "@/db";
import { workflowRuns, approvalGates } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import type {
  OrchestrationStore,
  CreateRunParams,
  CreateGateParams,
  GateDecisionInput,
  GateRecord,
  RunState,
} from "./gate";

export class DbOrchestrationStore implements OrchestrationStore {
  async createRun(p: CreateRunParams): Promise<string> {
    const [row] = await db
      .insert(workflowRuns)
      .values({
        tenantId: p.tenantId,
        kind: p.kind,
        state: "running",
        payload: (p.payload ?? {}) as never,
        inngestEventId: p.inngestEventId ?? null,
      })
      .returning({ id: workflowRuns.id });
    return row.id;
  }

  async getRun(runId: string) {
    const [row] = await db
      .select({ state: workflowRuns.state, currentModule: workflowRuns.currentModule })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    return row ? { state: row.state as RunState, currentModule: row.currentModule } : null;
  }

  async setRunState(runId: string, state: RunState): Promise<void> {
    await db.update(workflowRuns).set({ state, updatedAt: sql`now()` }).where(eq(workflowRuns.id, runId));
  }

  async setCurrentModule(runId: string, module: string): Promise<void> {
    await db.update(workflowRuns).set({ currentModule: module, updatedAt: sql`now()` }).where(eq(workflowRuns.id, runId));
  }

  async createGate(p: CreateGateParams): Promise<string> {
    const [row] = await db
      .insert(approvalGates)
      .values({ tenantId: p.tenantId, runId: p.runId, kind: p.kind, payload: (p.payload ?? {}) as never })
      .returning({ id: approvalGates.id });
    return row.id;
  }

  async decideGate(gateId: string, decision: GateDecisionInput): Promise<GateDecisionInput> {
    // Only the first decision sticks (decision IS NULL guard).
    const updated = await db
      .update(approvalGates)
      .set({
        decision: decision.type,
        editedPayload: (decision.editedPayload ?? null) as never,
        reason: decision.reason ?? null,
        decidedBy: decision.decidedBy ?? null,
        decidedAt: sql`now()`,
      })
      .where(and(eq(approvalGates.id, gateId), isNull(approvalGates.decision)))
      .returning({ id: approvalGates.id });

    if (updated.length > 0) {
      // Resume the blocked run.
      await inngest.send({ name: "gate.decided", data: { gateId } });
      return decision;
    }
    // Already decided — return the persisted decision.
    const g = await this.getGate(gateId);
    return g?.decision ?? decision;
  }

  async getGate(gateId: string): Promise<GateRecord | null> {
    const [row] = await db.select().from(approvalGates).where(eq(approvalGates.id, gateId)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      runId: row.runId,
      kind: row.kind,
      payload: row.payload,
      decision: row.decision
        ? { type: row.decision as GateDecisionInput["type"], editedPayload: row.editedPayload ?? undefined, reason: row.reason ?? undefined, decidedBy: row.decidedBy ?? undefined }
        : null,
    };
  }
}

export const dbOrchestrationStore = new DbOrchestrationStore();
