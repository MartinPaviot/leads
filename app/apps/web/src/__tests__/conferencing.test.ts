import { describe, it, expect } from "vitest";
import { resolveConferencing } from "@/lib/integrations/calendar-write";

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
