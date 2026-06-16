import { describe, it, expect } from "vitest";
import {
  getLeadFeedback,
  getLeadRelationship,
  withLeadFeedback,
  withLeadRelationship,
  isExcludedAsLead,
  leadExclusionReason,
} from "@/lib/inbound/lead-status";

describe("lead-status — getters/setters (immutable)", () => {
  it("round-trips lead feedback", () => {
    const p = withLeadFeedback({ existing: 1 }, { isLead: false, at: "2026-06-16T00:00:00Z", reason: "vendor" });
    expect((p as Record<string, unknown>).existing).toBe(1); // preserves other props
    const fb = getLeadFeedback(p);
    expect(fb).toEqual({ isLead: false, at: "2026-06-16T00:00:00Z", reason: "vendor" });
  });

  it("round-trips a stored relationship verdict", () => {
    const p = withLeadRelationship(null, {
      isInboundLead: false,
      relationshipToUs: "vendor",
      intent: "notification",
      reason: "A service we subscribe to.",
      at: "2026-06-16T00:00:00Z",
    });
    expect(getLeadRelationship(p)?.relationshipToUs).toBe("vendor");
  });

  it("ignores malformed shapes (no throw, returns null)", () => {
    expect(getLeadFeedback(null)).toBeNull();
    expect(getLeadFeedback({ leadFeedback: { isLead: "yes" } })).toBeNull();
    expect(getLeadRelationship({ leadRelationship: 42 })).toBeNull();
    expect(getLeadRelationship(undefined)).toBeNull();
  });
});

describe("lead-status — isExcludedAsLead precedence", () => {
  it("unjudged contact is not excluded", () => {
    expect(isExcludedAsLead(null)).toBe(false);
    expect(isExcludedAsLead({})).toBe(false);
  });

  it("human 'not a lead' excludes", () => {
    const p = withLeadFeedback(null, { isLead: false, at: "2026-06-16T00:00:00Z" });
    expect(isExcludedAsLead(p)).toBe(true);
  });

  it("LLM 'not a lead' excludes when the user has not ruled", () => {
    const p = withLeadRelationship(null, {
      isInboundLead: false,
      relationshipToUs: "recruiter",
      reason: "Recruiter outreach.",
      at: "2026-06-16T00:00:00Z",
    });
    expect(isExcludedAsLead(p)).toBe(true);
  });

  it("human override BEATS the LLM verdict (data-approval principle)", () => {
    // LLM says not-a-lead, but the human says it IS a lead → keep it.
    let p = withLeadRelationship(null, {
      isInboundLead: false,
      relationshipToUs: "vendor",
      reason: "Looks like a vendor.",
      at: "2026-06-16T00:00:00Z",
    });
    p = withLeadFeedback(p, { isLead: true, at: "2026-06-16T01:00:00Z" });
    expect(isExcludedAsLead(p)).toBe(false);
  });

  it("human 'not a lead' still excludes even if the LLM thought it was a lead", () => {
    let p = withLeadRelationship(null, {
      isInboundLead: true,
      relationshipToUs: "prospect",
      reason: "Asked for a demo.",
      at: "2026-06-16T00:00:00Z",
    });
    p = withLeadFeedback(p, { isLead: false, at: "2026-06-16T01:00:00Z", reason: "actually a supplier" });
    expect(isExcludedAsLead(p)).toBe(true);
  });
});

describe("lead-status — leadExclusionReason", () => {
  it("prefers the human note, then the LLM reason, else null", () => {
    expect(leadExclusionReason(null)).toBeNull();
    expect(
      leadExclusionReason(withLeadFeedback(null, { isLead: false, at: "x", reason: "supplier" })),
    ).toBe("supplier");
    expect(
      leadExclusionReason(withLeadFeedback(null, { isLead: false, at: "x" })),
    ).toBe("Marked not a lead");
    expect(
      leadExclusionReason(
        withLeadRelationship(null, {
          isInboundLead: false,
          relationshipToUs: "vendor",
          reason: "Vendor we pay.",
          at: "x",
        }),
      ),
    ).toBe("Vendor we pay.");
  });
});
