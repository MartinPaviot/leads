import { describe, it, expect } from "vitest";
import { injectMeetingLink } from "@/lib/inbox/meeting-link";

describe("injectMeetingLink (INBOX-G10)", () => {
  it("appends the join link after the existing draft with a blank-line separator", () => {
    const out = injectMeetingLink("Looks good, let's meet.", "https://meet.elevay.example/abc");
    expect(out).toBe("Looks good, let's meet.\n\nJoin the meeting: https://meet.elevay.example/abc\n");
  });

  it("seeds an empty draft with just the link line", () => {
    expect(injectMeetingLink("", "https://meet.elevay.example/x")).toBe(
      "Join the meeting: https://meet.elevay.example/x\n",
    );
  });

  it("is idempotent — never duplicates a link already present", () => {
    const once = injectMeetingLink("Hi", "https://meet.elevay.example/x");
    expect(injectMeetingLink(once, "https://meet.elevay.example/x")).toBe(once);
  });

  it("returns the body unchanged when there is no url", () => {
    expect(injectMeetingLink("Draft body", "")).toBe("Draft body");
    expect(injectMeetingLink("Draft body", "   ")).toBe("Draft body");
  });

  it("does not leave trailing whitespace from the prior draft", () => {
    expect(injectMeetingLink("Hi   \n\n", "https://meet.elevay.example/x")).toBe(
      "Hi\n\nJoin the meeting: https://meet.elevay.example/x\n",
    );
  });
});
