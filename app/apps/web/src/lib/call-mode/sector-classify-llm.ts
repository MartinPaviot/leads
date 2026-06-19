/**
 * LLM tier UNDER the deterministic waterfall (sector-classify) — last resort for
 * a company the structured signals can't place (no NAICS, no telling name). A
 * small model (Haiku) reads name + industry + description + keywords and picks
 * the real business sector; the caller caches the answer on the company so it's
 * paid once. Fail-soft: any error / no key → null, and the deterministic result
 * stands. Kept in its own file so the pure classifier + its tests don't import
 * the AI SDK (local vitest flake).
 */

import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";

// Must match the call-script sector keys (SECTOR_KEYS).
const KEYS = ["sante", "fondations", "parapublic", "international", "education", "conseil", "it", "low-tech", "generic"] as const;

export interface LlmSectorSignals {
  name?: string | null;
  industry?: string | null;
  description?: string | null;
  keywords?: string[] | null;
}

/** Classify one company into a sector key via a small model, or null on
 *  failure / no model configured (the deterministic result then stands). */
export async function classifySectorLLM(sig: LlmSectorSignals): Promise<string | null> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return null;
  if (!(sig.name || sig.industry)) return null; // nothing to go on

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: z.object({ sector: z.enum(KEYS) }),
      prompt: `Classe cette entreprise dans UN secteur, pour adapter un script d'appel B2B (Suisse romande). Choisis le MÉTIER RÉEL, pas le tag d'industrie (souvent faux).

Secteurs:
- sante : EMS, cliniques, hôpitaux, institutions de soin
- fondations : fondations, associations, ONG, institutions sociales
- parapublic : administrations, communes, cantons, secteur public
- international : organisations internationales, fédérations, ONU/OIG
- education : écoles, hautes écoles, universités, organismes de formation
- conseil : cabinets de conseil, audit
- it : sociétés informatiques, logiciel, SaaS, hébergement
- low-tech : industrie, construction, négoce, commerce, transport, logistique
- generic : tout le reste (luxe, banque/finance, hôtellerie, sport, immobilier, médias…)

Entreprise : ${sig.name ?? "?"}
Industrie (peu fiable) : ${sig.industry ?? "?"}${sig.description ? `\nDescription : ${sig.description.slice(0, 400)}` : ""}${sig.keywords?.length ? `\nMots-clés : ${sig.keywords.slice(0, 10).join(", ")}` : ""}`,
      _trace: { agentId: "sector-classify-llm", inputPreview: (sig.name ?? "").slice(0, 60) },
    });
    return (KEYS as readonly string[]).includes(object.sector) ? object.sector : null;
  } catch {
    return null;
  }
}
