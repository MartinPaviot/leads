import { describe, it, expect } from "vitest";
import {
  detectInboxProvider,
  resolveInboxDeepLinks,
} from "@/lib/inbox-deep-links";

describe("detectInboxProvider", () => {
  it.each([
    ["gmail.com", "gmail"],
    ["googlemail.com", "gmail"],
    ["outlook.com", "outlook"],
    ["hotmail.com", "outlook"],
    ["live.com", "outlook"],
    ["msn.com", "outlook"],
    ["yahoo.com", "yahoo"],
    ["mail.yahoo.com", "yahoo"],
    ["icloud.com", "icloud"],
    ["me.com", "icloud"],
    ["mac.com", "icloud"],
    ["fastmail.com", "fastmail"],
    ["fastmail.fm", "fastmail"],
    ["proton.me", "proton"],
    ["protonmail.com", "proton"],
    ["pm.me", "proton"],
  ])("recognises %s as %s", (domain, provider) => {
    expect(detectInboxProvider(domain)).toBe(provider);
  });

  it("returns null for corporate / unknown domains", () => {
    expect(detectInboxProvider("acmecorp.com")).toBeNull();
    expect(detectInboxProvider("startup.io")).toBeNull();
  });

  it("returns null for nullish input", () => {
    expect(detectInboxProvider(null)).toBeNull();
    expect(detectInboxProvider("")).toBeNull();
  });

  it("is case-insensitive on the domain", () => {
    expect(detectInboxProvider("GMAIL.COM")).toBe("gmail");
    expect(detectInboxProvider("Outlook.Com")).toBe("outlook");
  });
});

describe("resolveInboxDeepLinks", () => {
  it("returns only the matching consumer provider when known", () => {
    const links = resolveInboxDeepLinks("alice@gmail.com");
    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe("gmail");
    expect(links[0].url).toContain("mail.google.com");
  });

  it("returns the gmail+outlook fallback pair for corporate domains", () => {
    const links = resolveInboxDeepLinks("alice@acmecorp.com");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.provider).sort()).toEqual(["gmail", "outlook"]);
  });

  it("never returns broken URLs", () => {
    for (const domain of [
      "alice@gmail.com",
      "alice@outlook.com",
      "alice@yahoo.com",
      "alice@icloud.com",
      "alice@fastmail.com",
      "alice@proton.me",
      "alice@unknown.io",
    ]) {
      const links = resolveInboxDeepLinks(domain);
      for (const l of links) {
        expect(l.url).toMatch(/^https?:\/\//);
        expect(l.label).toMatch(/^Open /);
      }
    }
  });
});
