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

  it("falls back to the intended sovereign host when env is unset", () => {
    expect(getVideoMeetBaseUrl({})).toBe("https://visio.pilae.ch");
  });

  it("rejects a non-sovereign host (meet.jit.si) in production", () => {
    expect(() =>
      getVideoMeetBaseUrl({
        NODE_ENV: "production",
        VIDEO_MEET_BASE_URL: "https://meet.jit.si",
      }),
    ).toThrow(/non-sovereign/);
  });

  it("allows meet.jit.si outside production (dev placeholder only)", () => {
    expect(
      getVideoMeetBaseUrl({
        NODE_ENV: "development",
        VIDEO_MEET_BASE_URL: "https://meet.jit.si",
      }),
    ).toBe("https://meet.jit.si");
  });

  it("throws on an invalid base URL", () => {
    expect(() => getVideoMeetBaseUrl({ VIDEO_MEET_BASE_URL: "not a url" })).toThrow(
      /valid URL/,
    );
  });
});
