/**
 * International-institution classifier — PURE core (no AI SDK import, so it's
 * unit-testable without the @ai-sdk vitest flake).
 *
 * Why this exists: Apollo's industry tags can't separate an international
 * institution from a commercial business in the same tag — a sport FEDERATION
 * and a ski school are both "sports"; a broadcast STANDARDS body and a media
 * agency are both "media production". Pilae's prime segment (NGO / IGO / UN /
 * international federation-association / charitable foundation / parapublic) is
 * therefore not expressible as an Apollo query. Like title→persona and
 * industry-match, an LLM reasons over the REAL labels (name, industry, domain,
 * description); a hardcoded keyword table is banned. Fail-closed: anything the
 * model can't place is "unknown" + isInstitution=false (we never over-include).
 */
import { z } from "zod";

export const INSTITUTION_KINDS = [
  "ngo",
  "igo_un",
  "federation_association",
  "foundation",
  "parapublic",
  "standards_scientific",
  "commercial",
  "unknown",
] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

export interface InstitutionVerdict {
  isInstitution: boolean;
  kind: InstitutionKind;
  confidence: number; // 0..1
}

export interface CompanyToClassify {
  id: string;
  name: string | null;
  industry: string | null;
  domain: string | null;
  description?: string | null;
}

/** LLM output shape: one entry per company, keyed by a per-batch integer ref
 *  (echoing a UUID is fragile — a small int is robust to copy back). */
export const institutionResultSchema = z.object({
  results: z
    .array(
      // NOTE: no min/max/int constraints here — Anthropic's structured-output
      // JSON schema rejects `minimum`/`maximum`. parseInstitutionVerdicts clamps
      // confidence to [0,1] and validates kind, so the wire schema stays loose.
      z.object({
        ref: z.number().describe("The [n] number of the company, copied exactly"),
        isInstitution: z.boolean(),
        kind: z.enum(INSTITUTION_KINDS),
        confidence: z.number().describe("0 to 1"),
      }),
    )
    .describe("Exactly one entry per company"),
});
export type InstitutionResult = z.infer<typeof institutionResultSchema>;

/** One company rendered for the prompt, prefixed by its batch ref. */
export function formatCompanyLine(ref: number, c: CompanyToClassify): string {
  const parts = [
    `[${ref}] ${c.name ?? "(no name)"}`,
    `industry: ${c.industry || "?"}`,
    `domain: ${c.domain || "?"}`,
  ];
  const desc = (c.description || "").replace(/\s+/g, " ").trim();
  if (desc) parts.push(`about: ${desc.slice(0, 160)}`);
  return parts.join(" | ");
}

export function buildInstitutionPrompt(batch: Array<{ ref: number; company: CompanyToClassify }>): string {
  return `You label organisations for a Swiss CRM as INTERNATIONAL INSTITUTION vs COMMERCIAL.

An INTERNATIONAL INSTITUTION (isInstitution=true) is a non-profit, mission/charter/treaty/member-based organisation in the public-interest or international sphere. Kinds:
- ngo: non-governmental / charitable organisation
- igo_un: intergovernmental organisation, UN agency/programme, multilateral/diplomatic body (often a .int domain)
- federation_association: an international federation, union, council or member association — INCLUDING international SPORT federations / governing bodies, and professional or trade associations
- foundation: a charitable / philanthropic / mission-driven foundation
- parapublic: a public or cantonal/regional body, public economic-promotion agency, public institution
- standards_scientific: a non-profit standards body, scientific union or learned society (e.g. broadcast/telecom standards, scientific unions, industry technical associations)

COMMERCIAL (isInstitution=false, kind="commercial") is any for-profit business: startups, SMEs, banks, asset/wealth managers, hotels, restaurants, retailers, manufacturers, watchmakers, marketing/PR/event agencies, consultancies, law firms, private clinics, private schools and ed-tech, and COMMERCIAL sports businesses (clubs, ski/sport schools, venues, sports-marketing agencies). A "Foundation" in the NAME that is actually an investment vehicle or fund manager is COMMERCIAL.

Hints: an international federation/association/union/programme/council is an institution; a club/school/venue/agency is commercial. ".int" ⇒ igo_un. ".org" leans non-profit but verify. When you genuinely cannot tell, use kind="unknown" and isInstitution=false (do NOT guess true).

Classify EACH organisation below. Return exactly one entry per [n], echoing its ref, with isInstitution, kind, and confidence (0-1).

${batch.map((b) => formatCompanyLine(b.ref, b.company)).join("\n")}`;
}

/**
 * Validate + map the LLM output back to company ids. Pure. Drops entries whose
 * ref is out of range (hallucinated); clamps confidence; an unknown kind string
 * collapses to "unknown"/false. A company the model didn't answer stays ABSENT
 * from the map (caller treats absent as unresolved, never as a negative).
 */
export function parseInstitutionVerdicts(
  results: Array<{ ref: number; isInstitution: boolean; kind: string; confidence: number }> | undefined,
  refToId: Map<number, string>,
): Map<string, InstitutionVerdict> {
  const out = new Map<string, InstitutionVerdict>();
  const kinds = new Set<string>(INSTITUTION_KINDS);
  for (const r of results ?? []) {
    const id = refToId.get(r.ref);
    if (!id) continue; // hallucinated ref
    const kind = (kinds.has(r.kind) ? r.kind : "unknown") as InstitutionKind;
    const isInstitution = kind === "commercial" || kind === "unknown" ? false : !!r.isInstitution;
    const confidence = Math.max(0, Math.min(1, Number.isFinite(r.confidence) ? r.confidence : 0));
    out.set(id, { isInstitution, kind, confidence });
  }
  return out;
}
