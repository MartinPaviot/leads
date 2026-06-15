import { describe, it, expect } from "vitest";
import {
  generateOpener,
  tamSignalsToAngleSignals,
} from "@/lib/scoring/signal-opener";

describe("tamSignalsToAngleSignals", () => {
  it("maps fired TAM signals to angle taxonomy, skips unfired", () => {
    const out = tamSignalsToAngleSignals({
      funding_recent: { value: true, confidence: "high", reason: "Raised 4mo ago" },
      hiring_intent: { value: true, confidence: "medium", reason: "12 open roles" },
      investor_overlap: { value: false },
      unknown_signal: { value: true },
    });
    const types = out.map((s) => s.type).sort();
    expect(types).toEqual(["funding", "hiring"]);
    expect(out.find((s) => s.title === "funding_recent")?.relevance).toBe("high");
  });

  it("never maps yc_company — a static trait is not an outreach moment (§19)", () => {
    const out = tamSignalsToAngleSignals({
      yc_company: { value: true, confidence: "high", reason: "S23" },
    });
    expect(out).toEqual([]);
  });

  it("maps investor_overlap to its own warm-path angle, never funding", () => {
    const out = tamSignalsToAngleSignals({
      investor_overlap: { value: true, confidence: "high", reason: "Backed by Founders Fund too" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("common_investor");
  });

  it("drops a stale payload (computedAt beyond the type's TTL)", () => {
    const asOf = new Date("2026-06-12T00:00:00Z");
    const out = tamSignalsToAngleSignals(
      {
        // hiring TTL is 30 days — 90 days old is a fossil.
        hiring_intent: { value: true, confidence: "high", computedAt: "2026-03-14T00:00:00Z" },
        // funding TTL is 180 days — 90 days old is still fresh.
        funding_recent: { value: true, confidence: "high", computedAt: "2026-03-14T00:00:00Z" },
      },
      asOf,
    );
    expect(out.map((s) => s.type)).toEqual(["funding"]);
  });

  it("keeps a legacy payload without computedAt (no retroactive purge)", () => {
    const out = tamSignalsToAngleSignals({
      hiring_intent: { value: true, confidence: "medium", reason: "legacy row" },
    });
    expect(out.map((s) => s.type)).toEqual(["hiring"]);
  });

  it("warm path has no TTL — an old investor_overlap stays usable", () => {
    const asOf = new Date("2026-06-12T00:00:00Z");
    const out = tamSignalsToAngleSignals(
      { investor_overlap: { value: true, confidence: "high", computedAt: "2025-01-01T00:00:00Z" } },
      asOf,
    );
    expect(out.map((s) => s.type)).toEqual(["common_investor"]);
  });

  it("fails closed on an unparsable computedAt for TTL'd types", () => {
    const out = tamSignalsToAngleSignals({
      hiring_intent: { value: true, confidence: "high", computedAt: "not-a-date" },
    });
    expect(out).toEqual([]);
  });
});

describe("generateOpener", () => {
  it("uses the strongest signal and fills the angle template (funding/BASHO)", () => {
    const r = generateOpener({
      companyName: "Acme",
      seniority: "c-suite",
      signals: tamSignalsToAngleSignals({ funding_recent: { value: true, confidence: "high" } }),
      product: "incident response",
      fields: { fundingDetail: "a $12M Series A four months ago", inferredArea: "scaling engineering", painPoint: "on-call alert fatigue" },
    });
    expect(r.angle).toBe("funding");
    expect(r.signalUsed).toBe("funding_recent");
    expect(r.methodology).toBe("BASHO");
    expect(r.maxWords).toBe(80);
    expect(r.opener).toContain("$12M Series A");
    expect(r.opener).toContain("on-call alert fatigue");
    expect(r.opener).not.toContain("{"); // no leftover placeholders
  });

  it("prefers the warm path over every cold angle (common_investor > funding)", () => {
    const r = generateOpener({
      companyName: "Acme",
      seniority: "c-suite",
      signals: tamSignalsToAngleSignals({
        funding_recent: { value: true, confidence: "high" },
        investor_overlap: { value: true, confidence: "high", reason: "Shared seed investor" },
      }),
    });
    expect(r.angle).toBe("common_investor");
    expect(r.opener).toContain("Acme");
    expect(r.opener).not.toMatch(/\{[a-z]+\}/i);
    // The warm-path template must never fabricate a raise.
    expect(r.opener.toLowerCase()).not.toContain("raise");
  });

  it("prefers funding over hiring (priority + relevance)", () => {
    const r = generateOpener({
      companyName: "Acme",
      seniority: "vp",
      signals: tamSignalsToAngleSignals({
        funding_recent: { value: true, confidence: "high" },
        hiring_intent: { value: true, confidence: "high" },
      }),
    });
    expect(r.angle).toBe("funding");
    expect(r.methodology).toBe("Challenger"); // vp
  });

  it("routes hiring signal to the hiring angle", () => {
    const r = generateOpener({
      companyName: "Acme",
      seniority: "director",
      signals: tamSignalsToAngleSignals({ hiring_intent: { value: true, confidence: "high" } }),
      fields: { department: "data engineering", inferredPain: "pipeline reliability" },
    });
    expect(r.angle).toBe("hiring");
    expect(r.opener).toContain("data engineering");
    expect(r.opener).not.toContain("{");
  });

  it("falls back to a methodology-shaped opener when no signal fired", () => {
    const r = generateOpener({
      companyName: "Acme",
      seniority: "senior",
      signals: [],
      product: "observability",
    });
    expect(r.signalUsed).toBeNull();
    expect(r.angle).toBeNull();
    expect(r.methodology).toBe("Product-Led");
    expect(r.opener.length).toBeGreaterThan(0);
    expect(r.opener).not.toContain("{");
  });

  it("never leaks an unfilled placeholder even with sparse fields", () => {
    const r = generateOpener({
      companyName: "Globex",
      seniority: "head",
      signals: tamSignalsToAngleSignals({ hiring_intent: { value: true, confidence: "low" } }),
    });
    // The core guarantee: no raw {placeholder} survives, even with no fields.
    expect(r.opener).not.toMatch(/\{[a-z]+\}/i);
    expect(r.opener.length).toBeGreaterThan(0);
  });

  it("injects the company name when the angle template references it (leadership_change)", () => {
    const r = generateOpener({
      companyName: "Globex",
      seniority: "c-suite",
      signals: [{ type: "leadership_change", relevance: "high", title: "leadership_change", description: "" }],
      fields: { role: "CTO", category: "observability" },
    });
    expect(r.opener).toContain("Globex");
    expect(r.opener).not.toMatch(/\{[a-z]+\}/i);
  });
});
