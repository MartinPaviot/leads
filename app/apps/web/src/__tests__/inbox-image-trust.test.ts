import { describe, it, expect } from "vitest";
import { extractSenderEmail, isImageSenderTrusted } from "@/lib/inbox/image-trust";

describe("extractSenderEmail (R02)", () => {
  it("pulls the address out of a 'Name <addr>' header, lowercased", () => {
    expect(extractSenderEmail("Acme Sales <Sales@Acme.com>")).toBe("sales@acme.com");
  });
  it("accepts a bare address and rejects non-addresses", () => {
    expect(extractSenderEmail("a@b.co")).toBe("a@b.co");
    expect(extractSenderEmail("no email here")).toBe("");
    expect(extractSenderEmail("")).toBe("");
  });
});

describe("isImageSenderTrusted (R02)", () => {
  it("trusts an exact address match", () => {
    expect(isImageSenderTrusted(["sales@acme.com"], "Acme <sales@acme.com>")).toBe(true);
  });
  it("trusts a whole domain via an @domain entry", () => {
    expect(isImageSenderTrusted(["@acme.com"], "anyone@acme.com")).toBe(true);
    expect(isImageSenderTrusted(["@acme.com"], "bob@other.com")).toBe(false);
  });
  it("does not trust an unknown sender or an unparseable one", () => {
    expect(isImageSenderTrusted(["sales@acme.com"], "stranger@evil.example")).toBe(false);
    expect(isImageSenderTrusted(["sales@acme.com"], "")).toBe(false);
    expect(isImageSenderTrusted([], "sales@acme.com")).toBe(false);
  });
  it("is case-insensitive on both sides", () => {
    expect(isImageSenderTrusted(["Sales@Acme.com"], "SALES@ACME.COM")).toBe(true);
  });
});
