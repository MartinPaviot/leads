import { describe, it, expect } from "vitest";
import { scoreTranscriptLevers, TALK_RATIO_BAND } from "@/lib/voice/lever-scoring";

const A = (text: string) => ({ speaker: "agent" as const, text });
const P = (text: string) => ({ speaker: "prospect" as const, text });

// A methodology-clean call: permission → reason → enjeu → de-risked binary ask.
const GOOD = [
  A("Bonjour Madame Rochat, Martin Paviot, co-fondateur de Pilae. Est-ce que vous avez deux minutes ?"),
  P("Oui, allez-y, mais rapidement."),
  A("Merci. C'est justement pour ça que je vous appelle : vous recrutez un responsable informatique en ce moment."),
  P("C'est exact, on cherche quelqu'un depuis un moment déjà pour reprendre tout ça."),
  A("La plupart des fondations que j'appelle paient des abonnements accumulés qu'on pourrait remplacer pour bien moins cher. C'est un sujet chez vous ?"),
  P("Honnêtement oui, on en parle en interne, la facture monte chaque année et personne ne pilote vraiment le sujet."),
  A("Alors on a intérêt à se rencontrer : je viens avec une première lecture de l'écart de coût, rien à préparer de votre côté. Plutôt mardi 14h ou jeudi matin ?"),
  P("Disons jeudi matin, ça me va très bien."),
];

describe("scoreTranscriptLevers", () => {
  it("scores a clean call all-green with no drill", () => {
    const s = scoreTranscriptLevers(GOOD)!;
    expect(s.bannedOpener).toBe(false);
    expect(s.openerPermission).toBe(true);
    expect(s.reasonStated).toBe(true);
    expect(s.askDerisked).toBe(true);
    expect(s.binarySlot).toBe(true);
    expect(s.deferUsed).toBe(false);
    expect(s.talkRatioPct).toBeGreaterThanOrEqual(TALK_RATIO_BAND[0]);
    expect(s.talkRatioPct).toBeLessThanOrEqual(TALK_RATIO_BAND[1]);
    expect(s.drill).toBeNull();
  });

  it("detects the banned opener and makes it THE drill", () => {
    const s = scoreTranscriptLevers([
      A("Bonjour, je vous dérange ? Vous avez deux minutes ?"),
      P("Euh, c'est à quel sujet exactement ?"),
      A("C'est pour ça que je vous appelle : votre recrutement. On se voit mardi 14h ou jeudi, rien à préparer ?"),
      P("Je ne sais pas trop, envoyez-moi quelque chose."),
    ]);
    expect(s?.bannedOpener).toBe(true);
    expect(s?.drill).toBe("banned_opener");
  });

  it("flags a deferred slot when everything else is clean", () => {
    const s = scoreTranscriptLevers([
      ...GOOD.slice(0, 6),
      A("On se cale 45 minutes, rien à préparer de votre côté, mardi 14h ou jeudi ? Sinon dites-moi quand vous seriez disponible."),
      P("Plutôt jeudi je pense, à confirmer avec mon assistante demain."),
    ]);
    expect(s?.deferUsed).toBe(true);
    expect(s?.drill).toBe("defer_used");
  });

  it("drill priority: a missing reason outranks a missing de-risk", () => {
    const s = scoreTranscriptLevers([
      A("Bonjour Madame Rochat, Martin de Pilae. Vous avez deux minutes ?"),
      P("Allez-y, je vous écoute, mais soyez bref s'il vous plaît."),
      A("Les fondations paient des abonnements qu'on remplace moins cher. On se voit mardi 14h ou jeudi matin ?"),
      P("Pourquoi pas, à voir selon mes disponibilités de la semaine."),
    ]);
    expect(s?.reasonStated).toBe(false);
    expect(s?.drill).toBe("reason_stated");
  });

  it("returns null on thin transcripts — no verdict on a voicemail", () => {
    expect(scoreTranscriptLevers([])).toBeNull();
    expect(scoreTranscriptLevers([A("Bonjour, rappelez-moi au zéro six...")])).toBeNull(); // agent-only
    expect(scoreTranscriptLevers([A("Allô ?"), P("Oui ?")])).toBeNull(); // < 120 chars
  });

  it("computes the talk ratio as the agent character share", () => {
    const s = scoreTranscriptLevers([
      A("a".repeat(300)),
      A("vous avez deux minutes ? c'est pour ça que je vous appelle, rien à préparer, mardi 14h ou jeudi"),
      P("b".repeat(100)),
    ])!;
    expect(s.talkRatioPct).toBe(Math.round(((300 + 96) / (300 + 96 + 100)) * 100));
  });
});
