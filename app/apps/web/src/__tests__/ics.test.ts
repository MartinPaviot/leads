import { describe, it, expect } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine, toIcsUtc } from "@/lib/integrations/ics";

describe("ics — iCalendar builder", () => {
  const base = {
    uid: "pilae-abc123@elevay.dev",
    start: new Date("2026-06-20T08:00:00.000Z"),
    end: new Date("2026-06-20T08:45:00.000Z"),
    summary: "Échange Pilae",
    description: "Rejoindre la visio : https://visio.pilae.ch/pilae-abc123",
    location: "https://visio.pilae.ch/pilae-abc123",
    url: "https://visio.pilae.ch/pilae-abc123",
    organizer: { email: "rep@pilae.ch", name: "Martin Paviot" },
    attendees: [{ email: "prospect@example.ch", name: "Jean Dupont" }],
  };

  /** Rejoin RFC 5545 folded lines (CRLF + space) so assertions can match the
   *  logical content regardless of where folding fell. */
  const unfold = (ics: string) => ics.replace(/\r\n /g, "");

  it("emits a well-formed VCALENDAR/VEVENT with REQUEST method", () => {
    const ics = buildIcs({ ...base });
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:pilae-abc123@elevay.dev");
    expect(ics).toContain("END:VEVENT\r\nEND:VCALENDAR\r\n");
  });

  it("formats DTSTART/DTEND as UTC stamps", () => {
    const ics = buildIcs({ ...base });
    expect(ics).toContain("DTSTART:20260620T080000Z");
    expect(ics).toContain("DTEND:20260620T084500Z");
  });

  it("carries the sovereign join link in LOCATION and URL (never Meet/Teams)", () => {
    const ics = unfold(buildIcs({ ...base }));
    expect(ics).toContain("LOCATION:https://visio.pilae.ch/pilae-abc123");
    expect(ics).toContain("URL:https://visio.pilae.ch/pilae-abc123");
    expect(ics).not.toMatch(/meet\.google|teams\.microsoft|jit\.si/i);
  });

  it("writes ORGANIZER and an RSVP attendee as mailto", () => {
    const ics = unfold(buildIcs({ ...base }));
    expect(ics).toContain("ORGANIZER;CN=Martin Paviot:mailto:rep@pilae.ch");
    expect(ics).toContain(
      "ATTENDEE;CN=Jean Dupont;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:prospect@example.ch",
    );
  });

  it("escapes TEXT separators per §3.3.11", () => {
    expect(escapeIcsText("a; b, c\\ d\ne")).toBe("a\\; b\\, c\\\\ d\\ne");
    const ics = buildIcs({ ...base, summary: "Call: pricing; scope, next" });
    expect(ics).toContain("SUMMARY:Call: pricing\\; scope\\, next");
  });

  it("folds lines longer than 75 octets with a leading space", () => {
    const long = "X".repeat(200);
    const folded = foldIcsLine(`DESCRIPTION:${long}`);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const l of physical) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    for (let i = 1; i < physical.length; i++) expect(physical[i].startsWith(" ")).toBe(true);
  });

  it("toIcsUtc is stable regardless of local offset", () => {
    expect(toIcsUtc(new Date("2026-01-02T03:04:05.000Z"))).toBe("20260102T030405Z");
  });
});
