import { describe, it, expect } from "vitest";
import { phoneToTimezone, hourInTimezone } from "@/lib/voice/phone-timezone";

describe("phoneToTimezone", () => {
  it("maps single-timezone countries to their zone", () => {
    expect(phoneToTimezone("+41 79 658 97 85")).toBe("Europe/Zurich");
    expect(phoneToTimezone("+33 6 49 11 99 21")).toBe("Europe/Paris");
    expect(phoneToTimezone("+49 151 23456789")).toBe("Europe/Berlin");
    expect(phoneToTimezone("+44 20 7946 0958")).toBe("Europe/London");
  });

  it("prefers the longest matching country code", () => {
    expect(phoneToTimezone("+352 621 123 456")).toBe("Europe/Luxembourg"); // not +35 / +3
    expect(phoneToTimezone("+358 40 1234567")).toBe("Europe/Helsinki");
    expect(phoneToTimezone("+353 1 234 5678")).toBe("Europe/Dublin");
  });

  it("returns null for genuinely multi-timezone countries (never guess)", () => {
    expect(phoneToTimezone("+1 650 253 0000")).toBeNull(); // US/CA
    expect(phoneToTimezone("+7 495 1234567")).toBeNull(); // RU
    expect(phoneToTimezone("+61 2 1234 5678")).toBeNull(); // AU
    expect(phoneToTimezone("+55 11 91234 5678")).toBeNull(); // BR
  });

  it("returns null for missing, malformed, or unknown numbers", () => {
    expect(phoneToTimezone(null)).toBeNull();
    expect(phoneToTimezone(undefined)).toBeNull();
    expect(phoneToTimezone("")).toBeNull();
    expect(phoneToTimezone("079 658 97 85")).toBeNull(); // no +, not E.164
    expect(phoneToTimezone("+12")).toBeNull(); // too short
    expect(phoneToTimezone("+999 123 4567")).toBeNull(); // unknown code
  });
});

describe("hourInTimezone", () => {
  const instant = new Date("2026-06-16T10:00:00Z"); // summer → CEST/BST in effect

  it("converts a UTC instant to the local hour of the zone", () => {
    expect(hourInTimezone(instant, "Europe/Zurich")).toBe(12); // UTC+2 (CEST)
    expect(hourInTimezone(instant, "Europe/London")).toBe(11); // UTC+1 (BST)
    expect(hourInTimezone(instant, "Asia/Tokyo")).toBe(19); // UTC+9
  });

  it("returns midnight as 0, never 24", () => {
    const midnightZurich = new Date("2026-06-15T22:00:00Z"); // 00:00 CEST next day
    expect(hourInTimezone(midnightZurich, "Europe/Zurich")).toBe(0);
  });

  it("returns null for an invalid zone", () => {
    expect(hourInTimezone(instant, "Mars/Phobos")).toBeNull();
  });
});
