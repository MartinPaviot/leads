import { describe, it, expect } from "vitest";
import { isUrlSafeForProxy, isPrivateIp, isPrivateIpv4 } from "@/lib/inbox/proxy-guard";

describe("isPrivateIpv4", () => {
  it("flags loopback, private, link-local, CGNAT, multicast", () => {
    for (const ip of [
      "127.0.0.1", "10.0.0.1", "10.255.255.255", "192.168.1.1",
      "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1",
      "0.0.0.0", "224.0.0.1", "255.255.255.255",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "93.184.216.34"]) {
      expect(isPrivateIpv4(ip), ip).toBe(false);
    }
  });
  it("treats malformed octets as unsafe", () => {
    expect(isPrivateIpv4("999.1.1.1")).toBe(true);
  });
});

describe("isPrivateIp", () => {
  it("blocks every IPv6 literal wholesale", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "2001:4860:4860::8888", "[::1]"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
});

describe("isUrlSafeForProxy", () => {
  it("allows http/https to public DNS names and public IPs", () => {
    for (const u of [
      "https://cdn.example.com/a.png",
      "http://images.acme.co/logo.gif",
      "https://8.8.8.8/pixel.png",
      "https://sub.deep.example.org/x?y=1",
    ]) {
      expect(isUrlSafeForProxy(u), u).toBe(true);
    }
  });

  it("blocks non-http protocols", () => {
    for (const u of ["ftp://host.com/a", "file:///etc/passwd", "data:image/png;base64,xx", "javascript:alert(1)"]) {
      expect(isUrlSafeForProxy(u), u).toBe(false);
    }
  });

  it("blocks internal / private / loopback targets", () => {
    for (const u of [
      "http://localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://10.0.0.5/a.png",
      "http://192.168.1.1/a.png",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "http://[::1]/a.png",
      "https://intranet/logo.png", // single-label host
      "https://wiki.internal/x.png",
      "https://printer.local/x.png",
    ]) {
      expect(isUrlSafeForProxy(u), u).toBe(false);
    }
  });

  it("blocks non-default ports and embedded credentials", () => {
    expect(isUrlSafeForProxy("http://cdn.example.com:8080/a.png")).toBe(false);
    expect(isUrlSafeForProxy("https://user:pass@cdn.example.com/a.png")).toBe(false);
  });

  it("allows explicit default ports", () => {
    expect(isUrlSafeForProxy("https://cdn.example.com:443/a.png")).toBe(true);
    expect(isUrlSafeForProxy("http://cdn.example.com:80/a.png")).toBe(true);
  });

  it("rejects unparseable input", () => {
    expect(isUrlSafeForProxy("not a url")).toBe(false);
    expect(isUrlSafeForProxy("")).toBe(false);
  });
});
