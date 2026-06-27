import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchStep,
  registerAdapter,
  resetRegistryForTest,
  type ChannelAdapter,
  type DispatchInput,
} from "@/lib/sequence-dispatch";

function stepInput(overrides: Partial<DispatchInput["step"]> = {}): DispatchInput {
  return {
    tenantId: "t1",
    enrollmentId: "e1",
    contactId: "c1",
    step: {
      id: "s1",
      stepNumber: 1,
      stepType: "email",
      subjectTemplate: "",
      bodyTemplate: "",
      channelConfig: {},
      ...overrides,
    },
  };
}

describe("sequence-dispatch registry", () => {
  beforeEach(() => {
    resetRegistryForTest();
  });

  it("returns a structured error when no adapter is registered for a type", async () => {
    const fake: ChannelAdapter = {
      type: "email",
      isAvailable: () => true,
      dispatch: vi.fn(),
    };
    registerAdapter(fake);
    const res = await dispatchStep(stepInput({ stepType: "sms" }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No adapter registered/);
    expect(fake.dispatch).not.toHaveBeenCalled();
  });

  it("returns a structured error when the adapter is registered but unavailable (missing creds)", async () => {
    registerAdapter({
      type: "linkedin_message",
      isAvailable: () => false,
      dispatch: vi.fn(),
    });
    const res = await dispatchStep(stepInput({ stepType: "linkedin_message" }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not available/);
  });

  it("routes to the matching adapter and returns its result", async () => {
    const dispatchMock = vi.fn<
      (input: DispatchInput) => Promise<{ ok: true; channel: "email"; artefactId: string }>
    >().mockResolvedValue({
      ok: true,
      channel: "email",
      artefactId: "outbound-42",
    });
    registerAdapter({ type: "email", isAvailable: () => true, dispatch: dispatchMock });
    const res = await dispatchStep(stepInput());
    expect(res.ok).toBe(true);
    expect(res.artefactId).toBe("outbound-42");
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("captures thrown adapter errors as structured DispatchResults (never crashes the cron)", async () => {
    registerAdapter({
      type: "gift",
      isAvailable: () => true,
      async dispatch() {
        throw new Error("sendoso 502");
      },
    });
    const res = await dispatchStep(stepInput({ stepType: "gift" }));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("sendoso 502");
  });

  it("re-registering with the same type replaces the previous adapter", async () => {
    registerAdapter({
      type: "email",
      isAvailable: () => true,
      async dispatch() { return { ok: false, channel: "email", error: "old" }; },
    });
    registerAdapter({
      type: "email",
      isAvailable: () => true,
      async dispatch() { return { ok: true, channel: "email", artefactId: "new" }; },
    });
    const res = await dispatchStep(stepInput());
    expect(res.ok).toBe(true);
    expect(res.artefactId).toBe("new");
  });

  it("email adapter delegates to the legacy pipeline via pendingReason (no double-send risk)", async () => {
    const { emailAdapter } = await import("@/lib/sequence-dispatch/email-adapter");
    registerAdapter(emailAdapter);
    const res = await dispatchStep(stepInput());
    expect(res.ok).toBe(true);
    expect(res.pendingReason).toMatch(/legacy sendSequenceStep/);
  });

  it("linkedin adapter fails loudly when a provider is set but the live client is unbuilt", async () => {
    // No provider → manual-task mode (covered with a mocked recorder in
    // lib/sequence-dispatch/__tests__/dispatch.test.ts). Here we assert the
    // remaining no-DB branch: a declared provider with no implementation must
    // fail loudly rather than silently drop the step.
    const prior = process.env.LINKEDIN_OUTREACH_PROVIDER;
    process.env.LINKEDIN_OUTREACH_PROVIDER = "unipile";
    try {
      const { linkedinMessageAdapter } = await import("@/lib/sequence-dispatch/linkedin-adapter");
      registerAdapter(linkedinMessageAdapter);
      const res = await dispatchStep(stepInput({ stepType: "linkedin_message" }));
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not implemented/);
    } finally {
      if (prior === undefined) delete process.env.LINKEDIN_OUTREACH_PROVIDER;
      else process.env.LINKEDIN_OUTREACH_PROVIDER = prior;
    }
  });
});
