import { describe, it, expect } from "vitest";
import { decideBrandingMode, fuzzyDomainMatch, isSameOrg } from "@/lib/recording/branding";

function baseTenant(overrides: Partial<Parameters<typeof decideBrandingMode>[0]["tenant"]["settings"]> = {}) {
  return {
    id: "tenant_a",
    ownerEmail: "owner@acme.com",
    settings: {
      recordingEnabled: true,
      recordingBotName: "Acme Notetaker",
      recordingPolicy: "branded" as const,
      ...overrides,
    },
  };
}

describe("decideBrandingMode", () => {
  it("scenario 1: recording disabled → opted_out", () => {
    const decision = decideBrandingMode({
      attendees: [{ email: "prospect@external.com" }],
      tenant: baseTenant({ recordingEnabled: false }),
    });
    expect(decision.mode).toBe("opted_out");
    expect(decision.botDisplayName).toBe("");
    expect(decision.externalAttendees).toEqual([]);
    expect(decision.reason).toBe("recording_disabled");
  });

  it("scenario 2: policy=always_silent overrides externals → silent/Notes", () => {
    const decision = decideBrandingMode({
      attendees: [{ email: "prospect@external.com" }, { email: "owner@acme.com", self: true }],
      tenant: baseTenant({ recordingPolicy: "always_silent" }),
    });
    expect(decision.mode).toBe("silent");
    expect(decision.botDisplayName).toBe("Notes");
    expect(decision.reason).toBe("tenant_always_silent");
    expect(decision.externalAttendees).toEqual([]);
  });

  it("scenario 3: all internal attendees → silent/Notes", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "colleague@acme.com" },
      ],
      tenant: baseTenant(),
    });
    expect(decision.mode).toBe("silent");
    expect(decision.botDisplayName).toBe("Notes");
    expect(decision.reason).toBe("all_internal");
  });

  it("scenario 4: mixed internal + external → full branded, externals captured", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "John.Doe+test@gmail.com" },
        { email: "CEO@widget.com" },
      ],
      tenant: baseTenant(),
    });
    expect(decision.mode).toBe("full");
    expect(decision.botDisplayName).toBe("Acme Notetaker (via Elevay)");
    expect(decision.reason).toBe("branded_default");
    expect(decision.externalAttendees).toEqual(
      expect.arrayContaining(["johndoe@gmail.com", "ceo@widget.com"])
    );
    expect(decision.externalAttendees).toHaveLength(2);
  });

  it("scenario 5: fuzzy domain alias treated as same org → silent", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "john@acme-corp.com" }, // not a real alias, but Levenshtein ≤2 + same TLD
      ],
      tenant: baseTenant({ domainAliases: ["acme-corp.com"] }),
    });
    expect(decision.mode).toBe("silent");
    expect(decision.reason).toBe("all_internal");
  });

  it("scenario 6: meeting override silent despite externals → silent/Notes", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "prospect@external.com" },
      ],
      tenant: baseTenant(),
      meetingOverride: "silent",
    });
    expect(decision.mode).toBe("silent");
    expect(decision.botDisplayName).toBe("Notes");
    expect(decision.reason).toBe("meeting_override_silent");
  });

  it("uses default bot name when recordingBotName is missing", () => {
    const tenant = baseTenant();
    // recordingBotName is optional in the underlying type; cast so the
    // delete is structurally valid (TS strict mode rejects `delete` on
    // inferred-non-optional fields).
    delete (tenant.settings as { recordingBotName?: string }).recordingBotName;
    const decision = decideBrandingMode({
      attendees: [{ email: "prospect@external.com" }],
      tenant,
    });
    expect(decision.botDisplayName).toBe("Elevay Notetaker (via Elevay)");
  });

  it("uses owner email domain when primaryDomain is not set", () => {
    const decision = decideBrandingMode({
      attendees: [{ email: "someone@acme.com" }],
      tenant: baseTenant(),
    });
    // Same domain as owner → internal → silent
    expect(decision.mode).toBe("silent");
  });

  it("prefers explicit primaryDomain over owner email", () => {
    const decision = decideBrandingMode({
      attendees: [{ email: "user@acme.com" }, { email: "user@rippletide.com", self: true }],
      tenant: {
        id: "t",
        ownerEmail: "owner@rippletide.com",
        settings: {
          recordingEnabled: true,
          recordingPolicy: "branded",
          primaryDomain: "rippletide.com",
          recordingBotName: "R Notes",
        },
      },
    });
    expect(decision.mode).toBe("full");
    expect(decision.externalAttendees).toEqual(["user@acme.com"]);
  });

  it("skips malformed email addresses silently", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "not-an-email" },
        { email: "real@other.com" },
      ],
      tenant: baseTenant(),
    });
    expect(decision.externalAttendees).toEqual(["real@other.com"]);
  });

  it("dedupes identical normalised externals (+tag variants)", () => {
    const decision = decideBrandingMode({
      attendees: [
        { email: "owner@acme.com", self: true },
        { email: "j.doe@gmail.com" },
        { email: "J.Doe+promo@gmail.com" },
      ],
      tenant: baseTenant(),
    });
    expect(decision.externalAttendees).toEqual(["jdoe@gmail.com"]);
  });
});

describe("fuzzyDomainMatch", () => {
  it("exact match returns true", () => {
    expect(fuzzyDomainMatch("acme.com", "acme.com")).toBe(true);
  });

  it("differs by ≤2 edits + same TLD → true", () => {
    expect(fuzzyDomainMatch("acmecorp.com", "acme-corp.com")).toBe(true);
  });

  it("different TLDs → false even for identical root", () => {
    expect(fuzzyDomainMatch("acme.com", "acme.io")).toBe(false);
  });

  it("short roots (<4 chars) → false to avoid false positives", () => {
    expect(fuzzyDomainMatch("abc.com", "xyz.com")).toBe(false);
  });

  it(">2 edits on root → false", () => {
    expect(fuzzyDomainMatch("acme.com", "zenith.com")).toBe(false);
  });

  it("handles subdomains (uses last two labels)", () => {
    expect(fuzzyDomainMatch("mail.acme.com", "acme.com")).toBe(true);
  });
});

describe("isSameOrg", () => {
  it("exact primary match", () => {
    expect(isSameOrg("acme.com", "acme.com", [])).toBe(true);
  });

  it("alias list hit", () => {
    expect(isSameOrg("acme-eu.com", "acme.com", ["acme-eu.com"])).toBe(true);
  });

  it("unrelated → false", () => {
    expect(isSameOrg("competitor.com", "acme.com", [])).toBe(false);
  });
});
