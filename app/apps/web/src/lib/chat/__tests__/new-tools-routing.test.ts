import { describe, it, expect } from "vitest";
import { detectIntent, routeTools, getToolGroup } from "../tool-router";
import { orchestrate, getSpecialistTools } from "@/lib/agents/orchestrator";

/**
 * Mirror exactly what api/chat/route.ts does: use the orchestrator's
 * specialist tools when it routed confidently, else fall back to
 * intent-based routeTools. This is the real "is the tool reachable?" path.
 */
function reachableTools(msg: string): Record<string, unknown> {
  const r = orchestrate(msg, STUB);
  return r.routed ? r.tools : routeTools(STUB, msg);
}

/**
 * Guards that the Part-2 tools (enrichAccount, findContactMobile,
 * getCallList) are actually REACHABLE — grouped correctly and routed in
 * for the phrases users say. A tool the router silently drops is dead
 * weight no matter how well it's wired underneath.
 */

// Minimal stub registry — routeTools/getSpecialistTools only check names.
const STUB = {
  queryContacts: {},
  queryAccounts: {},
  draftEmail: {},
  enrichContact: {},
  enrichAccount: {},
  findContactMobile: {},
  getCallList: {},
} as Record<string, unknown>;

describe("new tools — group membership", () => {
  it("maps the new tools to the right groups", () => {
    expect(getToolGroup("enrichAccount")).toBe("skills");
    expect(getToolGroup("findContactMobile")).toBe("skills");
    expect(getToolGroup("getCallList")).toBe("query");
  });
});

describe("new tools — intent routing (routeTools)", () => {
  it("routes enrichAccount in for an account-enrich request", () => {
    const tools = routeTools(STUB, "enrich this account");
    expect("enrichAccount" in tools).toBe(true);
  });

  it("routes findContactMobile in for a mobile/phone request", () => {
    for (const msg of ["find their mobile", "get me a phone number for Sarah", "find a cell for this contact"]) {
      const tools = routeTools(STUB, msg);
      expect("findContactMobile" in tools, `routed for: ${msg}`).toBe(true);
    }
  });

  it("always keeps getCallList available (query group is always included)", () => {
    for (const msg of ["who should I call today", "create a deal", "update the stage"]) {
      const tools = routeTools(STUB, msg);
      expect("getCallList" in tools, `present for: ${msg}`).toBe(true);
    }
  });
});

describe("new tools — orchestrator specialist routing", () => {
  it("keeps the enrichment tools reachable end-to-end (orchestrator route OR routeTools fallback)", () => {
    // Whether the orchestrator routes confidently or falls back, the tool
    // must survive into the set the model actually receives.
    expect("findContactMobile" in reachableTools("find their mobile number")).toBe(true);
    expect("enrichAccount" in reachableTools("enrich this account")).toBe(true);
  });

  it("research specialist tools include the enrichment tools", () => {
    const tools = getSpecialistTools(["research"], STUB);
    expect("enrichAccount" in tools).toBe(true);
    expect("findContactMobile" in tools).toBe(true);
  });

  it("every specialist keeps getCallList (query is in every specialist's groups)", () => {
    for (const s of ["research", "outreach", "deal", "data", "admin"] as const) {
      const tools = getSpecialistTools([s], STUB);
      expect("getCallList" in tools, `present for specialist: ${s}`).toBe(true);
    }
  });
});
