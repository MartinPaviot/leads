import { describe, it, expect } from "vitest";
import { normalizeEmail, extractDomain } from "@/lib/util/email";

describe("normalizeEmail", () => {
  it("lowercases local and domain", () => {
    expect(normalizeEmail("Foo.Bar@Example.COM")).toBe("foo.bar@example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  john@acme.com  ")).toBe("john@acme.com");
  });

  it("strips +tag from local part", () => {
    expect(normalizeEmail("john+newsletter@acme.com")).toBe("john@acme.com");
  });

  it("strips everything after the first + (multiple plus signs)", () => {
    expect(normalizeEmail("john+a+b+c@acme.com")).toBe("john@acme.com");
  });

  it("removes dots from Gmail local part", () => {
    expect(normalizeEmail("john.doe@gmail.com")).toBe("johndoe@gmail.com");
  });

  it("does not remove dots for non-Gmail domains", () => {
    expect(normalizeEmail("john.doe@acme.com")).toBe("john.doe@acme.com");
  });

  it("collapses googlemail.com to gmail.com", () => {
    expect(normalizeEmail("J.Doe@googlemail.com")).toBe("jdoe@gmail.com");
  });

  it("applies Gmail dot strip AFTER +tag strip", () => {
    expect(normalizeEmail("j.doe+promo@gmail.com")).toBe("jdoe@gmail.com");
  });

  it("preserves subdomain in the domain", () => {
    expect(normalizeEmail("john@mail.acme.co.uk")).toBe("john@mail.acme.co.uk");
  });

  it("handles unicode in local part", () => {
    // IDN local parts are preserved (we do not punycode); lowercase applies.
    expect(normalizeEmail("Élise@Acme.com")).toBe("élise@acme.com");
  });

  it("rejects empty string", () => {
    expect(() => normalizeEmail("")).toThrow();
  });

  it("rejects missing @", () => {
    expect(() => normalizeEmail("johnacme.com")).toThrow();
  });

  it("rejects multiple @", () => {
    expect(() => normalizeEmail("john@@acme.com")).toThrow();
    expect(() => normalizeEmail("john@sub@acme.com")).toThrow();
  });

  it("rejects @-only boundary", () => {
    expect(() => normalizeEmail("@acme.com")).toThrow();
    expect(() => normalizeEmail("john@")).toThrow();
  });

  it("rejects local that becomes empty after + strip", () => {
    expect(() => normalizeEmail("+tag@acme.com")).toThrow();
  });

  it("rejects RFC 5321 length overflow", () => {
    const long = "a".repeat(250) + "@acme.com";
    expect(() => normalizeEmail(long)).toThrow();
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — intentional wrong type
    expect(() => normalizeEmail(42)).toThrow();
    // @ts-expect-error — intentional wrong type
    expect(() => normalizeEmail(null)).toThrow();
  });

  it("rejects Gmail local that is pure dots (becomes empty after dot strip)", () => {
    // `.`.repeat(5) + "@gmail.com" → local is "" after dot removal
    expect(() => normalizeEmail(".....@gmail.com")).toThrow();
  });

  it("treats equivalent Gmail inputs as equal", () => {
    expect(normalizeEmail("John.Doe+promo@gmail.com"))
      .toBe(normalizeEmail("johndoe@googlemail.com"));
  });

  it("idempotent", () => {
    const a = normalizeEmail("Jane.Doe+test@GMAIL.com");
    expect(normalizeEmail(a)).toBe(a);
  });

  it("preserves unusual-but-valid characters in local part", () => {
    expect(normalizeEmail("foo_bar-baz@acme.com")).toBe("foo_bar-baz@acme.com");
  });
});

describe("extractDomain", () => {
  it("returns lowercased domain", () => {
    expect(extractDomain("John@Acme.COM")).toBe("acme.com");
  });

  it("returns null on malformed input", () => {
    expect(extractDomain("nope")).toBeNull();
    expect(extractDomain("john@")).toBeNull();
    expect(extractDomain("@acme.com")).toBeNull();
  });

  it("returns null for non-string input", () => {
    // @ts-expect-error — intentional wrong type
    expect(extractDomain(null)).toBeNull();
  });
});
