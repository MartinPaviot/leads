import { describe, it, expect } from "vitest";
import { checkQuietHours, resolveTimezone } from "@/lib/voice/quiet-hours";

describe("resolveTimezone", () => {
  it("prefers the explicit timezone when given", () => {
    expect(resolveTimezone("Europe/Berlin", "FR")).toBe("Europe/Berlin");
  });

  it("falls back to country primary timezone", () => {
    expect(resolveTimezone(undefined, "FR")).toBe("Europe/Paris");
    expect(resolveTimezone(null, "US")).toBe("America/New_York");
  });

  it("falls back to Europe/Paris when nothing is known", () => {
    expect(resolveTimezone(undefined, null)).toBe("Europe/Paris");
  });
});

describe("checkQuietHours", () => {
  it("is open at Tuesday 11:00 Paris", () => {
    // 2026-05-19 is a Tuesday; 11:00 Paris = 09:00 UTC.
    const t = new Date("2026-05-19T09:00:00Z");
    const status = checkQuietHours(t, "Europe/Paris");
    expect(status.inQuietHours).toBe(false);
    expect(status.localTime).toBe("11:00");
    expect(status.localDayOfWeek).toBe(2);
  });

  it("is closed at Tuesday 23:00 Paris", () => {
    const t = new Date("2026-05-19T21:00:00Z");
    const status = checkQuietHours(t, "Europe/Paris");
    expect(status.inQuietHours).toBe(true);
    expect(status.localTime).toBe("23:00");
  });

  it("is closed on Sunday in any local timezone", () => {
    // 2026-05-17 is a Sunday; pick noon local in Paris.
    const t = new Date("2026-05-17T10:00:00Z");
    const status = checkQuietHours(t, "Europe/Paris");
    expect(status.inQuietHours).toBe(true);
    expect(status.localDayOfWeek).toBe(0);
  });

  it("returns a next-window-opens-at when closed", () => {
    const t = new Date("2026-05-19T21:00:00Z");
    const status = checkQuietHours(t, "Europe/Paris");
    expect(status.nextWindowOpensAt).not.toBeNull();
    // Next window for Tuesday 23:00 Paris is Wednesday 8:00 Paris.
    if (status.nextWindowOpensAt) {
      const probe = checkQuietHours(status.nextWindowOpensAt, "Europe/Paris");
      expect(probe.inQuietHours).toBe(false);
    }
  });
});
