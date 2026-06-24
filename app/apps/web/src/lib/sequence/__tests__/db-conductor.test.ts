import { describe, it, expect, afterEach } from "vitest";
import {
  isSequenceEngineV2Enabled,
  toEngineStatus,
  toLiveStatus,
  buildDefinition,
  buildEngineEnrollment,
  applyVars,
} from "../db-conductor";

/**
 * Spec 25 — the DB conductor's live<->engine mapping. These are the pieces most
 * likely to drift from the schema; the engine state machine itself is tested in
 * engine.test. tickEnrollmentV2 (db I/O) is exercised by the eval gate.
 */

const DAY = 24 * 60 * 60 * 1000;

const ORIG = process.env.SEQUENCE_ENGINE_V2;
afterEach(() => {
  if (ORIG === undefined) delete process.env.SEQUENCE_ENGINE_V2;
  else process.env.SEQUENCE_ENGINE_V2 = ORIG;
});

describe("isSequenceEngineV2Enabled", () => {
  it("off by default, on for 1/true", () => {
    delete process.env.SEQUENCE_ENGINE_V2;
    expect(isSequenceEngineV2Enabled()).toBe(false);
    process.env.SEQUENCE_ENGINE_V2 = "1";
    expect(isSequenceEngineV2Enabled()).toBe(true);
    process.env.SEQUENCE_ENGINE_V2 = "true";
    expect(isSequenceEngineV2Enabled()).toBe(true);
    process.env.SEQUENCE_ENGINE_V2 = "off";
    expect(isSequenceEngineV2Enabled()).toBe(false);
  });
});

describe("status mapping", () => {
  it("toEngineStatus: terminal live statuses -> halted; paused/completed pass; default active", () => {
    expect(toEngineStatus("active")).toBe("active");
    expect(toEngineStatus("paused")).toBe("paused");
    expect(toEngineStatus("completed")).toBe("completed");
    expect(toEngineStatus("replied")).toBe("halted");
    expect(toEngineStatus("bounced")).toBe("halted");
    expect(toEngineStatus("unsubscribed")).toBe("halted");
    expect(toEngineStatus(null)).toBe("active");
  });
  it("toLiveStatus: halted -> completed (live enum has no 'halted'); others map through", () => {
    expect(toLiveStatus("halted")).toBe("completed");
    expect(toLiveStatus("paused")).toBe("paused");
    expect(toLiveStatus("completed")).toBe("completed");
    expect(toLiveStatus("active")).toBe("active");
  });
});

describe("applyVars", () => {
  it("replaces every occurrence of each {{var}} and leaves unknown tokens", () => {
    expect(applyVars("Hi {{firstName}}, {{firstName}} — re {{title}}", { firstName: "Sam", title: "CTO" }))
      .toBe("Hi Sam, Sam — re CTO");
    expect(applyVars("Hi {{missing}}", { firstName: "Sam" })).toBe("Hi {{missing}}");
    expect(applyVars("", { firstName: "Sam" })).toBe("");
  });
});

describe("buildDefinition", () => {
  it("orders by stepNumber, maps delayDays->ms and stepType->kind", () => {
    const def = buildDefinition("seq1", [
      { id: "b", stepNumber: 2, stepType: "linkedin_message", subjectTemplate: "", bodyTemplate: "", delayDays: 3 },
      { id: "a", stepNumber: 1, stepType: "email", subjectTemplate: "", bodyTemplate: "", delayDays: 0 },
      { id: "c", stepNumber: 3, stepType: "wait", subjectTemplate: "", bodyTemplate: "", delayDays: null },
    ]);
    expect(def.steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(def.steps.map((s) => s.kind)).toEqual(["email", "linkedin", "wait"]);
    expect(def.steps[1].delayMs).toBe(3 * DAY);
    expect(def.steps[2].delayMs).toBe(0);
  });
});

describe("buildEngineEnrollment", () => {
  const def = buildDefinition("seq1", [
    { id: "a", stepNumber: 1, stepType: "email", subjectTemplate: "", bodyTemplate: "", delayDays: 0 },
    { id: "b", stepNumber: 2, stepType: "email", subjectTemplate: "", bodyTemplate: "", delayDays: 2 },
  ]);

  it("maps currentStep (1-based) -> currentStepIndex (0-based) and nextStepAt -> dueAt", () => {
    const due = new Date(5_000);
    const e = buildEngineEnrollment(
      { id: "e1", contactId: "c1", sequenceId: "seq1", status: "active", currentStep: 2, nextStepAt: due },
      def,
      new Set([1]),
      9_999,
    );
    expect(e.currentStepIndex).toBe(1);
    expect(e.dueAt).toBe(5_000);
    expect(e.steps[0].status).toBe("sent"); // step 1 has an outbound
    expect(e.steps[1].status).toBe("pending");
  });

  it("falls back to now when nextStepAt is null and clamps currentStep>=1", () => {
    const e = buildEngineEnrollment(
      { id: "e1", contactId: "c1", sequenceId: "seq1", status: "completed", currentStep: null, nextStepAt: null },
      def,
      new Set(),
      7_777,
    );
    expect(e.dueAt).toBe(7_777);
    expect(e.currentStepIndex).toBe(0);
    expect(e.status).toBe("completed");
    expect(e.steps.every((s) => s.status === "pending")).toBe(true);
  });
});
