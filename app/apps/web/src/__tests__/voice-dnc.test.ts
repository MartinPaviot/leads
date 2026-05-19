import { describe, it, expect } from "vitest";
import { detectDncRequest } from "@/lib/voice/dnc";

describe("detectDncRequest", () => {
  it("flags French opt-out phrasing", () => {
    expect(
      detectDncRequest("Non merci, ne me rappelez plus s'il vous plaît."),
    ).toBe(true);
    expect(
      detectDncRequest("Retirez-moi de votre liste, je n'ai pas le temps."),
    ).toBe(true);
    expect(detectDncRequest("Pas intéressé, enlevez-moi.")).toBe(true);
  });

  it("flags English opt-out phrasing", () => {
    expect(detectDncRequest("Please remove me from your list.")).toBe(true);
    expect(detectDncRequest("Do not call us again.")).toBe(true);
    expect(detectDncRequest("Take me off your list right now.")).toBe(true);
    expect(detectDncRequest("Stop calling me.")).toBe(true);
    expect(detectDncRequest("I'd like to opt-out.")).toBe(true);
  });

  it("does NOT flag neutral conversation", () => {
    expect(
      detectDncRequest(
        "Hi Marie, thanks for taking my call. I wanted to discuss your team's pipeline.",
      ),
    ).toBe(false);
    expect(
      detectDncRequest("Send me an email with the details and I'll review."),
    ).toBe(false);
  });

  it("does NOT flag mention of unrelated 'list' or 'call'", () => {
    expect(detectDncRequest("We have a call list of vendors to vet.")).toBe(
      false,
    );
  });
});
