import { describe, it, expect } from "vitest";
import { counterpartyEmail } from "../email-sync-attribution";

describe("counterpartyEmail", () => {
  it("uses the sender for an inbound email", () => {
    expect(counterpartyEmail({ direction: "inbound", from: "Jane Doe <jane@acme.com>", to: ["me@elevay.dev"] })).toBe("jane@acme.com");
  });

  it("uses the first recipient for an outbound email", () => {
    expect(counterpartyEmail({ direction: "outbound", from: "me@elevay.dev", to: ["Bob <bob@acme.com>", "cc@acme.com"] })).toBe("bob@acme.com");
  });

  it("normalizes to lowercase", () => {
    expect(counterpartyEmail({ direction: "inbound", from: "JANE@ACME.COM", to: [] })).toBe("jane@acme.com");
  });

  it("extracts the address from a bare or bracketed header", () => {
    expect(counterpartyEmail({ direction: "inbound", from: "plain@acme.com", to: [] })).toBe("plain@acme.com");
  });

  it("returns null for an outbound email with no recipients", () => {
    expect(counterpartyEmail({ direction: "outbound", from: "me@elevay.dev", to: [] })).toBeNull();
  });

  it("returns null when the relevant header is empty", () => {
    expect(counterpartyEmail({ direction: "inbound", from: "", to: ["x@y.com"] })).toBeNull();
  });
});
