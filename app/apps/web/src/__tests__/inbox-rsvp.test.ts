import { describe, it, expect } from "vitest";
import {
  isRsvpChoice,
  rsvpPartstat,
  rsvpSubject,
  rsvpBody,
  buildReplyIcs,
} from "@/lib/inbox/rsvp";
import { parseIcs } from "@/lib/inbox/parse-ics";

const now = new Date("2026-06-18T00:00:00Z");

const INVITE = [
  "BEGIN:VCALENDAR",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:abc-123@acme.io",
  "DTSTART:20260620T150000Z",
  "DTEND:20260620T153000Z",
  "SUMMARY:Intro call",
  "ORGANIZER:mailto:ada@acme.io",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("RSVP choice mapping (INBOX-CAL04)", () => {
  it("guards the choice union", () => {
    expect(isRsvpChoice("yes")).toBe(true);
    expect(isRsvpChoice("nope")).toBe(false);
  });

  it("maps choices to iTIP PARTSTAT", () => {
    expect(rsvpPartstat("yes")).toBe("ACCEPTED");
    expect(rsvpPartstat("maybe")).toBe("TENTATIVE");
    expect(rsvpPartstat("no")).toBe("DECLINED");
  });

  it("writes a clear subject + body", () => {
    expect(rsvpSubject("yes", "Intro call")).toBe("Accepted: Intro call");
    expect(rsvpBody("no", "Intro call")).toBe('I have declined "Intro call".');
    expect(rsvpBody("maybe", "Intro call", "Bob")).toBe('Bob has tentatively accepted "Intro call".');
  });
});

describe("buildReplyIcs", () => {
  it("emits a METHOD:REPLY with the responder's PARTSTAT and the original UID", () => {
    const ev = parseIcs(INVITE)!;
    const ics = buildReplyIcs({ event: ev, responderEmail: "me@my.co", choice: "yes", now })!;
    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("UID:abc-123@acme.io");
    expect(ics).toContain("ORGANIZER:mailto:ada@acme.io");
    expect(ics).toContain("ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@my.co");
    expect(ics).not.toContain("STATUS:CONFIRMED"); // not on an attendee reply
  });

  it("returns null when the invite has no organizer or UID", () => {
    const ev = parseIcs(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:x", "DTSTART:20260620T150000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n"))!;
    expect(buildReplyIcs({ event: ev, responderEmail: "me@my.co", choice: "yes", now })).toBeNull();
  });
});
