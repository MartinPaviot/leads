import { describe, it, expect } from "vitest";
import { companies } from "@/db/schema";
import { requireWorkspace, workspacePredicate, WorkspaceScopeError } from "../scoped";

describe("requireWorkspace (AC5)", () => {
  it("returns the tenant id when present", () => {
    expect(requireWorkspace("tenant_123")).toBe("tenant_123");
  });

  it("throws on a missing/empty/non-string workspace predicate", () => {
    expect(() => requireWorkspace("")).toThrow(WorkspaceScopeError);
    expect(() => requireWorkspace("   ")).toThrow(WorkspaceScopeError);
    expect(() => requireWorkspace(null)).toThrow(WorkspaceScopeError);
    expect(() => requireWorkspace(undefined)).toThrow(WorkspaceScopeError);
    expect(() => requireWorkspace(42)).toThrow(WorkspaceScopeError);
  });
});

describe("workspacePredicate (AC5)", () => {
  it("builds a SQL condition when scoped", () => {
    const sqlCond = workspacePredicate(companies.tenantId, "t1", undefined);
    expect(sqlCond).toBeTruthy();
  });

  it("refuses to build a predicate without a workspace", () => {
    expect(() => workspacePredicate(companies.tenantId, "")).toThrow(WorkspaceScopeError);
  });
});
