import { describe, it, expect, vi, beforeEach } from "vitest";

// Test greeting logic
describe("Dashboard greeting", () => {
  function getGreeting(hour: number): string {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  it("returns Good morning for hours 0-11", () => {
    expect(getGreeting(0)).toBe("Good morning");
    expect(getGreeting(6)).toBe("Good morning");
    expect(getGreeting(11)).toBe("Good morning");
  });

  it("returns Good afternoon for hours 12-16", () => {
    expect(getGreeting(12)).toBe("Good afternoon");
    expect(getGreeting(14)).toBe("Good afternoon");
    expect(getGreeting(16)).toBe("Good afternoon");
  });

  it("returns Good evening for hours 17-23", () => {
    expect(getGreeting(17)).toBe("Good evening");
    expect(getGreeting(20)).toBe("Good evening");
    expect(getGreeting(23)).toBe("Good evening");
  });
});

// Test week start calculation
describe("Week start calculation", () => {
  function getStartOfWeek(now: Date): Date {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  it("returns Monday for a Wednesday", () => {
    // Wed Apr 2 2026
    const wed = new Date(2026, 3, 1);
    const monday = getStartOfWeek(wed);
    expect(monday.getDay()).toBe(1); // Monday
  });

  it("returns Monday for a Monday", () => {
    const mon = new Date(2026, 2, 30); // Mon Mar 30 2026
    const result = getStartOfWeek(mon);
    expect(result.getDay()).toBe(1);
  });

  it("returns previous Monday for a Sunday", () => {
    const sun = new Date(2026, 3, 5); // Sun Apr 5 2026
    const monday = getStartOfWeek(sun);
    expect(monday.getDay()).toBe(1);
    expect(monday < sun).toBe(true);
  });
});

// Test stall detection logic
describe("Stall detection", () => {
  function getStalledDays(lastActivityDate: Date | null): number | null {
    if (!lastActivityDate) return null;
    const now = new Date();
    const diffMs = now.getTime() - lastActivityDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 3 ? diffDays : null;
  }

  it("returns null for recent activity", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(getStalledDays(yesterday)).toBeNull();
  });

  it("returns days for stalled deals (3+ days)", () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    expect(getStalledDays(fiveDaysAgo)).toBe(5);
  });

  it("returns null for null input", () => {
    expect(getStalledDays(null)).toBeNull();
  });

  it("returns null for exactly 2 days ago", () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    expect(getStalledDays(twoDaysAgo)).toBeNull();
  });

  it("returns 3 for exactly 3 days ago", () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    expect(getStalledDays(threeDaysAgo)).toBe(3);
  });
});

// Test empty state handling
describe("Weekly summary display", () => {
  function getSummaryText(ws: { sequencesLaunched: number; responsesReceived: number; meetingsBooked: number; opportunitiesClosed: number }): string {
    const total = ws.sequencesLaunched + ws.responsesReceived + ws.meetingsBooked + ws.opportunitiesClosed;
    if (total === 0) return "No activity this week yet. Let's change that.";
    return `This week, you've launched ${ws.sequencesLaunched} sequences, received ${ws.responsesReceived} responses, booked ${ws.meetingsBooked} meetings, and closed ${ws.opportunitiesClosed} opportunities.`;
  }

  it("shows empty state for zero activity", () => {
    expect(getSummaryText({ sequencesLaunched: 0, responsesReceived: 0, meetingsBooked: 0, opportunitiesClosed: 0 }))
      .toBe("No activity this week yet. Let's change that.");
  });

  it("shows summary for any activity", () => {
    const text = getSummaryText({ sequencesLaunched: 5, responsesReceived: 2, meetingsBooked: 1, opportunitiesClosed: 0 });
    expect(text).toContain("5 sequences");
    expect(text).toContain("2 responses");
    expect(text).toContain("1 meetings");
    expect(text).toContain("0 opportunities");
  });
});
