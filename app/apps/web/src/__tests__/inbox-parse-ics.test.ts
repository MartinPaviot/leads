import { describe, it, expect } from "vitest";
import { parseIcs, eventStatusLabel, isEventCancelled } from "@/lib/inbox/parse-ics";

const INVITE = [
  "BEGIN:VCALENDAR",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:abc-123@acme.com",
  "SUMMARY:Quarterly review with Acme",
  "DTSTART:20260618T140000Z",
  "DTEND:20260618T150000Z",
  "LOCATION:Zoom\\, link in description",
  "ORGANIZER;CN=Alice:mailto:Alice@Acme.com",
  "STATUS:CONFIRMED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs (INBOX-R12/CAL)", () => {
  it("parses a standard meeting invite", () => {
    const ev = parseIcs(INVITE)!;
    expect(ev).not.toBeNull();
    expect(ev.summary).toBe("Quarterly review with Acme");
    expect(ev.method).toBe("REQUEST");
    expect(ev.status).toBe("CONFIRMED");
    expect(ev.uid).toBe("abc-123@acme.com");
    expect(ev.allDay).toBe(false);
  });

  it("parses a UTC DTSTART/DTEND to the right instant", () => {
    const ev = parseIcs(INVITE)!;
    expect(ev.start?.toISOString()).toBe("2026-06-18T14:00:00.000Z");
    expect(ev.end?.toISOString()).toBe("2026-06-18T15:00:00.000Z");
  });

  it("unescapes TEXT values and lowercases the organizer email", () => {
    const ev = parseIcs(INVITE)!;
    expect(ev.location).toBe("Zoom, link in description");
    expect(ev.organizer).toBe("alice@acme.com");
  });

  it("treats a VALUE=DATE DTSTART as an all-day event", () => {
    const ev = parseIcs(
      "BEGIN:VEVENT\r\nSUMMARY:Company holiday\r\nDTSTART;VALUE=DATE:20260704\r\nEND:VEVENT",
    )!;
    expect(ev.allDay).toBe(true);
    expect(ev.summary).toBe("Company holiday");
    expect(ev.start).toBeInstanceOf(Date);
  });

  it("unfolds RFC 5545 line continuations", () => {
    const folded = "BEGIN:VEVENT\r\nSUMMARY:A very long meeting tit\r\n le that wraps\r\nDTSTART:20260101T090000Z\r\nEND:VEVENT";
    expect(parseIcs(folded)!.summary).toBe("A very long meeting title that wraps");
  });

  it("captures METHOD:CANCEL for a cancelled invite", () => {
    const cancel = "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nSUMMARY:Cancelled sync\r\nDTSTART:20260101T090000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const ev = parseIcs(cancel)!;
    expect(ev.method).toBe("CANCEL");
    expect(ev.status).toBe("CANCELLED");
  });

  it("reads only the first VEVENT", () => {
    const two = "BEGIN:VEVENT\r\nSUMMARY:First\r\nDTSTART:20260101T090000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Second\r\nEND:VEVENT";
    expect(parseIcs(two)!.summary).toBe("First");
  });

  it("returns null when there is no VEVENT or nothing usable", () => {
    expect(parseIcs("just some text")).toBeNull();
    expect(parseIcs("")).toBeNull();
    expect(parseIcs("BEGIN:VEVENT\r\nUID:x\r\nEND:VEVENT")).toBeNull(); // no summary, no start
  });

  it("never throws on malformed input", () => {
    expect(() => parseIcs("BEGIN:VEVENT\r\nDTSTART:garbage\r\nSUMMARY:Broken\r\n")).not.toThrow();
    const ev = parseIcs("BEGIN:VEVENT\r\nDTSTART:garbage\r\nSUMMARY:Broken\r\n")!;
    expect(ev.summary).toBe("Broken");
    expect(ev.start).toBeNull();
  });

  it("labels the invite from METHOD/STATUS and detects cancellation", () => {
    expect(eventStatusLabel(parseIcs(INVITE)!)).toBe("Invitation");
    const cancel = parseIcs("BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nSUMMARY:x\r\nDTSTART:20260101T090000Z\r\nEND:VEVENT")!;
    expect(eventStatusLabel(cancel)).toBe("Cancelled");
    expect(isEventCancelled(cancel)).toBe(true);
    expect(isEventCancelled(parseIcs(INVITE)!)).toBe(false);
    const tentative = parseIcs("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nSUMMARY:y\r\nDTSTART:20260101T090000Z\r\nSTATUS:TENTATIVE\r\nEND:VEVENT")!;
    expect(eventStatusLabel(tentative)).toBe("Tentative invitation");
  });
});
