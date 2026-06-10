import { describe, it, expect } from "vitest";
import { matchProblem, tokenize } from "@/lib/call-mode/match-problem";

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
