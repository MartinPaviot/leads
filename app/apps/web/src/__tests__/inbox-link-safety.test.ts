import { describe, it, expect } from "vitest";
import { classifyLink, riskChipLabel, registrableish } from "@/lib/inbox/link-safety";

describe("classifyLink (R03) — benign cases", () => {
  it("passes a normal same-domain https link with the true host, no risk", () => {
    const s = classifyLink("https://example.com/pricing", "see example.com");
    expect(s.risky).toBe(false);
    expect(s.risks).toEqual([]);
    expect(s.realHost).toBe("example.com");
    expect(s.reason).toBeNull();
    expect(s.safeHref).toBe("https://example.com/pricing");
  });

  it("treats a subdomain of the same registrable domain as a match", () => {
    expect(classifyLink("https://paypal.com/x", "mail.paypal.com").risky).toBe(false);
  });

  it("does not flag mismatch when the visible text names no domain", () => {
    expect(classifyLink("https://anywhere.example/x", "Click here").risky).toBe(false);
  });

  it("allows mailto: and tel: with no host and no warning", () => {
    expect(classifyLink("mailto:a@b.com").risky).toBe(false);
    expect(classifyLink("mailto:a@b.com").safeHref).toBe("mailto:a@b.com");
    expect(classifyLink("tel:+15551234567").risky).toBe(false);
  });

  it("allows inline data:image links but neutralizes other data: payloads", () => {
    expect(classifyLink("data:image/png;base64,iVBORw0KGgo=").risky).toBe(false);
    const html = classifyLink("data:text/html,<script>alert(1)</script>");
    expect(html.risks).toContain("dangerous-scheme");
    expect(html.safeHref).toBe("#");
  });
});

describe("classifyLink (R03) — phishing & risk cases", () => {
  it("flags display-vs-destination mismatch and names the real host", () => {
    const s = classifyLink("https://evil.example/login", "www.paypal.com");
    expect(s.risks).toContain("mismatch");
    expect(s.realHost).toBe("evil.example");
    expect(s.reason).toContain("evil.example");
  });

  it("catches same-eTLD phishing on a multi-part TLD", () => {
    expect(classifyLink("https://phish.co.uk/login", "bank.co.uk").risks).toContain("mismatch");
    expect(classifyLink("https://bank.co.uk/x", "mail.bank.co.uk").risky).toBe(false);
  });

  it("flags raw IPv4 and IPv6 hosts regardless of text", () => {
    expect(classifyLink("http://192.168.10.4/x", "").risks).toContain("ip-literal");
    expect(classifyLink("http://[2001:db8::1]/x", "").risks).toContain("ip-literal");
  });

  it("flags punycode / IDN homograph hosts", () => {
    expect(classifyLink("https://xn--80ak6aa92e.example/x", "").risks).toContain("punycode");
  });

  it("flags credentials embedded before the @", () => {
    expect(classifyLink("https://support%40paypal.com:x@evil.example/", "paypal.com").risks).toContain("credentials");
    expect(classifyLink("https://user@host.example/").risks).toContain("credentials");
  });

  it("neutralizes javascript: and vbscript: schemes to '#'", () => {
    const js = classifyLink("javascript:alert(1)", "click");
    expect(js.risks).toContain("dangerous-scheme");
    expect(js.safeHref).toBe("#");
    expect(classifyLink("vbscript:msgbox(1)").safeHref).toBe("#");
  });

  it("collects every distinct risk and surfaces the highest-priority reason", () => {
    // credentials + mismatch + punycode all present; reason should be credentials (top priority).
    const s = classifyLink("https://login@xn--pypal-4ve.com/", "paypal.com");
    expect(s.risks).toEqual(expect.arrayContaining(["credentials", "punycode", "mismatch"]));
    expect(s.reason).toMatch(/credentials/i);
  });
});

describe("classifyLink (R03) — neutralized & edge inputs", () => {
  it("neutralizes relative, anchor and protocol-relative hrefs (no app-origin nav)", () => {
    for (const href of ["#section", "/dashboard", "../up", "//evil.example/x", "not a url"]) {
      const s = classifyLink(href);
      expect(s.safeHref).toBe("#");
      expect(s.realHost).toBeNull();
      expect(s.risky).toBe(false);
    }
  });

  it("neutralizes unknown schemes (file:, ftp:)", () => {
    expect(classifyLink("file:///etc/passwd").safeHref).toBe("#");
    expect(classifyLink("ftp://x.example/f").safeHref).toBe("#");
  });

  it("lowercases the host and strips a trailing dot", () => {
    expect(classifyLink("https://Example.COM./x", "").realHost).toBe("example.com");
  });

  it("returns a neutralized verdict for empty / whitespace href", () => {
    expect(classifyLink("").safeHref).toBe("#");
    expect(classifyLink("   ").realHost).toBeNull();
  });
});

describe("riskChipLabel (R03)", () => {
  it("returns null for benign links", () => {
    expect(riskChipLabel(classifyLink("https://example.com/x", "example.com"))).toBeNull();
  });
  it("labels a mismatch chip with the true host", () => {
    expect(riskChipLabel(classifyLink("https://evil.example/x", "paypal.com"))).toBe("goes to evil.example");
  });
  it("labels IP, punycode and credential chips", () => {
    expect(riskChipLabel(classifyLink("http://10.0.0.1/x", ""))).toBe("raw IP 10.0.0.1");
    expect(riskChipLabel(classifyLink("https://xn--80ak6aa92e.example/x", ""))).toBe("look-alike domain");
    expect(riskChipLabel(classifyLink("https://user@host.example/"))).toBe("hidden login");
  });
});

describe("registrableish (R03)", () => {
  it("collapses subdomains to the registrable domain", () => {
    expect(registrableish("a.b.example.com")).toBe("example.com");
  });
  it("keeps 3 labels for known multi-part TLDs", () => {
    expect(registrableish("mail.bank.co.uk")).toBe("bank.co.uk");
  });
});
