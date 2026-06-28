import { describe, it, expect } from "vitest";
import {
  renderBrandedEmail,
  getBrandedEmailAttachments,
  escapeHtml,
} from "@/lib/emails/email-shell";

describe("renderBrandedEmail", () => {
  it("renders the brand chrome: inline logo, wordmark, gradient bar, footer", () => {
    const html = renderBrandedEmail({
      heading: "Hello",
      bodyHtml: "<p>body</p>",
    });
    // Logo is referenced inline (cid:), never a hosted URL.
    expect(html).toContain('src="cid:orion-logo"');
    expect(html).not.toMatch(/src="https?:\/\//);
    // Wordmark + gradient bar + footer.
    expect(html).toContain(">Orion</span>");
    expect(html).toContain("linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D)");
    expect(html).toContain("Orion — the autonomous GTM engine");
  });

  it("escapes the heading but inserts body HTML verbatim", () => {
    const html = renderBrandedEmail({
      heading: "<script>alert(1)</script>",
      bodyHtml: "<p>raw <strong>html</strong></p>",
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("<p>raw <strong>html</strong></p>");
  });

  it("renders an Outlook-safe CTA button when given, and escapes its url", () => {
    const html = renderBrandedEmail({
      heading: "h",
      bodyHtml: "b",
      button: { label: "Confirm email", url: "https://x.test/v?t=a&b=1" },
    });
    expect(html).toContain('bgcolor="#2C6BED"');
    expect(html).toContain("Confirm email");
    expect(html).toContain('href="https://x.test/v?t=a&amp;b=1"');
  });

  it("omits the button table and fallback when no button/fallback is given", () => {
    const html = renderBrandedEmail({ heading: "h", bodyHtml: "b" });
    expect(html).not.toContain("bgcolor=");
    expect(html).not.toContain("Button not working?");
  });

  it("renders the fallback line, defaulting its url to the button's", () => {
    const html = renderBrandedEmail({
      heading: "h",
      bodyHtml: "b",
      button: { label: "Go", url: "https://x.test/go" },
      fallback: { text: "open it here" },
    });
    expect(html).toContain("Button not working?");
    expect(html).toContain(">open it here</a>");
    // Fallback link reuses the button url when no explicit url is set.
    expect(html.match(/href="https:\/\/x\.test\/go"/g)?.length).toBe(2);
  });

  it("lets the fallback override the url independently of the button", () => {
    const html = renderBrandedEmail({
      heading: "h",
      bodyHtml: "b",
      button: { label: "Go", url: "https://x.test/go" },
      fallback: { text: "here", url: "https://x.test/alt" },
    });
    expect(html).toContain('href="https://x.test/alt"');
  });

  it("renders a footnote when given and nothing when omitted", () => {
    const withNote = renderBrandedEmail({
      heading: "h",
      bodyHtml: "b",
      footnoteHtml: "fine print",
    });
    expect(withNote).toContain("fine print");
    const without = renderBrandedEmail({ heading: "h", bodyHtml: "b" });
    expect(without).not.toContain("fine print");
  });

  it("renders an escaped, hidden preheader when given and omits it otherwise", () => {
    const withPre = renderBrandedEmail({
      heading: "h",
      bodyHtml: "b",
      preheader: "Tom & Jerry invited you",
    });
    expect(withPre).toContain("display:none");
    expect(withPre).toContain("Tom &amp; Jerry invited you");
    const without = renderBrandedEmail({ heading: "h", bodyHtml: "b" });
    expect(without).not.toContain("display:none");
  });
});

describe("getBrandedEmailAttachments", () => {
  it("returns the inline logo whose contentId matches the cid in the HTML", () => {
    const atts = getBrandedEmailAttachments();
    expect(atts).toHaveLength(1);
    const [logo] = atts;
    expect(logo.filename).toBe("orion-logo.png");
    expect(logo.contentType).toBe("image/png");
    expect(typeof logo.content).toBe("string");
    expect(logo.content.length).toBeGreaterThan(100);

    const html = renderBrandedEmail({ heading: "h", bodyHtml: "b" });
    expect(html).toContain(`cid:${logo.contentId}`);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" id='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; id=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });
});
