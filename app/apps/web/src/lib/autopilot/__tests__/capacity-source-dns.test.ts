import { describe, it, expect, vi } from "vitest";
import { dnsAwareAuthResolver } from "../capacity-source";
import type { DnsAuthRecords } from "@/lib/sending/identity/auth";

const PASS: DnsAuthRecords = { spfPass: true, dmarcPass: true, dkimPass: true, dkimBits: 2048 };

describe("dnsAwareAuthResolver", () => {
  it("OAuth-managed domains are sendable WITHOUT any DNS lookup", async () => {
    const lookup = vi.fn(async (_d: string): Promise<DnsAuthRecords> => PASS);
    const map = await dnsAwareAuthResolver(
      [{ domain: "o.com", provider: "outlook" }, { domain: "g.com", provider: "gmail" }],
      lookup,
    );
    expect(map.get("o.com")?.sendable).toBe(true);
    expect(map.get("g.com")?.sendable).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("a self-managed domain that passes the DNS proof becomes sendable", async () => {
    const lookup = vi.fn(async (_d: string): Promise<DnsAuthRecords> => PASS);
    const map = await dnsAwareAuthResolver([{ domain: "send.client.com", provider: "smtp_custom" }], lookup);
    expect(map.get("send.client.com")?.sendable).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a self-managed domain that fails SPF stays NOT sendable", async () => {
    const lookup = vi.fn(async (_d: string): Promise<DnsAuthRecords> => ({ ...PASS, spfPass: false }));
    const map = await dnsAwareAuthResolver([{ domain: "bad.client.com", provider: "smtp_custom" }], lookup);
    const status = map.get("bad.client.com")!;
    expect(status.sendable).toBe(false);
    expect(status.failures).toContain("spf");
  });

  it("a DNS lookup error fails closed (not sendable), never throws", async () => {
    const lookup = vi.fn(async (_d: string): Promise<DnsAuthRecords> => { throw new Error("ENOTFOUND"); });
    const map = await dnsAwareAuthResolver([{ domain: "down.client.com", provider: "smtp_custom" }], lookup);
    expect(map.get("down.client.com")).toMatchObject({ sendable: false, failures: ["dns-lookup-failed"] });
  });

  it("dedupes by domain — one lookup per distinct domain", async () => {
    const lookup = vi.fn(async (_d: string): Promise<DnsAuthRecords> => PASS);
    await dnsAwareAuthResolver(
      [{ domain: "same.com", provider: "smtp_custom" }, { domain: "same.com", provider: "smtp_custom" }],
      lookup,
    );
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
