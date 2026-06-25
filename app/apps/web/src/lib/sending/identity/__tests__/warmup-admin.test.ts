import { describe, it, expect, vi } from "vitest";
import { setTenantWarmup, mailboxWarmupOverview, type TenantWarmupDeps } from "../warmup-admin";

const deps = (over: Partial<TenantWarmupDeps> = {}): TenantWarmupDeps => ({
  resolveKey: vi.fn(async () => "k_tenant"),
  listAccounts: vi.fn(async () => ({ ok: true, accounts: [{ email: "a@x.com" }, { email: "b@x.com" }] })),
  setWarmup: vi.fn(async () => ({ ok: true, jobId: "job_1" })),
  ...over,
});

describe("setTenantWarmup", () => {
  it("enables warmup for ALL of the tenant's mailboxes and returns the job id", async () => {
    const d = deps();
    const r = await setTenantWarmup("t1", "enable", d);
    expect(r).toEqual({ ok: true, action: "enable", mailboxes: 2, jobId: "job_1" });
    expect(d.setWarmup).toHaveBeenCalledWith("k_tenant", ["a@x.com", "b@x.com"], "enable");
  });

  it("Instantly not connected → instantly_not_connected (no list/setWarmup call)", async () => {
    const d = deps({ resolveKey: vi.fn(async () => null) });
    const r = await setTenantWarmup("t1", "enable", d);
    expect(r).toMatchObject({ ok: false, reason: "instantly_not_connected", mailboxes: 0 });
    expect(d.listAccounts).not.toHaveBeenCalled();
    expect(d.setWarmup).not.toHaveBeenCalled();
  });

  it("list failure → list_accounts_failed (no setWarmup call)", async () => {
    const d = deps({ listAccounts: vi.fn(async () => ({ ok: false, accounts: [], errorMessage: "401" })) });
    const r = await setTenantWarmup("t1", "enable", d);
    expect(r).toMatchObject({ ok: false, reason: "list_accounts_failed" });
    expect(d.setWarmup).not.toHaveBeenCalled();
  });

  it("a tenant with no mailboxes → no_mailboxes", async () => {
    const d = deps({ listAccounts: vi.fn(async () => ({ ok: true, accounts: [] })) });
    expect(await setTenantWarmup("t1", "enable", d)).toMatchObject({ ok: false, reason: "no_mailboxes" });
  });

  it("a requested subset is INTERSECTED with the tenant's own mailboxes (security: never an outside address)", async () => {
    const d = deps();
    const r = await setTenantWarmup("t1", "disable", d, { emails: ["A@X.com", "evil@attacker.com"] });
    // "evil@attacker.com" is dropped; only the tenant's own "a@x.com" (case-insensitive) acts.
    expect(r).toEqual({ ok: true, action: "disable", mailboxes: 1, jobId: "job_1" });
    expect(d.setWarmup).toHaveBeenCalledWith("k_tenant", ["a@x.com"], "disable");
  });

  it("a subset matching NONE of the tenant's mailboxes → no_matching_mailboxes (never acts)", async () => {
    const d = deps();
    const r = await setTenantWarmup("t1", "enable", d, { emails: ["evil@attacker.com"] });
    expect(r).toMatchObject({ ok: false, reason: "no_matching_mailboxes" });
    expect(d.setWarmup).not.toHaveBeenCalled();
  });

  it("a failed warmup call → warmup_call_failed (carries the mailbox count it attempted)", async () => {
    const d = deps({ setWarmup: vi.fn(async () => ({ ok: false, errorMessage: "500" })) });
    expect(await setTenantWarmup("t1", "enable", d)).toEqual({ ok: false, action: "enable", mailboxes: 2, reason: "warmup_call_failed" });
  });
});

describe("mailboxWarmupOverview", () => {
  it("maps accounts to per-mailbox warmup status + score, dropping rows without an email", async () => {
    expect(
      mailboxWarmupOverview([
        { email: "a@x.com", warmup_status: 1, stat_warmup_score: 85 },
        { email: "b@x.com" }, // no warmup fields → null
        { warmup_status: 1 }, // no email → dropped
      ]),
    ).toEqual([
      { email: "a@x.com", warmupStatus: 1, warmupScore: 85 },
      { email: "b@x.com", warmupStatus: null, warmupScore: null },
    ]);
  });
});
