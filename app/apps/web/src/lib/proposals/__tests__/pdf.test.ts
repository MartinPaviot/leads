import { describe, it, expect } from "vitest";
import { renderProposalPdf } from "../pdf";

describe("renderProposalPdf", () => {
  it("produces a structurally valid PDF containing the content", () => {
    const pdf = renderProposalPdf([
      { label: "Executive Summary", kind: "section", content: "Acme needs faster turnaround.\nSecond paragraph here." },
      { label: "Pricing", kind: "section", content: "Platform: 999 per month." },
    ]);
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("xref");
    expect(s).toContain("/Root 1 0 R");
    expect(s).toContain("startxref");
    expect(s).toContain("EXECUTIVE SUMMARY");
    expect(s).toContain("Acme needs faster turnaround");
    expect(s).toContain("PRICING");
  });

  it("paginates long content into multiple pages", () => {
    const long = Array.from({ length: 120 }, (_, i) => `Line number ${i}`).join("\n");
    const pdf = renderProposalPdf([{ label: "Body", kind: "section", content: long }]);
    const s = pdf.toString("latin1");
    const pageCount = (s.match(/\/Type \/Page\b/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it("escapes parens, preserves latin-1, replaces unsupported chars, never throws", () => {
    const pdf = renderProposalPdf([{ label: "T", kind: "field", content: "Cout (HT) éàû 1000 — 日本" }]);
    const s = pdf.toString("latin1");
    expect(s).toContain("éàû"); // French accents preserved (latin-1)
    expect(s).toContain("\\(HT\\)"); // parens escaped
    expect(s).toContain("?"); // em-dash + CJK replaced
  });
});
