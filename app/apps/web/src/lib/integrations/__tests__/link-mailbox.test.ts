import { describe, it, expect, vi } from "vitest";
import {
  deriveEeAccountId,
  buildEeOAuthBody,
  linkOAuthMailbox,
  type LinkResult,
  type EeOAuthBody,
  type LinkOAuthDeps,
} from "@/lib/integrations/link-mailbox";

type UpsertFn = NonNullable<LinkOAuthDeps["upsert"]>;
type SendFn = NonNullable<LinkOAuthDeps["send"]>;

function fakeMailbox(over: Record<string, unknown> = {}) {
  return { id: "mb_1", emailAddress: "x@acme.com", status: "warming_up", ...over } as unknown as LinkResult["mailbox"];
}

describe("deriveEeAccountId", () => {
  it("matches the route.ts rule (tenant + _ + email non-alphanumerics hyphenated)", () => {
    expect(deriveEeAccountId("t1", "jane.doe@acme.com")).toBe("t1_jane-doe-acme-com");
  });
});

describe("buildEeOAuthBody", () => {
  it("builds the gmail OAuth body with token custody fields", () => {
    const body = buildEeOAuthBody({ eeAccountId: "t1_x", email: "x@acme.com", displayName: "X", provider: "gmail", accessToken: "AT", refreshToken: "RT" });
    expect(body).toEqual({
      account: "t1_x",
      name: "X",
      oauth2: { provider: "gmail", auth: { user: "x@acme.com" }, accessToken: "AT", refreshToken: "RT" },
    });
  });
  it("maps outlook provider", () => {
    expect(buildEeOAuthBody({ eeAccountId: "t1_x", email: "x@acme.com", provider: "outlook", accessToken: "AT" }).oauth2.provider).toBe("outlook");
  });
});

describe("linkOAuthMailbox", () => {
  function deps(over: Record<string, unknown> = {}) {
    return {
      register: vi.fn<(b: EeOAuthBody) => Promise<void>>(async () => {}),
      upsert: vi.fn<UpsertFn>(async () => ({ mailbox: fakeMailbox(), created: true })),
      send: vi.fn<SendFn>(async () => ({})),
      ...over,
    };
  }

  const input = {
    authUserId: "u1",
    tenantId: "t1",
    provider: "gmail" as const,
    email: "Jane@Acme.com",
    displayName: "Jane",
    accessToken: "AT",
    refreshToken: "RT",
    appUserId: "app1",
    syncUserId: "clerk1",
  };

  it("registers with EE (lowercased email + derived account), upserts once, fires sync once", async () => {
    const d = deps();
    const res = await linkOAuthMailbox(input, d);
    expect(res.created).toBe(true);
    expect(d.register).toHaveBeenCalledTimes(1);
    const body = d.register.mock.calls[0][0];
    expect(body.account).toBe("t1_jane-acme-com");
    expect(body.oauth2.auth.user).toBe("jane@acme.com");
    expect(d.upsert).toHaveBeenCalledTimes(1);
    expect(d.upsert.mock.calls[0][0]).toMatchObject({ email: "jane@acme.com", eeAccountId: "t1_jane-acme-com", authUserId: "u1", provider: "gmail" });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][0]).toMatchObject({ name: "email/sync-requested", data: { mailboxId: "mb_1", tenantId: "t1", provider: "gmail" } });
  });

  it("EE failure aborts BEFORE any row or sync (R7.3 fail-closed)", async () => {
    const d = deps({ register: vi.fn(async () => { throw new Error("EmailEngine registration failed (502): nope"); }) });
    await expect(linkOAuthMailbox(input, d)).rejects.toThrow(/EmailEngine registration failed/);
    expect(d.upsert).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("idempotent re-link reflects created=false from the upsert", async () => {
    const d = deps({ upsert: vi.fn(async () => ({ mailbox: fakeMailbox(), created: false })) });
    const res = await linkOAuthMailbox(input, d);
    expect(res.created).toBe(false);
    expect(d.upsert).toHaveBeenCalledTimes(1);
  });

  it("never returns tokens on the result", async () => {
    const res = await linkOAuthMailbox(input, deps());
    expect(JSON.stringify(res)).not.toContain("AT");
    expect(JSON.stringify(res)).not.toContain("RT");
  });

  it("a sync-fire failure does not fail the link", async () => {
    const d = deps({ send: vi.fn(async () => { throw new Error("inngest down"); }) });
    const res = await linkOAuthMailbox(input, d);
    expect(res.created).toBe(true); // link still succeeds
  });
});
