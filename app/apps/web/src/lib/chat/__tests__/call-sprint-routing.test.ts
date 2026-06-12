import { describe, it, expect } from "vitest";
import { routeTools, getToolGroup } from "../tool-router";
import { orchestrate, getSpecialistTools } from "@/lib/agents/orchestrator";

/**
 * Guards that the call-sprint pair is REACHABLE: proposeCallSprint rides the
 * always-included query group (the preview must be available from any
 * phrasing), applyCallSprint is an action (write, role-gated upstream) that
 * the campaign/sprint intents route in. Mirrors new-tools-routing.test.ts.
 */

const STUB = {
  queryContacts: {},
  getCallList: {},
  proposeCallSprint: {},
  applyCallSprint: {},
  enrichCallSprint: {},
  draftEmail: {},
} as Record<string, unknown>;

function reachableTools(msg: string): Record<string, unknown> {
  const r = orchestrate(msg, STUB);
  return r.routed ? r.tools : routeTools(STUB, msg);
}

describe("call sprint — group membership", () => {
  it("maps the trio to the right groups in the router", () => {
    expect(getToolGroup("proposeCallSprint")).toBe("query");
    expect(getToolGroup("applyCallSprint")).toBe("action");
    expect(getToolGroup("enrichCallSprint")).toBe("action");
  });
});

describe("call sprint — routing", () => {
  it("always keeps proposeCallSprint available (query group)", () => {
    for (const msg of [
      "extrais les DG des EMS pour une call list",
      "create a deal",
      "update the stage",
      "who should I call today",
    ]) {
      expect("proposeCallSprint" in routeTools(STUB, msg), `present for: ${msg}`).toBe(true);
    }
  });

  it("routes applyCallSprint in for sprint/campaign wording and the default intent", () => {
    for (const msg of [
      "apply the sprint to my campaign",
      "lance le sprint EMS",
      "vas-y applique",
    ]) {
      expect("applyCallSprint" in reachableTools(msg), `reachable for: ${msg}`).toBe(true);
    }
  });

  it("every specialist keeps proposeCallSprint (query is in every specialist's groups)", () => {
    for (const s of ["research", "outreach", "deal", "data", "admin"] as const) {
      const tools = getSpecialistTools([s], STUB);
      expect("proposeCallSprint" in tools, `present for specialist: ${s}`).toBe(true);
    }
  });
});
