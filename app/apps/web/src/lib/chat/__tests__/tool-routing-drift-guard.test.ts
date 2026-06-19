import { describe, it, expect } from "vitest";
import { getToolGroup, getRoutedToolNames } from "@/lib/chat/tool-router";
import { getOrchestratorToolGroup, getOrchestratorToolNames } from "@/lib/agents/orchestrator";
import type { ToolContext } from "@/lib/chat/tools";

/**
 * DRIFT-GUARD (CLE-01).
 * The two routing maps — tool-router.ts TOOL_GROUPS and orchestrator.ts
 * TOOL_GROUP_MAP — must stay total and mutually consistent over the LIVE
 * tool registry. filterToolsByGroups (tool-router) and getSpecialistTools
 * (orchestrator) FAIL-OPEN on unmapped tools, so an unmapped tool ships every
 * turn and silently defeats routing. This test removes that risk for known tools.
 *
 * Structure:
 *  - Part A (always runs): map-vs-map consistency — needs only the two router
 *    modules, no AI imports, so it runs locally and in CI.
 *  - Part B (live registry): enumerates buildAllChatTools. That import pulls the
 *    AI provider chain, which hits the local-only @ai-sdk/provider resolution
 *    flake (CI fine — reference_ci-health-and-test-flakes). We load it via a
 *    catchable dynamic import and skip Part B locally when it can't resolve.
 */

const KNOWN_GROUPS = new Set([
  "query", "create", "update", "action", "intelligence",
  "coaching", "skills", "memory", "briefing", "schema", "undo",
]);

// CLE-02 built runCustomSkill/listCustomSkills/forkSkill as real tools and
// removed the former PENDING_TOOLS allowlist — every mapped name is now a live
// registry key, so the live-registry phantom check (Part B) is fully strict.
const ROUTER_NAMES = getRoutedToolNames();
const ORCH_NAMES = getOrchestratorToolNames();

// Attempt the live registry. Dynamic import so a resolution failure rejects
// (catchable) instead of failing the whole suite at load.
let REGISTRY_NAMES: string[] | null = null;
try {
  const { buildAllChatTools } = await import("@/lib/chat/tools");
  const ctx = {
    tenantId: "t_test",
    userId: "u_test",
    authCtx: { tenantId: "t_test", appUserId: "u_test", role: "admin" },
    settings: {},
    agentApprovalMode: "review-each",
  } as unknown as ToolContext;
  REGISTRY_NAMES = Object.keys(buildAllChatTools(ctx)).sort();
} catch {
  REGISTRY_NAMES = null; // local @ai-sdk/provider flake — Part B runs in CI.
}

describe("tool-routing drift-guard — map consistency (Part A)", () => {
  it("every tool-router group is a known group (no typo groups)", () => {
    const bad = ROUTER_NAMES
      .map((n) => ({ n, g: getToolGroup(n) }))
      .filter(({ g }) => !g || !KNOWN_GROUPS.has(g));
    expect(bad, `bad tool-router groups: ${bad.map((b) => `${b.n}->${b.g}`).join(", ")}`).toEqual([]);
  });

  it("every orchestrator group is a known group (no typo groups)", () => {
    const bad = ORCH_NAMES
      .map((n) => ({ n, g: getOrchestratorToolGroup(n) }))
      .filter(({ g }) => !g || !KNOWN_GROUPS.has(g));
    expect(bad, `bad orchestrator groups: ${bad.map((b) => `${b.n}->${b.g}`).join(", ")}`).toEqual([]);
  });

  it("the two maps cover the SAME tool names", () => {
    const router = new Set(ROUTER_NAMES);
    const orch = new Set(ORCH_NAMES);
    const onlyRouter = [...router].filter((n) => !orch.has(n));
    const onlyOrch = [...orch].filter((n) => !router.has(n));
    expect(onlyRouter, `in tool-router but not orchestrator: ${onlyRouter.join(", ")}`).toEqual([]);
    expect(onlyOrch, `in orchestrator but not tool-router: ${onlyOrch.join(", ")}`).toEqual([]);
  });

  it("the two maps agree on the group for every shared tool", () => {
    const mismatched = ROUTER_NAMES
      .map((n) => ({ n, a: getToolGroup(n), b: getOrchestratorToolGroup(n) }))
      .filter(({ a, b }) => a !== b);
    expect(
      mismatched,
      `group mismatch: ${mismatched.map((m) => `${m.n} (${m.a} vs ${m.b})`).join(", ")}`,
    ).toEqual([]);
  });

  it("the formerly-unrouted tools landed in their intended groups", () => {
    const expected: Record<string, string> = {
      getBuyerIntentScore: "intelligence",
      getDealsAtRisk: "intelligence",
      getWinLossAnalysis: "intelligence",
      buildCompanyDossier: "intelligence",
      getRevenueForcast: "intelligence",
      mapDealStakeholders: "intelligence",
      searchTranscripts: "coaching",
      createWorkflow: "update",
      listWorkflows: "update",
      deleteWorkflow: "update",
      listProposalTemplates: "skills",
      fillProposal: "skills",
      executeCode: "intelligence",
    };
    for (const [name, group] of Object.entries(expected)) {
      expect(getToolGroup(name), `${name} tool-router group`).toBe(group);
      expect(getOrchestratorToolGroup(name), `${name} orchestrator group`).toBe(group);
    }
  });
});

describe.skipIf(REGISTRY_NAMES === null)("tool-routing drift-guard — live registry (Part B, CI)", () => {
  it("registry is non-trivially large (sanity floor)", () => {
    expect(REGISTRY_NAMES!.length).toBeGreaterThanOrEqual(150);
  });

  it("every live tool has a tool-router group", () => {
    const unmapped = REGISTRY_NAMES!.filter((n) => getToolGroup(n) === undefined);
    expect(unmapped, `unmapped in tool-router.ts: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("every live tool has an orchestrator group", () => {
    const unmapped = REGISTRY_NAMES!.filter((n) => getOrchestratorToolGroup(n) === undefined);
    expect(unmapped, `unmapped in orchestrator.ts: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("neither map has phantom keys beyond the live registry + pending allowlist", () => {
    const live = new Set(REGISTRY_NAMES!);
    const mapKeys = new Set<string>([...ROUTER_NAMES, ...ORCH_NAMES]);
    const phantom = [...mapKeys].filter((n) => !live.has(n));
    expect(phantom, `phantom map keys (mapped, not in registry): ${phantom.join(", ")}`).toEqual([]);
  });
});
