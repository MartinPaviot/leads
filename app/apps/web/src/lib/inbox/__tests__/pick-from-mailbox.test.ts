import { describe, it, expect } from "vitest";
import { pickDefaultFrom, mailboxDisplay, type SendableMailbox } from "@/lib/inbox/pick-from-mailbox";

const boxes: SendableMailbox[] = [
  { id: "b1", address: "primary@acme.com", label: "Primary" },
  { id: "b2", address: "sales@acme.com", label: "sales@acme.com" },
];

describe("pickDefaultFrom", () => {
  it("keeps the preferred box when it is sendable (R2.1)", () => {
    expect(pickDefaultFrom("b2", boxes)).toBe("b2");
  });
  it("falls back to the primary (first) when the preferred is not sendable (R2.3/R2.4)", () => {
    expect(pickDefaultFrom("gone", boxes)).toBe("b1");
  });
  it("defaults to the primary when no preferred is given (R2.2)", () => {
    expect(pickDefaultFrom(undefined, boxes)).toBe("b1");
  });
  it("returns undefined when there is no sendable box (R1.3/R4.5)", () => {
    expect(pickDefaultFrom("b1", [])).toBeUndefined();
    expect(pickDefaultFrom(undefined, [])).toBeUndefined();
  });
});

describe("mailboxDisplay", () => {
  it("shows the label when it adds info, else the address", () => {
    expect(mailboxDisplay(boxes[0])).toBe("Primary");
    expect(mailboxDisplay(boxes[1])).toBe("sales@acme.com");
  });
});
