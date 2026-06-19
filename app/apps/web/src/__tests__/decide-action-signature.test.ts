/**
 * CLE-16 T14 — composition / no-regression guards (AC-23 / AC-24).
 *   - `satisfies` compile check that DecideActionInput still equals the frozen
 *     README §3.5bis first-argument shape (the test only compiles if it's
 *     unchanged).
 *   - git-diff guard that decide-action.ts's BODY + the CLE-10/CLE-11/capture
 *     cores are UNMODIFIED on this branch.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";

// ── AC-23: frozen §3.5bis first-argument shape ────────────────
// This object literal must remain assignable to DecideActionInput. If the
// frozen shape changed, TS fails to compile this file.
const FROZEN_INPUT = {
  action: {
    mutating: true as boolean,
    outbound: false as boolean | undefined,
    reversible: true as boolean | undefined,
    cost: "free" as "free" | "credits" | "money" | undefined,
    confirm: "never" as "never" | "risky" | "always",
  },
  approvalMode: "review-each",
  role: "member",
  confidence: 0.5 as number | undefined,
} satisfies DecideActionInput;

describe("decideAction signature (AC-23)", () => {
  it("the frozen §3.5bis input shape still type-checks and runs", () => {
    const d = decideAction(FROZEN_INPUT as DecideActionInput, {
      actionKey: "contact-update",
      learnedThresholds: { "contact-update": 0.6 },
    });
    expect(["execute", "confirm", "queue", "refuse"]).toContain(d.disposition);
  });

  it("the one-argument call (frozen subset) is still valid", () => {
    const d = decideAction({
      action: { mutating: false, confirm: "never" },
      approvalMode: "auto-high-confidence",
      role: "member",
      confidence: 1,
    });
    expect(d.disposition).toBe("execute"); // pure read
  });
});

// ── AC-23/AC-24: protected files unmodified on this branch ─────
const PROTECTED = [
  "src/lib/guardrails/decide-action.ts",
  "src/lib/chat/tool-call-log.ts",
  "src/lib/chat/tools/undo.ts",
  "src/lib/capture/approval.ts",
  "src/lib/campaign-engine/trust-score.ts",
];

describe("protected cores are UNMODIFIED (AC-23/AC-24)", () => {
  it("git diff HEAD shows no changes to the frozen files on this branch", () => {
    let root = "";
    try {
      root = execSync("git rev-parse --show-toplevel", { cwd: process.cwd(), encoding: "utf8" }).trim();
    } catch {
      // No git (CI sandbox): the satisfies check above is the binding guard; skip.
      return;
    }
    // CLE-16 leaves all changes unstaged for parent review, so `git diff HEAD`
    // captures every working-tree change. The protected paths must be absent.
    const paths = PROTECTED.map((p) => `app/apps/web/${p}`).join(" ");
    const changed = execSync(`git diff --stat HEAD -- ${paths}`, { cwd: root, encoding: "utf8" }).trim();
    expect(changed).toBe("");
  });
});
