import { describe, it, expect } from "vitest";
import { buildIntentPrompt, classifyGeneralIntent, type IntentInput } from "@/lib/inbox/classify-intent";

const emails: IntentInput[] = [
  { index: 0, subject: "Your login code", body: "Verification code 482913." },
  { index: 1, subject: "Invoice", body: "Invoice #5 due June 30." },
];

describe("buildIntentPrompt (INBOX-S06)", () => {
  it("lists the taxonomy and the emails", () => {
    const p = buildIntentPrompt(emails);
    expect(p).toContain("security_account");
    expect(p).toContain("invoice_billing");
    expect(p).toContain("Your login code");
  });
});

describe("classifyGeneralIntent", () => {
  it("maps and normalizes the model labels", async () => {
    const out = await classifyGeneralIntent(emails, async () => ({
      results: [
        { index: 0, intent: "security_account" },
        { index: 1, intent: "invoice_billing" },
      ],
    }));
    expect(out.get(0)).toBe("security_account");
    expect(out.get(1)).toBe("invoice_billing");
  });

  it("coerces an unknown label to fyi_update", async () => {
    const out = await classifyGeneralIntent(emails, async () => ({
      results: [{ index: 0, intent: "made_up_label" }],
    }));
    expect(out.get(0)).toBe("fyi_update");
  });

  it("is fail-closed on a generator error", async () => {
    const out = await classifyGeneralIntent(emails, async () => {
      throw new Error("LLM down");
    });
    expect(out.size).toBe(0);
  });

  it("returns empty for no input", async () => {
    expect((await classifyGeneralIntent([], async () => ({ results: [] }))).size).toBe(0);
  });
});
