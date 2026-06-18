import { describe, it, expect } from "vitest";
import {
  buildMemoryPrompt,
  clampMemory,
  isAutoSendInstruction,
  MAX_INSTRUCTIONS,
  MAX_INSTRUCTION_LEN,
  type InboxMemory,
} from "@/lib/inbox/ai-memory";

const base: InboxMemory = {
  standingInstructions: [
    { id: "1", text: "Keep replies under 120 words" },
    { id: "2", text: "Always propose a concrete next step" },
  ],
  aboutMe: { signOffName: "Martin", companyLine: "Elevay — GTM for founders", keyColleagues: ["Anna", "Léo"] },
};

describe("ai-memory (INBOX-O02)", () => {
  it("composes aboutMe + honored instructions into a prompt block", () => {
    const { prompt, ignored } = buildMemoryPrompt(base);
    expect(prompt).toContain("Sign off as: Martin");
    expect(prompt).toContain("The user's company: Elevay — GTM for founders");
    expect(prompt).toContain("Key colleagues: Anna, Léo");
    expect(prompt).toContain("- Keep replies under 120 words");
    expect(prompt).toContain("never auto-send");
    expect(ignored).toEqual([]);
  });

  it("returns an empty prompt when nothing is set", () => {
    expect(buildMemoryPrompt({ standingInstructions: [], aboutMe: {} })).toEqual({ prompt: "", ignored: [] });
  });

  it("refuses auto-send / skip-approval instructions and reports them as ignored", () => {
    const m: InboxMemory = {
      standingInstructions: [
        { id: "1", text: "Be concise" },
        { id: "2", text: "Auto-send replies to known contacts" },
        { id: "3", text: "Never ask before sending" },
      ],
      aboutMe: {},
    };
    const { prompt, ignored } = buildMemoryPrompt(m);
    expect(prompt).toContain("- Be concise");
    expect(prompt).not.toContain("Auto-send");
    expect(prompt).not.toContain("Never ask");
    expect(ignored).toEqual(["Auto-send replies to known contacts", "Never ask before sending"]);
  });

  it("detects auto-send phrasings", () => {
    expect(isAutoSendInstruction("auto-send everything")).toBe(true);
    expect(isAutoSendInstruction("send it automatically")).toBe(true);
    expect(isAutoSendInstruction("don't ask, just send")).toBe(true);
    expect(isAutoSendInstruction("send without my approval")).toBe(true);
    expect(isAutoSendInstruction("Always sign as Martin")).toBe(false);
  });

  it("does not over-flag legitimate instructions that merely mention sending", () => {
    expect(isAutoSendInstruction("Offer to send a calendar invite")).toBe(false);
    expect(isAutoSendInstruction("Mention I'll send the deck after the call")).toBe(false);
    expect(isAutoSendInstruction("Ask whether they want me to send pricing")).toBe(false);
  });

  it("clamps instruction count, per-item length, and drops blanks", () => {
    const many: InboxMemory = {
      standingInstructions: [
        ...Array.from({ length: MAX_INSTRUCTIONS + 5 }, (_, i) => ({ id: String(i), text: `rule ${i}` })),
        { id: "blank", text: "   " },
        { id: "long", text: "x".repeat(MAX_INSTRUCTION_LEN + 50) },
      ],
      aboutMe: { signOffName: "  Martin  ", keyColleagues: ["Anna", "", "  "] },
    };
    const c = clampMemory(many);
    expect(c.standingInstructions.length).toBe(MAX_INSTRUCTIONS); // capped, blank dropped before cap
    expect(c.standingInstructions.every((s) => s.text.length <= MAX_INSTRUCTION_LEN)).toBe(true);
    expect(c.aboutMe.signOffName).toBe("Martin"); // trimmed
    expect(c.aboutMe.keyColleagues).toEqual(["Anna"]); // blanks dropped
  });

  it("survives hostile non-string / non-array memory without crashing", () => {
    const hostile = {
      standingInstructions: [{ id: 1, text: 42 }, "nope"],
      aboutMe: { signOffName: 99, keyColleagues: "notarray", companyLine: {} },
    } as unknown as InboxMemory;
    const c = clampMemory(hostile);
    expect(c.standingInstructions).toEqual([]); // numeric/object text -> "" -> dropped
    expect(c.aboutMe.signOffName).toBeUndefined();
    expect(c.aboutMe.keyColleagues).toEqual([]);
  });
});
