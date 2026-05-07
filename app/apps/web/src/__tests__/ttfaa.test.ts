import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` calls are hoisted above every top-level statement by Vitest,
// so the mock factories can't close over plain `const` variables (they'd
// be in the temporal dead zone when the factory runs). `vi.hoisted()`
// lets us declare mock state that gets hoisted alongside the mocks.
const { getSettingsMock, updateSettingsMock, captureEventMock, loggerWarnMock } =
  vi.hoisted(() => ({
    getSettingsMock: vi.fn(),
    updateSettingsMock: vi.fn(),
    captureEventMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  updateTenantSettings: (tenantId: string, updates: Record<string, unknown>) =>
    updateSettingsMock(tenantId, updates),
}));

vi.mock("@/lib/analytics/analytics", () => ({
  captureEvent: (
    distinctId: string,
    event: string,
    props?: Record<string, unknown>
  ) => captureEventMock(distinctId, event, props),
}));

vi.mock("@/lib/observability/logger", () => {
  const logger = {
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: logger, logger };
});

import { markTtfaaStarted, markTtfaaCompletedV1Proxy } from "@/lib/observability/ttfaa";

beforeEach(() => {
  getSettingsMock.mockReset();
  updateSettingsMock.mockReset();
  captureEventMock.mockReset();
  loggerWarnMock.mockReset();
  // Deterministic UUID so assertions are stable.
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "11111111-2222-3333-4444-555555555555" as `${string}-${string}-${string}-${string}-${string}`
  );
});

describe("markTtfaaStarted", () => {
  it("writes settings + emits ttfaa_started on first call", async () => {
    getSettingsMock.mockResolvedValue({}); // no prior session
    updateSettingsMock.mockResolvedValue(undefined);
    captureEventMock.mockResolvedValue(undefined);

    const result = await markTtfaaStarted({
      userId: "user-1",
      tenantId: "tenant-1",
      provider: "google",
    });

    expect(result.alreadyStarted).toBe(false);
    expect(result.sessionCorrelationId).toBe("11111111-2222-3333-4444-555555555555");

    // Settings written before the event fires.
    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
    const [tenantId, updates] = updateSettingsMock.mock.calls[0];
    expect(tenantId).toBe("tenant-1");
    expect(updates.ttfaaSessionId).toBe("11111111-2222-3333-4444-555555555555");
    expect(typeof updates.ttfaaStartedAt).toBe("string");
    expect(new Date(updates.ttfaaStartedAt as string).toString()).not.toBe("Invalid Date");

    expect(captureEventMock).toHaveBeenCalledTimes(1);
    expect(captureEventMock).toHaveBeenCalledWith("user-1", "ttfaa_started", {
      provider: "google",
      sessionCorrelationId: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("is idempotent — second call returns alreadyStarted with no write or emit", async () => {
    getSettingsMock.mockResolvedValue({
      ttfaaSessionId: "existing-session",
      ttfaaStartedAt: "2026-04-21T10:00:00.000Z",
    });

    const result = await markTtfaaStarted({
      userId: "user-1",
      tenantId: "tenant-1",
      provider: "microsoft-entra-id",
    });

    expect(result.alreadyStarted).toBe(true);
    expect(result.sessionCorrelationId).toBe("existing-session");
    expect(updateSettingsMock).not.toHaveBeenCalled();
    expect(captureEventMock).not.toHaveBeenCalled();
  });

  it("swallows DB errors and returns a safe default so auth never breaks", async () => {
    getSettingsMock.mockRejectedValue(new Error("DB down"));

    const result = await markTtfaaStarted({
      userId: "user-1",
      tenantId: "tenant-1",
      provider: "google",
    });

    expect(result.alreadyStarted).toBe(false);
    expect(result.sessionCorrelationId).toBe("");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ttfaa: markTtfaaStarted failed",
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    expect(captureEventMock).not.toHaveBeenCalled();
  });
});

describe("markTtfaaCompletedV1Proxy", () => {
  it("computes durationMs from ttfaaStartedAt and emits the event", async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString(); // 60 s ago
    getSettingsMock.mockResolvedValue({
      ttfaaStartedAt: startedAt,
      ttfaaSessionId: "existing-session",
    });
    updateSettingsMock.mockResolvedValue(undefined);
    captureEventMock.mockResolvedValue(undefined);

    const result = await markTtfaaCompletedV1Proxy({
      userId: "user-1",
      tenantId: "tenant-1",
      enrichedRecordCount: 12,
    });

    expect(result.alreadyCompleted).toBe(false);
    expect(result.durationMs).not.toBeNull();
    // Allow small clock skew between Date.now() in the test and inside the helper.
    expect(result.durationMs!).toBeGreaterThanOrEqual(59_000);
    expect(result.durationMs!).toBeLessThanOrEqual(61_000);
    expect(result.sessionCorrelationId).toBe("existing-session");

    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
    const [, updates] = updateSettingsMock.mock.calls[0];
    expect(typeof updates.ttfaaCompletedAtV1Proxy).toBe("string");

    expect(captureEventMock).toHaveBeenCalledTimes(1);
    const [distinctId, eventName, props] = captureEventMock.mock.calls[0];
    expect(distinctId).toBe("user-1");
    expect(eventName).toBe("ttfaa_completed_v1_proxy");
    expect(props).toMatchObject({
      enrichedRecordCount: 12,
      sessionCorrelationId: "existing-session",
    });
    expect(props.durationMs).toBeGreaterThanOrEqual(59_000);
  });

  it("is idempotent — second call returns alreadyCompleted with no write or emit", async () => {
    getSettingsMock.mockResolvedValue({
      ttfaaStartedAt: "2026-04-21T10:00:00.000Z",
      ttfaaSessionId: "existing-session",
      ttfaaCompletedAtV1Proxy: "2026-04-21T10:01:00.000Z",
    });

    const result = await markTtfaaCompletedV1Proxy({
      userId: "user-1",
      tenantId: "tenant-1",
      enrichedRecordCount: 5,
    });

    expect(result.alreadyCompleted).toBe(true);
    expect(result.durationMs).toBeNull();
    expect(result.sessionCorrelationId).toBe("existing-session");
    expect(updateSettingsMock).not.toHaveBeenCalled();
    expect(captureEventMock).not.toHaveBeenCalled();
  });

  it("fires with durationMs: 0 when ttfaaStartedAt is missing (legacy tenant path)", async () => {
    getSettingsMock.mockResolvedValue({}); // no start timestamp, no session
    updateSettingsMock.mockResolvedValue(undefined);
    captureEventMock.mockResolvedValue(undefined);

    const result = await markTtfaaCompletedV1Proxy({
      userId: "user-1",
      tenantId: "tenant-1",
      enrichedRecordCount: 7,
    });

    expect(result.alreadyCompleted).toBe(false);
    expect(result.durationMs).toBeNull();
    expect(result.sessionCorrelationId).toBeNull();

    expect(captureEventMock).toHaveBeenCalledTimes(1);
    const [, , props] = captureEventMock.mock.calls[0];
    // The event still fires with durationMs: 0 so PostHog sees the signal;
    // downstream queries filter nulls via the paired session ID.
    expect(props.durationMs).toBe(0);
    expect(props.sessionCorrelationId).toBe("");
  });

  it("ignores a ttfaaStartedAt that is in the future (clock skew guard)", async () => {
    const futureStart = new Date(Date.now() + 10_000).toISOString();
    getSettingsMock.mockResolvedValue({
      ttfaaStartedAt: futureStart,
      ttfaaSessionId: "skewed-session",
    });
    updateSettingsMock.mockResolvedValue(undefined);
    captureEventMock.mockResolvedValue(undefined);

    const result = await markTtfaaCompletedV1Proxy({
      userId: "user-1",
      tenantId: "tenant-1",
      enrichedRecordCount: 3,
    });

    // completed < started → durationMs remains null, event still fires.
    expect(result.durationMs).toBeNull();
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    const [, , props] = captureEventMock.mock.calls[0];
    expect(props.durationMs).toBe(0);
  });

  it("swallows DB errors and returns a safe default", async () => {
    getSettingsMock.mockRejectedValue(new Error("DB down"));

    const result = await markTtfaaCompletedV1Proxy({
      userId: "user-1",
      tenantId: "tenant-1",
      enrichedRecordCount: 0,
    });

    expect(result.alreadyCompleted).toBe(false);
    expect(result.durationMs).toBeNull();
    expect(result.sessionCorrelationId).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ttfaa: markTtfaaCompletedV1Proxy failed",
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    expect(captureEventMock).not.toHaveBeenCalled();
  });
});
