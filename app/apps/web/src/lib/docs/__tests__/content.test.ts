import { describe, expect, it } from "vitest";
import {
  DOC_PHASES,
  collectBlockStrings,
  collectDocStrings,
  docSteps,
  docsByPhase,
  estimateReadMinutes,
  getAdjacentDocs,
  getDocBySlug,
} from "../content";

describe("method content registry", () => {
  it("has unique kebab-case slugs", () => {
    const slugs = docSteps.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("covers the planned steps", () => {
    const slugs = docSteps.map((s) => s.slug);
    for (const expected of [
      "operating-doctrine",
      "the-road-to-one-million",
      "positioning-and-message",
      "define-your-icp",
      "size-the-funnel",
      "build-your-tam",
      "overlay-signals",
      "design-the-cadence",
      "cold-email",
      "cold-calling",
      "linkedin-and-content",
      "brand-gifts-launches",
      "the-discovery-call",
      "the-demo",
      "the-proposal",
      "closing",
      "measure-and-diagnose",
      "keep-the-tam-alive",
      "scale-beyond-yourself",
    ]) {
      expect(slugs).toContain(expected);
    }
  });

  it("step numbers are contiguous from 1 and ordered", () => {
    expect(docSteps.map((s) => s.step)).toEqual(
      Array.from({ length: docSteps.length }, (_, i) => i + 1)
    );
  });

  it("phases are contiguous runs in the canonical phase order", () => {
    // Reading order = step order; a phase must never be interleaved.
    const seen = docSteps.map((s) => s.phase);
    const runs: string[] = [];
    for (const phase of seen) {
      if (runs[runs.length - 1] !== phase) runs.push(phase);
    }
    expect(runs).toEqual(DOC_PHASES);
  });

  it("every step is complete and substantial", () => {
    for (const step of docSteps) {
      expect(step.title.length).toBeGreaterThan(5);
      expect(step.description.length).toBeGreaterThan(20);
      expect(step.blocks.length).toBeGreaterThan(3);
      expect(DOC_PHASES).toContain(step.phase);
    }
  });

  it("every step carries at least one worked example", () => {
    for (const step of docSteps) {
      const hasExample = step.blocks.some((b) => b.type === "example");
      expect(hasExample, `${step.slug} has no example block`).toBe(true);
    }
  });

  it("every phase group is non-empty and ordered", () => {
    const groups = docsByPhase();
    expect(groups.map((g) => g.phase)).toEqual(DOC_PHASES);
    for (const g of groups) expect(g.steps.length).toBeGreaterThan(0);
  });

  it("table rows match their headers", () => {
    for (const step of docSteps) {
      for (const block of step.blocks) {
        if (block.type !== "table") continue;
        expect(block.headers.length).toBeGreaterThan(1);
        for (const row of block.rows) {
          expect(row.length).toBe(block.headers.length);
        }
      }
    }
  });

  it("collectBlockStrings covers every block type", () => {
    expect(collectBlockStrings({ type: "p", text: "a" })).toEqual(["a"]);
    expect(collectBlockStrings({ type: "h2", text: "a" })).toEqual(["a"]);
    expect(collectBlockStrings({ type: "h3", text: "a" })).toEqual(["a"]);
    expect(collectBlockStrings({ type: "ul", items: ["a", "b"] })).toEqual(["a", "b"]);
    expect(collectBlockStrings({ type: "ol", items: ["a"] })).toEqual(["a"]);
    expect(collectBlockStrings({ type: "callout", title: "t", text: "a" })).toEqual(["t", "a"]);
    expect(collectBlockStrings({ type: "callout", text: "a" })).toEqual(["a"]);
    expect(collectBlockStrings({ type: "example", title: "t", lines: ["a", "b"] })).toEqual([
      "t",
      "a",
      "b",
    ]);
    expect(collectBlockStrings({ type: "example", lines: ["a"] })).toEqual(["a"]);
    expect(
      collectBlockStrings({ type: "table", headers: ["h"], rows: [["c1"], ["c2"]] })
    ).toEqual(["h", "c1", "c2"]);
  });

  it("helpers resolve slugs and neighbors", () => {
    expect(getDocBySlug("nope")).toBeUndefined();
    expect(getAdjacentDocs("nope")).toEqual({ prev: null, next: null });

    const first = docSteps[0];
    const last = docSteps[docSteps.length - 1];
    expect(getDocBySlug(first.slug)).toBe(first);
    expect(getAdjacentDocs(first.slug).prev).toBeNull();
    expect(getAdjacentDocs(first.slug).next).toBe(docSteps[1]);
    expect(getAdjacentDocs(last.slug).next).toBeNull();

    for (const step of docSteps) {
      expect(estimateReadMinutes(step)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("method copy rules (house style)", () => {
  const allStrings = docSteps.flatMap((step) =>
    collectDocStrings(step).map((text) => ({ slug: step.slug, text }))
  );

  it("contains no emoji", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const { slug, text } of allStrings) {
      expect(emoji.test(text), `${slug}: ${text}`).toBe(false);
    }
  });

  it("contains no em or en dashes", () => {
    for (const { slug, text } of allStrings) {
      expect(/[–—]/.test(text), `${slug}: ${text}`).toBe(false);
    }
  });

  it("never says LeadSens (brand is Elevay)", () => {
    for (const { slug, text } of allStrings) {
      expect(text.includes("LeadSens"), `${slug}: ${text}`).toBe(false);
    }
  });

  it("never names data providers, vendors or competitors", () => {
    // Word-boundary, case-sensitive: the method speaks of "Elevay's data
    // sources", channels and practices, never of specific vendors.
    const banned = [
      "Apollo",
      "Lusha",
      "Kaspr",
      "Cognism",
      "Dropcontact",
      "FullEnrich",
      "Clearbit",
      "Twilio",
      "Deepgram",
      "Unipile",
      "SIRENE",
      "Zefix",
      "Pappers",
      "Crunchbase",
      "Monaco",
      "Lightfield",
      "Snitcher",
      "ZoomInfo",
      "HubSpot",
      "Salesforce",
      "Salesloft",
      "Smartlead",
      "Lavender",
      "Gong",
      "Belkins",
      "Brex",
      "Zenefits",
    ];
    for (const name of banned) {
      const re = new RegExp(`\\b${name}\\b`);
      for (const { slug, text } of allStrings) {
        expect(re.test(text), `${slug} mentions ${name}: ${text}`).toBe(false);
      }
    }
  });

  it("has balanced bold markers and no markdown leftovers", () => {
    for (const { slug, text } of allStrings) {
      const starPairs = (text.match(/\*\*/g) || []).length;
      expect(starPairs % 2, `${slug} unbalanced **: ${text}`).toBe(0);
      expect(/^#{1,6} /.test(text), `${slug} raw markdown heading: ${text}`).toBe(false);
      expect(text.includes("TODO"), `${slug} TODO left in copy: ${text}`).toBe(false);
    }
  });
});
