import { describe, it, expect } from "vitest";
import {
  accountWriteSchema,
  contactWriteSchema,
  vendorIdsSchema,
  parseOrThrow,
  CanonicalValidationError,
} from "@/validators/canonical";

describe("canonical write validation (AC2)", () => {
  it("accepts a valid account write", () => {
    const v = parseOrThrow(accountWriteSchema, { name: "Acme", domain: "acme.fr", industry: "software" });
    expect(v.name).toBe("Acme");
  });

  it("rejects a wrong-typed field (mirror enforces the Drizzle shape)", () => {
    // name is text → a number must be rejected.
    expect(() => parseOrThrow(accountWriteSchema, { name: 42 })).toThrow(CanonicalValidationError);
    // score is real → a string must be rejected.
    expect(() => parseOrThrow(accountWriteSchema, { score: "high" })).toThrow(CanonicalValidationError);
  });

  it("rejects a wrong-typed contact write", () => {
    expect(() => parseOrThrow(contactWriteSchema, { email: 123 })).toThrow(CanonicalValidationError);
  });

  it("validates the vendor side map as string→string", () => {
    expect(parseOrThrow(vendorIdsSchema, { apollo: "5f3", linkedin: "https://x" })).toEqual({
      apollo: "5f3",
      linkedin: "https://x",
    });
    expect(() => parseOrThrow(vendorIdsSchema, { apollo: 5 })).toThrow(CanonicalValidationError);
  });

  it("surfaces zod issues on the error", () => {
    try {
      parseOrThrow(accountWriteSchema, { name: 42 });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CanonicalValidationError);
      expect((e as CanonicalValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});
