import { describe, it, expect } from "vitest";
import {
  detectRegressions,
  evaluateRegressions,
  InMemoryAlertStore,
  type MetricSnapshot,
  type Alert,
  type AlertDeps,
} from "../index";

const snap = (current: MetricSnapshot["current"], baseline: MetricSnapshot["baseline"], scope = "camp1"): MetricSnapshot => ({ scope, current, baseline });

describe("detectRegressions — AC1 direction-aware", () => {
  it("flags a reply-rate drop beyond the threshold", () => {
    const r = detectRegressions(snap({ replyRate: 0.03 }, { replyRate: 0.06 })); // -50%
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ metric: "replyRate", cause: "content", route: "weekly" });
  });
  it("flags a bounce-rate rise beyond the threshold", () => {
    const r = detectRegressions(snap({ bounceRate: 0.05 }, { bounceRate: 0.02 })); // +150%
    expect(r[0]).toMatchObject({ metric: "bounceRate", cause: "deliverability", route: "guard" });
  });
  it("does not flag an improvement", () => {
    expect(detectRegressions(snap({ replyRate: 0.09 }, { replyRate: 0.06 }))).toEqual([]); // reply UP
    expect(detectRegressions(snap({ bounceRate: 0.01 }, { bounceRate: 0.02 }))).toEqual([]); // bounce DOWN
  });
  it("ignores a small change below the threshold", () => {
    expect(detectRegressions(snap({ replyRate: 0.055 }, { replyRate: 0.06 }))).toEqual([]); // -8% < 30%
  });
  it("AC5: a tighter per-workspace threshold catches a smaller drop", () => {
    expect(detectRegressions(snap({ replyRate: 0.055 }, { replyRate: 0.06 }), { threshold: 0.05 })).toHaveLength(1);
  });
  it("ignores metrics with a baseline below minBaseline", () => {
    expect(detectRegressions(snap({ spamRate: 0.01 }, { spamRate: 0.0001 }), { minBaseline: 0.001 })).toEqual([]);
  });
});

function deps(store = new InMemoryAlertStore()): { deps: AlertDeps; posted: Alert[]; resolved: Alert[]; store: InMemoryAlertStore } {
  const posted: Alert[] = [];
  const resolved: Alert[] = [];
  return { store, posted, resolved, deps: { store, postAlert: (a) => void posted.push(a), postResolved: (a) => void resolved.push(a) } };
}

describe("evaluateRegressions — AC2/AC3 fire, dedup, resolve", () => {
  it("fires a Slack alert on a new regression", async () => {
    const { deps: d, posted } = deps();
    const events = await evaluateRegressions(snap({ bounceRate: 0.06 }, { bounceRate: 0.02 }), d);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("firing");
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ metric: "bounceRate", route: "guard" });
  });

  it("dedupes a still-active regression (no second Slack post)", async () => {
    const { deps: d, posted } = deps();
    const s = snap({ bounceRate: 0.06 }, { bounceRate: 0.02 });
    await evaluateRegressions(s, d);
    const second = await evaluateRegressions(s, d);
    expect(second[0].status).toBe("deduped");
    expect(posted).toHaveLength(1); // not 2
  });

  it("resolves when the metric recovers", async () => {
    const { deps: d, resolved } = deps();
    await evaluateRegressions(snap({ bounceRate: 0.06 }, { bounceRate: 0.02 }), d); // fire
    const events = await evaluateRegressions(snap({ bounceRate: 0.02 }, { bounceRate: 0.02 }), d); // recovered
    expect(events.find((e) => e.status === "resolved")?.alert.metric).toBe("bounceRate");
    expect(resolved).toHaveLength(1);
    expect(await d.store.isActive("camp1:bounceRate")).toBe(false);
  });
});

describe("evaluateRegressions — AC4 routing", () => {
  it("routes a deliverability regression to the guard and a content one to weekly", async () => {
    const { deps: d } = deps();
    const events = await evaluateRegressions(snap({ bounceRate: 0.06, replyRate: 0.02 }, { bounceRate: 0.02, replyRate: 0.06 }), d);
    const byMetric = Object.fromEntries(events.map((e) => [e.alert.metric, e.alert.route]));
    expect(byMetric.bounceRate).toBe("guard");
    expect(byMetric.replyRate).toBe("weekly");
  });

  it("does not cross-resolve a different scope's active alert", async () => {
    const store = new InMemoryAlertStore();
    const { deps: d } = deps(store);
    await evaluateRegressions(snap({ bounceRate: 0.06 }, { bounceRate: 0.02 }, "campA"), d);
    // a healthy snapshot for campB must not resolve campA's alert
    await evaluateRegressions(snap({ bounceRate: 0.02 }, { bounceRate: 0.02 }, "campB"), d);
    expect(await store.isActive("campA:bounceRate")).toBe(true);
  });
});
