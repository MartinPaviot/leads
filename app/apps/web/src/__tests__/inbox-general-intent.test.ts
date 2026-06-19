import { describe, it, expect } from "vitest";
import { resolveGeneralIntent, normalizeIntent } from "@/lib/inbox/general-intent";

describe("resolveGeneralIntent (INBOX-S06)", () => {
  it("forces automated_no_reply for machine mail, no sales sub-intent", () => {
    const r = resolveGeneralIntent({ modelIntent: "sales_reply", isMachineSent: true, hasOutbound: true });
    expect(r.generalIntent).toBe("automated_no_reply");
    expect(r.salesSubIntentApplies).toBe(false);
  });

  it("applies the sales sub-intent only on a sales_reply WITH matched outbound", () => {
    expect(resolveGeneralIntent({ modelIntent: "sales_reply", hasOutbound: true }).salesSubIntentApplies).toBe(true);
    expect(resolveGeneralIntent({ modelIntent: "sales_reply", hasOutbound: false }).salesSubIntentApplies).toBe(false);
  });

  it("keeps a general transactional intent and never fires the sales sub-taxonomy", () => {
    const r = resolveGeneralIntent({ modelIntent: "invoice_billing", hasOutbound: true });
    expect(r.generalIntent).toBe("invoice_billing");
    expect(r.salesSubIntentApplies).toBe(false);
  });

  it("normalizes an unknown/unsure label to fyi_update", () => {
    expect(normalizeIntent("totally_made_up")).toBe("fyi_update");
    expect(normalizeIntent(null)).toBe("fyi_update");
    expect(normalizeIntent("question")).toBe("question");
  });
});
