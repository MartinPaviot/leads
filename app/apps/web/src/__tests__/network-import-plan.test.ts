import { describe, it, expect } from "vitest";
import { planNetworkImport } from "@/lib/network/import-plan";
import type { LinkedInConnection } from "@/lib/network/linkedin-connections";

function conn(partial: Partial<LinkedInConnection>): LinkedInConnection {
  return {
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    linkedinUrl: "https://www.linkedin.com/in/jane-doe",
    email: "jane@acme.com",
    company: "Acme",
    position: "VP Sales",
    connectedOn: "2024-06-15",
    connectedOnRaw: "15 Jun 2024",
    ...partial,
  };
}

describe("planNetworkImport", () => {
  it("inserts everything when the tenant has no existing contacts", () => {
    const plan = planNetworkImport({
      connections: [conn({}), conn({ linkedinUrl: "https://www.linkedin.com/in/marc", email: null, company: "Pilae" })],
    });
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.alreadyInDb).toBe(0);
    expect(plan.companyNames.sort()).toEqual(["Acme", "Pilae"]);
  });

  it("dedups against an existing LinkedIn URL (normalizing the DB's raw form)", () => {
    const plan = planNetworkImport({
      connections: [conn({})],
      existingLinkedinUrls: ["http://linkedin.com/in/jane-doe/"], // trailing slash + http
    });
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.alreadyInDb).toBe(1);
  });

  it("dedups against an existing email case-insensitively", () => {
    const plan = planNetworkImport({
      connections: [conn({ linkedinUrl: null })],
      existingEmails: ["JANE@ACME.COM"],
    });
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.alreadyInDb).toBe(1);
  });

  it("keeps a connection whose URL and email are both new", () => {
    const plan = planNetworkImport({
      connections: [conn({})],
      existingLinkedinUrls: ["https://www.linkedin.com/in/someone-else"],
      existingEmails: ["other@x.com"],
    });
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.alreadyInDb).toBe(0);
  });

  it("shapes the draft from the connection (title from position, connectedOn carried)", () => {
    const plan = planNetworkImport({ connections: [conn({})] });
    expect(plan.toInsert[0]).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.com",
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
      title: "VP Sales",
      companyName: "Acme",
      networkConnectedOn: "2024-06-15",
    });
  });

  it("does not list a null company and dedups company names", () => {
    const plan = planNetworkImport({
      connections: [
        conn({ linkedinUrl: "https://www.linkedin.com/in/a", company: "Acme" }),
        conn({ linkedinUrl: "https://www.linkedin.com/in/b", company: null, email: "b@x.com" }),
        conn({ linkedinUrl: "https://www.linkedin.com/in/c", company: "Acme", email: "c@x.com" }),
      ],
    });
    expect(plan.companyNames).toEqual(["Acme"]);
    expect(plan.toInsert).toHaveLength(3);
  });

  it("handles an empty connection list", () => {
    const plan = planNetworkImport({ connections: [] });
    expect(plan).toEqual({ toInsert: [], alreadyInDb: 0, companyNames: [] });
  });
});
