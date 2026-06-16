import { describe, it, expect } from "vitest";
import { checkScriptMethod } from "@/lib/call-mode/script-levers";
import { defaultScriptFields } from "@/lib/call-mode/call-scripts";

const ids = (f: Parameters<typeof checkScriptMethod>[0]) => checkScriptMethod(f).map((g) => g.id);

describe("checkScriptMethod", () => {
  it("every sector default ships compliant — no gaps out of the box", () => {
    for (const s of ["Santé", "Fondation", "Public", "Industrie", "xyz"]) {
      expect(checkScriptMethod(defaultScriptFields(s))).toEqual([]);
    }
  });

  it("flags the banned opener pattern", () => {
    const f = { ...defaultScriptFields("Fondation"), opener: "Bonjour {name}, je vous dérange ?" };
    expect(ids(f)).toContain("opener_banned");
  });

  it("flags an opener that pitches an enjeu (incl. a {tool} template enjeu)", () => {
    const base = defaultScriptFields("Fondation");
    const pitched = { ...base, opener: `Bonjour {name}, ${base.problems[0]} — vous avez 2 min ?` };
    expect(ids(pitched)).toContain("opener_pitches");
    // A {tool}-template enjeu (tenant scripts may still carry one) pasted into
    // the opener still matches — the lever strips {tool} before comparing.
    const toolEnjeu = "des abonnements comme {tool} qui grimpent à chaque renouvellement";
    const pitchedTool = { ...base, problems: [toolEnjeu, ...base.problems], opener: `Bonjour, ${toolEnjeu.replace("{tool}", " ")} ?` };
    expect(ids(pitchedTool)).toContain("opener_pitches");
  });

  it("flags an ask without a guided binary slot", () => {
    const f = { ...defaultScriptFields("Santé"), bookingAsk: "On se cale 45 minutes pour vous présenter la solution, rien à préparer." };
    expect(ids(f)).toContain("ask_no_binary_slot");
  });

  it("flags a deferring ask even when a slot exists", () => {
    const f = {
      ...defaultScriptFields("Santé"),
      bookingAsk: "Mardi 14h ou jeudi matin, rien à préparer — sinon dites-moi quelles sont vos disponibilités.",
    };
    expect(ids(f)).toContain("ask_defers");
  });

  it("flags a non-derisked ask", () => {
    const f = { ...defaultScriptFields("Santé"), bookingAsk: "On se voit mardi 14h ou jeudi matin ?" };
    expect(ids(f)).toContain("ask_no_derisk");
  });

  it("flags empty problems and a missing 'no' response", () => {
    const base = defaultScriptFields("Public");
    expect(ids({ ...base, problems: ["  "] })).toContain("no_problems");
    expect(ids({ ...base, guidance: base.guidance.filter((g) => !g.startsWith("[NON]")) })).toContain(
      "no_response_missing",
    );
  });
});
