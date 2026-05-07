import { describe, it, expect } from "vitest";
import {
  parseCitations,
  formatSecondsAsTimestamp,
  splitWithCitations,
} from "@/lib/coaching/citation-parser";

describe("parseCitations", () => {
  it("finds a single mm:ss citation", () => {
    const tokens = parseCitations(`The buyer said [12:34] "we don't have budget".`);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].seconds).toBe(12 * 60 + 34);
    expect(tokens[0].display).toBe("12:34");
  });

  it("finds multiple citations in order", () => {
    const text = "First [01:00] then [02:30] then [03:45].";
    const tokens = parseCitations(text);
    expect(tokens).toHaveLength(3);
    expect(tokens.map((t) => t.seconds)).toEqual([60, 150, 225]);
    // Indices ascending
    expect(tokens[1].startIndex).toBeGreaterThan(tokens[0].startIndex);
  });

  it("supports hh:mm:ss form", () => {
    const tokens = parseCitations("After an hour: [1:02:03] something happened.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].seconds).toBe(3600 + 2 * 60 + 3);
    expect(tokens[0].display).toBe("1:02:03");
  });

  it("supports single-digit minute mm:ss", () => {
    const tokens = parseCitations("Quick check: [5:09] there.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].seconds).toBe(5 * 60 + 9);
  });

  it("rejects out-of-range mm:ss values", () => {
    expect(parseCitations("[99:99]")).toHaveLength(0);
    expect(parseCitations("[60:00]")).toHaveLength(0);
    expect(parseCitations("[12:60]")).toHaveLength(0);
  });

  it("rejects bracketed numbers without colon (footnotes)", () => {
    expect(parseCitations("See [12] in the doc.")).toHaveLength(0);
    expect(parseCitations("[1] [2] [3]")).toHaveLength(0);
  });

  it("ignores nested or partial brackets", () => {
    expect(parseCitations("This [[12:34]] is suspicious.")).toHaveLength(1);
    expect(parseCitations("Open [12:34 is unclosed.")).toHaveLength(0);
  });

  it("returns indices that slice the original string", () => {
    const text = "Before [05:30] middle [10:00] end.";
    const tokens = parseCitations(text);
    expect(text.slice(tokens[0].startIndex, tokens[0].endIndex)).toBe("[05:30]");
    expect(text.slice(tokens[1].startIndex, tokens[1].endIndex)).toBe("[10:00]");
  });

  it("returns empty for null/empty/no-match input", () => {
    expect(parseCitations("")).toEqual([]);
    expect(parseCitations("plain text no citations")).toEqual([]);
  });

  it("regex state isolation across calls", () => {
    // Global regex state could leak lastIndex; verify two consecutive
    // calls give the same result.
    const text = "Look [01:00] here.";
    const a = parseCitations(text);
    const b = parseCitations(text);
    expect(a).toEqual(b);
  });
});

describe("formatSecondsAsTimestamp", () => {
  it("formats < 1h as mm:ss", () => {
    expect(formatSecondsAsTimestamp(0)).toBe("0:00");
    expect(formatSecondsAsTimestamp(9)).toBe("0:09");
    expect(formatSecondsAsTimestamp(75)).toBe("1:15");
    expect(formatSecondsAsTimestamp(3599)).toBe("59:59");
  });

  it("formats ≥ 1h as h:mm:ss", () => {
    expect(formatSecondsAsTimestamp(3600)).toBe("1:00:00");
    expect(formatSecondsAsTimestamp(3661)).toBe("1:01:01");
  });

  it("clamps negative input to 0", () => {
    expect(formatSecondsAsTimestamp(-10)).toBe("0:00");
  });

  it("floors fractional seconds", () => {
    expect(formatSecondsAsTimestamp(75.9)).toBe("1:15");
  });
});

describe("splitWithCitations", () => {
  it("returns single text segment when no citations", () => {
    const segs = splitWithCitations("Just plain text.");
    expect(segs).toEqual([{ kind: "text", text: "Just plain text." }]);
  });

  it("returns empty array on empty input", () => {
    expect(splitWithCitations("")).toEqual([]);
  });

  it("alternates text and citation segments preserving order", () => {
    const segs = splitWithCitations("Before [01:00] middle [02:30] end.");
    expect(segs).toHaveLength(5);
    expect(segs[0]).toEqual({ kind: "text", text: "Before " });
    expect(segs[1].kind).toBe("citation");
    expect(segs[2]).toEqual({ kind: "text", text: " middle " });
    expect(segs[3].kind).toBe("citation");
    expect(segs[4]).toEqual({ kind: "text", text: " end." });
  });

  it("handles citation at very start", () => {
    const segs = splitWithCitations("[01:00] starts here.");
    expect(segs[0].kind).toBe("citation");
    expect(segs[1]).toEqual({ kind: "text", text: " starts here." });
  });

  it("handles citation at very end", () => {
    const segs = splitWithCitations("Ends here [01:00]");
    expect(segs[segs.length - 1].kind).toBe("citation");
  });
});
