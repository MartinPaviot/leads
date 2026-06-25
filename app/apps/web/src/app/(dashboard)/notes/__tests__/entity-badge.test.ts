import { describe, it, expect } from "vitest";
import {
  isLinkableNoteEntity,
  LINKABLE_NOTE_ENTITY_TYPES,
} from "../_entity-badge";

describe("isLinkableNoteEntity (P1 30)", () => {
  it("is true for the three linkable CRM entity types", () => {
    for (const t of LINKABLE_NOTE_ENTITY_TYPES) {
      expect(isLinkableNoteEntity(t, "some-id")).toBe(true);
    }
  });

  it("hides the badge for 'general' inline notes (was a stray badge)", () => {
    expect(isLinkableNoteEntity("general", "")).toBe(false);
    expect(isLinkableNoteEntity("general", "x")).toBe(false);
  });

  it("hides the badge for inbox_thread notes", () => {
    expect(isLinkableNoteEntity("inbox_thread", "thread-1")).toBe(false);
  });

  it("hides the badge for null / empty entity type", () => {
    expect(isLinkableNoteEntity(null)).toBe(false);
    expect(isLinkableNoteEntity(undefined)).toBe(false);
    expect(isLinkableNoteEntity("")).toBe(false);
  });

  it("hides a linkable type when the id is an empty string", () => {
    expect(isLinkableNoteEntity("company", "")).toBe(false);
  });

  it("allows a linkable type when id is omitted (id check opt-in)", () => {
    expect(isLinkableNoteEntity("contact")).toBe(true);
  });
});
