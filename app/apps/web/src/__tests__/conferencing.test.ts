import { describe, it, expect } from "vitest";
import {
  resolveConferencing,
  extraCcEmails,
  nativeAgendaText,
  nativeHtmlBody,
  whenLine,
  descriptionText,
  htmlBody,
} from "@/lib/integrations/calendar-write";

/** Distinctive fragment of RECORDING_NOTICE (the constant is module-private). */
const NOTICE = "sera enregistré pour en garder un compte rendu";

/** A minimal EventCore for the pure helpers. */
function core(
  over: {
    contactEmail?: string;
    attendees?: Array<{ email: string; name?: string }>;
    startTime?: Date;
    durationMinutes?: number;
    organizerTimeZone?: string;
  } = {},
) {
  return {
    contactEmail: over.contactEmail ?? "prospect@acme.com",
    contactName: "Prospect",
    startTime: over.startTime ?? new Date("2026-07-01T09:00:00.000Z"),
    durationMinutes: over.durationMinutes ?? 30,
    title: "Rendez-vous",
    attendees: over.attendees,
    organizerTimeZone: over.organizerTimeZone,
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

  it("native bodies include the WHEN line when provided", () => {
    expect(nativeHtmlBody("Rdv", "", "Jeudi 9 juillet, 09:00")).toContain("Jeudi 9 juillet, 09:00");
    expect(nativeAgendaText("Ordre du jour", "Jeudi 9 juillet, 09:00")).toContain("Jeudi 9 juillet, 09:00");
    // when-only (no agenda) still carries the when.
    expect(nativeAgendaText(undefined, "Jeudi 9 juillet")).toBe("Jeudi 9 juillet");
  });
});

describe("recording disclosure — appears only when Jibri will record (recorded=true)", () => {
  const URL = "https://visio.pilae.ch/rdv-ab3k";

  it("descriptionText omits the notice by default and when recorded is false", () => {
    expect(descriptionText(URL)).not.toContain(NOTICE);
    expect(descriptionText(URL, "Agenda", "Jeudi 09:00", false)).not.toContain(NOTICE);
  });

  it("descriptionText appends the notice after the join line when recorded", () => {
    const txt = descriptionText(URL, undefined, undefined, true);
    expect(txt).toContain(NOTICE);
    // Non-alarming placement: the notice comes AFTER the join link, at the bottom.
    expect(txt.indexOf("Rejoindre la visio")).toBeLessThan(txt.indexOf(NOTICE));
  });

  it("htmlBody omits the notice by default and when recorded is false", () => {
    expect(htmlBody("Rdv", URL)).not.toContain(NOTICE);
    expect(htmlBody("Rdv", URL, "Agenda", "Jeudi 09:00", false)).not.toContain(NOTICE);
  });

  it("htmlBody renders the notice as a muted trailing line when recorded", () => {
    const html = htmlBody("Rdv", URL, undefined, undefined, true);
    expect(html).toContain(NOTICE);
    expect(html).toMatch(/color:#6b7280/); // muted grey, not an alarm banner
    expect(html.indexOf("Rejoindre la visio")).toBeLessThan(html.indexOf(NOTICE));
  });

  it("native bodies never carry the recording notice (Meet/Teams aren't Jibri-recorded)", () => {
    expect(nativeHtmlBody("Rdv", "Agenda", "Jeudi 09:00")).not.toContain(NOTICE);
    expect(nativeAgendaText("Agenda", "Jeudi 09:00")).not.toContain(NOTICE);
  });
});

describe("whenLine — the invite states WHEN (date/time/zone in the organizer's zone)", () => {
  it("renders date + time range + a zone marker, weekday capitalized", () => {
    // 07:00Z + Europe/Paris (CEST +2) = 09:00 local, 30 min → 09:00–09:30.
    const w = whenLine(core({ startTime: new Date("2026-07-09T07:00:00.000Z"), durationMinutes: 30, organizerTimeZone: "Europe/Paris" }));
    expect(w).toContain("9 juillet 2026");
    expect(w).toContain("09:00");
    expect(w).toContain("09:30");
    expect(w).toMatch(/UTC\+2|GMT\+2|CEST|\+2/);
    expect(w[0]).toBe(w[0].toUpperCase()); // "Jeudi …" not "jeudi …"
  });
  it("falls back to UTC when the organizer zone is absent/invalid", () => {
    const w = whenLine(core({ startTime: new Date("2026-07-09T07:00:00.000Z"), durationMinutes: 30 }));
    expect(w).toContain("07:00");
    expect(w).toContain("07:30");
  });
});
