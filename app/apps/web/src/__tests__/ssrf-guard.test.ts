import { describe, it, expect, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    // Deterministic test DNS — `public.example.com` resolves to a real
    // public IP; `evil-rebind.example.com` to a private one; everything
    // else throws ENOTFOUND.
    if (host === "public.example.com") return [{ address: "93.184.216.34", family: 4 }];
    if (host === "evil-rebind.example.com") return [{ address: "10.0.0.5", family: 4 }];
    if (host === "metadata-masquerade.example.com")
      return [{ address: "169.254.169.254", family: 4 }];
    if (host === "v6-public.example.com")
      return [{ address: "2606:4700:4700::1111", family: 6 }];
    if (host === "v6-loopback.example.com")
      return [{ address: "::1", family: 6 }];
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  }),
}));

import { assertPublicUrl } from "@/lib/ssrf-guard";

describe("assertPublicUrl — SSRF regression (C9)", () => {
  it("accepts a public HTTPS URL", async () => {
    const res = await assertPublicUrl("https://public.example.com/foo");
    expect(res.ok).toBe(true);
    expect(res.url).toMatch(/^https:\/\/public\.example\.com\//);
  });

  it("accepts a bare public domain and defaults to https", async () => {
    const res = await assertPublicUrl("public.example.com");
    expect(res.ok).toBe(true);
    expect(res.url).toMatch(/^https:\/\//);
  });

  it("rejects http:// by default", async () => {
    const res = await assertPublicUrl("http://public.example.com");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("scheme_not_allowed");
  });

  it("rejects non-web schemes", async () => {
    for (const u of ["file:///etc/passwd", "gopher://evil/x", "data:text/html,x", "ftp://example.com"]) {
      const res = await assertPublicUrl(u);
      expect(res.ok).toBe(false);
    }
  });

  it("rejects literal localhost", async () => {
    const res = await assertPublicUrl("https://localhost");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("localhost");
  });

  it("rejects IPv4 loopback", async () => {
    const res = await assertPublicUrl("https://127.0.0.1/admin");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("private_ipv4");
  });

  it("rejects RFC1918 IPv4 literals", async () => {
    for (const ip of ["10.0.0.5", "172.20.1.1", "192.168.1.1"]) {
      const res = await assertPublicUrl(`https://${ip}`);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("private_ipv4");
    }
  });

  it("rejects the AWS/GCP metadata IP", async () => {
    const res = await assertPublicUrl("https://169.254.169.254/latest/meta-data/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("private_ipv4");
  });

  it("rejects metadata hostname 'metadata.google.internal'", async () => {
    const res = await assertPublicUrl("https://metadata.google.internal/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("metadata_host");
  });

  it("rejects private TLDs like .internal and .local", async () => {
    for (const host of ["neon.internal", "cache.local", "svc.corp"]) {
      const res = await assertPublicUrl(`https://${host}`);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("private_tld");
    }
  });

  it("rejects a hostname that DNS-resolves to a private address", async () => {
    const res = await assertPublicUrl("https://evil-rebind.example.com/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("resolves_to_private_ipv4");
  });

  it("rejects a hostname that DNS-resolves to the cloud metadata IP", async () => {
    const res = await assertPublicUrl("https://metadata-masquerade.example.com/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("resolves_to_private_ipv4");
  });

  it("rejects IPv6 loopback", async () => {
    const res = await assertPublicUrl("https://[::1]/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("private_ipv6");
  });

  it("accepts a public IPv6 address", async () => {
    const res = await assertPublicUrl("https://[2606:4700:4700::1111]/");
    expect(res.ok).toBe(true);
  });

  it("rejects DNS lookup failures fail-closed", async () => {
    const res = await assertPublicUrl("https://does-not-exist-anywhere.example.com/");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("dns_failed");
  });

  it("rejects empty and non-string inputs", async () => {
    expect((await assertPublicUrl("")).ok).toBe(false);
    // @ts-expect-error intentionally passing wrong type
    expect((await assertPublicUrl(null)).ok).toBe(false);
  });
});
