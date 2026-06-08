import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { enrichPersonLusha } from "@/lib/integrations/lusha-client";

/**
 * Guards the v2/person response parsing — the live shape nests the record
 * under `contact.data` (not `data`) and puts LinkedIn under
 * `socialLinks.linkedin`. A regression here silently returns 0 phones.
 */
describe("enrichPersonLusha parsing", () => {
  beforeEach(() => { process.env.LUSHA_API_KEY = "test-key"; });
  afterEach(() => vi.restoreAllMocks());

  it("parses contact.data nesting: phones, work email confidence, socialLinks linkedin", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          contact: {
            error: null,
            isCreditCharged: true,
            data: {
              firstName: "Carole",
              lastName: "Haddad",
              emailAddresses: [{ email: "carole.haddad@ifage.ch", emailType: "work", emailConfidence: "A+" }],
              phoneNumbers: [
                { number: "+41 76 675 23 93", phoneType: "mobile", doNotCall: false },
                { number: "+961 3 999 196", phoneType: "mobile", doNotCall: false },
              ],
              socialLinks: { linkedin: "https://www.linkedin.com/in/caroleash" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const r = await enrichPersonLusha({ firstName: "Carole", lastName: "Haddad", companyDomain: "ifage.ch" });
    expect(r).not.toBeNull();
    expect(r?.phones).toHaveLength(2);
    expect(r?.phones[0]).toMatchObject({ number: "+41 76 675 23 93", type: "mobile" });
    expect(r?.email).toBe("carole.haddad@ifage.ch");
    expect(r?.emailConfident).toBe(true);
    expect(r?.linkedinUrl).toBe("https://www.linkedin.com/in/caroleash");
  });

  it("returns null when contact.error is set", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ contact: { error: "Not found", data: null } }), { status: 200 }),
    );
    const r = await enrichPersonLusha({ linkedinUrl: "https://www.linkedin.com/in/nobody" });
    expect(r).toBeNull();
  });

  it("does not call the API without a linkedin or full name + company", async () => {
    const spy = vi.spyOn(global, "fetch");
    const r = await enrichPersonLusha({ firstName: "Solo" }); // no last name, no company, no linkedin
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
