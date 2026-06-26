import { describe, it, expect, vi } from "vitest";
import { provisionOwnMailboxWarmup, type ProvisionWarmupDeps, type ProvisionMailboxInput } from "../provision-own-mailbox-warmup";

const box: ProvisionMailboxInput = {
  email: "go@cold.com", password: "pw", smtpHost: "ssl0.ovh.net", smtpPort: 465, imapHost: "ssl0.ovh.net", imapPort: 993,
};

function deps(over: Partial<ProvisionWarmupDeps> = {}): ProvisionWarmupDeps {
  return {
    resolveKey: async () => "api-key",
    connect: async () => ({ ok: true, accountId: "acc_1" }),
    enableWarmup: async () => ({ ok: true, jobId: "job_1" }),
    ...over,
  };
}

describe("provisionOwnMailboxWarmup", () => {
  it("connects THEN enables warmup; returns accountId + jobId", async () => {
    const order: string[] = [];
    const r = await provisionOwnMailboxWarmup("t1", box, deps({
      connect: async () => { order.push("connect"); return { ok: true, accountId: "acc_1" }; },
      enableWarmup: async () => { order.push("warmup"); return { ok: true, jobId: "job_1" }; },
    }));
    expect(r).toMatchObject({ ok: true, accountId: "acc_1", jobId: "job_1" });
    expect(order).toEqual(["connect", "warmup"]); // connect must precede warmup
  });

  it("bails (no Instantly key) without calling connect/warmup", async () => {
    const connect = vi.fn(async () => ({ ok: true }));
    const r = await provisionOwnMailboxWarmup("t1", box, deps({ resolveKey: async () => null, connect }));
    expect(r).toMatchObject({ ok: false, reason: "instantly_not_connected" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("connect failure → reason connect_failed, warmup not attempted", async () => {
    const enableWarmup = vi.fn(async () => ({ ok: true }));
    const r = await provisionOwnMailboxWarmup("t1", box, deps({
      connect: async () => ({ ok: false, errorMessage: "Email address is already in use." }),
      enableWarmup,
    }));
    expect(r).toMatchObject({ ok: false, reason: "connect_failed" });
    expect(r.errorMessage).toContain("already in use");
    expect(enableWarmup).not.toHaveBeenCalled();
  });

  it("warmup-enable failure still surfaces the connected accountId", async () => {
    const r = await provisionOwnMailboxWarmup("t1", box, deps({
      connect: async () => ({ ok: true, accountId: "acc_9" }),
      enableWarmup: async () => ({ ok: false, errorMessage: "rate limited" }),
    }));
    expect(r).toMatchObject({ ok: false, reason: "warmup_enable_failed", accountId: "acc_9" });
  });
});
