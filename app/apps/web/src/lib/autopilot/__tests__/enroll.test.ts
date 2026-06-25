import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrollOne, type EnrollOneDeps } from "../enroll";
import type { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import type { recordAgentAction } from "@/lib/agents/agent-actions";

const guardMock = vi.fn();
const recordDraftMock = vi.fn();
const valuesSpy = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const database = { insert: () => ({ values: valuesSpy }) } as any;

const deps = (): EnrollOneDeps => ({
  guard: guardMock as unknown as typeof guardEnrollment,
  recordDraft: recordDraftMock as unknown as typeof recordAgentAction,
  database,
});

beforeEach(() => {
  guardMock.mockReset();
  recordDraftMock.mockReset().mockResolvedValue(undefined);
  valuesSpy.mockReset();
});

describe("enrollOne", () => {
  it("draft → records a pending agent action (review lane), no enrollment insert", async () => {
    const res = await enrollOne({ tenantId: "t1", contactId: "c1", sequenceId: "s1", action: "draft", draftPayload: { companyId: "co1" } }, deps());
    expect(res.outcome).toBe("drafted");
    expect(recordDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        actionType: "sequence-enrollment",
        awaitingApproval: true,
        payload: expect.objectContaining({ source: "autopilot", sequenceId: "s1", contactIds: ["c1"], companyId: "co1" }),
      }),
    );
    expect(guardMock).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
  });

  it("auto + anti-collision clear → enrolls (active, step 1, due now)", async () => {
    guardMock.mockResolvedValue({ proceed: true });
    const res = await enrollOne({ tenantId: "t1", contactId: "c1", sequenceId: "s1", action: "auto" }, deps());
    expect(res.outcome).toBe("enrolled");
    expect(guardMock).toHaveBeenCalledWith({ tenantId: "t1", contactId: "c1", enrollmentId: "s1:c1" });
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: "s1", contactId: "c1", status: "active", currentStep: 1 }));
    expect(recordDraftMock).not.toHaveBeenCalled();
  });

  it("auto + anti-collision held → skipped, no double-enroll", async () => {
    guardMock.mockResolvedValue({ proceed: false });
    const res = await enrollOne({ tenantId: "t1", contactId: "c1", sequenceId: "s1", action: "auto" }, deps());
    expect(res.outcome).toBe("collision");
    expect(valuesSpy).not.toHaveBeenCalled();
  });
});
