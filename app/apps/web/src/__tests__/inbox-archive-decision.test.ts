import { describe, it, expect } from "vitest";
import { archiveDecision, type ArchiveInput } from "@/lib/inbox/archive-decision";

function base(over: Partial<ArchiveInput> = {}): ArchiveInput {
  return {
    senderEmail: "news@promo.example",
    alwaysArchive: [],
    neverArchive: [],
    ruleMatched: false,
    hasOutbound: false,
    ...over,
  };
}

describe("archiveDecision (INBOX-T10)", () => {
  it("archives on a matched rule", () => {
    const d = archiveDecision(base({ ruleMatched: true, ruleName: "marketing" }));
    expect(d.archived).toBe(true);
    expect(d.why).toContain("marketing");
  });

  it("archives a sender on the Always list", () => {
    expect(archiveDecision(base({ alwaysArchive: ["promo.example"] })).archived).toBe(true);
  });

  it("Never-Archive overrides a rule AND the Always list (safety)", () => {
    const d = archiveDecision(
      base({ ruleMatched: true, alwaysArchive: ["promo.example"], neverArchive: ["promo.example"] }),
    );
    expect(d.archived).toBe(false);
    expect(d.why).toContain("Never-Archive");
  });

  it("never auto-archives a live thread (we have outbound), even on Always", () => {
    expect(archiveDecision(base({ hasOutbound: true, alwaysArchive: ["promo.example"] })).archived).toBe(false);
  });

  it("matches by full address as well as domain", () => {
    expect(archiveDecision(base({ alwaysArchive: ["news@promo.example"] })).archived).toBe(true);
  });

  it("keeps mail with no rule/list match in attention", () => {
    expect(archiveDecision(base()).archived).toBe(false);
  });
});
