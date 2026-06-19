import { describe, it, expect } from "vitest";
import {
  pickCallScript,
  resolveCallScript,
  interpolateOpener,
  lineFor,
  splitGuidance,
  withNoResponse,
  peerLeadFor,
  BASCULE,
  OBJECTIONS,
  resolveBranches,
  personaEnjeuIndex,
  prefixObservation,
} from "@/lib/call-mode/call-scripts";

describe("pickCallScript", () => {
  it("matches a sector by keyword (accent/case-insensitive)", () => {
    expect(pickCallScript("Santé / EMS").key).toBe("sante");
    expect(pickCallScript("Fondation d'utilité publique").key).toBe("fondations");
    expect(pickCallScript("Administration cantonale").key).toBe("parapublic");
    expect(pickCallScript("Industrie / manufacturing").key).toBe("low-tech");
    expect(pickCallScript("International affairs (Geneva)").key).toBe("international");
    expect(pickCallScript("Higher education").key).toBe("education");
    expect(pickCallScript("Cabinet de conseil").key).toBe("conseil");
    expect(pickCallScript("Information technology & services").key).toBe("it");
  });

  it("org-type wins over topic (the Apollo-industry trap)", () => {
    // A health SCHOOL is education, not an EMS — even when Apollo tags the
    // account "hospital & health care". The name carries the real signal.
    expect(pickCallScript("Haute école de santé Genève hospital & health care").key).toBe("education");
    expect(pickCallScript("Haute école de travail social nonprofit").key).toBe("education");
    expect(pickCallScript("International School of Geneva").key).toBe("education");
    // A real care institution still resolves to santé.
    expect(pickCallScript("EMS Les Tilleuls hospital & health care").key).toBe("sante");
    expect(pickCallScript("Clinique de La Source").key).toBe("sante");
  });

  it("falls back to generic for unknown / empty", () => {
    expect(pickCallScript("Quantum widgets").key).toBe("generic");
    expect(pickCallScript(null).key).toBe("generic");
    expect(pickCallScript("").key).toBe("generic");
  });

  it("every script carries 3 enjeux, a sector line, qualifiers + a booking ask", () => {
    for (const s of ["Santé", "Fondation", "Public", "Industrie", "International affairs", "Higher education", "xyz"]) {
      const sc = pickCallScript(s);
      expect(sc.problems.length).toBe(3);
      expect(sc.line.length).toBeGreaterThan(0);
      expect(sc.qualifiers.length).toBeGreaterThanOrEqual(1);
      expect(sc.bookingAsk.length).toBeGreaterThan(0);
      expect(["terrain", "mure"]).toContain(sc.segment);
    }
  });

  it("santé/fondations/parapublic are terrain; international/education/conseil/it are orga mûre", () => {
    expect(pickCallScript("Santé").segment).toBe("terrain");
    expect(pickCallScript("Fondation").segment).toBe("terrain");
    expect(pickCallScript("Commune de Morges").segment).toBe("terrain");
    expect(pickCallScript("International affairs").segment).toBe("mure");
    expect(pickCallScript("Higher education").segment).toBe("mure");
    expect(pickCallScript("Cabinet de conseil").segment).toBe("mure");
  });

  it("enjeux are récit-pair (quoted peer + two-door), no {tool} placeholder", () => {
    for (const s of ["Santé", "Fondation", "International affairs", "Higher education", "xyz"]) {
      const sc = pickCallScript(s);
      expect(sc.problems.length).toBe(3);
      for (const p of sc.problems) {
        expect(p.includes("{tool}")).toBe(false);
        expect(p).toContain("«"); // quoted peer voice
        expect(p).toContain("→"); // the two-door validation
      }
    }
  });
});

describe("lineFor (sector ↔ subject)", () => {
  it("returns a sector-specific line", () => {
    expect(lineFor("Fondation").toLowerCase()).toContain("fondation");
    expect(lineFor("Santé").toLowerCase()).toContain("soin");
    expect(lineFor("International affairs").toLowerCase()).toContain("internationales");
  });
  it("falls back to a generic romand line", () => {
    expect(lineFor("xyz").toLowerCase()).toContain("entreprises romandes");
    expect(lineFor(null).toLowerCase()).toContain("romand");
  });
});

describe("resolveCallScript (final model: sector↔subject opener, no phone discovery)", () => {
  it("builds an identity + sector↔subject + permission opener", () => {
    const r = resolveCallScript({ sector: "Santé", geo: "Genève", contactName: "Mme Rochat" });
    expect(r.opener).toContain("Mme Rochat");
    expect(r.opener).toContain("Pilae");
    expect(r.opener).toContain("lausannoise"); // minimal identity
    expect(r.opener.toLowerCase()).toContain("je me concentre en ce moment sur"); // the sector hook
    expect(r.opener.toLowerCase()).toContain("soin"); // the santé line
    expect(r.opener).toContain("Ça vous convient ?"); // the permission ask
    expect(r.opener).not.toContain("Je vous appelle car"); // the rejected framing is gone
    expect(r.opener).not.toContain("{name}");
    expect(r.opener).not.toContain("{line}");
    expect(r.permissionCheck).toBe(""); // validation travels inside each enjeu
    expect(r.problems.length).toBe(3);
    expect(r.guidance.some((g) => g.toLowerCase().includes("qualifier"))).toBe(true);
  });

  it("never names a detected tool in the opener, never tells the buyer he overpays", () => {
    const r = resolveCallScript({ sector: "Santé", contactName: "Mme Rochat", tool: "Microsoft 365" });
    expect(r.opener).not.toContain("Microsoft 365");
    expect(r.opener.toLowerCase()).not.toContain("trop cher");
    expect(r.opener).not.toContain("{line}");
  });

  it("exposes the bascule lead and a video booking with concrete time windows", () => {
    const r = resolveCallScript({ sector: "EMS" });
    expect(r.peerLead).toBe(BASCULE);
    expect(r.peerLead.toLowerCase()).toContain("open source");
    expect(r.bookingAsk.toLowerCase()).toContain("visio");
    expect(r.bookingAsk).toMatch(/\d{1,2}h/); // concrete hours
    expect(r.bookingAsk).toMatch(/\bou\b/); // binary choice
    expect(r.bookingAsk.toLowerCase()).toContain("rien à préparer"); // de-risk
  });

  it("uses safe fallbacks when fields are missing (clean greeting, no leftover placeholders)", () => {
    const r = resolveCallScript({});
    expect(r.opener.startsWith("Bonjour,")).toBe(true);
    expect(r.opener.toLowerCase()).toContain("entreprises romandes"); // generic line
    expect(r.opener).not.toContain("{name}");
    expect(r.opener).not.toContain("{line}");
    expect(r.opener).not.toMatch(/\s{2,}/);
    expect(r.peerLead).toBe(BASCULE);
    expect(r.guidance.length).toBeGreaterThan(0);
  });
});

describe("interpolateOpener", () => {
  it("replaces the {line} token", () => {
    const out = interpolateOpener("Bonjour {name}, de Pilae. Je me concentre sur {line} Ça vous convient ?", {
      name: "M. Berra",
      line: "les fondations romandes : l'IA souveraine.",
    });
    expect(out).toBe("Bonjour M. Berra, de Pilae. Je me concentre sur les fondations romandes : l'IA souveraine. Ça vous convient ?");
    expect(out).not.toContain("{line}");
  });

  it("accepts the legacy {reason} token as an alias for {line}", () => {
    const out = interpolateOpener("Bonjour {name}. {reason}", { name: "M. Berra", line: "les EMS romands." });
    expect(out).toBe("Bonjour M. Berra. les EMS romands.");
  });

  it("collapses the {line} token cleanly when nothing is known", () => {
    const out = interpolateOpener("Bonjour {name}, de Pilae. {line}", { name: "M. Berra" });
    expect(out).toBe("Bonjour M. Berra, de Pilae.");
  });

  it("never positionally injects into a tokenless opener", () => {
    const out = interpolateOpener("Bonjour M. Dupont, de Pilae. Vous avez deux minutes ?", {
      name: "M. Dupont",
      line: "les EMS romands.",
    });
    expect(out).toBe("Bonjour M. Dupont, de Pilae. Vous avez deux minutes ?");
    expect(out).not.toContain("les EMS romands.");
  });
});

describe("peerLeadFor", () => {
  it("returns the bascule demi-phrase regardless of sector", () => {
    expect(peerLeadFor("Fondation")).toBe(BASCULE);
    expect(peerLeadFor("hospital & health care")).toBe(BASCULE);
    expect(peerLeadFor("")).toBe(BASCULE);
    expect(peerLeadFor(null)).toBe(BASCULE);
  });
});

describe("prefixObservation (lead with a fresh prospect signal)", () => {
  const opener = "Bonjour M. Berra, Martin Paviot, cofondateur de Pilae, une société lausannoise. Je me concentre en ce moment sur les EMS romands. Ça vous convient ?";
  it("inserts the observation as its own sentence after the identity, before the sector", () => {
    const out = prefixObservation(opener, "Je vois que vous recrutez un DSI.");
    expect(out).toBe("Bonjour M. Berra, Martin Paviot, cofondateur de Pilae, une société lausannoise. Je vois que vous recrutez un DSI. Je me concentre en ce moment sur les EMS romands. Ça vous convient ?");
  });
  it("returns the opener unchanged when there is no observation", () => {
    expect(prefixObservation(opener, null)).toBe(opener);
    expect(prefixObservation(opener, "  ")).toBe(opener);
  });
  it("prepends when the opener has no sentence break", () => {
    expect(prefixObservation("Vous avez un instant", "J'ai vu votre levée.")).toBe("J'ai vu votre levée. Vous avez un instant");
  });
});

describe("personaEnjeuIndex (float the enjeu the role cares about)", () => {
  it("finance roles → coût (1)", () => {
    expect(personaEnjeuIndex("CFO")).toBe(1);
    expect(personaEnjeuIndex("Directeur administratif et financier / CFO-COO")).toBe(1);
    expect(personaEnjeuIndex("Head of Finance & Controlling")).toBe(1);
  });
  it("IT roles → souveraineté (2)", () => {
    expect(personaEnjeuIndex("DSI")).toBe(2);
    expect(personaEnjeuIndex("Head of Information Technology Department")).toBe(2);
    expect(personaEnjeuIndex("Responsable IT")).toBe(2);
    expect(personaEnjeuIndex("CIO")).toBe(2);
  });
  it("general management → retard IA (0)", () => {
    expect(personaEnjeuIndex("Directeur général")).toBe(0);
    expect(personaEnjeuIndex("Secrétaire général")).toBe(0);
    expect(personaEnjeuIndex("Chief Executive Officer")).toBe(0);
    expect(personaEnjeuIndex("Managing Director")).toBe(0);
    expect(personaEnjeuIndex("Propriétaire")).toBe(0);
  });
  it("no strong steer → null (keep default order)", () => {
    expect(personaEnjeuIndex("Directrice des Soins Infirmiers")).toBeNull();
    expect(personaEnjeuIndex("Responsable marketing et communication")).toBeNull();
    expect(personaEnjeuIndex(null)).toBeNull();
    expect(personaEnjeuIndex("")).toBeNull();
  });
});

describe("branches (gatekeeper / voicemail / callback / objections)", () => {
  it("covers the classic objections, each with a response", () => {
    expect(OBJECTIONS.length).toBeGreaterThanOrEqual(5);
    const cues = OBJECTIONS.map((o) => o.cue.toLowerCase()).join(" | ");
    expect(cues).toMatch(/temps/);
    expect(cues).toMatch(/mail/);
    expect(cues).toMatch(/outil|microsoft/);
    expect(cues).toMatch(/pas intéress/);
    expect(cues).toMatch(/combien/);
    for (const o of OBJECTIONS) {
      expect(o.cue.trim().length).toBeGreaterThan(0);
      expect(o.response.trim().length).toBeGreaterThan(20);
    }
  });

  it("never argues — answers redirect to the meeting or ask a calibrated question", () => {
    const all = OBJECTIONS.map((o) => o.response).join(" ").toLowerCase();
    expect(all).toMatch(/visio|recontacte|deux minutes|15 min/);
  });

  it("interpolates {name} into the branch lines, no leftover token", () => {
    const b = resolveBranches({ name: "M. Berra" });
    expect(b.gatekeeper).toContain("M. Berra");
    expect(b.voicemail).toContain("M. Berra");
    expect(b.callback).toContain("M. Berra");
    for (const s of [b.gatekeeper, b.voicemail, b.callback]) expect(s).not.toContain("{name}");
    expect(b.objections).toHaveLength(OBJECTIONS.length);
  });

  it("degrades cleanly with no name", () => {
    const b = resolveBranches({});
    expect(b.voicemail).not.toContain("{name}");
    expect(b.voicemail.length).toBeGreaterThan(0);
  });
});

describe("no response (guidance-encoded)", () => {
  it("every sector ships a read-aloud 'no' response, split cleanly from tips", () => {
    for (const s of ["Santé", "Fondation", "Public", "Industrie", "International affairs", "Higher education", "xyz"]) {
      const r = resolveCallScript({ sector: s });
      const { noResponse, tips } = splitGuidance(r.guidance);
      expect(noResponse.length).toBeGreaterThan(0);
      expect(noResponse).not.toContain("[NON]");
      expect(tips.every((t) => !t.startsWith("[NON]"))).toBe(true);
      expect(tips.length).toBeGreaterThan(0);
    }
  });

  it("round-trips an edited 'no' response through the guidance array", () => {
    const r = resolveCallScript({ sector: "Fondation" });
    const { tips } = splitGuidance(r.guidance);
    const edited = withNoResponse(tips, "Pas de souci, je vous laisse, bonne journée.");
    const back = splitGuidance(edited);
    expect(back.noResponse).toBe("Pas de souci, je vous laisse, bonne journée.");
    expect(back.tips).toEqual(tips);
    expect(splitGuidance(withNoResponse(tips, "  ")).noResponse).toBe("");
  });
});
