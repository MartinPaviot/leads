import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CLE-13 T10 — drift guard. Static assertions that the orphan stays wired:
 * the shared gate imports enforceSendingIdentity, all five send chokepoints
 * import the shared gate, the send-window path no longer reads UTC wall-clock,
 * and the signal auto-enroll loop routes through the approval authority.
 */

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("CLE-13 wiring guards", () => {
  it("sending-gate imports the orphaned enforceSendingIdentity", () => {
    const src = read("lib/guardrails/sending-gate.ts");
    expect(src).toMatch(/from\s+["']@\/lib\/guardrails\/sending-identity["']/);
    expect(src).toContain("enforceSendingIdentity");
  });

  it("all five send chokepoints import the shared sending gate (evaluateSend)", () => {
    const chokepoints = [
      "inngest/email-send-worker.ts", // C1 + C2 (same module)
      "inngest/outbound-smtp-send.ts", // C3
      "lib/emails/deliver-interactive.ts", // C4
      "app/api/meetings/[id]/notes/send-follow-up/route.ts", // C5
    ];
    for (const f of chokepoints) {
      const src = read(f);
      expect(src, `${f} must import the shared sending gate`).toMatch(
        /from\s+["']@\/lib\/guardrails\/sending-gate["']/,
      );
      expect(src, `${f} must call evaluateSend`).toContain("evaluateSend");
    }
  });

  it("the send-window path no longer reads UTC wall-clock (getUTCDay/getUTCHours)", () => {
    const src = read("inngest/email-send-worker.ts");
    expect(src).not.toContain("getUTCDay");
    expect(src).not.toContain("getUTCHours");
    expect(src).toMatch(/from\s+["']@\/lib\/emails\/send-window["']/);
    expect(src).toContain("isWithinSendWindow");
  });

  it("signalAutoEnroll routes through the approval authority before enrolling", () => {
    const src = read("inngest/signal-to-sequence.ts");
    expect(src).toContain("enforceAgentApprovalMode");
    expect(src).toContain("approval-gate");
    expect(src).toContain("recordAgentAction");
  });
});
