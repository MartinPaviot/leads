import { describe, it, expect } from "vitest";
import { isEmailKnownUnsendable, loadEmailStatus } from "../db-status";

/**
 * Spec 17 — the pre-send gate's email-status adapter. SAFE rollout means only an
 * explicit terminal-bad status ('invalid') blocks; everything else (incl. NULL)
 * passes so an unverified audience is not halted.
 */

describe("isEmailKnownUnsendable — only 'invalid' is terminal-bad", () => {
  it("blocks 'invalid'", () => {
    expect(isEmailKnownUnsendable("invalid")).toBe(true);
  });
  it("allows null/undefined (unverified) and every non-invalid status", () => {
    for (const s of [null, undefined, "valid", "risky", "catch_all", "unknown", ""]) {
      expect(isEmailKnownUnsendable(s as string | null | undefined)).toBe(false);
    }
  });
});

// Minimal db stub mirroring the drizzle chain loadEmailStatus walks.
function dbReturning(rows: Array<{ s: string | null }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("loadEmailStatus", () => {
  it("returns the matching contact's status", async () => {
    expect(await loadEmailStatus("t1", "Jane@Acme.com", dbReturning([{ s: "invalid" }]))).toBe("invalid");
  });
  it("returns null when no contact matches the address", async () => {
    expect(await loadEmailStatus("t1", "ghost@nowhere.com", dbReturning([]))).toBeNull();
  });
  it("returns null when the contact has no status yet", async () => {
    expect(await loadEmailStatus("t1", "x@y.com", dbReturning([{ s: null }]))).toBeNull();
  });
});
