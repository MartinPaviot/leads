import { describe, expect, it } from "vitest";
import { parseInline } from "../inline";

describe("parseInline", () => {
  it("returns plain text as one segment", () => {
    expect(parseInline("hello world")).toEqual([{ bold: false, text: "hello world" }]);
  });

  it("extracts a bold span", () => {
    expect(parseInline("a **b** c")).toEqual([
      { bold: false, text: "a " },
      { bold: true, text: "b" },
      { bold: false, text: " c" },
    ]);
  });

  it("handles multiple bold spans", () => {
    expect(parseInline("**x** and **y**")).toEqual([
      { bold: true, text: "x" },
      { bold: false, text: " and " },
      { bold: true, text: "y" },
    ]);
  });

  it("handles bold at the start without empty segments", () => {
    const segs = parseInline("**lead** rest");
    expect(segs[0]).toEqual({ bold: true, text: "lead" });
    expect(segs.every((s) => s.text.length > 0)).toBe(true);
  });

  it("leaves a lone unclosed marker as plain text", () => {
    expect(parseInline("a ** b")).toEqual([{ bold: false, text: "a ** b" }]);
  });
});
