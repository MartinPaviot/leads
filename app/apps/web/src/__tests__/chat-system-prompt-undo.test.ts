import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt } from "@/lib/prompts/chat-system-prompt";

function build() {
  return buildChatSystemPrompt({
    crmSnapshot: "",
    ragContext: "",
    entityContext: "",
    knowledgeContext: "",
    memoriesContext: "",
    approvalRequiresReview: false,
  });
}

describe("CLE-11 system-prompt undo note (Task 11)", () => {
  it("tells the model to use undoLastAction inside the page_actions block", () => {
    const prompt = build();
    expect(prompt).toContain("undoLastAction");
    // The note lives in the <page_actions> block.
    const block = prompt.slice(
      prompt.indexOf("<page_actions>"),
      prompt.indexOf("</page_actions>"),
    );
    expect(block).toContain("undoLastAction");
  });

  it("states an already-sent email cannot be unsent", () => {
    const prompt = build();
    expect(prompt.toLowerCase()).toContain("cannot be unsent");
  });

  it("tells the model to revert a filter as a forward action, not the undo log", () => {
    const prompt = build();
    expect(prompt).toContain("apply the previous filter");
  });
});
