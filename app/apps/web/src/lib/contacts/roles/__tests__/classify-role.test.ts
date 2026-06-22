import { describe, it, expect, vi } from "vitest";
import {
  classifyRole,
  classifyByRules,
  ROLE_RULES,
  type RoleClassifyDeps,
  type AgentRoleResult,
} from "../classify-role";

describe("classifyByRules — AC1 transparent rule table", () => {
  it("top-tier seniority → decision-maker", () => {
    expect(classifyByRules({ seniority: "c_suite" })?.role_class).toBe("decision-maker");
    expect(classifyByRules({ seniority: "vp" })?.role_class).toBe("decision-maker");
    expect(classifyByRules({ seniority: "founder" })?.role_class).toBe("decision-maker");
  });
  it("a founder/chief title classifies even when seniority is missing", () => {
    expect(classifyByRules({ title: "Co-Founder & CEO" })?.role_class).toBe("decision-maker");
    expect(classifyByRules({ title: "Directeur Général" })?.role_class).toBe("decision-maker");
  });
  it("mid-management → champion", () => {
    expect(classifyByRules({ seniority: "manager" })?.role_class).toBe("champion");
    expect(classifyByRules({ title: "Head of Marketing" })?.role_class).toBe("champion");
  });
  it("individual contributor → user", () => {
    expect(classifyByRules({ seniority: "senior" })?.role_class).toBe("user");
    expect(classifyByRules({ seniority: "intern" })?.role_class).toBe("user");
  });
  it("returns null for an ambiguous contact (no seniority, uninformative title)", () => {
    expect(classifyByRules({ title: "Specialist", seniority: "" })).toBeNull();
  });
  it("the rule table is inspectable data the UI can render", () => {
    expect(ROLE_RULES.length).toBeGreaterThan(0);
    for (const r of ROLE_RULES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(["decision-maker", "champion", "user"]).toContain(r.role_class);
    }
  });
});

describe("classifyRole — AC3 override wins and persists", () => {
  it("an override beats the rule table and is sourced 'override'", async () => {
    const r = await classifyRole({ seniority: "intern" }, { override: "decision-maker" });
    expect(r).toMatchObject({ role_class: "decision-maker", source: "override" });
  });
  it("override is stable across repeated re-runs (idempotent)", async () => {
    const deps: RoleClassifyDeps = { override: "champion" };
    const a = await classifyRole({ seniority: "c_suite" }, deps);
    const b = await classifyRole({ seniority: "c_suite" }, deps);
    expect(a).toEqual(b);
    expect(a.role_class).toBe("champion");
  });
  it("an invalid override is ignored (falls through to the rules)", async () => {
    const r = await classifyRole({ seniority: "c_suite" }, { override: "garbage" as never });
    expect(r.source).toBe("rule");
    expect(r.role_class).toBe("decision-maker");
  });
});

describe("classifyRole — AC2 agent fallback on ambiguous", () => {
  const ambiguous = { title: "Specialist", seniority: "" };

  it("uses the agent when no rule matches and accepts a grounded, confident, valid answer", async () => {
    const runAgent = vi.fn(async (): Promise<AgentRoleResult> => ({
      evalPassed: true,
      value: { role_class: "user", rationale: "A Specialist is an individual contributor", confidence: 0.9 },
    }));
    const r = await classifyRole(ambiguous, { runAgent });
    expect(runAgent).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ role_class: "user", source: "agent" });
  });

  it("low confidence → needs-review (never a guess)", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => ({
      evalPassed: true,
      value: { role_class: "decision-maker", rationale: "Specialist sounds senior", confidence: 0.3 },
    });
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("needs-review");
  });

  it("a failed eval → needs-review", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => ({
      evalPassed: false,
      value: { role_class: "user", rationale: "Specialist is a user", confidence: 0.95 },
      reason: "eval failed",
    });
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("needs-review");
  });

  it("no agent configured → needs-review", async () => {
    expect((await classifyRole(ambiguous)).role_class).toBe("needs-review");
  });

  it("an agent throw → needs-review", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => { throw new Error("model down"); };
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("needs-review");
  });
});

describe("classifyRole — AC4 grounding + enum validity", () => {
  const ambiguous = { title: "Specialist", seniority: "" };

  it("rejects an ungrounded rationale even at high confidence (valid enum, empty reasoning)", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => ({
      evalPassed: true,
      value: { role_class: "decision-maker", rationale: "I think so", confidence: 0.99 },
    });
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("needs-review");
  });

  it("rejects an invalid enum from the agent", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => ({
      evalPassed: true,
      value: { role_class: "buyer", rationale: "Specialist is a buyer", confidence: 0.99 },
    });
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("needs-review");
  });

  it("accepts a rationale grounded in the title token", async () => {
    const runAgent = async (): Promise<AgentRoleResult> => ({
      evalPassed: true,
      value: { role_class: "user", rationale: "A specialist role is hands-on, an end user of the product", confidence: 0.8 },
    });
    expect((await classifyRole(ambiguous, { runAgent })).role_class).toBe("user");
  });
});
