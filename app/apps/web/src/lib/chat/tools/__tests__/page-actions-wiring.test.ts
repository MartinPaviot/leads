import { describe, it, expect } from "vitest";
import { getToolGroup } from "@/lib/chat/tool-router";
import { getOrchestratorToolGroup } from "@/lib/agents/orchestrator";
import { isViewerAllowedTool, VIEWER_GATEWAY_TOOLS } from "@/lib/agents/capability-resolver";
import { buildChatSystemPrompt } from "@/lib/prompts/chat-system-prompt";
import { ACTION_RESULT_OPEN, ACTION_RESULT_CLOSE } from "@/lib/chat/page-actions/result-tags";

describe("CLE-04 wiring", () => {
  it("both routing maps group the two tools (survives CLE-01 drift-guard)", () => {
    expect(getToolGroup("listPageActions")).toBe("query");
    expect(getToolGroup("invokePageAction")).toBe("action");
    expect(getOrchestratorToolGroup("listPageActions")).toBe("query");
    expect(getOrchestratorToolGroup("invokePageAction")).toBe("action");
  });

  it("invokePageAction is reachable by viewers (gateway); listPageActions is read-only", () => {
    expect(VIEWER_GATEWAY_TOOLS.has("invokePageAction")).toBe(true);
    expect(isViewerAllowedTool("invokePageAction")).toBe(true);
    expect(isViewerAllowedTool("listPageActions")).toBe(true);
  });

  it("the system prompt teaches page actions + the frozen envelope tags", () => {
    const p = buildChatSystemPrompt({
      crmSnapshot: "",
      ragContext: "",
      entityContext: "",
      knowledgeContext: "",
      memoriesContext: "",
      approvalRequiresReview: false,
    });
    expect(p).toContain("<page_actions>");
    expect(p).toContain("invokePageAction");
    expect(p).toContain("Two-tier routing");
    expect(p).toContain(ACTION_RESULT_OPEN);
    expect(p).toContain(ACTION_RESULT_CLOSE);
  });
});
