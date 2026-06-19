import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROMPT,
  DEFAULT_WRITING_STYLE,
  clampWritingStyle,
  normalizeSchedulingLink,
  buildWritingStylePrompt,
  selectAudience,
  type WritingStyle,
  type Audience,
} from "@/lib/inbox/writing-style";

function styleWith(over: Partial<WritingStyle>): WritingStyle {
  return { ...DEFAULT_WRITING_STYLE, ...over };
}

const aud = (over: Partial<Audience>): Audience => ({
  id: over.id ?? "a1",
  label: over.label ?? "Investors",
  match: over.match ?? { kind: "domain", value: "sequoia.com" },
  prompt: over.prompt ?? "Be concise and metrics-led.",
});

describe("normalizeSchedulingLink", () => {
  it("accepts a bare domain and adds https", () => {
    expect(normalizeSchedulingLink("www.calendly.com/meeting")).toBe("https://www.calendly.com/meeting");
  });
  it("keeps an existing https url (drops trailing slash)", () => {
    expect(normalizeSchedulingLink("https://cal.com/me/")).toBe("https://cal.com/me");
  });
  it("rejects a non-link", () => {
    expect(normalizeSchedulingLink("not a link")).toBe("");
    expect(normalizeSchedulingLink("nodot")).toBe("");
    expect(normalizeSchedulingLink("")).toBe("");
    expect(normalizeSchedulingLink(null)).toBe("");
  });
});

describe("clampWritingStyle", () => {
  it("blank prompt falls back to the verbatim default (no blank textarea)", () => {
    expect(clampWritingStyle({ prompt: "   " }).prompt).toBe(DEFAULT_PROMPT);
    expect(clampWritingStyle({}).prompt).toBe(DEFAULT_PROMPT);
  });
  it("enforces caps", () => {
    const c = clampWritingStyle({
      prompt: "p".repeat(5000),
      aboutMe: "a".repeat(2000),
      role: "r".repeat(500),
      signOff: "s".repeat(500),
    });
    expect(c.prompt.length).toBe(2000);
    expect(c.aboutMe.length).toBe(600);
    expect(c.role.length).toBe(120);
    expect(c.signOff.length).toBe(120);
  });
  it("normalizes the scheduling link and drops a malformed one", () => {
    expect(clampWritingStyle({ schedulingLink: "calendly.com/x" }).schedulingLink).toBe("https://calendly.com/x");
    expect(clampWritingStyle({ schedulingLink: "garbage" }).schedulingLink).toBe("");
  });
  it("drops audiences without a label or prompt, caps at 8", () => {
    const audiences = [
      aud({ id: "1", label: "", prompt: "x" }),
      aud({ id: "2", label: "ok", prompt: "" }),
      ...Array.from({ length: 10 }, (_, i) => aud({ id: `k${i}`, label: `L${i}`, prompt: `P${i}` })),
    ];
    const c = clampWritingStyle({ audiences });
    expect(c.audiences.length).toBe(8);
    expect(c.audiences.every((a) => a.label && a.prompt)).toBe(true);
  });
  it("drops an audience whose non-all match has no value", () => {
    const c = clampWritingStyle({ audiences: [aud({ match: { kind: "domain", value: "" } })] });
    expect(c.audiences).toHaveLength(0);
  });
  it("keeps a valid 'all' match without a value", () => {
    const c = clampWritingStyle({ audiences: [aud({ id: "z", label: "Everyone", match: { kind: "all" }, prompt: "Friendly." })] });
    expect(c.audiences[0].match).toEqual({ kind: "all" });
  });
  it("preserves derivedAt when present", () => {
    expect(clampWritingStyle({ derivedAt: "2026-06-19T00:00:00.000Z" }).derivedAt).toBe("2026-06-19T00:00:00.000Z");
    expect(clampWritingStyle({}).derivedAt).toBeUndefined();
  });
});

describe("buildWritingStylePrompt", () => {
  it("emits the base prompt, role, about-me, sign-off and scheduling guidance in order", () => {
    const { prompt } = buildWritingStylePrompt(
      styleWith({
        prompt: "Be warm.",
        role: "Founder at Acme",
        aboutMe: "Ex-Stripe, building GTM tools.",
        signOff: "Best",
        schedulingLink: "https://cal.com/me",
      }),
    );
    expect(prompt).toContain("Write in this style:\nBe warm.");
    expect(prompt).toContain("The user is Founder at Acme.");
    expect(prompt).toContain("About the user: Ex-Stripe, building GTM tools.");
    expect(prompt).toContain('Sign off with "Best".');
    expect(prompt).toContain("offer this booking link: https://cal.com/me");
    expect(prompt).toContain("Never invent or guess a link.");
  });
  it("uses the matched audience prompt IN PLACE OF the base (R4.3)", () => {
    const style = styleWith({
      prompt: "BASE STYLE",
      audiences: [aud({ id: "inv", prompt: "AUDIENCE STYLE" })],
    });
    const { prompt } = buildWritingStylePrompt(style, "inv");
    expect(prompt).toContain("AUDIENCE STYLE");
    expect(prompt).not.toContain("BASE STYLE");
  });
  it("scrubs auto-send phrasing and reports it as ignored (R2.4)", () => {
    const { prompt, ignored } = buildWritingStylePrompt(
      styleWith({ prompt: "- Be brief.\n- Auto-send without my approval.\n- Stay friendly." }),
    );
    expect(prompt).toContain("Be brief.");
    expect(prompt).toContain("Stay friendly.");
    expect(prompt).not.toMatch(/auto-send/i);
    expect(ignored.some((i) => /auto-send/i.test(i))).toBe(true);
  });
  it("omits empty optional blocks", () => {
    const { prompt } = buildWritingStylePrompt(styleWith({ prompt: "Just style.", role: "", aboutMe: "", signOff: "", schedulingLink: "" }));
    expect(prompt).toBe("Write in this style:\nJust style.");
  });
});

describe("selectAudience", () => {
  const style = styleWith({
    audiences: [
      aud({ id: "dom", label: "Sequoia", match: { kind: "domain", value: "sequoia.com" }, prompt: "VC tone" }),
      aud({ id: "title", label: "Eng leaders", match: { kind: "title", value: "engineer" }, prompt: "Technical tone" }),
      aud({ id: "tag", label: "VIP", match: { kind: "contact_tag", value: "vip" }, prompt: "White-glove" }),
    ],
  });

  it("matches by recipient email domain", () => {
    expect(selectAudience(style, { email: "partner@sequoia.com" })?.id).toBe("dom");
  });
  it("matches by contact title substring (case-insensitive)", () => {
    expect(selectAudience(style, { title: "Staff Software Engineer" })?.id).toBe("title");
  });
  it("matches by contact tag", () => {
    expect(selectAudience(style, { tags: ["VIP"] })?.id).toBe("tag");
  });
  it("first match wins, order-stable", () => {
    // a recipient that matches both domain and title resolves the EARLIER audience
    expect(selectAudience(style, { email: "cto@sequoia.com", title: "Engineer" })?.id).toBe("dom");
  });
  it("returns null when nothing matches (→ base prompt)", () => {
    expect(selectAudience(style, { email: "x@other.com", title: "Marketer", tags: [] })).toBeNull();
  });
  it("an 'all' audience always matches", () => {
    const s = styleWith({ audiences: [aud({ id: "all", label: "Everyone", match: { kind: "all" }, prompt: "Friendly" })] });
    expect(selectAudience(s, {})?.id).toBe("all");
  });
});
