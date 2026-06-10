import { describe, it, expect } from "vitest";
import { matchProblem, planProblems, tokenize } from "@/lib/call-mode/match-problem";

const PROBLEMS = [
  "le budget logiciels rogne sur la mission",
  "des outils Salesforce en place qu'on remplace à l'identique pour moins cher",
  "une facture logicielle qui grimpe à chaque renouvellement",
];

describe("tokenize", () => {
  it("is accent-insensitive and drops short words", () => {
    expect(tokenize("Données éclatées et IT")).toEqual(new Set(["donnees", "eclatees"]));
  });
});

describe("matchProblem", () => {
  it("floats the enjeu naming the detected tool", () => {
    expect(matchProblem(PROBLEMS, "Outils en place : Salesforce, SAP")).toBe(1);
  });

  it("returns -1 when nothing overlaps — never fakes relevance", () => {
    expect(matchProblem(PROBLEMS, "Apache Backbone Bootstrap")).toBe(-1);
  });

  it("returns -1 on empty trigger or empty problems", () => {
    expect(matchProblem(PROBLEMS, "")).toBe(-1);
    expect(matchProblem(PROBLEMS, null)).toBe(-1);
    expect(matchProblem([], "Salesforce")).toBe(-1);
  });

  it("picks the strongest overlap when several match", () => {
    const problems = ["facture logicielle en hausse", "facture logicielle et renouvellement Salesforce"];
    expect(matchProblem(problems, "renouvellement Salesforce facture")).toBe(1);
  });
});

describe("planProblems ({tool} convention)", () => {
  const PROBS = [
    "le budget logiciels rogne sur la mission",
    "des abonnements comme {tool}, qu'on pourrait remplacer pour bien moins cher",
    "une facture logicielle qui grimpe à chaque renouvellement",
  ];

  it("interpolates the detected tool and grounds the match on it", () => {
    const { display, matchedIdx } = planProblems(PROBS, "Microsoft Office 365 Apache", "Microsoft Office 365");
    expect(matchedIdx).toBe(1);
    const hit = display.find((d) => d.idx === 1)!;
    expect(hit.viaTool).toBe(true);
    expect(hit.text).toBe("des abonnements comme Microsoft Office 365, qu'on pourrait remplacer pour bien moins cher");
    expect(hit.text).not.toContain("{tool}");
  });

  it("HIDES the {tool} enjeu when no tool is detected — a raw placeholder is never read aloud", () => {
    const { display, matchedIdx } = planProblems(PROBS, null, null);
    expect(display.map((d) => d.idx)).toEqual([0, 2]);
    expect(display.every((d) => !d.text.includes("{tool}"))).toBe(true);
    expect(matchedIdx).toBe(-1);
  });

  it("falls back to token overlap when no enjeu carries {tool}", () => {
    const plain = ["le budget rogne sur la mission", "des outils Salesforce en place à remplacer"];
    const { matchedIdx } = planProblems(plain, "Outils en place : Salesforce", "Salesforce");
    expect(matchedIdx).toBe(1);
  });

  it("keeps ORIGINAL indices stable for checkboxes after hiding", () => {
    const { display } = planProblems(PROBS, "facture renouvellement", null);
    // idx 1 hidden; remaining entries keep their original indices 0 and 2.
    expect(display.map((d) => d.idx)).toEqual([0, 2]);
  });

  it("interpolates every occurrence of the placeholder", () => {
    const { display } = planProblems(["{tool} partout : {tool} encore"], null, "Wix");
    expect(display[0].text).toBe("Wix partout : Wix encore");
  });
});
