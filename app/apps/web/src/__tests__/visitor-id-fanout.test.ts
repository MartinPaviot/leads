import { describe, it, expect } from "vitest";
import { planFanout } from "@/lib/visitor-id/fanout";

const baseInput = {
  tenantId: "t-1",
  companyId: "co-1",
  companyDomain: "acme.io",
  companyName: "Acme Corp",
  visitId: "v-1",
  isNewCompany: false,
  fromCache: false,
  url: "https://acme.io/pricing",
};

describe("planFanout", () => {
  it("emits no events when the result was a dedup-cache hit", () => {
    expect(
      planFanout({ ...baseInput, fromCache: true, isNewCompany: true }),
    ).toEqual([]);
  });

  it("emits company/created when the company is new", () => {
    const events = planFanout({ ...baseInput, isNewCompany: true });
    expect(events.some((e) => e.name === "company/created")).toBe(true);
    const c = events.find((e) => e.name === "company/created")!;
    expect(c.data).toMatchObject({
      companyId: "co-1",
      tenantId: "t-1",
    });
  });

  it("does NOT emit company/created when the company already existed", () => {
    const events = planFanout({ ...baseInput, isNewCompany: false });
    expect(events.some((e) => e.name === "company/created")).toBe(false);
  });

  it("always emits signals/auto-enroll for non-cache identifications", () => {
    const newCo = planFanout({ ...baseInput, isNewCompany: true });
    const existingCo = planFanout({ ...baseInput, isNewCompany: false });
    expect(newCo.some((e) => e.name === "signals/auto-enroll")).toBe(true);
    expect(existingCo.some((e) => e.name === "signals/auto-enroll")).toBe(true);
  });

  it("composes a path-aware signal title when URL is a full URL", () => {
    const events = planFanout({
      ...baseInput,
      url: "https://acme.io/pricing",
    });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    expect(sig.data.signalTitle).toBe("Acme Corp visited /pricing");
  });

  it("accepts a raw path as URL", () => {
    const events = planFanout({ ...baseInput, url: "/pricing" });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    expect(sig.data.signalTitle).toBe("Acme Corp visited /pricing");
  });

  it("falls back to generic title when URL is missing", () => {
    const events = planFanout({ ...baseInput, url: null });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    expect(sig.data.signalTitle).toBe("Acme Corp visited the website");
  });

  it("falls back to domain when companyName is null", () => {
    const events = planFanout({
      ...baseInput,
      companyName: null,
      url: null,
    });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    expect(sig.data.signalTitle).toBe("acme.io visited the website");
  });

  it("includes audit-trail fields on the signal payload", () => {
    const events = planFanout({ ...baseInput, url: "/blog/post-1" });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    expect(sig.data).toMatchObject({
      tenantId: "t-1",
      companyId: "co-1",
      companyName: "Acme Corp",
      signalType: "website_visit",
      sourceVisitId: "v-1",
      sourceUrl: "/blog/post-1",
    });
  });

  it("emits company/created BEFORE signals/auto-enroll (so enrich can run first)", () => {
    const events = planFanout({ ...baseInput, isNewCompany: true });
    const idxCreated = events.findIndex((e) => e.name === "company/created");
    const idxEnroll = events.findIndex((e) => e.name === "signals/auto-enroll");
    expect(idxCreated).toBeLessThan(idxEnroll);
  });

  it("ignores malformed URL gracefully", () => {
    const events = planFanout({
      ...baseInput,
      url: "not a url at all",
    });
    const sig = events.find((e) => e.name === "signals/auto-enroll")!;
    // Without a parseable path, fall back to generic title.
    expect(sig.data.signalTitle).toBe("Acme Corp visited the website");
  });
});
