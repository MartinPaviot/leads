import { describe, it, expect } from "vitest";
import { icpTriageLane } from "@/lib/inbox/icp-triage";

describe("icpTriageLane (INBOX-G11)", () => {
  it("routes a required-criterion miss to low (outside ICP)", () => {
    expect(icpTriageLane({ requiredMet: false, fitScore: 0.9, personaMatch: true }).lane).toBe("low");
  });

  it("routes strong fit + persona to priority", () => {
    expect(icpTriageLane({ requiredMet: true, fitScore: 0.8, personaMatch: true }).lane).toBe("priority");
  });

  it("routes partial fit to standard", () => {
    expect(icpTriageLane({ requiredMet: true, fitScore: 0.5, personaMatch: false }).lane).toBe("standard");
  });

  it("a persona match alone keeps it out of low", () => {
    expect(icpTriageLane({ requiredMet: true, fitScore: 0.2, personaMatch: true }).lane).toBe("standard");
  });

  it("routes weak fit with no persona to low", () => {
    expect(icpTriageLane({ requiredMet: true, fitScore: 0.2, personaMatch: false }).lane).toBe("low");
  });
});
