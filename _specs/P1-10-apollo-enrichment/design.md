# Design — P1-10 Apollo firmographic/funding enrichment dans le brief

## Composants existants (read-only puis fix cible)

| Fichier | Role | Status |
|---|---|---|
| `lib/integrations/apollo-client.ts:84-91` | `enrichOrganization(domain)` REST + circuit breaker | EXISTE — read-only |
| `lib/providers/company-enrichment/apollo-adapter.ts:27-109` | Adapter Apollo→`EnrichedCompany`, palier 10 | EXISTE — read-only |
| `lib/providers/company-enrichment/waterfall.ts:148-192` | `enrichCompany()` orchestrateur + provenance par-champ | EXISTE — read-only, **point d'entree consomme** |
| `lib/providers/company-enrichment/types.ts:11-33,103-116` | `EnrichedCompany`, `ProvenanceEntry`, `WaterfallResult` | EXISTE — read-only |
| `lib/providers/company-enrichment/register-defaults.ts:29-42` | Wiring providers Apollo(10)…LLM(100) | EXISTE — read-only |
| `lib/campaign-engine/build-intelligence-brief.ts:186-235` | `fetchAllSources` (5 sources) | **FIX 1** — ajoute source firmographics |
| `lib/campaign-engine/build-intelligence-brief.ts:75-108` | Upsert du brief | **FIX 2** — ecrit firmographics + provenance |
| `lib/campaign-engine/build-intelligence-brief.ts:150-162,237-261` | `toResearchBriefContext`, `rowToBrief` | **FIX 3/4** — mappe les nouveaux champs |
| `lib/campaign-engine/types.ts:1-23` | `IntelligenceBrief` | **FIX 5** — etend de `firmographics`/provenance |
| `lib/context/prospect-context.ts:27-33,310-384` | `ResearchBriefContext`, `formatContextForPrompt` | **FIX 6** — expose + rend firmographics |
| `db/schema/campaign.ts:22-53` | Table `intelligence_briefs` | **FIX 7** — +2 colonnes jsonb |
| `lib/utils/with-timeout.ts` | `withTimeout` (livre P0) | EXISTE — read-only, reutilise (R6) |

## Fixes cibles

### Fix 1 — Brancher le waterfall dans `fetchAllSources` (`build-intelligence-brief.ts:186-235`)

Ajoute une 6e tache soft-fail bornee par timeout. Signatures REELLES du code consomme :

```ts
// import existant a ajouter en tete de build-intelligence-brief.ts
import { enrichCompany } from "@/lib/providers/company-enrichment/waterfall";
import { withTimeout } from "@/lib/utils/with-timeout";
import type { WaterfallResult } from "@/lib/providers/company-enrichment/types";

const FIRMOGRAPHICS_TIMEOUT_MS = 6000;

// Nouveau type plat, sous-ensemble de EnrichedCompany (types.ts:11-33)
export interface FirmographicFacts {
  industry: string | null;
  description: string | null;
  employeeCount: number | null;
  sizeRange: string | null;
  annualRevenue: number | null;
  revenueRange: string | null;
  foundedYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  fundingStage: string | null;
  totalFunding: number | null;
  investors: string[];
  technologies: string[];
}
export interface FieldProvenance {
  field: keyof FirmographicFacts;
  provider: string;   // "apollo" | "sirene" | "crunchbase" | "llm-fallback" | ...
  atIso: string;
}

// fetchAllSources gagne un parametre tenantId + retourne firmographics + provenance
async function fetchFirmographics(
  domain: string | null,
  name: string,
  tenantId: string,
): Promise<{ facts: FirmographicFacts | null; provenance: FieldProvenance[]; error: string | null }> {
  if (!domain) return { facts: null, provenance: [], error: null }; // R2
  try {
    const wf: WaterfallResult = await withTimeout(
      enrichCompany({ domain, name }, { tenantId }),
      FIRMOGRAPHICS_TIMEOUT_MS,
      "firmographics-waterfall",
    );
    if (!wf.enriched) return { facts: null, provenance: [], error: "no provider enriched" }; // R5
    const facts = pickFirmographics(wf.data);          // R3 — extrait le sous-ensemble
    const provenance = wf.provenance                    // R4 — restreint aux champs firmographic
      .filter((p) => p.field in EMPTY_FIRMOGRAPHICS)
      .map((p) => ({ field: p.field as keyof FirmographicFacts, provider: p.provider, atIso: p.atIso }));
    return { facts, provenance, error: null };
  } catch (err) {
    return { facts: null, provenance: [], error: err instanceof Error ? err.message : String(err) }; // R5/R6
  }
}
```

`fetchAllSources` appelle `fetchFirmographics` en parallele des 5 taches existantes (via `Promise.allSettled`, `:211`) ; en cas d'erreur, push `{ source: "firmographics", error }` dans `errors` (`:191`, R5).

### Fix 2 — Persister firmographics + provenance (`build-intelligence-brief.ts:75-108`)

```ts
const briefData = {
  // ...champs existants :79-95...
  firmographics: sources.firmographics ?? null,             // R8
  firmographicProvenance: sources.firmographicProvenance ?? [],
};
// onConflictDoUpdate.set inclut les deux nouveaux champs (idempotent, :102-105)
```

Garde-fou migration (edge case 8) : si `BRIEF_FIRMOGRAPHICS !== "off"` est requis OU try/catch isolant l'ecriture firmographics du reste du brief.

### Fix 3 — `rowToBrief` (`build-intelligence-brief.ts:237-261`)

```ts
firmographics: (row.firmographics ?? null) as FirmographicFacts | null,
firmographicProvenance: (row.firmographicProvenance ?? []) as FieldProvenance[],
```

### Fix 4 — `toResearchBriefContext` (`build-intelligence-brief.ts:150-162`)

```ts
firmographics: b.firmographics
  ? { facts: b.firmographics, provenance: b.firmographicProvenance ?? [] }
  : undefined,   // R11 — JAMAIS de payload raw (R17)
```

### Fix 5 — `IntelligenceBrief` (`types.ts:1-23`)

Ajoute `firmographics: FirmographicFacts | null;` et `firmographicProvenance: FieldProvenance[];` (types importes de build-intelligence-brief ou colocalises).

### Fix 6 — `ResearchBriefContext` + rendu (`prospect-context.ts:27-33,310-384`)

```ts
export interface ResearchBriefContext {
  bestAngle: string | null;
  painPoints: string[];
  competitorDetected: string | null;
  publicContent: Array<{ type: string; title: string; quote: string }>;
  warmthSignals: Array<{ type: string; detail: string }>;
  firmographics?: { facts: FirmographicFacts; provenance: FieldProvenance[] }; // R11
}
```

Dans `formatContextForPrompt`, apres la section RESEARCH BRIEF (`:332-342`) :

```ts
if (ctx.researchBrief?.firmographics) {
  const { facts, provenance } = ctx.researchBrief.firmographics;
  const srcOf = (f: keyof FirmographicFacts) =>
    provenance.find((p) => p.field === f)?.provider ?? "enrichment";
  const lines: string[] = [];
  if (facts.fundingStage || facts.totalFunding)
    lines.push(`- Funding: ${[facts.fundingStage, facts.totalFunding ? printMoney(facts.totalFunding) : null].filter(Boolean).join(" ")} [source: ${srcOf("fundingStage")}]`);
  if (facts.employeeCount) lines.push(`- Headcount: ${facts.employeeCount} [source: ${srcOf("employeeCount")}]`);
  if (facts.investors?.length) lines.push(`- Investors: ${facts.investors.slice(0,5).join(", ")} [source: ${srcOf("investors")}]`);
  // industry/revenue/foundedYear/geo idem, champs non-nuls seulement (R12)
  if (lines.length) sections.push(`FIRMOGRAPHICS (verified):\n${lines.join("\n")}`);
}
```

R13 : la section n'est emise QUE si `firmographics` defini ET au moins une ligne non-nulle → sortie byte-identique quand absent.

### Fix 7 — Schema (`db/schema/campaign.ts:22-53`)

```ts
firmographics: jsonb("firmographics"),                                    // R7
firmographicProvenance: jsonb("firmographic_provenance").default([]),
```

## Data model (drizzle)

ALTER additif, idempotent (runner casse a 0012 → appliquer via `db:migrate:apply` custom + `db:push` dev, cf. memoire) :

```sql
ALTER TABLE intelligence_briefs
  ADD COLUMN IF NOT EXISTS firmographics jsonb,
  ADD COLUMN IF NOT EXISTS firmographic_provenance jsonb DEFAULT '[]'::jsonb;
```

Aucun index requis (lecture toujours par PK via l'unique index `(tenant, company, contact)` existant `campaign.ts:51`). Backfill : aucun (les briefs existants rendront `firmographics=null`, degrade au comportement P0-2 ; ils s'enrichiront au prochain refresh apres TTL 14j).

## Flux (ordre des appels + gates)

```
buildIntelligenceBrief(companyId, tenantId, contactId?)
  └─ getCachedBrief()  ── cache-hit ──> RETURN (0 credit waterfall)   [GATE R14]
  └─ cache-miss:
       load company (tenant-scoped :32-36)
       └─ domain null ? ── oui ──> firmographics=null                 [GATE R2]
       fetchAllSources():
          Promise.allSettled([website, jobs, techStack, news, linkedin,
                              fetchFirmographics(domain,name,tenantId)])  [R1]
             └─ withTimeout(enrichCompany, 6000ms)                     [GATE R6]
                  └─ Apollo(10)→SIRENE→…→LLM(100)  (waterfall existant)
                  └─ enriched=false / throw / timeout ──> soft-fail    [GATE R5]
       synthesizeBrief(rawSources, company, contact)   (inchange :54-69)
       upsert intelligence_briefs { ...synth, firmographics, firmographicProvenance }  [R8]
  └─ RETURN brief

generateSequence path (P0-2, inchange):
  buildProspectContext → readCachedBrief (READ-ONLY, 0 waterfall)      [GATE R16]
    → toResearchBriefContext (mappe firmographics, PAS de raw)         [R11/R17]
    → formatContextForPrompt (section FIRMOGRAPHICS verified)          [R12]
```

## Failure handling / Security

- **Fail-open (motive).** L'enrichment firmographique est un ENRICHISSEMENT, pas un invariant de securite : son echec ne doit jamais bloquer la generation outbound. Donc soft-fail (R5/R6), identique au traitement des 5 sources existantes (`:214-222`). Symetrie avec P0-2 qui degrade au firmographique sur echec brief.
- **Tenant-scoping.** `enrichCompany(..., { tenantId })` recoit le tenant (`waterfall.ts:148` ProviderContext). Lecture/ecriture brief deja scopees `(tenantId, companyId, contactId)` (`:116-123`, `:32-36`, `:102-105`) — inchange.
- **Idempotence.** Cache-hit court-circuite le waterfall (R14, `:26-29`) ; dans la fenetre TTL 14j, 0 credit. `onConflictDoUpdate` gere la concurrence (edge case 11).
- **Budget credits Apollo.** 1 credit export par build FROID (plan free 75/mois, `apollo-tools.md`). Le circuit breaker (`apollo-client.ts:6`) + la gestion 403 (`:36-43`) evitent de bruler des appels sur quota epuise. Aucun budget tokens LLM additionnel (le LLM-fallback du waterfall n'est atteint que si Apollo+registres echouent, deja le cas avant P1-10).
- **Pas de fuite raw.** `raw` Apollo (`apollo-adapter.ts:98`) reste dans `WaterfallResult.data.raw` mais `pickFirmographics` ne le copie PAS dans `FirmographicFacts` ; `toResearchBriefContext` ne l'expose pas (R17).
- **Garde migration prod** (memoire "Prod schema behind Drizzle") : try/catch isolant l'ecriture des 2 colonnes, OU flag `BRIEF_FIRMOGRAPHICS` off tant que `firmographics`/`firmographic_provenance` ne sont pas en prod — sinon 500 runtime malgre build vert.

## Open questions

1. **`FirmographicFacts`/`FieldProvenance` : colocaliser dans `campaign-engine/types.ts` ou `providers/company-enrichment/types.ts` ?** Reco : `campaign-engine/types.ts` (a cote de `IntelligenceBrief`), pour eviter un cycle d'import `prospect-context → providers`. La provenance moteur (`ProvenanceEntry`) reste cote providers ; on en derive un type allege cote brief.
2. **Flag `BRIEF_FIRMOGRAPHICS` ou try/catch ?** Reco : try/catch isolant l'ecriture (plus simple, pas de config tenant), couple a l'application de la migration sur dev AVANT merge. Le flag n'est utile que si on veut deployer code avant migration prod.
3. **Faut-il refresh proactif des briefs existants (firmographics=null) ?** Non — ils s'enrichissent naturellement au refresh post-TTL. Backfill explicite = HORS SCOPE (eviterait juste 14j de degrade).
