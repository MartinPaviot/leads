import { describe, it, expect } from "vitest";
import {
  canTransition,
  isTerminal,
  validateRejectionReason,
  type DraftStatus,
} from "@/lib/sequence-drafts/state-machine";

describe("canTransition — approve", () => {
  it("allows pending_approval → approved", () => {
    const r = canTransition("pending_approval", "approve");
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("approved");
  });

  it.each<DraftStatus>(["approved", "rejected", "expired", "sent"])(
    "rejects approve from %s",
    (from) => {
      const r = canTransition(from, "approve");
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/Cannot approve/);
    },
  );
});

describe("canTransition — reject", () => {
  it("allows pending_approval → rejected", () => {
    const r = canTransition("pending_approval", "reject");
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("rejected");
  });

  it.each<DraftStatus>(["approved", "rejected", "expired", "sent"])(
    "rejects reject from %s",
    (from) => {
      const r = canTransition(from, "reject");
      expect(r.allowed).toBe(false);
    },
  );
});

describe("canTransition — edit", () => {
  it("allows edit when pending — status stays pending", () => {
    const r = canTransition("pending_approval", "edit");
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("pending_approval");
  });

  it("blocks edit on approved (race with sender worker)", () => {
    const r = canTransition("approved", "edit");
    expect(r.allowed).toBe(false);
  });

  it.each<DraftStatus>(["rejected", "expired", "sent"])(
    "blocks edit on terminal %s",
    (from) => {
      const r = canTransition(from, "edit");
      expect(r.allowed).toBe(false);
    },
  );
});

describe("canTransition — expire", () => {
  it("allows pending → expired", () => {
    const r = canTransition("pending_approval", "expire");
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("expired");
  });

  it("expire on terminal is a no-op (idempotent cron)", () => {
    const r = canTransition("rejected", "expire");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/already in terminal/);
  });

  it("expire on approved → not allowed (sender worker should pick up)", () => {
    const r = canTransition("approved", "expire");
    expect(r.allowed).toBe(false);
  });
});

describe("canTransition — mark_sent", () => {
  it("allows approved → sent", () => {
    const r = canTransition("approved", "mark_sent");
    expect(r.allowed).toBe(true);
    expect(r.nextStatus).toBe("sent");
  });

  it("blocks mark_sent from non-approved", () => {
    expect(canTransition("pending_approval", "mark_sent").allowed).toBe(false);
    expect(canTransition("rejected", "mark_sent").allowed).toBe(false);
    expect(canTransition("expired", "mark_sent").allowed).toBe(false);
    expect(canTransition("sent", "mark_sent").allowed).toBe(false);
  });
});

describe("isTerminal", () => {
  it("identifies terminal states", () => {
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("expired")).toBe(true);
    expect(isTerminal("sent")).toBe(true);
  });

  it("identifies non-terminal states", () => {
    expect(isTerminal("pending_approval")).toBe(false);
    expect(isTerminal("approved")).toBe(false);
  });
});

describe("validateRejectionReason", () => {
  it("accepts trimmed reason in [3, 200] chars", () => {
    const r = validateRejectionReason("  too generic  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("too generic");
  });

  it("rejects non-string", () => {
    expect(validateRejectionReason(undefined).ok).toBe(false);
    expect(validateRejectionReason(null).ok).toBe(false);
    expect(validateRejectionReason(123).ok).toBe(false);
    expect(validateRejectionReason({}).ok).toBe(false);
  });

  it("rejects too short (< 3 after trim)", () => {
    expect(validateRejectionReason("ab").ok).toBe(false);
    expect(validateRejectionReason("  a  ").ok).toBe(false);
    expect(validateRejectionReason("").ok).toBe(false);
  });

  it("rejects too long (> 200 after trim)", () => {
    const r = validateRejectionReason("x".repeat(201));
    expect(r.ok).toBe(false);
  });

  it("accepts exactly 200 chars", () => {
    const r = validateRejectionReason("x".repeat(200));
    expect(r.ok).toBe(true);
  });

  it("accepts exactly 3 chars", () => {
    const r = validateRejectionReason("ok!");
    expect(r.ok).toBe(true);
  });
});
