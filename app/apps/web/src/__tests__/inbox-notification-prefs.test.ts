import { describe, it, expect } from "vitest";
import {
  isInDnd,
  isEventEnabled,
  shouldNotify,
  clampPrefs,
  DEFAULT_PREFS,
  type NotificationPrefs,
} from "@/lib/inbox/notification-prefs";

const at = (h: number, m = 0) => h * 60 + m;

describe("notification-prefs (INBOX-N01/N02/N03)", () => {
  it("isInDnd handles a normal daytime window", () => {
    expect(isInDnd(at(13), "12:00", "14:00")).toBe(true);
    expect(isInDnd(at(11), "12:00", "14:00")).toBe(false);
    expect(isInDnd(at(14), "12:00", "14:00")).toBe(false); // end exclusive
  });

  it("isInDnd wraps past midnight (22:00 -> 07:00)", () => {
    expect(isInDnd(at(23), "22:00", "07:00")).toBe(true);
    expect(isInDnd(at(3), "22:00", "07:00")).toBe(true);
    expect(isInDnd(at(12), "22:00", "07:00")).toBe(false);
  });

  it("isInDnd is off when unset or degenerate", () => {
    expect(isInDnd(at(13), null, null)).toBe(false);
    expect(isInDnd(at(13), "09:00", "09:00")).toBe(false);
    expect(isInDnd(at(13), "bad", "14:00")).toBe(false);
  });

  it("isEventEnabled uses per-event defaults then overrides", () => {
    expect(isEventEnabled(DEFAULT_PREFS, "important_inbound")).toBe(true);
    expect(isEventEnabled(DEFAULT_PREFS, "bulk_summary")).toBe(false);
    const p: NotificationPrefs = { ...DEFAULT_PREFS, events: { important_inbound: false, bulk_summary: true } };
    expect(isEventEnabled(p, "important_inbound")).toBe(false);
    expect(isEventEnabled(p, "bulk_summary")).toBe(true);
    expect(isEventEnabled(DEFAULT_PREFS, "unknown")).toBe(false);
  });

  it("shouldNotify gates on the event toggle AND the DND window", () => {
    const p: NotificationPrefs = { ...DEFAULT_PREFS, dndStart: "22:00", dndEnd: "07:00" };
    expect(shouldNotify(p, "important_inbound", at(10))).toBe(true);
    expect(shouldNotify(p, "important_inbound", at(23))).toBe(false); // in DND
    expect(shouldNotify(p, "bulk_summary", at(10))).toBe(false); // event off by default
  });

  it("clampPrefs normalizes invalid digest, partial DND, and unknown events", () => {
    const c = clampPrefs({
      events: { important_inbound: false, ghost: true } as Record<string, boolean>,
      digest: "whenever" as unknown as "morning",
      dndStart: "22:00",
      dndEnd: "bad",
    });
    expect(c.digest).toBe("morning"); // invalid -> default
    expect(c.dndStart).toBeNull(); // partial window -> dropped
    expect(c.dndEnd).toBeNull();
    expect(c.events).toEqual({ important_inbound: false }); // unknown dropped
  });

  it("survives hostile non-string DND values without crashing", () => {
    const c = clampPrefs({ dndStart: 1430 as unknown as string, dndEnd: {} as unknown as string });
    expect(c.dndStart).toBeNull();
    expect(c.dndEnd).toBeNull();
    expect(isInDnd(600, 1430 as unknown as string, "07:00")).toBe(false);
  });
});
