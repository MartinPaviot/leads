import { describe, it, expect } from "vitest";
import { classifyCustomerMessage } from "@/lib/voice-of-customer/classifier";

describe("classifyCustomerMessage", () => {
  it("returns null on mundane chatter", () => {
    expect(classifyCustomerMessage("hi there!")).toBeNull();
    expect(classifyCustomerMessage("thanks, that worked")).toBeNull();
    expect(classifyCustomerMessage("ok cool")).toBeNull();
  });

  it("returns null on empty / out-of-range input", () => {
    expect(classifyCustomerMessage("")).toBeNull();
    expect(classifyCustomerMessage("a")).toBeNull(); // too short
    expect(classifyCustomerMessage(null as never)).toBeNull();
  });

  describe("feature_request", () => {
    it("matches 'I wish you would …'", () => {
      const out = classifyCustomerMessage(
        "I wish you would let us export the TAM as CSV.",
      );
      expect(out?.kind).toBe("feature_request");
      expect(out?.canonicalKey).toContain("export");
    });

    it("matches 'could you add …'", () => {
      const out = classifyCustomerMessage("Could you add bulk delete on contacts?");
      expect(out?.kind).toBe("feature_request");
      expect(out?.canonicalKey).toContain("bulk-delete");
    });

    it("matches 'it would be great if …'", () => {
      const out = classifyCustomerMessage(
        "It would be great if we could schedule sequences.",
      );
      expect(out?.kind).toBe("feature_request");
    });

    it("matches 'please add …'", () => {
      const out = classifyCustomerMessage("Please add a dark mode toggle.");
      expect(out?.kind).toBe("feature_request");
    });
  });

  describe("integration_ask", () => {
    it("classifies 'integrate with Salesforce' as integration_ask, not feature_request", () => {
      const out = classifyCustomerMessage(
        "Could you integrate with Salesforce? We need bidir sync.",
      );
      expect(out?.kind).toBe("integration_ask");
      expect(out?.canonicalKey).toContain("salesforce");
    });

    it("matches 'support hubspot'", () => {
      const out = classifyCustomerMessage("Do you support hubspot?");
      expect(out?.kind).toBe("integration_ask");
      expect(out?.canonicalKey).toBe("hubspot");
    });

    it("matches 'does it work with Notion'", () => {
      const out = classifyCustomerMessage("Does it work with Notion?");
      expect(out?.kind).toBe("integration_ask");
      expect(out?.canonicalKey).toContain("notion");
    });
  });

  describe("bug_report", () => {
    it("matches 'X is broken'", () => {
      const out = classifyCustomerMessage("Sync is broken since this morning.");
      expect(out?.kind).toBe("bug_report");
      expect(out?.canonicalKey).toContain("sync-broken");
    });

    it("matches 'doesn't work'", () => {
      const out = classifyCustomerMessage(
        "The export button doesn't work on the contacts page.",
      );
      expect(out?.kind).toBe("bug_report");
    });

    it("matches 'bug in/with/on'", () => {
      const out = classifyCustomerMessage("There's a bug in the sequence editor.");
      expect(out?.kind).toBe("bug_report");
    });
  });

  describe("ux_friction", () => {
    it("matches 'can't find'", () => {
      const out = classifyCustomerMessage(
        "I can't find the option to disable email tracking.",
      );
      expect(out?.kind).toBe("ux_friction");
    });

    it("matches 'so confusing'", () => {
      const out = classifyCustomerMessage(
        "The pipeline view is so confusing, I gave up.",
      );
      expect(out?.kind).toBe("ux_friction");
      expect(out?.canonicalKey).toBe("ux-too-complicated");
    });

    it("matches 'where is'", () => {
      const out = classifyCustomerMessage("Where is the unsubscribe link setting?");
      expect(out?.kind).toBe("ux_friction");
    });
  });

  describe("doc_gap", () => {
    it("matches 'no docs for X'", () => {
      const out = classifyCustomerMessage(
        "There are no docs for the webhook signature format.",
      );
      expect(out?.kind).toBe("doc_gap");
    });

    it("matches 'how do I X'", () => {
      const out = classifyCustomerMessage(
        "How do I configure custom signal scoring?",
      );
      expect(out?.kind).toBe("doc_gap");
    });
  });

  describe("expansion_intent", () => {
    it("matches 'add my team'", () => {
      const out = classifyCustomerMessage("How do I add my team to Elevay?");
      expect(out?.kind).toBe("expansion_intent");
    });

    it("matches 'more seats'", () => {
      const out = classifyCustomerMessage("Can we get more seats this week?");
      expect(out?.kind).toBe("expansion_intent");
    });

    it("matches 'upgrade our plan'", () => {
      const out = classifyCustomerMessage("We'd like to upgrade our plan.");
      expect(out?.kind).toBe("expansion_intent");
    });
  });

  it("provides a non-null matchedSnippet when a pattern fires", () => {
    const out = classifyCustomerMessage("I wish you would build a dialer.");
    expect(out).not.toBeNull();
    expect(out!.matchedSnippet.length).toBeGreaterThan(5);
  });

  it("normalises canonicalKey to dash-joined lowercase ascii", () => {
    const out = classifyCustomerMessage("Could you add LinkedIn export?");
    expect(out?.canonicalKey).toMatch(/^[a-z0-9-]+$/);
  });
});
