import { describe, it, expect } from "vitest";
import {
  tamReducer,
  initialTamStreamState,
  type TamStreamState,
} from "@/hooks/use-tam-stream";
import type {
  CompanyCompact,
  EnrichmentPatch,
  ScorePayload,
  SignalPayload,
  TamEvent,
} from "@/lib/tam-stream/events";

// ─── Fixture helpers ───────────────────────────────────────────

function compact(id: string, name = "Acme"): CompanyCompact {
  return {
    id,
    name,
    domain: `${id}.com`,
    industry: "Software",
    size: "51-100",
    logoUrl: null,
    strategyLabel: "Direct ICP fit",
  };
}

function enrichment(): EnrichmentPatch {
  return {
    industry: "Software",
    size: "51-100",
    revenue: null,
    description: "desc",
    technologies: [],
  };
}

function score(value: number, grade: string = "C", heat = "Cool"): ScorePayload {
  return { score: value, grade, heat, reasons: [] };
}

function signal(value: boolean): SignalPayload {
  return {
    value,
    reason: value ? "matched" : "no match",
    sources: [],
    confidence: "high",
    computedAt: "2026-04-21T00:00:00Z",
  };
}

function reduce(state: TamStreamState, ...events: TamEvent[]): TamStreamState {
  return events.reduce(
    (s, ev) => tamReducer(s, { type: "event", event: ev }),
    state,
  );
}

function running(state: TamStreamState = initialTamStreamState): TamStreamState {
  return tamReducer(state, { type: "start" });
}

// ─── Tests ─────────────────────────────────────────────────────

describe("tamReducer", () => {
  it("start() enters running state", () => {
    const s = tamReducer(initialTamStreamState, { type: "start" });
    expect(s.isRunning).toBe(true);
    expect(s.terminated).toBeNull();
    expect(s.rows.size).toBe(0);
  });

  it("hello event stores jobId and startedAt", () => {
    const s = reduce(running(), {
      type: "hello",
      jobId: "job-1",
      tenantId: "t-1",
      startedAt: "2026-04-21T00:00:00Z",
    });
    expect(s.jobId).toBe("job-1");
    expect(s.startedAt).toBe("2026-04-21T00:00:00Z");
    expect(s.isRunning).toBe(true);
  });

  it("strategy.generated stores all strategies as not-done", () => {
    const s = reduce(running(), {
      type: "strategy.generated",
      strategies: [
        { label: "Direct", reasoning: "r1" },
        { label: "Adjacent", reasoning: "r2" },
      ],
    });
    expect(s.strategies).toHaveLength(2);
    expect(s.strategies.every((x) => !x.done)).toBe(true);
  });

  it("strategy.complete flips matching label to done", () => {
    const s = reduce(
      running(),
      {
        type: "strategy.generated",
        strategies: [
          { label: "Direct", reasoning: "" },
          { label: "Adjacent", reasoning: "" },
        ],
      },
      { type: "strategy.complete", label: "Direct", added: 10, skipped: 2 },
    );
    expect(s.strategies[0].done).toBe(true);
    expect(s.strategies[1].done).toBe(false);
  });

  it("company.inserted adds a row with initial score + signal", () => {
    const s = reduce(running(), {
      type: "company.inserted",
      company: compact("c1"),
      enrichment: enrichment(),
      initialScore: score(85, "A", "Burning"),
      initialSignal: { key: "funding_recent", payload: signal(true) },
    });
    expect(s.rows.size).toBe(1);
    expect(s.rowOrder).toEqual(["c1"]);
    expect(s.progress.insertedSoFar).toBe(1);
    expect(s.progress.aBurning).toBe(1);
    expect(s.progress.signalsLit.funding_recent).toBe(1);
    const row = s.rows.get("c1")!;
    expect(row.signals.funding_recent?.status).toBe("resolved");
    // Remaining signals start pending so the UI can render shimmer chips.
    expect(row.signals.investor_overlap?.status).toBe("pending");
  });

  it("company.inserted is idempotent — duplicate id does not double-count", () => {
    const ev: TamEvent = {
      type: "company.inserted",
      company: compact("c1"),
      enrichment: enrichment(),
      initialScore: score(50),
      initialSignal: null,
    };
    const s = reduce(running(), ev, ev, ev);
    expect(s.rows.size).toBe(1);
    expect(s.rowOrder).toEqual(["c1"]);
    expect(s.progress.insertedSoFar).toBe(1);
  });

  it("signal.computed resolves a pending slot and bumps counter when true", () => {
    const s = reduce(
      running(),
      {
        type: "company.inserted",
        company: compact("c1"),
        enrichment: enrichment(),
        initialScore: score(50),
        initialSignal: null,
      },
      {
        type: "signal.computed",
        companyId: "c1",
        key: "hiring_intent",
        payload: signal(true),
      },
    );
    const row = s.rows.get("c1")!;
    expect(row.signals.hiring_intent?.status).toBe("resolved");
    expect(s.progress.signalsLit.hiring_intent).toBe(1);
  });

  it("signal.computed is idempotent — re-firing a true signal does not double-count", () => {
    const base = reduce(running(), {
      type: "company.inserted",
      company: compact("c1"),
      enrichment: enrichment(),
      initialScore: score(50),
      initialSignal: null,
    });
    const once = reduce(base, {
      type: "signal.computed",
      companyId: "c1",
      key: "yc_company",
      payload: signal(true),
    });
    const twice = reduce(once, {
      type: "signal.computed",
      companyId: "c1",
      key: "yc_company",
      payload: signal(true),
    });
    expect(twice.progress.signalsLit.yc_company).toBe(1);
  });

  it("signal.computed on missing company id is a safe no-op", () => {
    const s = reduce(running(), {
      type: "signal.computed",
      companyId: "ghost",
      key: "yc_company",
      payload: signal(true),
    });
    expect(s.rows.size).toBe(0);
    expect(s.progress.signalsLit.yc_company).toBe(0);
  });

  it("company.scored updates score and maintains aBurning counter", () => {
    const base = reduce(running(), {
      type: "company.inserted",
      company: compact("c1"),
      enrichment: enrichment(),
      initialScore: score(65, "B", "Warm"),
      initialSignal: null,
    });
    expect(base.progress.aBurning).toBe(0);
    const upgraded = reduce(base, {
      type: "company.scored",
      companyId: "c1",
      score: score(90, "A", "Burning"),
    });
    expect(upgraded.progress.aBurning).toBe(1);
    const downgraded = reduce(upgraded, {
      type: "company.scored",
      companyId: "c1",
      score: score(55, "C", "Cool"),
    });
    expect(downgraded.progress.aBurning).toBe(0);
  });

  it("contacts.found replaces the contacts array on the row", () => {
    const s = reduce(
      running(),
      {
        type: "company.inserted",
        company: compact("c1"),
        enrichment: enrichment(),
        initialScore: score(50),
        initialSignal: null,
      },
      {
        type: "contacts.found",
        companyId: "c1",
        contacts: [
          {
            id: "p1",
            firstName: "Ada",
            lastName: "Lovelace",
            title: "CTO",
            email: "ada@c1.com",
            seniority: "c_suite",
          },
        ],
      },
    );
    expect(s.rows.get("c1")!.contacts).toHaveLength(1);
  });

  it("warm_path.computed stores paths on the row", () => {
    const s = reduce(
      running(),
      {
        type: "company.inserted",
        company: compact("c1"),
        enrichment: enrichment(),
        initialScore: score(50),
        initialSignal: null,
      },
      {
        type: "warm_path.computed",
        companyId: "c1",
        paths: [
          {
            viaUserId: "u1",
            viaUserName: "Martin",
            contactId: "p1",
            contactName: "Ada",
            contactTitle: "CTO",
            strength: 0.8,
          },
        ],
      },
    );
    expect(s.rows.get("c1")!.warmPaths).toHaveLength(1);
  });

  it("done flips to terminated:done with summary", () => {
    const s = reduce(running(), {
      type: "done",
      summary: {
        strategiesRun: 4,
        companiesFound: 300,
        companiesInserted: 281,
        companiesSkipped: 19,
        aBurningCount: 12,
        signalsLit: {
          investor_overlap: 3,
          funding_recent: 20,
          hiring_intent: 44,
          yc_company: 7,
        },
        warmPathsFound: 5,
        contactsFound: 60,
        durationMs: 65000,
      },
    });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("done");
    expect(s.summary?.companiesInserted).toBe(281);
  });

  it("error events accumulate without terminating", () => {
    const s = reduce(running(), {
      type: "error",
      companyId: "c1",
      stage: "signal:yc_company",
      message: "oops",
      recoverable: true,
    });
    expect(s.errors).toHaveLength(1);
    expect(s.isRunning).toBe(true);
  });

  it("stream_closed without prior done flips to terminated using error count", () => {
    const withError = reduce(running(), {
      type: "error",
      stage: "contacts",
      message: "deprecated endpoint",
      recoverable: true,
    });
    const closed = tamReducer(withError, { type: "stream_closed" });
    expect(closed.isRunning).toBe(false);
    expect(closed.terminated).toBe("error");
  });

  it("stream_closed when no errors → terminated:done", () => {
    const s = tamReducer(running(), { type: "stream_closed" });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("done");
  });

  it("stream_closed is a no-op when not running (idempotent on re-fire)", () => {
    const finalDone: TamStreamState = {
      ...initialTamStreamState,
      isRunning: false,
      terminated: "done",
    };
    const out = tamReducer(finalDone, { type: "stream_closed" });
    expect(out).toBe(finalDone);
  });

  it("cancel always terminates the run", () => {
    const s = tamReducer(running(), { type: "cancel" });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("cancelled");
  });

  it("stream_error terminates with error payload captured", () => {
    const s = tamReducer(running(), {
      type: "stream_error",
      message: "network dropped",
    });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("error");
    expect(s.errors[0].message).toBe("network dropped");
  });

  it("heartbeat is a no-op", () => {
    const before = running();
    const after = reduce(before, {
      type: "heartbeat",
      ts: "2026-04-21T00:00:00Z",
    });
    expect(after).toBe(before);
  });

  it("start() resets progress but preserves prior rows (so the merge stays stable between runs)", () => {
    const withRow = reduce(running(), {
      type: "company.inserted",
      company: compact("c1"),
      enrichment: enrichment(),
      initialScore: score(50),
      initialSignal: null,
    });
    const next = tamReducer(withRow, { type: "start" });
    expect(next.isRunning).toBe(true);
    expect(next.rows.size).toBe(1);
    expect(next.rowOrder).toEqual(["c1"]);
    expect(next.progress.insertedSoFar).toBe(0); // reset
    expect(next.summary).toBeNull();
  });
});
