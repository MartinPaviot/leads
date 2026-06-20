import { describe, it, expect } from "vitest";
import { normalizeCommentBody, shapeComment, canDeleteComment, INBOX_COMMENT_ENTITY_TYPE } from "../comments";

/** B8 B1 — comment shape + body normalization (pure). */

describe("normalizeCommentBody", () => {
  it("nulls a non-string / empty / whitespace body, trims, and caps at 50000", () => {
    expect(normalizeCommentBody(123)).toBeNull();
    expect(normalizeCommentBody("   ")).toBeNull();
    expect(normalizeCommentBody("  hi  ")).toBe("hi");
    expect(normalizeCommentBody("x".repeat(60000))).toHaveLength(50000);
  });
});

describe("shapeComment", () => {
  const row = { id: "c1", conversationKey: "k1", authorId: "u1", body: "ship it", createdAt: "2026-06-19T10:00:00.000Z" };

  it("resolves the author name from the map", () => {
    const c = shapeComment(row, { u1: "Ada" });
    expect(c).toMatchObject({ id: "c1", conversationKey: "k1", authorId: "u1", authorName: "Ada", body: "ship it" });
    expect(c.createdAt).toBe("2026-06-19T10:00:00.000Z");
  });

  it("falls back to 'A teammate' for an unknown / blank author", () => {
    expect(shapeComment(row, {}).authorName).toBe("A teammate");
    expect(shapeComment(row, { u1: "  " }).authorName).toBe("A teammate");
  });

  it("serializes a Date createdAt to ISO", () => {
    const c = shapeComment({ ...row, createdAt: new Date("2026-06-19T10:00:00.000Z") }, { u1: "Ada" });
    expect(c.createdAt).toBe("2026-06-19T10:00:00.000Z");
  });

  it("uses a dedicated synthetic entity type (never a real CRM entity)", () => {
    expect(INBOX_COMMENT_ENTITY_TYPE).toBe("inbox_comment");
  });
});

describe("canDeleteComment", () => {
  it("allows the author or an admin, denies anyone else", () => {
    const comment = { authorId: "u1" };
    expect(canDeleteComment("u1", comment, false)).toBe(true); // author
    expect(canDeleteComment("u2", comment, true)).toBe(true); // admin
    expect(canDeleteComment("u2", comment, false)).toBe(false); // other, non-admin
  });
});
