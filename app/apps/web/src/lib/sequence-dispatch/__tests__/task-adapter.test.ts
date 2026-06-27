import { describe, it, expect, vi } from "vitest";
import { makeManualTaskAdapter } from "../task-adapter";
import type { DispatchInput } from "../types";

const input = (over: Partial<DispatchInput> = {}): DispatchInput => ({
  tenantId: "t1",
  enrollmentId: "en1",
  contactId: "c1",
  step: {
    id: "s1",
    stepNumber: 2,
    stepType: "linkedin_message",
    subjectTemplate: "",
    bodyTemplate: "Bonjour, on se connecte ?",
    channelConfig: { connectionNote: "salut" },
    ...(over.step ?? {}),
  },
  ...over,
});

describe("makeManualTaskAdapter", () => {
  it("is always available (the human is the channel)", () => {
    expect(makeManualTaskAdapter("phone_task").isAvailable()).toBe(true);
  });

  it("records a Needs-you task (awaitingApproval) and returns ok + artefactId", async () => {
    const record = vi.fn(async (_a: { tenantId: string; actionType: string; awaitingApproval?: boolean; payload: Record<string, unknown> }) => ({ id: "act_9" }));
    const adapter = makeManualTaskAdapter("linkedin_message", { record });
    const res = await adapter.dispatch(input());

    expect(res).toMatchObject({ ok: true, channel: "linkedin_message", artefactId: "act_9" });
    expect(record).toHaveBeenCalledTimes(1);
    const arg = record.mock.calls[0][0];
    expect(arg.tenantId).toBe("t1");
    expect(arg.actionType).toBe("manual_linkedin_message");
    expect(arg.awaitingApproval).toBe(true); // → never auto-dispatched, only surfaces for the human
    expect(arg.payload).toMatchObject({ channel: "linkedin_message", contactId: "c1", enrollmentId: "en1", stepId: "s1", body: "Bonjour, on se connecte ?" });
  });

  it("uses the channel in the actionType (phone_task)", async () => {
    const record = vi.fn(async (_a: { tenantId: string; actionType: string; awaitingApproval?: boolean; payload: Record<string, unknown> }) => ({ id: "act_p" }));
    await makeManualTaskAdapter("phone_task", { record }).dispatch(input({ step: { id: "s1", stepNumber: 1, stepType: "phone_task", subjectTemplate: "", bodyTemplate: "Call them", channelConfig: {} } }));
    expect(record.mock.calls[0][0].actionType).toBe("manual_phone_task");
  });

  it("a record failure → ok:false with the error (never throws)", async () => {
    const record = vi.fn(async (_a: { tenantId: string; actionType: string; awaitingApproval?: boolean; payload: Record<string, unknown> }) => {
      throw new Error("db down");
    });
    const res = await makeManualTaskAdapter("linkedin_message", { record }).dispatch(input());
    expect(res).toMatchObject({ ok: false, channel: "linkedin_message" });
    expect(String(res.error)).toContain("db down");
  });
});
