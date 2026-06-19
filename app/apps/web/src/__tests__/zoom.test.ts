import { describe, it, expect } from "vitest";
import { zoomConfigured } from "@/lib/integrations/zoom";

describe("zoom — configured gate", () => {
  it("is configured only when all three S2S OAuth vars are present", () => {
    expect(zoomConfigured({})).toBe(false);
    expect(zoomConfigured({ ZOOM_ACCOUNT_ID: "a" })).toBe(false);
    expect(zoomConfigured({ ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b" })).toBe(false);
    expect(
      zoomConfigured({ ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b", ZOOM_CLIENT_SECRET: "c" }),
    ).toBe(true);
  });
});
