import { describe, it, expect } from "vitest";
import { buildWritingStylePrompt } from "@/lib/writing-profile";

describe("buildWritingStylePrompt", () => {
  it("returns empty string when no samples", () => {
    expect(buildWritingStylePrompt([])).toBe("");
  });

  it("includes all samples as numbered examples", () => {
    const samples = [
      "Hey John, quick note — we just shipped the new API. Let me know if you want a walkthrough. Cheers, Martin",
      "Hi Sarah, following up on our chat last week. The pricing deck is attached. Worth a quick call Thursday?",
      "Tom — saw your post about scaling infra. We had the exact same problem. Happy to share what worked for us.",
    ];

    const result = buildWritingStylePrompt(samples);

    // Should contain all samples
    expect(result).toContain("Example 1");
    expect(result).toContain("Example 2");
    expect(result).toContain("Example 3");
    expect(result).toContain("Hey John");
    expect(result).toContain("Hi Sarah");
    expect(result).toContain("Tom —");

    // Should have the style instruction
    expect(result).toContain("WRITING STYLE");
    expect(result).toContain("match this style exactly");
    expect(result).toContain("Same voice, same rhythm");
  });

  it("works with single sample", () => {
    const result = buildWritingStylePrompt(["Short email body here."]);
    expect(result).toContain("Example 1");
    expect(result).not.toContain("Example 2");
  });
});
