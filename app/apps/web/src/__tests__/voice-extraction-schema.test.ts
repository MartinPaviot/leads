import { describe, it, expect } from "vitest";
import { callNotesSchema } from "@/lib/voice/extraction-schema";

describe("callNotesSchema", () => {
  it("accepts a fully populated note", () => {
    const ok = callNotesSchema.safeParse({
      summary: "Connected briefly; prospect curious but busy.",
      outcome: "callback_requested",
      sentiment: "positive",
      keyPoints: ["Currently using Outreach", "Renews in Q4"],
      actionItems: [
        { owner: "Martin", task: "Send 1-pager", deadline: "2026-05-25" },
      ],
      buyingSignals: {
        budget: null,
        timeline: "Q4 renewal",
        currentStack: ["Outreach"],
        painPoints: ["Reply rate dropping"],
        objections: [],
        nextSteps: ["Send email"],
        competitors: ["Outreach"],
        teamSize: null,
        initiatives: [],
      },
      meddic: null,
      contactProfile: null,
      evidence: [],
      callbackRequest: {
        requested: true,
        whenIso: "2026-05-21T14:00:00+02:00",
        note: "Tuesday after lunch",
      },
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a fully-qualified note with MEDDPICC, contact profile and evidence", () => {
    const ok = callNotesSchema.safeParse({
      summary: "Strong call. DAF confirmed the SaaS renewal is the trigger.",
      outcome: "meeting_booked",
      sentiment: "positive",
      keyPoints: ["Renewal in 3 months", "Sovereignty is a board topic"],
      actionItems: [{ owner: "Martin", task: "Send security one-pager", deadline: "2026-06-15" }],
      buyingSignals: {
        budget: "CHF 80k/an",
        timeline: "Renouvellement dans 3 mois",
        currentStack: ["Salesforce", "Microsoft 365"],
        painPoints: ["Facture qui grimpe", "Données hors d'Europe"],
        objections: ["Effort de migration"],
        nextSteps: ["Démo technique"],
        competitors: ["Statu quo", "Salesforce"],
        teamSize: "12",
        initiatives: ["Audit de souveraineté mandaté par le comité"],
      },
      meddic: {
        metrics: "−20% sur la facture annuelle",
        economicBuyer: "Directrice administrative et financière",
        decisionCriteria: ["Hébergement CH/EU", "Réversibilité"],
        decisionProcess: "Validation comité de direction en septembre",
        identifiedPain: "Dépendance au Cloud Act sur des données sensibles",
        champion: "Secrétaire général",
      },
      contactProfile: {
        role: "Directrice administrative et financière",
        isDecisionMaker: true,
        disposition: "champion",
      },
      evidence: [
        { claim: "Le renouvellement SaaS est dans 3 mois", quote: "on doit resigner Salesforce d'ici septembre" },
        { claim: "La souveraineté est un sujet du comité", quote: "le board nous a demandé un audit là-dessus" },
      ],
      callbackRequest: null,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an unknown outcome value", () => {
    const bad = callNotesSchema.safeParse({
      summary: "x",
      outcome: "ghosted",
      sentiment: "neutral",
      keyPoints: [],
      actionItems: [],
      buyingSignals: {
        budget: null,
        timeline: null,
        currentStack: [],
        painPoints: [],
        objections: [],
        nextSteps: [],
        competitors: [],
        teamSize: null,
        initiatives: [],
      },
      meddic: null,
      contactProfile: null,
      evidence: [],
      callbackRequest: null,
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a minimal voicemail note", () => {
    const ok = callNotesSchema.safeParse({
      summary: "Dropped voicemail introducing Elevay.",
      outcome: "voicemail_left",
      sentiment: "neutral",
      keyPoints: [],
      actionItems: [],
      buyingSignals: {
        budget: null,
        timeline: null,
        currentStack: [],
        painPoints: [],
        objections: [],
        nextSteps: [],
        competitors: [],
        teamSize: null,
        initiatives: [],
      },
      meddic: null,
      contactProfile: null,
      evidence: [],
      callbackRequest: null,
    });
    expect(ok.success).toBe(true);
  });
});
