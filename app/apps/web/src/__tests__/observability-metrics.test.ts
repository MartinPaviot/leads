import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  metrics,
  RecordingMetricsClient,
  setMetricsClient,
  resetMetricsClient,
} from "@/lib/observability/metrics";

describe("metrics primitive", () => {
  let recorder: RecordingMetricsClient;

  beforeEach(() => {
    recorder = new RecordingMetricsClient();
    setMetricsClient(recorder);
  });

  afterEach(() => {
    resetMetricsClient();
  });

  it("counts increment calls with normalised tags", () => {
    metrics.increment("deal_autofill.field_updated", {
      field: "budget",
      rule: "latest_wins",
      manual: false,
    });
    expect(recorder.counts).toHaveLength(1);
    expect(recorder.counts[0]).toEqual({
      name: "deal_autofill.field_updated",
      tags: { field: "budget", rule: "latest_wins", manual: "false" },
    });
  });

  it("strips undefined / null tags so cardinality stays clean", () => {
    metrics.increment("deal_autofill.field_updated", {
      field: "budget",
      confidence: undefined,
      session: null,
    });
    expect(recorder.counts[0].tags).toEqual({ field: "budget" });
  });

  it("returns undefined tags when all values were stripped", () => {
    metrics.increment("counter.empty", { all: undefined, gone: null });
    expect(recorder.counts[0].tags).toBeUndefined();
  });

  it("records histograms with numeric values", () => {
    metrics.histogram("deal_autofill.confidence", 0.92, {
      field: "team_size",
      source: "transcript",
    });
    expect(recorder.histograms).toHaveLength(1);
    expect(recorder.histograms[0]).toEqual({
      name: "deal_autofill.confidence",
      value: 0.92,
      tags: { field: "team_size", source: "transcript" },
    });
  });

  it("drops non-finite histogram values", () => {
    metrics.histogram("deal_autofill.confidence", NaN);
    metrics.histogram("deal_autofill.confidence", Infinity);
    metrics.histogram("deal_autofill.confidence", -Infinity);
    expect(recorder.histograms).toHaveLength(0);
  });

  it("flattens boolean and number tags to strings", () => {
    metrics.increment("test.metric", { active: true, count: 42 });
    expect(recorder.counts[0].tags).toEqual({ active: "true", count: "42" });
  });
});
