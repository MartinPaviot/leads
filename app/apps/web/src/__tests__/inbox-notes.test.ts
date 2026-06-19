import { describe, it, expect } from "vitest";
import { normalizeNoteContent, INBOX_NOTE_ENTITY_TYPE } from "@/lib/inbox/notes";

describe("normalizeNoteContent (INBOX-X06)", () => {
  it("trims content", () => {
    expect(normalizeNoteContent("  call back Tuesday  ")).toBe("call back Tuesday");
  });

  it("returns null for empty / whitespace / non-string", () => {
    expect(normalizeNoteContent("")).toBeNull();
    expect(normalizeNoteContent("   ")).toBeNull();
    expect(normalizeNoteContent(null)).toBeNull();
    expect(normalizeNoteContent(42)).toBeNull();
  });

  it("caps very long content", () => {
    expect(normalizeNoteContent("x".repeat(60000))!.length).toBe(50000);
  });
});

describe("INBOX_NOTE_ENTITY_TYPE", () => {
  it("is a synthetic entity type, not a real CRM entity", () => {
    expect(INBOX_NOTE_ENTITY_TYPE).toBe("inbox_thread");
    expect(["contact", "company", "deal", "general"]).not.toContain(INBOX_NOTE_ENTITY_TYPE);
  });
});
