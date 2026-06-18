// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml, stripDangerousHtml } from "@/lib/inbox/sanitize-email";

describe("sanitizeEmailHtml (authoritative DOM allowlist)", () => {
  it("drops <script> and its code entirely", () => {
    const out = sanitizeEmailHtml(`<p>Hi</p><script>alert(1)</script>`);
    expect(out).toContain("Hi");
    expect(out).not.toContain("alert");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("drops <style> WITHOUT leaking the CSS as visible text (the infra-sanitizer bug)", () => {
    const out = sanitizeEmailHtml(`<style>.x{color:red}</style><p>Body</p>`);
    expect(out).toContain("Body");
    expect(out).not.toContain("color:red");
    expect(out).not.toContain(".x{");
  });

  it("drops head/meta/link/base/iframe/object/embed/form/input", () => {
    // No resolvable src/href/data: the assertions only check tag removal, and
    // happy-dom would otherwise try to fetch them during parse.
    const out = sanitizeEmailHtml(
      `<head><meta charset="utf-8"><link rel="stylesheet"></head>` +
        `<iframe></iframe><object></object><embed>` +
        `<form><input name="card"></form><p>Keep</p>`,
    );
    expect(out).toContain("Keep");
    for (const bad of ["<iframe", "<object", "<embed", "<form", "<input", "<meta", "<link"]) {
      expect(out.toLowerCase()).not.toContain(bad);
    }
  });

  it("unwraps unknown tags but keeps their text", () => {
    const out = sanitizeEmailHtml(`<marquee>scrolling</marquee>`);
    expect(out).toContain("scrolling");
    expect(out.toLowerCase()).not.toContain("<marquee");
  });

  it("keeps email-safe structural tags", () => {
    const html = `<p>Para</p><strong>bold</strong><ul><li>one</li></ul>` +
      `<table><tbody><tr><td>cell</td></tr></tbody></table><blockquote>q</blockquote>`;
    const out = sanitizeEmailHtml(html);
    for (const keep of ["<p", "<strong", "<ul", "<li", "<table", "<td", "<blockquote"]) {
      expect(out.toLowerCase()).toContain(keep);
    }
  });

  it("strips inline event handlers", () => {
    const out = sanitizeEmailHtml(`<a href="https://ok.example" onclick="steal()">link</a>`);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("steal");
  });

  it("neutralises javascript: and data:text/html URLs", () => {
    const js = sanitizeEmailHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(js).not.toContain("javascript:");
    const data = sanitizeEmailHtml(`<a href="data:text/html,<script>alert(1)</script>">x</a>`);
    expect(data).not.toContain("data:text/html");
  });

  it("forces rel+target on links so they open safely", () => {
    const out = sanitizeEmailHtml(`<a href="https://ok.example">link</a>`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener");
  });

  it("strips layout-escape CSS but keeps benign styling", () => {
    const out = sanitizeEmailHtml(`<div style="position:fixed;color:#333">x</div>`);
    expect(out).not.toContain("position:fixed");
    expect(out).toContain("color:#333");
  });

  it("keeps an <img> src (remote images allowed in R01; proxy/blocking is R02/R07) but drops onerror", () => {
    const out = sanitizeEmailHtml(`<img src="https://cdn.example/a.png" alt="a" onerror="x()">`);
    expect(out).toContain("https://cdn.example/a.png");
    expect(out).not.toContain("onerror");
  });

  it("blocks every data: scheme on an href — no legit data: link in mail (R03)", () => {
    const out = sanitizeEmailHtml(`<a href="data:image/png;base64,iVBORw0KGgo=">x</a>`);
    expect(out).not.toContain("data:image/png");
    expect(out).toContain('href="#"');
  });

  it("neutralises vbscript:, file: and blob: hrefs (R03)", () => {
    expect(sanitizeEmailHtml(`<a href="vbscript:msgbox(1)">x</a>`)).not.toContain("vbscript:");
    expect(sanitizeEmailHtml(`<a href="file:///etc/passwd">x</a>`)).not.toContain("file:");
    expect(sanitizeEmailHtml(`<a href="blob:https://x.example/abc">x</a>`)).not.toContain("blob:");
  });

  it("keeps a benign data:image src but blocks a script-bearing data:image/svg src (R03)", () => {
    expect(sanitizeEmailHtml(`<img src="data:image/png;base64,iVBORw0KGgo=">`)).toContain("data:image/png");
    expect(sanitizeEmailHtml(`<img src="data:image/svg+xml;base64,PHN2Zz4=">`)).not.toContain("data:image/svg");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeEmailHtml("")).toBe("");
  });

  it("never throws on malformed / unclosed markup (INBOX-R09 robustness)", () => {
    expect(() => sanitizeEmailHtml("<div><p>unclosed <b>bold <a href=https://x.example>link")).not.toThrow();
    expect(() => sanitizeEmailHtml("<<>><sCrIpt<script>>alert(1)</script>")).not.toThrow();
    expect(() => sanitizeEmailHtml("<table><tr><td>cell")).not.toThrow();
  });
});

describe("stripDangerousHtml (server-safe pre-strip, no DOM)", () => {
  it("removes script/style content and inline handlers without a DOM", () => {
    const out = stripDangerousHtml(
      `<p onmouseover="x()">Hi</p><script>a()</script><style>.y{}</style>`,
    );
    expect(out).toContain("Hi");
    expect(out).not.toContain("a()");
    expect(out).not.toContain(".y{");
    expect(out).not.toContain("onmouseover");
  });

  it("neutralises javascript: hrefs", () => {
    const out = stripDangerousHtml(`<a href="javascript:evil()">x</a>`);
    expect(out).not.toContain("javascript:evil");
  });

  it("returns empty string for empty input", () => {
    expect(stripDangerousHtml("")).toBe("");
  });
});
