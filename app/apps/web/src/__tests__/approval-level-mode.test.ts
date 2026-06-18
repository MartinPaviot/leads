/**
 * CLE-10 T17 — autonomy level → ApprovalModeV2 derivation + the single resolver.
 *
 * `deriveApprovalModeFromLevel` is the pure level→mode map (trust gates strategic
 * relaxation). `resolveEffectiveMode` is the ONE read path the control plane uses:
 * level-derived when an autonomy_config row exists, else the stored mode via
 * readApprovalMode (EC-4 legacy tenants).
 */
import { describe, it, expect } from "vitest";
import {
  deriveApprovalModeFromLevel,
  resolveEffectiveMode,
} from "@/lib/guardrails/approval-mode";

describe("deriveApprovalModeFromLevel", () => {
  it("copilot → review-each (relax:false)", () => {
    expect(deriveApprovalModeFromLevel("copilot", 100)).toEqual({ mode: "review-each", relaxThresholds: false });
  });
  it("guided → review-each (relax:false) — conservative, batch deferred", () => {
    expect(deriveApprovalModeFromLevel("guided", 100)).toEqual({ mode: "review-each", relaxThresholds: false });
  });
  it("autonomous → auto-high-confidence, relax:false regardless of trust", () => {
    expect(deriveApprovalModeFromLevel("autonomous", 100)).toEqual({ mode: "auto-high-confidence", relaxThresholds: false });
    expect(deriveApprovalModeFromLevel("autonomous", 0)).toEqual({ mode: "auto-high-confidence", relaxThresholds: false });
  });
  it("strategic @ trust 80 → auto-high-confidence, relax:true", () => {
    expect(deriveApprovalModeFromLevel("strategic", 80)).toEqual({ mode: "auto-high-confidence", relaxThresholds: true });
  });
  it("strategic @ trust 79 → auto-high-confidence, relax:false (belt-and-braces trust gate)", () => {
    expect(deriveApprovalModeFromLevel("strategic", 79)).toEqual({ mode: "auto-high-confidence", relaxThresholds: false });
  });
});

describe("resolveEffectiveMode", () => {
  it("row present → level-derived mode (ignores stored agentApprovalMode)", () => {
    const r = resolveEffectiveMode({
      settings: { agentApprovalMode: "review-each" },
      level: "autonomous",
      trustOverall: 50,
    });
    expect(r.mode).toBe("auto-high-confidence");
  });
  it("strategic row + trust 80 → relaxed", () => {
    const r = resolveEffectiveMode({
      settings: { agentApprovalMode: "review-each" },
      level: "strategic",
      trustOverall: 80,
    });
    expect(r).toEqual({ mode: "auto-high-confidence", relaxThresholds: true });
  });
  it("no row (null/undefined level) → falls back to readApprovalMode(settings)", () => {
    const r = resolveEffectiveMode({ settings: { agentApprovalMode: "batch-daily" }, level: null });
    expect(r).toEqual({ mode: "batch-daily", relaxThresholds: false });
  });
  it("no row + legacy stored 'ask' → coerced review-each", () => {
    const r = resolveEffectiveMode({ settings: { agentApprovalMode: "ask" } });
    expect(r).toEqual({ mode: "review-each", relaxThresholds: false });
  });
  it("no row + legacy stored 'auto' → coerced auto-high-confidence", () => {
    const r = resolveEffectiveMode({ settings: { agentApprovalMode: "auto" }, level: undefined });
    expect(r.mode).toBe("auto-high-confidence");
  });
  it("trustOverall defaults to 50 when omitted (strategic stays unrelaxed)", () => {
    const r = resolveEffectiveMode({ settings: { agentApprovalMode: "review-each" }, level: "strategic" });
    expect(r).toEqual({ mode: "auto-high-confidence", relaxThresholds: false });
  });
});
