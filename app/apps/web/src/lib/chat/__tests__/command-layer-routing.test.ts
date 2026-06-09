import { describe, it, expect } from "vitest";
import { routeTools, getToolGroup } from "../tool-router";
import { orchestrate, getSpecialistTools } from "@/lib/agents/orchestrator";

/**
 * The command + read-gap tools must be REACHABLE everywhere: they're mapped to
 * the "query" group, which tool-router always includes and every orchestrator
 * specialist owns. A tool the router silently drops can never fire a directive.
 */

const COMMAND_TOOLS = ["openRecord", "openListView", "composeEmail"] as const;
const READ_GAP_TOOLS = ["querySequences", "getMailboxHealth", "queryProposals"] as const;
const ALL_NEW = [...COMMAND_TOOLS, ...READ_GAP_TOOLS];

const STUB = Object.fromEntries(
  [...ALL_NEW, "queryContacts", "draftEmail"].map((n) => [n, {}]),
) as Record<string, unknown>;

function reachableTools(msg: string): Record<string, unknown> {
  const r = orchestrate(msg, STUB);
  return r.routed ? r.tools : routeTools(STUB, msg);
}

describe("command layer — group membership", () => {
  it("maps every new tool to the always-on 'query' group", () => {
    for (const name of ALL_NEW) {
      expect(getToolGroup(name), `${name} group`).toBe("query");
    }
  });
});

describe("command layer — always reachable via routeTools", () => {
  it("keeps every new tool present regardless of detected intent", () => {
    for (const msg of [
      "open Acme",
      "go to my pipeline",
      "draft an email and open it",
      "how are my campaigns doing",
      "why aren't my emails sending",
      "list my proposals",
      "create a deal", // unrelated intent — query is still always included
    ]) {
      const tools = routeTools(STUB, msg);
      for (const name of ALL_NEW) {
        expect(name in tools, `${name} present for: "${msg}"`).toBe(true);
      }
    }
  });
});

describe("command layer — reachable end-to-end (orchestrator OR fallback)", () => {
  it("survives whichever path the route takes", () => {
    for (const msg of ["open the Acme account", "take me to my tasks", "show my sequences"]) {
      const tools = reachableTools(msg);
      for (const name of ALL_NEW) {
        expect(name in tools, `${name} reachable for: "${msg}"`).toBe(true);
      }
    }
  });

  it("every specialist keeps the command + read-gap tools (query ∈ every specialist)", () => {
    for (const s of ["research", "outreach", "deal", "data", "admin"] as const) {
      const tools = getSpecialistTools([s], STUB);
      for (const name of ALL_NEW) {
        expect(name in tools, `${name} present for specialist: ${s}`).toBe(true);
      }
    }
  });
});
