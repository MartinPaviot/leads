import { describe, expect, it } from "vitest";
import {
  DOC_CATEGORIES,
  collectBlockStrings,
  collectDocStrings,
  docArticles,
  docsByCategory,
  estimateReadMinutes,
  getAdjacentDocs,
  getDocBySlug,
} from "../content";

describe("docs content registry", () => {
  it("has unique kebab-case slugs", () => {
    const slugs = docArticles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("covers the planned articles", () => {
    const slugs = docArticles.map((a) => a.slug);
    for (const expected of [
      "how-elevay-works",
      "tam-for-early-stage-startups",
      "building-your-tam",
      "keeping-your-tam-alive",
      "outbound-channel-strategy",
      "cold-email-playbook",
      "cold-calling-playbook",
      "linkedin-playbook",
    ]) {
      expect(slugs).toContain(expected);
    }
  });

  it("every article is complete and categorized", () => {
    for (const article of docArticles) {
      expect(article.title.length).toBeGreaterThan(5);
      expect(article.description.length).toBeGreaterThan(20);
      expect(article.blocks.length).toBeGreaterThan(3);
      expect(DOC_CATEGORIES).toContain(article.category);
    }
  });

  it("every category group is non-empty and ordered", () => {
    const groups = docsByCategory();
    expect(groups.map((g) => g.category)).toEqual(DOC_CATEGORIES);
    for (const g of groups) expect(g.articles.length).toBeGreaterThan(0);
  });

  it("table rows match their headers", () => {
    for (const article of docArticles) {
      for (const block of article.blocks) {
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
    expect(
      collectBlockStrings({ type: "table", headers: ["h"], rows: [["c1"], ["c2"]] })
    ).toEqual(["h", "c1", "c2"]);
  });

  it("helpers resolve slugs and neighbors", () => {
    expect(getDocBySlug("nope")).toBeUndefined();
    expect(getAdjacentDocs("nope")).toEqual({ prev: null, next: null });

    const first = docArticles[0];
    const last = docArticles[docArticles.length - 1];
    expect(getDocBySlug(first.slug)).toBe(first);
    expect(getAdjacentDocs(first.slug).prev).toBeNull();
    expect(getAdjacentDocs(first.slug).next).toBe(docArticles[1]);
    expect(getAdjacentDocs(last.slug).next).toBeNull();

    for (const article of docArticles) {
      expect(estimateReadMinutes(article)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("docs copy rules (house style)", () => {
  const allStrings = docArticles.flatMap((article) =>
    collectDocStrings(article).map((text) => ({ slug: article.slug, text }))
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
    // Word-boundary, case-sensitive: docs speak of "Elevay's data sources",
    // channels and methods, never of specific vendors.
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
