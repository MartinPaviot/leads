import { describe, expect, it } from "vitest";
import { isFreeEmailDomain } from "@/lib/email/is-free-provider";

describe("isFreeEmailDomain", () => {
  it("flags major personal providers", () => {
    expect(isFreeEmailDomain("jane@gmail.com")).toBe(true);
    expect(isFreeEmailDomain("bob@yahoo.com")).toBe(true);
    expect(isFreeEmailDomain("alice@outlook.com")).toBe(true);
    expect(isFreeEmailDomain("user@hotmail.com")).toBe(true);
    expect(isFreeEmailDomain("john@icloud.com")).toBe(true);
    expect(isFreeEmailDomain("dev@protonmail.com")).toBe(true);
  });

  it("flags FR personal providers", () => {
    expect(isFreeEmailDomain("user@free.fr")).toBe(true);
    expect(isFreeEmailDomain("user@orange.fr")).toBe(true);
    expect(isFreeEmailDomain("user@laposte.net")).toBe(true);
  });

  it("flags disposable / temp-mail", () => {
    expect(isFreeEmailDomain("burner@mailinator.com")).toBe(true);
    expect(isFreeEmailDomain("temp@yopmail.com")).toBe(true);
    expect(isFreeEmailDomain("trash@10minutemail.com")).toBe(true);
  });

  it("does NOT flag corporate domains", () => {
    expect(isFreeEmailDomain("ceo@stripe.com")).toBe(false);
    expect(isFreeEmailDomain("founder@acme.io")).toBe(false);
    expect(isFreeEmailDomain("vp@vercel.com")).toBe(false);
    expect(isFreeEmailDomain("ops@anthropic.com")).toBe(false);
  });

  it("strips subdomains for the apex check", () => {
    // gmail's mail.google subdomains shouldn't slip through.
    expect(isFreeEmailDomain("user@mail.gmail.com")).toBe(true);
    expect(isFreeEmailDomain("foo@bar.outlook.com")).toBe(true);
    // But corporate subdomains stay corporate.
    expect(isFreeEmailDomain("user@team.acme.io")).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isFreeEmailDomain("Jane@GMAIL.COM")).toBe(true);
    expect(isFreeEmailDomain("user@HotMail.com")).toBe(true);
  });

  it("handles malformed / null / empty input safely", () => {
    expect(isFreeEmailDomain(null)).toBe(false);
    expect(isFreeEmailDomain(undefined)).toBe(false);
    expect(isFreeEmailDomain("")).toBe(false);
    expect(isFreeEmailDomain("notanemail")).toBe(false);
    expect(isFreeEmailDomain("@gmail.com")).toBe(false); // no local part is malformed
    expect(isFreeEmailDomain("user@")).toBe(false);
    expect(isFreeEmailDomain("user@.")).toBe(false);
  });

  it("trims whitespace in the domain portion", () => {
    expect(isFreeEmailDomain("user@ gmail.com ")).toBe(true);
  });
});
