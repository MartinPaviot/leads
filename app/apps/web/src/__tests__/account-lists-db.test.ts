import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "@/lib/accounts/account-lists-db";

describe("isUniqueViolation", () => {
  it("is true only for a Postgres 23505 (unique_violation) error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    // postgres.js attaches more fields; the code is what matters.
    expect(isUniqueViolation({ code: "23505", constraint_name: "account_lists_tenant_name_idx" })).toBe(true);
  });

  it("is false for any other error shape", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation
    expect(isUniqueViolation({ code: 23505 })).toBe(false); // numeric, not the string code
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
