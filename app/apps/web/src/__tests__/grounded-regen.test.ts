import { describe, it, expect } from "vitest";
import { evidenceFromProps } from "@/lib/call-mode/prospect-evidence";
import { filterGroundedProblems } from "@/lib/call-mode/tenant-script";
import type { GenEvidenceItem } from "@/lib/call-mode/prospect-evidence";

describe("evidenceFromProps", () => {
  it("builds citable evidence with stable ids from real props", () => {
    const ev = evidenceFromProps(
      { latestSignal: { type: "hiring", label: "Recrute 4 commerciaux" } },
      {
        technologies: ["AI", "Google Tag Manager", "Microsoft Office 365"],
        dossier: {
          hiringSignals: [{ role: "DSI" }],
          funding: { lastRound: "Série B", date: "2026" },
          techStack: ["WordPress.org"],
        },
      },
    );
    expect(ev.map((e) => e.id)).toEqual(["E1", "E2", "E3", "E4", "E5"]);
    expect(ev[0]).toMatchObject({ kind: "signal", fact: "Signal récent : Recrute 4 commerciaux" });
    expect(ev.find((e) => e.kind === "funding")?.fact).toBe("Levée de fonds : Série B (2026)");
    // tools: catalog-replaceable only, dossier-first order — junk (AI, GTM) excluded
    expect(ev.filter((e) => e.kind === "tool").map((e) => e.fact)).toEqual([
      "Outil en place : WordPress.org",
      "Outil en place : Microsoft Office 365",
    ]);
  });

  it("excludes internal signals and 'Unknown' funding dates", () => {
    const ev = evidenceFromProps(
      { latestSignal: { type: "engagement_spike", label: "Pic d'engagement" } },
      { dossier: { funding: { lastRound: "Série A", date: "Unknown" } } },
    );
    expect(ev.some((e) => e.kind === "signal")).toBe(false);
    expect(ev.find((e) => e.kind === "funding")?.fact).toBe("Levée de fonds : Série A");
  });

  it("returns empty for empty props — nothing to cite", () => {
    expect(evidenceFromProps(null, null)).toEqual([]);
    expect(evidenceFromProps({}, {})).toEqual([]);
  });
});

describe("filterGroundedProblems (fail-closed citation gate)", () => {
  const EV: GenEvidenceItem[] = [
    { id: "E1", kind: "tool", fact: "Outil en place : WordPress.org" },
    { id: "E2", kind: "hiring", fact: "Recrute DSI" },
  ];

  it("keeps cited enjeux with their grounding note, and null-ref generics", () => {
    const { kept, grounding } = filterGroundedProblems(
      [
        { text: "vous payez WordPress.org sans le piloter", evidenceRef: "E1" },
        { text: "une facture logicielle qui grimpe", evidenceRef: null },
      ],
      EV,
    );
    expect(kept).toHaveLength(2);
    expect(grounding).toEqual([{ index: 0, fact: "Outil en place : WordPress.org" }]);
  });

  it("DROPS an enjeu citing a non-existent id — never shown, never said", () => {
    const { kept, grounding } = filterGroundedProblems(
      [
        { text: "vous venez de lever 50 millions", evidenceRef: "E9" },
        { text: "une facture logicielle qui grimpe", evidenceRef: null },
      ],
      EV,
    );
    expect(kept).toEqual(["une facture logicielle qui grimpe"]);
    expect(grounding).toEqual([]);
  });

  it("grounding indexes stay correct after a drop", () => {
    const { kept, grounding } = filterGroundedProblems(
      [
        { text: "fabriqué", evidenceRef: "BOGUS" },
        { text: "vous recrutez un DSI en ce moment", evidenceRef: "E2" },
      ],
      EV,
    );
    expect(kept).toEqual(["vous recrutez un DSI en ce moment"]);
    expect(grounding).toEqual([{ index: 0, fact: "Recrute DSI" }]);
  });

  it("all-bogus citations ⇒ empty kept (caller falls back to sector defaults)", () => {
    const { kept } = filterGroundedProblems([{ text: "x", evidenceRef: "E9" }], EV);
    expect(kept).toEqual([]);
  });
});
