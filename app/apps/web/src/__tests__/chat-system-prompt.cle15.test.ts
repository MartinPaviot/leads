import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt } from "@/lib/prompts/chat-system-prompt";

/**
 * CLE-15 (AC-10) — the system prompt teaches WHEN to reveal (narrate-actuate on
 * intent, never on a pure question) and HOW to degrade off-web (never fake an
 * on-page action; give a headless result or a link). No emoji in the added
 * blocks (brand rule).
 */

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

function commandLayer(prompt: string) {
  return prompt.slice(prompt.indexOf("<command_layer>"), prompt.indexOf("</command_layer>"));
}
function pageActions(prompt: string) {
  return prompt.slice(prompt.indexOf("<page_actions>"), prompt.indexOf("</page_actions>"));
}

describe("CLE-15 — narrate-actuate prompt rule", () => {
  it("the command_layer teaches reveal-on-intent", () => {
    const block = commandLayer(build());
    expect(block).toContain("narrate + actuate");
    expect(block.toLowerCase()).toContain("reveal");
    expect(block).toContain("land");
  });

  it("the command_layer forbids navigating/revealing for a pure question", () => {
    const block = commandLayer(build());
    expect(block).toContain("PURE QUESTION");
    expect(block).toMatch(/Do NOT navigate and do NOT reveal/);
  });

  it("the answer must stand on its own (courtesy, not requirement)", () => {
    const block = commandLayer(build());
    expect(block.toLowerCase()).toContain("stand on its own");
  });
});

describe("CLE-15 — off-web degradation prompt rule (AC-10)", () => {
  it("the page_actions block says on-page actions only work in the web app", () => {
    const block = pageActions(build());
    expect(block).toContain("only work inside the web app");
  });

  it("forbids describing a fake on-page change off-web; offer a headless result or link", () => {
    const block = pageActions(build());
    expect(block).toMatch(/Never describe an on-page change as if it happened/);
    expect(block.toLowerCase()).toContain("headless");
    expect(block.toLowerCase()).toContain("link");
  });
});

describe("CLE-15 — brand: no emoji in the added blocks", () => {
  it("command_layer + page_actions contain no emoji", () => {
    const prompt = build();
    const blocks = commandLayer(prompt) + pageActions(prompt);
    // Code-point ranges: misc symbols & pictographs, emoticons, transport,
    // supplemental symbols, dingbats, regional indicators (flags).
    const emoji =
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;
    expect(emoji.test(blocks)).toBe(false);
  });
});
