import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for the asymmetry the call/visio audit found: the Recall/Jibri
// meeting webhook + manual-confirm paths all funnel through processPostCall,
// which never emitted "coaching/post-interaction" — so recorded meetings fed
// neither coaching insights nor playbook extraction (calls already did). This
// pins that processPostCall emits the event exactly once on a real run, and
// NOT on the idempotent already-processed path.

const h = vi.hoisted(() => ({
  sendMock: vi.fn(() => Promise.resolve()),
  state: { selectN: 0, activity: null as unknown },
}));

vi.mock("@/inngest/client", () => ({ inngest: { send: h.sendMock } }));

vi.mock("@/db", () => {
  function chain(val: unknown): Record<string, unknown> {
    const p = Promise.resolve(val);
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy", "set", "values", "onConflictDoNothing"]) c[m] = () => c;
    c.returning = () => chain([{ id: "task-1" }]);
    c.then = p.then.bind(p);
    c.catch = p.catch.bind(p);
    c.finally = p.finally.bind(p);
    return c;
  }
  return {
    db: {
      select: () => {
        h.state.selectN++;
        return chain(h.state.selectN === 1 ? (h.state.activity ? [h.state.activity] : []) : []);
      },
      insert: () => chain([{ id: "task-1" }]),
      update: () => chain(undefined),
    },
  };
});

vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateText: vi.fn(async () => ({ text: "" })) }));
vi.mock("./meeting-crm", () => ({ applyMeetingQualificationToCrm: vi.fn(async () => ({})) }));
vi.mock("@/lib/deals/deal-autofill", () => ({ autofillDealFromIntelligence: vi.fn(async () => ({})) }));

import { processPostCall } from "../post-call";

const baseActivity = {
  id: "act-1",
  tenantId: "t1",
  entityType: "contact",
  entityId: "c1",
  summary: "Sync with Paul",
  metadata: { structuredNotes: { actionItems: [], buyingSignals: {}, decisions: [], participants: [] } },
};

const minimalOpts = { activityId: "act-1", tenantId: "t1", userId: "u1", createTasks: false, updateDeal: false, generateFollowUp: false };

describe("processPostCall — coaching/post-interaction emit", () => {
  beforeEach(() => {
    h.sendMock.mockClear();
    h.state.selectN = 0;
    h.state.activity = baseActivity;
  });

  it("emits coaching/post-interaction exactly once on a real run", async () => {
    const r = await processPostCall(minimalOpts as never);
    expect(r.success).toBe(true);
    expect(h.sendMock).toHaveBeenCalledTimes(1);
    expect(h.sendMock).toHaveBeenCalledWith({
      name: "coaching/post-interaction",
      data: { tenantId: "t1", activityId: "act-1", userId: "u1" },
    });
  });

  it("does NOT emit on the idempotent already-processed path", async () => {
    h.state.activity = { ...baseActivity, metadata: { ...baseActivity.metadata, postCallProcessedAt: "2026-01-01T00:00:00Z" } };
    const r = await processPostCall({ activityId: "act-1", tenantId: "t1", userId: "u1" } as never);
    expect(r.alreadyProcessed).toBe(true);
    expect(h.sendMock).not.toHaveBeenCalled();
  });

  it("does NOT emit when the activity is missing", async () => {
    h.state.activity = null;
    const r = await processPostCall({ activityId: "missing", tenantId: "t1", userId: "u1" } as never);
    expect(r.notFound).toBe(true);
    expect(h.sendMock).not.toHaveBeenCalled();
  });

  it("does NOT emit when the activity has no structured notes", async () => {
    h.state.activity = { ...baseActivity, metadata: {} };
    const r = await processPostCall({ activityId: "act-1", tenantId: "t1", userId: "u1" } as never);
    expect(r.noNotes).toBe(true);
    expect(h.sendMock).not.toHaveBeenCalled();
  });
});
