/**
 * Company intake — pure layer tests: the canonical-section gate (unknown
 * titles dropped, categories forced, lengths bounded, sources restricted to
 * fetched pages, one entry per section) and the link-triage heuristic
 * (same-origin, keyword-scored, capped). Fetch/LLM orchestration is
 * covered by the live run (scripts/_verify-company-intake.ts).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ knowledgeEntries: {} }));
vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateObject: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: vi.fn() }));
vi.mock("@/lib/infra/ssrf-guard", () => ({ assertPublicUrl: vi.fn() }));
vi.mock("@/lib/knowledge/retrieval", () => ({ embedKnowledgeEntry: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));

import {
  INTAKE_SECTIONS,
  validateIntakeEntries,
  pickCandidateLinks,
  pageToText,
} from "@/lib/knowledge/company-intake";

const FETCHED = ["https://pilae.ch", "https://pilae.ch/about"];
const LONG = "x".repeat(120);

describe("validateIntakeEntries", () => {
  it("keeps canonical sections, forces the category, restricts sources to fetched pages", () => {
    const out = validateIntakeEntries(
      [
        {
          title: "Company — Offer & packaging",
          content: LONG,
          sourceUrls: ["https://pilae.ch", "https://evil.example.com"],
        },
      ],
      FETCHED,
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("product"); // forced from the canonical map
    expect(out[0].sourceUrls).toEqual(["https://pilae.ch"]);
  });

  it("drops unknown titles, short/oversized content, and duplicate sections", () => {
    const out = validateIntakeEntries(
      [
        { title: "Company — Secret sauce", content: LONG, sourceUrls: [] },
        { title: "Company — Proof points", content: "too short", sourceUrls: [] },
        { title: "Company — Proof points", content: LONG, sourceUrls: [] },
        { title: "Company — Proof points", content: LONG + "(dup)", sourceUrls: [] },
        { title: "Company — Identity & legal", content: "y".repeat(5000), sourceUrls: [] },
      ],
      FETCHED,
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Company — Proof points");
  });

  it("every canonical section has a valid knowledge category", () => {
    const allowed = new Set(["icp", "competitors", "objections", "product", "process", "context", "custom"]);
    for (const s of INTAKE_SECTIONS) expect(allowed.has(s.category), s.title).toBe(true);
  });
});

describe("pickCandidateLinks", () => {
  const html = `
    <a href="/about">About</a>
    <a href="/pricing?utm=x">Pricing</a>
    <a href="/blog/some-post">Blog</a>
    <a href="https://other.example.com/about">External about</a>
    <a href="/logo.png">Logo</a>
    <a href="/contact#form">Contact</a>
    <a href="/produit">Produit</a>
    <a href="mailto:x@y.z">Mail</a>
  `;

  it("keeps same-origin keyword pages only, strips query/hash, skips assets", () => {
    const links = pickCandidateLinks(html, "https://pilae.ch/");
    expect(links).toContain("https://pilae.ch/about");
    expect(links).toContain("https://pilae.ch/pricing");
    expect(links).toContain("https://pilae.ch/contact");
    expect(links).toContain("https://pilae.ch/produit");
    expect(links.some((l) => l.includes("other.example.com"))).toBe(false);
    expect(links.some((l) => l.includes("blog"))).toBe(false);
    expect(links.some((l) => l.includes("logo.png"))).toBe(false);
  });

  it("caps the candidate count", () => {
    const many = Array.from({ length: 20 }, (_, i) => `<a href="/service-${i}">s</a>`).join("");
    expect(pickCandidateLinks(many, "https://pilae.ch", 5)).toHaveLength(5);
  });
});

describe("pageToText", () => {
  it("extracts title, meta, headings and capped body without scripts", () => {
    const text = pageToText(
      `<html><head><title>Pilae</title><meta name="description" content="Sovereign cloud"></head>
       <body><script>evil()</script><h1>Le cloud souverain</h1><p>${"corps ".repeat(50)}</p></body></html>`,
      200,
    );
    expect(text).toContain("Title: Pilae");
    expect(text).toContain("Meta: Sovereign cloud");
    expect(text).toContain("Le cloud souverain");
    expect(text).not.toContain("evil");
  });
});
