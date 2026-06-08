import { describe, it, expect } from "vitest";
import { mapIcsToMeetings } from "@/lib/integrations/caldav";

// RFC 5545 wants CRLF between content lines.
const CRLF = "\r\n";
function ics(lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Elevay//Test//EN", ...lines, "END:VCALENDAR"].join(CRLF);
}

const winStart = new Date("2026-06-01T00:00:00Z");
const winEnd = new Date("2026-06-30T23:59:59Z");

describe("mapIcsToMeetings", () => {
  it("maps a single timed event with attendees, organizer and a meeting link", () => {
    const data = ics([
      "BEGIN:VEVENT",
      "UID:evt-1@test",
      "SUMMARY:Discovery call with Acme",
      "DTSTART:20260610T140000Z",
      "DTEND:20260610T143000Z",
      "LOCATION:https://zoom.us/j/123456",
      "STATUS:CONFIRMED",
      "ORGANIZER;CN=Martin Paviot:mailto:martin@elevay.dev",
      "ATTENDEE;CN=Jane Doe;PARTSTAT=ACCEPTED:mailto:jane@acme.com",
      "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:bob@acme.com",
      "END:VEVENT",
    ]);

    const out = mapIcsToMeetings(data, winStart, winEnd);
    expect(out).toHaveLength(1);
    const m = out[0];
    expect(m.calendarEventId).toBe("evt-1@test");
    expect(m.title).toBe("Discovery call with Acme");
    expect(m.startTime.toISOString()).toBe("2026-06-10T14:00:00.000Z");
    expect(m.endTime.toISOString()).toBe("2026-06-10T14:30:00.000Z");
    expect(m.isAllDay).toBe(false);
    expect(m.status).toBe("confirmed");
    expect(m.meetingLink).toBe("https://zoom.us/j/123456");
    expect(m.organizer).toEqual({ email: "martin@elevay.dev", displayName: "Martin Paviot" });
    expect(m.attendees).toEqual([
      { email: "jane@acme.com", displayName: "Jane Doe", responseStatus: "accepted" },
      { email: "bob@acme.com", displayName: null, responseStatus: "needsAction" },
    ]);
  });

  it("flags all-day events", () => {
    const data = ics([
      "BEGIN:VEVENT",
      "UID:allday@test",
      "SUMMARY:Conference day",
      "DTSTART;VALUE=DATE:20260615",
      "DTEND;VALUE=DATE:20260616",
      "END:VEVENT",
    ]);
    const out = mapIcsToMeetings(data, winStart, winEnd);
    expect(out).toHaveLength(1);
    expect(out[0].isAllDay).toBe(true);
    expect(out[0].title).toBe("Conference day");
  });

  it("expands a weekly recurrence into per-occurrence ids inside the window", () => {
    const data = ics([
      "BEGIN:VEVENT",
      "UID:weekly@test",
      "SUMMARY:Weekly sync",
      "DTSTART:20260604T090000Z",
      "DTEND:20260604T093000Z",
      "RRULE:FREQ=WEEKLY;COUNT=10",
      "END:VEVENT",
    ]);
    const out = mapIcsToMeetings(data, winStart, winEnd);
    // June 2026 occurrences: 4, 11, 18, 25 — the rest fall past the window end.
    expect(out.length).toBe(4);
    // Every occurrence carries a stable, unique id derived from the master UID.
    expect(out.every((m) => m.calendarEventId.startsWith("weekly@test::"))).toBe(true);
    expect(new Set(out.map((m) => m.calendarEventId)).size).toBe(out.length);
    expect(out[0].startTime.toISOString()).toBe("2026-06-04T09:00:00.000Z");
  });

  it("drops events outside the window", () => {
    const data = ics([
      "BEGIN:VEVENT",
      "UID:old@test",
      "SUMMARY:Last year",
      "DTSTART:20250101T100000Z",
      "DTEND:20250101T110000Z",
      "END:VEVENT",
    ]);
    expect(mapIcsToMeetings(data, winStart, winEnd)).toHaveLength(0);
  });

  it("defaults a missing STATUS to confirmed and tolerates no attendees", () => {
    const data = ics([
      "BEGIN:VEVENT",
      "UID:bare@test",
      "SUMMARY:Solo block",
      "DTSTART:20260612T080000Z",
      "DTEND:20260612T083000Z",
      "END:VEVENT",
    ]);
    const out = mapIcsToMeetings(data, winStart, winEnd);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("confirmed");
    expect(out[0].attendees).toEqual([]);
    expect(out[0].meetingLink).toBeNull();
  });
});
