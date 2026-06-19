import { describe, it, expect } from "vitest";
import {
  createSovereignMeeting,
  getVideoMeetBaseUrl,
} from "@/lib/integrations/video-meeting";

const CH = { VIDEO_MEET_BASE_URL: "https://visio.pilae.ch" };

describe("video-meeting — sovereign visio links", () => {
  it("mints a Jitsi room on the configured sovereign host", () => {
    const m = createSovereignMeeting({ prefix: "pilae", env: CH });
    expect(m.provider).toBe("jitsi");
    expect(m.joinUrl.startsWith("https://visio.pilae.ch/pilae-")).toBe(true);
    // 18 chars from the unambiguous alphabet (no l/o/0/1).
    expect(m.roomName).toMatch(/^pilae-[a-km-z2-9]{18}$/);
  });

  it("never produces a meet.jit.si / Google / Teams link", () => {
    const m = createSovereignMeeting({ prefix: "pilae", env: CH });
    expect(m.joinUrl).not.toMatch(/jit\.si|google|teams|zoom|8x8/i);
  });

  it("makes the prospect's join frictionless (no mobile app interstitial)", () => {
    const m = createSovereignMeeting({ prefix: "pilae", env: CH });
    // disableDeepLinking → joins straight in the browser, no app, no account.
    expect(m.joinUrl).toContain("#config.disableDeepLinking=true");
    // The room name itself stays clean (it's the ICS UID / idempotency handle).
    expect(m.roomName).not.toContain("#");
  });

  it("lets the join config be overridden or cleared via env", () => {
    const cleared = createSovereignMeeting({
      env: { VIDEO_MEET_BASE_URL: "https://visio.pilae.ch", VIDEO_MEET_JOIN_CONFIG: "" },
    });
    expect(cleared.joinUrl).not.toContain("#");

    const custom = createSovereignMeeting({
      env: {
        VIDEO_MEET_BASE_URL: "https://visio.pilae.ch",
        VIDEO_MEET_JOIN_CONFIG: "config.disableDeepLinking=true&config.prejoinConfig.enabled=false",
      },
    });
    expect(custom.joinUrl).toContain("#config.disableDeepLinking=true&config.prejoinConfig.enabled=false");
  });

  it("does not collide across many rapid mints (high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      seen.add(createSovereignMeeting({ env: CH }).roomName);
    }
    expect(seen.size).toBe(5000);
  });

  it("strips trailing slashes and sanitises a messy prefix", () => {
    const m = createSovereignMeeting({
      prefix: "  Pilae Sales!! ",
      env: { VIDEO_MEET_BASE_URL: "https://visio.pilae.ch/" },
    });
    expect(m.joinUrl.startsWith("https://visio.pilae.ch/pilae-sales-")).toBe(true);
  });

  it("falls back to public meet.jit.si when env is unset (works without DNS)", () => {
    expect(getVideoMeetBaseUrl({})).toBe("https://meet.jit.si");
  });

  it("does not throw on a non-sovereign host in production (warns, still works)", () => {
    expect(
      getVideoMeetBaseUrl({ NODE_ENV: "production", VIDEO_MEET_BASE_URL: "https://meet.jit.si" }),
    ).toBe("https://meet.jit.si");
  });

  it("honours an explicit sovereign host", () => {
    expect(getVideoMeetBaseUrl({ VIDEO_MEET_BASE_URL: "https://visio.pilae.ch" })).toBe(
      "https://visio.pilae.ch",
    );
  });

  it("throws on an invalid base URL", () => {
    expect(() => getVideoMeetBaseUrl({ VIDEO_MEET_BASE_URL: "not a url" })).toThrow(
      /valid URL/,
    );
  });
});
