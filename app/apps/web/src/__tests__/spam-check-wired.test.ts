import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * P0-4 T8 — guard against regressing checkSpamSignals back to dead code. Before
 * P0-4 it was imported only by its own test; the send-time bridge must keep
 * calling it (+ the fail-soft gate).
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("checkSpamSignals is wired into the send path", () => {
  it("the send-time bridge imports + calls checkSpamSignals via the spam gate", () => {
    const src = read("../inngest/sequence-draft-to-outbound.ts");
    expect(src).toContain('from "@/lib/emails/email-spam-check"');
    expect(src).toContain("checkSpamSignals(");
    expect(src).toContain("decideSpamGate(");
    expect(src).toContain('"recall"');
  });
});
