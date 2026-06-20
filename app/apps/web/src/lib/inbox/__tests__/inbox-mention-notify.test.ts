import { describe, it, expect } from "vitest";
import { resolveMentionTargets } from "../mention-notify";

/** B8 B2 — the mention-target resolver (the bridge the parser was missing). */

const mk = (...ids: string[]) => ({ mentioned: ids.map((id) => ({ id, name: id })) });
const allEnabled = () => true;

describe("resolveMentionTargets", () => {
  it("returns distinct mentioned ids", () => {
    expect(resolveMentionTargets(mk("a", "b"), "author", allEnabled)).toEqual(["a", "b"]);
  });

  it("drops a self-mention (the author is never notified)", () => {
    expect(resolveMentionTargets(mk("a", "author", "b"), "author", allEnabled)).toEqual(["a", "b"]);
  });

  it("collapses duplicate ids to one", () => {
    expect(resolveMentionTargets(mk("a", "a", "b", "a"), "author", allEnabled)).toEqual(["a", "b"]);
  });

  it("excludes a member whose mention notification is off", () => {
    const enabled = (id: string) => id !== "b"; // b opted out
    expect(resolveMentionTargets(mk("a", "b", "c"), "author", enabled)).toEqual(["a", "c"]);
  });

  it("returns [] when no one is mentioned", () => {
    expect(resolveMentionTargets(mk(), "author", allEnabled)).toEqual([]);
  });

  it("returns [] when the only mention is the author", () => {
    expect(resolveMentionTargets(mk("author"), "author", allEnabled)).toEqual([]);
  });
});
