// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { applyEmailPrivacy, isSuspiciousLink } from "@/lib/inbox/email-privacy";

describe("isSuspiciousLink (R03)", () => {
  it("flags when the visible domain differs from the destination", () => {
    expect(isSuspiciousLink("paypal.com", "https://evil.example/login")).toBe(true);
    expect(isSuspiciousLink("Visit www.bank.com now", "https://phish.example")).toBe(true);
  });
  it("accepts a subdomain of the same registrable domain", () => {
    expect(isSuspiciousLink("mail.paypal.com", "https://paypal.com/x")).toBe(false);
  });
  it("ignores links whose text names no domain", () => {
    expect(isSuspiciousLink("Click here", "https://anywhere.example")).toBe(false);
  });
  it("accepts matching domains", () => {
    expect(isSuspiciousLink("see example.com", "https://example.com/p")).toBe(false);
  });
  it("flags raw-IP and punycode destinations regardless of text", () => {
    expect(isSuspiciousLink("", "http://192.168.10.4/x")).toBe(true);
    expect(isSuspiciousLink("", "https://xn--80ak6aa92e.example/x")).toBe(true);
  });
  it("catches same-eTLD phishing on common multi-part TLDs", () => {
    expect(isSuspiciousLink("bank.co.uk", "https://phish.co.uk/login")).toBe(true);
    expect(isSuspiciousLink("mail.bank.co.uk", "https://bank.co.uk/x")).toBe(false);
  });
});

describe("applyEmailPrivacy (R02/R07)", () => {
  it("removes 1x1 tracking pixels (width/height attr)", () => {
    const res = applyEmailPrivacy(`<p>hi</p><img src="https://t.example/p.gif" width="1" height="1">`);
    expect(res.html).not.toContain("t.example");
    expect(res.html.toLowerCase()).not.toContain("<img");
    expect(res.blockedRemoteImages).toBe(0); // a pixel is removed, not "blocked"
  });

  it("removes pixels declared via inline style", () => {
    const res = applyEmailPrivacy(`<img src="https://t.example/p.gif" style="width:1px;height:1px">`);
    expect(res.html.toLowerCase()).not.toContain("<img");
  });

  it("removes pixels declared with unitless / non-px styles", () => {
    expect(applyEmailPrivacy(`<img src="https://t.example/a.gif" style="width:0">`).html.toLowerCase()).not.toContain("<img");
    expect(applyEmailPrivacy(`<img src="https://t.example/b.gif" style="height:0pt">`).html.toLowerCase()).not.toContain("<img");
  });

  it("blocks a real remote image by default (no live src, stashed for later)", () => {
    const res = applyEmailPrivacy(`<img src="https://cdn.example/banner.png" width="600">`);
    expect(res.blockedRemoteImages).toBe(1);
    expect(res.html).toContain("data-blocked-src");
    expect(res.html).not.toMatch(/<img[^>]*\ssrc=/i); // no fetchable src remains
  });

  it("loads remote images through the proxy when asked", () => {
    const res = applyEmailPrivacy(`<img src="https://cdn.example/banner.png" width="600">`, {
      loadRemoteImages: true,
      proxyBase: "/api/inbox/image-proxy?url=",
    });
    expect(res.blockedRemoteImages).toBe(0);
    expect(res.html).toContain("/api/inbox/image-proxy?url=");
    expect(res.html).toContain(encodeURIComponent("https://cdn.example/banner.png"));
  });

  it("keeps inline data: images (no privacy leak)", () => {
    const data = "data:image/png;base64,iVBORw0KGgo=";
    const res = applyEmailPrivacy(`<img src="${data}" width="40">`);
    expect(res.blockedRemoteImages).toBe(0);
    expect(res.html).toContain("data:image/png");
  });

  it("flags suspicious links inline and counts them", () => {
    const res = applyEmailPrivacy(`<a href="https://evil.example/login">paypal.com</a>`);
    expect(res.suspiciousLinks).toBe(1);
    expect(res.html).toContain('data-suspicious="true"');
  });

  it("blocks a remote CSS background image by default (R07)", () => {
    const res = applyEmailPrivacy(`<div style="background-image:url(https://cdn.example/bg.png)">hi</div>`);
    expect(res.blockedRemoteImages).toBe(1);
    expect(res.html).not.toContain("cdn.example");
    expect(res.html).toContain("background-image:none");
  });

  it("proxies a remote CSS background when images are loaded (R07)", () => {
    const res = applyEmailPrivacy(`<div style="background:#fff url('https://cdn.example/b.png') no-repeat">x</div>`, {
      loadRemoteImages: true,
      proxyBase: "/api/inbox/image-proxy?url=",
    });
    expect(res.html).toContain("/api/inbox/image-proxy?url=");
    expect(res.html).toContain(encodeURIComponent("https://cdn.example/b.png"));
  });

  it("keeps a data: CSS background (no remote fetch, no leak)", () => {
    const res = applyEmailPrivacy(`<div style="background:url(data:image/png;base64,iVBORw0KGgo=)">x</div>`);
    expect(res.blockedRemoteImages).toBe(0);
    expect(res.html).toContain("data:image/png");
  });

  it("returns zeroed result for empty input", () => {
    expect(applyEmailPrivacy("")).toEqual({ html: "", blockedRemoteImages: 0, suspiciousLinks: 0 });
  });
});
