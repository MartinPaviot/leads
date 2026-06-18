import { describe, it, expect } from "vitest";
import {
  taskValuesFromAction,
  dealNameFor,
  companyIdFromPayload,
  emailIntentFromPayload,
  enrollmentTargetsFromPayload,
  executeAgentAction,
} from "@/lib/agents/action-executors";

const NOW = new Date("2026-06-10T12:00:00Z");

describe("taskValuesFromAction", () => {
  it("falls back title: title → expectedOutcome → default", () => {
    expect(taskValuesFromAction("t", { title: "Call back" }, NOW).title).toBe("Call back");
    expect(taskValuesFromAction("t", { expectedOutcome: "Send deck" }, NOW).title).toBe("Send deck");
    expect(taskValuesFromAction("t", {}, NOW).title).toBe("Follow up");
  });
  it("defaults due in 3 days, honors dueInDays", () => {
    expect(taskValuesFromAction("t", {}, NOW).dueDate.toISOString()).toBe("2026-06-13T12:00:00.000Z");
    expect(taskValuesFromAction("t", { dueInDays: 1 }, NOW).dueDate.toISOString()).toBe("2026-06-11T12:00:00.000Z");
  });
  it("passes the entity link through and sets pending/medium", () => {
    const v = taskValuesFromAction("t", { entityType: "deal", entityId: "d1" }, NOW);
    expect(v.entityType).toBe("deal");
    expect(v.entityId).toBe("d1");
    expect(v.status).toBe("pending");
    expect(v.priority).toBe("medium");
  });
});

describe("dealNameFor", () => {
  it("uses explicit name, else company-based, else default", () => {
    expect(dealNameFor("Acme", { name: "Big deal" })).toBe("Big deal");
    expect(dealNameFor("Acme", {})).toBe("Acme — new opportunity");
    expect(dealNameFor(null, {})).toBe("New opportunity");
  });
});

describe("companyIdFromPayload", () => {
  it("reads a company-typed entity or an explicit companyId", () => {
    expect(companyIdFromPayload({ entityType: "company", entityId: "co1" })).toBe("co1");
    expect(companyIdFromPayload({ companyId: "co2" })).toBe("co2");
    expect(companyIdFromPayload({ entityType: "contact", entityId: "c1" })).toBe(null);
  });
});

describe("emailIntentFromPayload", () => {
  it("requires a real body (never sends a canned line)", () => {
    const bad = emailIntentFromPayload({ subject: "Hi" });
    expect(bad.ok).toBe(false);
  });
  it("defaults the subject when a body is present", () => {
    const good = emailIntentFromPayload({ body: "Hello there" });
    expect(good).toEqual({ ok: true, subject: "Following up", body: "Hello there" });
  });
});

describe("enrollmentTargetsFromPayload (CLE-13 deferred-enroll schema)", () => {
  it("parses a well-formed deferred-enrollment payload", () => {
    expect(
      enrollmentTargetsFromPayload({ sequenceId: "s1", contactIds: ["c1", "c2"] }),
    ).toEqual({ sequenceId: "s1", contactIds: ["c1", "c2"] });
  });
  it("drops blank/non-string contactIds and trims", () => {
    expect(
      enrollmentTargetsFromPayload({ sequenceId: " s1 ", contactIds: ["c1", "", "  ", 5, null, "c2"] }),
    ).toEqual({ sequenceId: "s1", contactIds: ["c1", "c2"] });
  });
  it("returns null when the sequenceId is missing", () => {
    expect(enrollmentTargetsFromPayload({ contactIds: ["c1"] })).toBeNull();
  });
  it("returns null when no usable contactId survives", () => {
    expect(enrollmentTargetsFromPayload({ sequenceId: "s1", contactIds: ["", "  "] })).toBeNull();
    expect(enrollmentTargetsFromPayload({ sequenceId: "s1" })).toBeNull();
    expect(enrollmentTargetsFromPayload({ sequenceId: "s1", contactIds: "c1" })).toBeNull();
  });
});

describe("executeAgentAction — fail-closed routing (no CRM mutation)", () => {
  const action = (actionType: string) => ({ id: "a", userId: null, actionType, payload: {} });
  it("fails closed for advance_deal", async () => {
    const r = await executeAgentAction("t", action("advance_deal"));
    expect(r.ok).toBe(false);
  });
  it("fails closed for enroll_sequence", async () => {
    const r = await executeAgentAction("t", action("enroll_sequence"));
    expect(r.ok).toBe(false);
  });
  it("fails closed for an unknown type", async () => {
    const r = await executeAgentAction("t", action("teleport"));
    expect(r.ok).toBe(false);
  });
  // sequence-enrollment with an empty payload short-circuits in the validator
  // BEFORE any DB call — so this is safe to assert without a db mock.
  it("fails closed for sequence-enrollment with an empty payload (no DB touch)", async () => {
    const r = await executeAgentAction("t", action("sequence-enrollment"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sequenceId or contactIds/);
  });
});
