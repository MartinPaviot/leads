import { describe, it, expect } from "vitest";
import { linkedinPath } from "@/db/canonical/identity";
import { engagerToContact } from "../post-sourcing";

describe("engagerToContact — engager (reactor/commenter) → canonical contact", () => {
  it("maps a person with an /in/ URL (name split, headline→title, normalized url)", () => {
    const c = engagerToContact({
      name: "Ben Latour",
      headline: "Spoken English for founders",
      profileUrl: "https://www.linkedin.com/in/ben-latour/",
    });
    expect(c).toEqual({
      firstName: "Ben",
      lastName: "Latour",
      title: "Spoken English for founders",
      linkedinUrl: linkedinPath("https://www.linkedin.com/in/ben-latour/"),
    });
    expect(c?.linkedinUrl).toBeTruthy();
  });

  it("keeps multi-word last names; single name → lastName null", () => {
    expect(engagerToContact({ name: "Olga Van Der Berg", profileUrl: "https://linkedin.com/in/olga" })).toMatchObject({
      firstName: "Olga",
      lastName: "Van Der Berg",
    });
    expect(engagerToContact({ name: "Cher", profileUrl: "https://linkedin.com/in/cher" })).toMatchObject({
      firstName: "Cher",
      lastName: null,
    });
  });

  it("skips companies (/company/ URL → no personal identity)", () => {
    expect(engagerToContact({ name: "Street Wise", profileUrl: "https://www.linkedin.com/company/street-wise-app/posts" })).toBeNull();
  });

  it("skips engagers with no resolvable URL", () => {
    expect(engagerToContact({ name: "Anon", profileUrl: null })).toBeNull();
    expect(engagerToContact({ name: "Anon" })).toBeNull();
  });

  it("empty/whitespace headline → null title", () => {
    expect(engagerToContact({ name: "X Y", headline: "   ", profileUrl: "https://linkedin.com/in/xy" })?.title).toBeNull();
  });
});
