import { describe, it, expect } from "vitest";
import { UnipileApiError } from "@/lib/providers/unipile/client";
import { isCleanNoProfile } from "../contact-hydration";

describe("isCleanNoProfile — mark permanent no-profiles, retry transient errors", () => {
  it("treats locked/not-found (422/404/403) as a clean no-profile (→ mark, skip 30d)", () => {
    expect(isCleanNoProfile(new UnipileApiError("locked", 422))).toBe(true);
    expect(isCleanNoProfile(new UnipileApiError("not found", 404))).toBe(true);
    expect(isCleanNoProfile(new UnipileApiError("forbidden", 403))).toBe(true);
  });
  it("treats rate-limit / server / network as transient (→ do NOT mark, rethrow)", () => {
    expect(isCleanNoProfile(new UnipileApiError("rate limited", 429))).toBe(false);
    expect(isCleanNoProfile(new UnipileApiError("server", 500))).toBe(false);
    expect(isCleanNoProfile(new UnipileApiError("bad gateway", 502))).toBe(false);
    expect(isCleanNoProfile(new Error("network down"))).toBe(false);
    expect(isCleanNoProfile(null)).toBe(false);
  });
});
