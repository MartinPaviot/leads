import { describe, it, expect } from "vitest";
import {
  resolveConferencing,
  extraCcEmails,
  nativeAgendaText,
  nativeHtmlBody,
} from "@/lib/integrations/calendar-write";

/** A minimal EventCore for the pure envelope helper. */
function core(over: { contactEmail?: string; attendees?: Array<{ email: string; name?: string }> } = {}) {
  return {
    contactEmail: over.contactEmail ?? "prospect@acme.com",
    contactName: "Prospect",
    startTime: new Date("2026-07-01T09:00:00.000Z"),
    durationMinutes: 30,
    title: "Rendez-vous",
    attendees: over.attendees,
  };
}

describe("resolveConferencing — Visio / Meet / Teams / Zoom", () => {
  it("Teams only on Microsoft, else falls back to sovereign", () => {
    expect(resolveConferencing("teams", "microsoft", false)).toBe("teams");
    expect(resolveConferencing("teams", "google", false)).toBe("sovereign");
    expect(resolveConferencing("teams", "caldav", false)).toBe("sovereign");
  });

  it("Google Meet only on Google, else falls back to sovereign", () => {
    expect(resolveConferencing("google_meet", "google", false)).toBe("google_meet");
    expect(resolveConferencing("google_meet", "microsoft", false)).toBe("sovereign");
  });

  it("Zoom only when Zoom is configured (any calendar), else sovereign", () => {
    expect(resolveConferencing("zoom", "microsoft", true)).toBe("zoom");
    expect(resolveConferencing("zoom", "caldav", true)).toBe("zoom");
    expect(resolveConferencing("zoom", "microsoft", false)).toBe("sovereign");
  });

  it("sovereign stays sovereign on every provider", () => {
    expect(resolveConferencing("sovereign", "google", true)).toBe("sovereign");
    expect(resolveConferencing("sovereign", "microsoft", true)).toBe("sovereign");
    expect(resolveConferencing("sovereign", "caldav", true)).toBe("sovereign");
  });

  it("SMTP-only mailboxes (Zimbra…) get sovereign, or Zoom when configured", () => {
    expect(resolveConferencing("sovereign", "smtp", false)).toBe("sovereign");
    expect(resolveConferencing("teams", "smtp", false)).toBe("sovereign");
    expect(resolveConferencing("google_meet", "smtp", false)).toBe("sovereign");
    expect(resolveConferencing("zoom", "smtp", true)).toBe("zoom");
    expect(resolveConferencing("zoom", "smtp", false)).toBe("sovereign");
  });
});

describe("extraCcEmails — who gets Cc'd on the CalDAV/SMTP invite", () => {
  it("is empty when there are no extra invitees (just the prospect)", () => {
    expect(extraCcEmails(core())).toBe("");
    expect(extraCcEmails(core({ attendees: [] }))).toBe("");
  });

  it("returns the extra invitees, comma-joined, with the prospect excluded", () => {
    expect(
      extraCcEmails(core({ attendees: [{ email: "cofounder@us.io" }, { email: "vp@acme.com" }] })),
    ).toBe("cofounder@us.io, vp@acme.com");
  });

  it("never re-lists the prospect even if they're passed again (case-insensitive)", () => {
    expect(
      extraCcEmails(core({ attendees: [{ email: "PROSPECT@acme.com" }, { email: "ally@us.io" }] })),
    ).toBe("ally@us.io");
  });

  it("drops anyone in `exclude` (the organiser, already Cc'd on the SMTP path)", () => {
    expect(
      extraCcEmails(
        core({ attendees: [{ email: "me@elevay.dev" }, { email: "ally@us.io" }] }),
        ["me@elevay.dev"],
      ),
    ).toBe("ally@us.io");
  });

  it("dedups repeated guests case-insensitively", () => {
    expect(
      extraCcEmails(core({ attendees: [{ email: "ally@us.io" }, { email: "Ally@us.io" }] })),
    ).toBe("ally@us.io");
  });
});

describe("native Meet/Teams invite body carries the agenda (no visio line)", () => {
  it("nativeAgendaText returns the trimmed agenda, or undefined when blank", () => {
    expect(nativeAgendaText("  Tour produit + pricing  ")).toBe("Tour produit + pricing");
    expect(nativeAgendaText("   ")).toBeUndefined();
    expect(nativeAgendaText(undefined)).toBeUndefined();
  });

  it("nativeHtmlBody includes the agenda but never a 'Rejoindre la visio' link", () => {
    const html = nativeHtmlBody("Rendez-vous", "Tour produit\n8 sièges");
    expect(html).toContain("Rendez-vous");
    expect(html).toContain("Tour produit<br>8 sièges"); // newline → <br>
    expect(html).not.toMatch(/Rejoindre la visio|href=/); // native mints its own join
  });

  it("nativeHtmlBody escapes HTML and omits the agenda block when blank", () => {
    expect(nativeHtmlBody("A <b>& B", "")).toBe("<p>A &lt;b&gt;&amp; B</p>");
  });
});
