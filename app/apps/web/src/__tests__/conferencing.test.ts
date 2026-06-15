import { describe, it, expect } from "vitest";
import { resolveConferencing } from "@/lib/integrations/calendar-write";

describe("resolveConferencing — native vs sovereign", () => {
  it("honours native on Google (Meet) and Microsoft (Teams)", () => {
    expect(resolveConferencing("native", "google")).toBe("native");
    expect(resolveConferencing("native", "microsoft")).toBe("native");
  });

  it("falls back to sovereign on CalDAV (no native conferencing)", () => {
    expect(resolveConferencing("native", "caldav")).toBe("sovereign");
  });

  it("keeps sovereign when sovereign is requested, whatever the provider", () => {
    expect(resolveConferencing("sovereign", "google")).toBe("sovereign");
    expect(resolveConferencing("sovereign", "microsoft")).toBe("sovereign");
    expect(resolveConferencing("sovereign", "caldav")).toBe("sovereign");
  });
});
