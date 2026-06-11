/**
 * Batch chaining in runEnrichStream — the stream endpoint processes at
 * most 100 companies per request, so the client chains sequential batch
 * requests into ONE continuous run: single start with the full total,
 * per-batch hello re-echoed with the full id list, per-batch summaries
 * summed into a single terminal done.
 */
import { describe, it, expect, vi } from "vitest";
import {
  runEnrichStream,
  enrichReducer,
  initialEnrichStreamState,
  type EnrichStreamAction,
  type EnrichStreamState,
} from "@/hooks/use-enrich-stream";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);

function ndjson(events: object[]): Response {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

/** A well-behaved server batch: hello, per-company start+done, terminal done. */
function batchEvents(
  batchIds: string[],
  jobId: string,
  summaryOverrides: Partial<{ enriched: number; alreadyComplete: number; noData: number; failed: number }> = {},
): object[] {
  const summary = {
    total: batchIds.length,
    enriched: summaryOverrides.enriched ?? batchIds.length,
    alreadyComplete: summaryOverrides.alreadyComplete ?? 0,
    noData: summaryOverrides.noData ?? 0,
    failed: summaryOverrides.failed ?? 0,
    durationMs: 5,
  };
  return [
    { type: "hello", jobId, companyIds: batchIds, criteria: ["industry"], startedAt: "t" },
    ...batchIds.flatMap((id) => [
      { type: "company.start", companyId: id },
      { type: "company.done", companyId: id, status: "enriched", provider: "apollo" },
    ]),
    { type: "done", summary },
  ];
}

function recorder() {
  const actions: EnrichStreamAction[] = [];
  return { actions, dispatch: (a: EnrichStreamAction) => actions.push(a) };
}

const doneActions = (actions: EnrichStreamAction[]) =>
  actions.filter((a) => a.type === "event" && a.event.type === "done");
const helloActions = (actions: EnrichStreamAction[]) =>
  actions.filter((a) => a.type === "event" && a.event.type === "hello");

describe("runEnrichStream batching", () => {
  it("a run within one batch keeps the single-request shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjson(batchEvents(ids(3), "j1")));
    const { actions, dispatch } = recorder();

    await runEnrichStream({
      req: { companyIds: ids(3), criteria: ["industry"] },
      dispatch,
      signal: new AbortController().signal,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(actions[0]).toEqual({ type: "start", total: 3 });
    expect(doneActions(actions)).toHaveLength(1);
    expect(actions[actions.length - 1]).toEqual({ type: "stream_closed" });
  });

  it("chains 250 ids into 100/100/50 batches under one continuous run", async () => {
    const all = ids(250);
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { companyIds: string[] };
      return ndjson(batchEvents(body.companyIds, `j-${body.companyIds.length}`, { enriched: body.companyIds.length - 1, noData: 1 }));
    });
    const { actions, dispatch } = recorder();

    await runEnrichStream({
      req: { companyIds: all, criteria: ["industry"] },
      dispatch,
      signal: new AbortController().signal,
      fetchImpl,
      batchSize: 100,
    });

    // Three requests carrying the exact consecutive slices.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const sent = fetchImpl.mock.calls.map(
      (c) => (JSON.parse(String((c[1] as RequestInit).body)) as { companyIds: string[] }).companyIds,
    );
    expect(sent.map((s) => s.length)).toEqual([100, 100, 50]);
    expect(sent[0][0]).toBe("c1");
    expect(sent[1][0]).toBe("c101");
    expect(sent[2][49]).toBe("c250");
    // The criteria ride along on every batch.
    for (const c of fetchImpl.mock.calls) {
      expect((JSON.parse(String((c[1] as RequestInit).body)) as { criteria: string[] }).criteria).toEqual(["industry"]);
    }

    // ONE start with the full total; every hello re-echoed with the full run.
    expect(actions.filter((a) => a.type === "start")).toEqual([{ type: "start", total: 250 }]);
    const hellos = helloActions(actions);
    expect(hellos).toHaveLength(3);
    for (const h of hellos) {
      expect(h.type === "event" && h.event.type === "hello" && h.event.companyIds).toHaveLength(250);
    }

    // ONE terminal done with the summed summary, then stream_closed last.
    const dones = doneActions(actions);
    expect(dones).toHaveLength(1);
    const d = dones[0];
    if (d.type === "event" && d.event.type === "done") {
      expect(d.event.summary.total).toBe(250);
      expect(d.event.summary.enriched).toBe(247); // (100-1) + (100-1) + (50-1)
      expect(d.event.summary.noData).toBe(3);
      expect(d.event.summary.failed).toBe(0);
    }
    expect(actions[actions.length - 1]).toEqual({ type: "stream_closed" });
    expect(actions[actions.length - 2]).toBe(dones[0]);
  });

  it("reducer integration: processed/total stay full-run across batches", async () => {
    const all = ids(250);
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { companyIds: string[] };
      return ndjson(batchEvents(body.companyIds, "j"));
    });

    let state: EnrichStreamState = initialEnrichStreamState;
    await runEnrichStream({
      req: { companyIds: all },
      dispatch: (a) => {
        state = enrichReducer(state, a);
        // The total never snaps down to a batch size mid-run.
        if (state.isRunning) expect(state.total).toBe(250);
      },
      signal: new AbortController().signal,
      fetchImpl,
      batchSize: 100,
    });

    expect(state.processed).toBe(250);
    expect(state.total).toBe(250);
    expect(state.isRunning).toBe(false);
    expect(state.terminated).toBe("done");
    expect(state.summary?.total).toBe(250);
    expect(state.companyStatus.get("c250")).toBe("enriched");
  });

  it("an abort stops the chain before the next batch fires", async () => {
    const ctrl = new AbortController();
    const fetchImpl = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body)) as { companyIds: string[] };
      return ndjson(batchEvents(body.companyIds, "j"));
    });
    const actions: EnrichStreamAction[] = [];

    await runEnrichStream({
      req: { companyIds: ids(250) },
      dispatch: (a) => {
        actions.push(a);
        // User cancels while batch 1 streams.
        if (a.type === "event" && a.event.type === "company.done") ctrl.abort();
      },
      signal: ctrl.signal,
      fetchImpl,
      batchSize: 100,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(actions[actions.length - 1]).toEqual({ type: "cancel" });
    expect(doneActions(actions)).toHaveLength(0);
    expect(actions.some((a) => a.type === "stream_closed")).toBe(false);
  });

  it("a mid-chain transport failure surfaces stream_error and stops", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String((init as RequestInit).body)) as { companyIds: string[] };
        return ndjson(batchEvents(body.companyIds, "j1"));
      })
      .mockResolvedValueOnce(new Response("Too many requests", { status: 429 }));
    const { actions, dispatch } = recorder();

    await runEnrichStream({
      req: { companyIds: ids(250) },
      dispatch,
      signal: new AbortController().signal,
      fetchImpl,
      batchSize: 100,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // batch 3 never fires
    expect(actions[actions.length - 1]).toEqual({ type: "stream_error", message: "Too many requests" });
    expect(doneActions(actions)).toHaveLength(0);
    // Batch 1's per-company progress still went through before the failure.
    expect(actions.some((a) => a.type === "event" && a.event.type === "company.done")).toBe(true);
  });
});
