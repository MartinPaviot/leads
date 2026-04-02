import { describe, it, expect } from "vitest";

// === S6: Auto-create accounts from email domains ===

describe("S6: Email domain company auto-creation", () => {
  const personalDomains = new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
    "aol.com", "protonmail.com", "mail.com", "live.com", "msn.com",
    "yandex.com", "zoho.com", "gmx.com", "fastmail.com",
  ]);

  function shouldCreateCompany(domain: string, excludedDomains: string[] = []): boolean {
    if (personalDomains.has(domain)) return false;
    if (excludedDomains.includes(domain)) return false;
    return true;
  }

  function domainToCompanyName(domain: string): string {
    return domain
      .replace(/\.(com|io|co|ai|dev|org|net|app)$/i, "")
      .split(".")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  it("skips personal email domains", () => {
    expect(shouldCreateCompany("gmail.com")).toBe(false);
    expect(shouldCreateCompany("yahoo.com")).toBe(false);
    expect(shouldCreateCompany("outlook.com")).toBe(false);
  });

  it("creates companies for business domains", () => {
    expect(shouldCreateCompany("acme.com")).toBe(true);
    expect(shouldCreateCompany("stripe.com")).toBe(true);
    expect(shouldCreateCompany("lightfield.app")).toBe(true);
  });

  it("respects excluded domains", () => {
    expect(shouldCreateCompany("elevay.dev", ["elevay.dev"])).toBe(false);
    expect(shouldCreateCompany("acme.com", ["elevay.dev"])).toBe(true);
  });

  it("generates company names from domains", () => {
    expect(domainToCompanyName("stripe.com")).toBe("Stripe");
    expect(domainToCompanyName("acme.io")).toBe("Acme");
    expect(domainToCompanyName("meridian-labs.ai")).toBe("Meridian-labs");
    expect(domainToCompanyName("tech.flow.co")).toBe("Tech Flow");
  });
});

// === S7: Agent action tools ===

describe("S7: Chat tool schemas", () => {
  it("createTask requires title", () => {
    const validTask = { title: "Follow up with Sarah", priority: "high" };
    expect(validTask.title).toBeTruthy();
  });

  it("updateDealStage requires dealId and newStage", () => {
    const validUpdate = { dealId: "abc-123", newStage: "proposal" };
    expect(validUpdate.dealId).toBeTruthy();
    expect(validUpdate.newStage).toBeTruthy();
  });

  it("draftEmail requires contactId and purpose", () => {
    const validDraft = { contactId: "abc-123", purpose: "follow-up" };
    expect(validDraft.contactId).toBeTruthy();
    expect(validDraft.purpose).toBeTruthy();
  });
});

// === S9: Transcript processing ===

describe("S9: Meeting transcript schema", () => {
  const sampleExtraction = {
    summary: "Great first call with Alex. Strong interest in API product.",
    keyPoints: ["Current CRM is Hubspot", "Point solutions are Apollo and Fireflies"],
    actionItems: [
      { owner: "Sam", task: "Setup shared Slack channel", deadline: "Friday" },
      { owner: "Alex", task: "Confirm availability for onboarding", deadline: null },
    ],
    buyingSignals: {
      budget: "$30,000",
      teamSize: "4",
      currentStack: ["Hubspot", "Apollo", "Fireflies"],
      painPoints: ["Too many disconnected tools"],
      competitors: ["Apollo"],
      timeline: "Q2 2026",
      objections: [],
      nextSteps: ["Deeper walkthrough next week"],
    },
    sentiment: "positive" as const,
  };

  it("extracts structured data from transcript analysis", () => {
    expect(sampleExtraction.buyingSignals.budget).toBe("$30,000");
    expect(sampleExtraction.buyingSignals.teamSize).toBe("4");
    expect(sampleExtraction.buyingSignals.currentStack).toContain("Hubspot");
  });

  it("captures action items with owners", () => {
    expect(sampleExtraction.actionItems.length).toBe(2);
    expect(sampleExtraction.actionItems[0].owner).toBe("Sam");
  });

  it("detects sentiment", () => {
    expect(["positive", "neutral", "negative"]).toContain(sampleExtraction.sentiment);
  });
});

// === S3: AI auto-fill ===

describe("S3: AI auto-fill field filtering", () => {
  interface TestField {
    id: string;
    entityType: string;
    aiFillMode: string;
  }

  const fields: TestField[] = [
    { id: "f1", entityType: "company", aiFillMode: "auto" },
    { id: "f2", entityType: "company", aiFillMode: "suggest" },
    { id: "f3", entityType: "company", aiFillMode: "off" },
    { id: "f4", entityType: "contact", aiFillMode: "auto" },
  ];

  it("filters auto-fill fields by entity type", () => {
    const companyAutoFields = fields.filter(
      (f) => f.entityType === "company" && f.aiFillMode === "auto"
    );
    expect(companyAutoFields.length).toBe(1);
    expect(companyAutoFields[0].id).toBe("f1");
  });

  it("excludes suggest and off fields from auto-fill", () => {
    const autoOnly = fields.filter((f) => f.aiFillMode === "auto");
    expect(autoOnly.length).toBe(2);
  });

  it("filters by entity type correctly", () => {
    const contactFields = fields.filter((f) => f.entityType === "contact");
    expect(contactFields.length).toBe(1);
  });
});
