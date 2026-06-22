import { describe, it, expect, vi } from "vitest";
import {
  enroll,
  advance,
  haltSequence,
  pauseSequence,
  resumeSequence,
  type SequenceDefinition,
  type SequenceDeps,
  type Enrollment,
  type SequenceVariant,
} from "../index";

const variant: SequenceVariant = { id: "v1", subject: "Hi", body: "Quick idea." };

const seq = (over: Partial<SequenceDefinition> = {}): SequenceDefinition => ({
  id: "seq1",
  steps: [
    { id: "s1", kind: "email", delayMs: 0, slot: "step-1" },
    { id: "s2", kind: "wait", delayMs: 1000 },
    { id: "s3", kind: "linkedin", delayMs: 0, slot: "step-3", linkedinAction: "message" },
  ],
  ...over,
});

let clock = 0;
const deps = (over: Partial<SequenceDeps> = {}): SequenceDeps => ({
  isEligible: () => true,
  isSuppressed: () => false,
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
  pullVariant: vi.fn(async () => variant),
  sendEmail: vi.fn(async () => {}),
  sendLinkedIn: vi.fn(async () => {}),
  isGuardTripped: () => false,
  newId: () => "enr1",
  now: () => clock,
  ...over,
});

describe("enroll — AC1 preconditions", () => {
  it("enrolls an eligible, unsuppressed contact and acquires the lock", async () => {
    clock = 100;
    const d = deps();
    const r = await enroll("c1", seq(), d);
    expect(r.enrolled).toBe(true);
    expect(r.enrollment).toMatchObject({ status: "active", currentStepIndex: 0, dueAt: 100 });
    expect(d.acquireLock).toHaveBeenCalledWith("c1", "enr1");
  });
  it("refuses an ineligible contact (no lock)", async () => {
    const d = deps({ isEligible: () => false });
    expect((await enroll("c1", seq(), d)).refusedReason).toBe("ineligible");
    expect(d.acquireLock).not.toHaveBeenCalled();
  });
  it("refuses a suppressed contact", async () => {
    expect((await enroll("c1", seq(), deps({ isSuppressed: () => true }))).refusedReason).toBe("suppressed");
  });
  it("refuses when the anti-collision lock is held by another enrollment", async () => {
    expect((await enroll("c1", seq(), deps({ acquireLock: async () => false }))).refusedReason).toBe("collision-locked");
  });
});

async function freshEnrollment(d: SequenceDeps, definition = seq()): Promise<Enrollment> {
  clock = 0;
  const r = await enroll("c1", definition, d);
  return r.enrollment!;
}

describe("advance — AC4 delays", () => {
  it("does not run a step before its delay", async () => {
    const d = deps();
    let e = await freshEnrollment(d, seq({ steps: [{ id: "s1", kind: "email", delayMs: 1000, slot: "x" }] }));
    clock = 500;
    e = await advance(e, seq({ steps: [{ id: "s1", kind: "email", delayMs: 1000, slot: "x" }] }), d);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(e.currentStepIndex).toBe(0); // not advanced
  });

  it("runs the step once its delay has elapsed", async () => {
    const definition = seq({ steps: [{ id: "s1", kind: "email", delayMs: 1000, slot: "x" }] });
    const d = deps();
    let e = await freshEnrollment(d, definition);
    clock = 1000;
    e = await advance(e, definition, d);
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(e.steps[0]).toMatchObject({ status: "sent", sentAt: 1000 });
  });
});

describe("advance — AC2 routing through ports", () => {
  it("routes email then (after wait) linkedin, pulling a variant each send", async () => {
    const definition = seq();
    const d = deps();
    let e = await freshEnrollment(d, definition);
    e = await advance(e, definition, d); // s1 email (delay 0, due at 0)
    expect(d.sendEmail).toHaveBeenCalledOnce();
    expect(e.currentStepIndex).toBe(1);
    expect(e.dueAt).toBe(1000); // wait step delay

    clock = 1000;
    e = await advance(e, definition, d); // s2 wait → skipped
    expect(e.steps[1].status).toBe("skipped");
    expect(e.currentStepIndex).toBe(2);

    e = await advance(e, definition, d); // s3 linkedin
    expect(d.sendLinkedIn).toHaveBeenCalledOnce();
    expect(e.status).toBe("completed");
  });

  it("a step with no available variant waits (no send, no advance)", async () => {
    const definition = seq({ steps: [{ id: "s1", kind: "email", delayMs: 0, slot: "x" }] });
    const d = deps({ pullVariant: async () => null });
    let e = await freshEnrollment(d, definition);
    e = await advance(e, definition, d);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(e.currentStepIndex).toBe(0);
  });
});

describe("advance — AC5 idempotency + guard pause", () => {
  it("a re-advance of an already-sent step does not re-send", async () => {
    const definition = seq({ steps: [{ id: "s1", kind: "email", delayMs: 0, slot: "x" }, { id: "s2", kind: "email", delayMs: 5000, slot: "y" }] });
    const d = deps();
    let e = await freshEnrollment(d, definition);
    e = await advance(e, definition, d); // s1 sent
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    // simulate a crash-retry: step persisted 'sent' but the cursor never advanced
    // (dueAt is still step-0's original due, so the delay guard passes).
    e = await advance({ ...e, currentStepIndex: 0, dueAt: 0 }, definition, d);
    expect(d.sendEmail).toHaveBeenCalledTimes(1); // not re-sent
    expect(e.currentStepIndex).toBe(1);
  });

  it("pauses the whole sequence when the guard trips", async () => {
    const definition = seq();
    const d = deps({ isGuardTripped: () => true });
    let e = await freshEnrollment(d, definition);
    e = await advance(e, definition, d);
    expect(e.status).toBe("paused");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("a paused sequence does not advance until resumed", async () => {
    const definition = seq();
    const d = deps();
    let e = await freshEnrollment(d, definition);
    e = pauseSequence(e, "guard");
    e = await advance(e, definition, d);
    expect(e.status).toBe("paused");
    e = await advance(resumeSequence(e), definition, d);
    expect(e.status).toBe("active");
    expect(d.sendEmail).toHaveBeenCalledOnce();
  });

  it("a mid-sequence suppression halts and releases the lock", async () => {
    const definition = seq();
    const d = deps({ isSuppressed: () => true });
    let e = await freshEnrollment(deps(), definition); // enroll while not suppressed
    e = await advance(e, definition, d); // now suppressed at send time
    expect(e.status).toBe("halted");
    expect(e.haltReason).toBe("suppressed");
    expect(d.releaseLock).toHaveBeenCalledWith("c1");
  });
});

describe("haltSequence — AC3 reply/opt-out", () => {
  it("halts and releases the lock", async () => {
    const d = deps();
    const e = await freshEnrollment(d);
    const halted = await haltSequence(e, d, "replied");
    expect(halted).toMatchObject({ status: "halted", haltReason: "replied" });
    expect(d.releaseLock).toHaveBeenCalledWith("c1");
  });

  it("halting an already-completed enrollment is a no-op", async () => {
    const d = deps();
    const e = await freshEnrollment(d);
    const completed: Enrollment = { ...e, status: "completed" };
    expect(await haltSequence(completed, d)).toBe(completed);
  });

  it("a halted sequence never advances", async () => {
    const definition = seq();
    const d = deps();
    let e = await freshEnrollment(d, definition);
    e = await haltSequence(e, d);
    e = await advance(e, definition, d);
    expect(e.status).toBe("halted");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });
});

describe("advance — completion releases the lock", () => {
  it("sending the last step completes and releases the lock", async () => {
    const definition = seq({ steps: [{ id: "s1", kind: "email", delayMs: 0, slot: "x" }] });
    const d = deps();
    let e = await freshEnrollment(d, definition);
    e = await advance(e, definition, d);
    expect(e.status).toBe("completed");
    expect(d.releaseLock).toHaveBeenCalledWith("c1");
  });
});
