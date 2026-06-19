import { describe, it, expect } from "vitest";
import { extractCalendarFromPayload } from "@/lib/integrations/gmail";

const ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Sync\r\nEND:VEVENT\r\nEND:VCALENDAR";
const b64 = Buffer.from(ICS, "utf-8").toString("base64url");

describe("extractCalendarFromPayload (INBOX-R12/CAL — Gmail transport)", () => {
  it("extracts a nested text/calendar part", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: Buffer.from("hi").toString("base64url") } },
        { mimeType: "text/calendar; method=REQUEST", body: { data: b64 } },
      ],
    };
    expect(extractCalendarFromPayload(payload)).toContain("BEGIN:VEVENT");
  });

  it("extracts an application/ics part too", () => {
    expect(
      extractCalendarFromPayload({ mimeType: "multipart/mixed", parts: [{ mimeType: "application/ics", body: { data: b64 } }] }),
    ).toContain("SUMMARY:Sync");
  });

  it("recurses into deeply nested multiparts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/html", body: { data: Buffer.from("<p>x</p>").toString("base64url") } },
            { mimeType: "text/calendar", body: { data: b64 } },
          ],
        },
      ],
    };
    expect(extractCalendarFromPayload(payload)).toContain("VEVENT");
  });

  it("returns empty when there is no calendar part", () => {
    expect(extractCalendarFromPayload({ mimeType: "text/plain", body: { data: Buffer.from("x").toString("base64url") } })).toBe("");
    expect(extractCalendarFromPayload(null)).toBe("");
    expect(extractCalendarFromPayload({})).toBe("");
  });
});
