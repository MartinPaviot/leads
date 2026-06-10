import { describe, it, expect } from "vitest";
import {
  isViewerWriteBlocked,
  VIEWER_WRITE_ALLOWLIST,
} from "@/lib/auth/viewer-guard";

describe("isViewerWriteBlocked", () => {
  it("blocks viewer mutations on arbitrary API routes", () => {
    expect(isViewerWriteBlocked("viewer", "POST", "/api/contacts")).toBe(true);
    expect(isViewerWriteBlocked("viewer", "PUT", "/api/sequences/abc")).toBe(true);
    expect(isViewerWriteBlocked("viewer", "PATCH", "/api/accounts")).toBe(true);
    expect(isViewerWriteBlocked("viewer", "DELETE", "/api/opportunities/1")).toBe(true);
    // future routes are covered by default (fail-closed)
    expect(isViewerWriteBlocked("viewer", "POST", "/api/some/brand-new-route")).toBe(true);
  });

  it("never blocks reads", () => {
    expect(isViewerWriteBlocked("viewer", "GET", "/api/contacts")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "HEAD", "/api/contacts")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "OPTIONS", "/api/contacts")).toBe(false);
    // method casing is normalized
    expect(isViewerWriteBlocked("viewer", "get", "/api/contacts")).toBe(false);
  });

  it("never blocks non-viewer roles", () => {
    expect(isViewerWriteBlocked("member", "POST", "/api/contacts")).toBe(false);
    expect(isViewerWriteBlocked("admin", "DELETE", "/api/contacts/1")).toBe(false);
    expect(isViewerWriteBlocked(undefined, "POST", "/api/contacts")).toBe(false);
    expect(isViewerWriteBlocked(null, "POST", "/api/contacts")).toBe(false);
  });

  it("never blocks page navigations (non-API paths)", () => {
    expect(isViewerWriteBlocked("viewer", "POST", "/accounts")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/")).toBe(false);
  });

  it("allows the read-only POST surfaces a viewer needs", () => {
    expect(isViewerWriteBlocked("viewer", "POST", "/api/chat")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/api/chat/threads")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/api/chat/suggestions")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/api/search")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/api/search/tam")).toBe(false);
    expect(isViewerWriteBlocked("viewer", "POST", "/api/filters/parse-nl")).toBe(false);
  });

  it("the allowlist stays small and intentional", () => {
    // Growing this list is a product decision: every entry is a POST
    // surface a read-only user can hit. Update the spec when it changes.
    expect(VIEWER_WRITE_ALLOWLIST.length).toBe(3);
  });
});
