import { describe, it, expect } from "vitest";
import { getToolGroup } from "@/lib/chat/tool-router";
import { getOrchestratorToolGroup } from "@/lib/agents/orchestrator";
import { toolViewerAllowed, toolAdminOnly } from "@/lib/agents/capability-resolver";

/**
 * Account-list chat tools — routing + capability intent. Both router maps
 * (tool-router TOOL_GROUPS + orchestrator TOOL_GROUP_MAP) must agree on the
 * group for each tool (the drift-guard enforces totality; this pins the
 * intended group), and the capability verdicts must land where we want:
 * reading lists is viewer-OK, every mutation/outbound list tool is member-write
 * (not viewer, not admin-only).
 */
const EXPECTED: Record<string, string> = {
  listAccountLists: "query",
  createAccountList: "create",
  addCompaniesToAccountList: "update",
  removeCompaniesFromAccountList: "update",
  renameAccountList: "update",
  deleteAccountList: "action",
  enrollAccountListInSequence: "action",
  runAutopilotForAccountList: "action",
};

describe("account-list chat tools — routing", () => {
  it("both router maps agree on the intended group", () => {
    for (const [name, group] of Object.entries(EXPECTED)) {
      expect(getToolGroup(name), `${name} tool-router group`).toBe(group);
      expect(getOrchestratorToolGroup(name), `${name} orchestrator group`).toBe(group);
    }
  });

  it("only the read tool is viewer-allowed; mutations are member-write", () => {
    expect(toolViewerAllowed("listAccountLists")).toBe(true);
    for (const name of ["createAccountList", "addCompaniesToAccountList", "removeCompaniesFromAccountList", "renameAccountList", "deleteAccountList", "enrollAccountListInSequence", "runAutopilotForAccountList"]) {
      expect(toolViewerAllowed(name), `${name} should not be viewer-allowed`).toBe(false);
    }
  });

  it("no list tool is admin-only (list management is member-level)", () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(toolAdminOnly(name), `${name} should not be admin-only`).toBe(false);
    }
  });
});
