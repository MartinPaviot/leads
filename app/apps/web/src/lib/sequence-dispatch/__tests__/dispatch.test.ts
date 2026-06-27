import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub the DB-backed action recorder so the LinkedIn task-mode path is pure.
const recordMock = vi.fn(async () => ({ id: "act_li" }));
vi.mock("@/lib/agents/agent-actions", () => ({
  recordAgentAction: (...args: unknown[]) => recordMock(...(args as [])),
}));

import { linkedinMessageAdapter } from "../linkedin-adapter";
import { registerDefaults } from "../register-defaults";
import { getAdapter, resetRegistryForTest } from "../registry";
import type { DispatchInput } from "../types";

const input: DispatchInput = {
  tenantId: "t1",
  enrollmentId: "en1",
  contactId: "c1",
  step: { id: "s1", stepNumber: 2, stepType: "linkedin_message", subjectTemplate: "", bodyTemplate: "Connectons-nous", channelConfig: {} },
};

const ORIG = process.env.LINKEDIN_OUTREACH_PROVIDER;
beforeEach(() => {
  recordMock.mockClear();
  delete process.env.LINKEDIN_OUTREACH_PROVIDER;
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.LINKEDIN_OUTREACH_PROVIDER;
  else process.env.LINKEDIN_OUTREACH_PROVIDER = ORIG;
});

describe("linkedinMessageAdapter", () => {
  it("is always available (manual-task mode needs no creds)", () => {
    expect(linkedinMessageAdapter.isAvailable()).toBe(true);
  });

  it("no provider env → manual-task mode (records a Needs-you task)", async () => {
    const res = await linkedinMessageAdapter.dispatch(input);
    expect(res).toMatchObject({ ok: true, channel: "linkedin_message", artefactId: "act_li" });
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("provider env set but client unbuilt → fails loudly, no task", async () => {
    process.env.LINKEDIN_OUTREACH_PROVIDER = "unipile";
    const res = await linkedinMessageAdapter.dispatch(input);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not implemented");
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("registerDefaults", () => {
  it("registers email, linkedin_message and phone_task", () => {
    resetRegistryForTest();
    registerDefaults();
    expect(getAdapter("email")?.type).toBe("email");
    expect(getAdapter("linkedin_message")?.type).toBe("linkedin_message");
    expect(getAdapter("phone_task")?.type).toBe("phone_task");
    expect(getAdapter("phone_task")?.isAvailable()).toBe(true);
    resetRegistryForTest();
  });
});
