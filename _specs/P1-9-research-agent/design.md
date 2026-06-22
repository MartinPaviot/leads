# Design — P1-9 (research-agent)

## Composants existants (read-only, puis fix ciblé)

| Fichier | Rôle | Statut | file:line |
|---|---|---|---|
| `lib/campaign-engine/build-intelligence-brief.ts` | Orchestrateur cache→fetch→synth→upsert | **MODIF ciblée** : insérer le chemin agent + fallback | `:19-109`, `fetchAllSources :186-235` |
| `lib/campaign-engine/brief-synthesizer.ts` | Synthèse LLM mono-call (fallback) | **read-only** (reste fallback) | `:69-103` |
| `lib/campaign-engine/types.ts` | `IntelligenceBrief` + sous-types | **read-only** (contrat de sortie) | `:1-77` |
| `lib/campaign-engine/sources/website.ts` | `scrapeCompanyWebsite` | **réutilisé** par l'outil `fetchWebsite` | `:10-62` |
| `lib/campaign-engine/sources/jobs.ts` | `scrapeJobPostings` | **réutilisé** par `fetchJobs` | `:13-28` |
| `lib/campaign-engine/sources/news.ts` | `fetchRecentNews` | **réutilisé** par `fetchNews` | `:3-55` |
| `lib/campaign-engine/sources/tech-stack.ts` | `detectTechStack` | **réutilisé** par `detectTechStack` (outil) | `:43-77` |
| `lib/ai/traced-ai.ts` | `tracedGenerateText` (budget+trace+spread args) | **réutilisé** (wrapper LLM de l'agent) | `:73-131` |
| `lib/ai/ai-provider.ts` | `anthropic()`, `getModelForTask()` | **réutilisé** (routing modèle) | `:126,217` |
| `lib/utils/with-timeout.ts` | `withTimeout` fail-open | **réutilisé** (timeout par outil) | `:6-16` |
| `lib/context/prospect-context.ts` | lecture brief caché (P0-2) | **read-only** (ne pas toucher) | `:179-193` |
| `lib/inbox/ask-agent.ts` | patron de boucle outil existant | **modèle de référence** (à imiter) | `:50-71` |

## Fixes ciblés

### Fix 1 — Nouveau : `lib/campaign-engine/sources/browse-page.ts`

Outil de crawl ciblé qui SUIT les liens internes (le gap de `website.ts`).

```ts
import * as cheerio from "cheerio";

export interface BrowsePageResult {
  url: string;
  title: string | null;
  headings: string[];
  mainText: string;      // tronqué 3000 chars (cf. website.ts:51)
  internalLinks: string[]; // liens même-domaine, dédupliqués, max 20
  fetchedAt: string;
}

export type BrowseOutcome =
  | { ok: true; page: BrowsePageResult }
  | { ok: false; error: "out_of_scope" | "blocked_host" | "fetch_failed" | "not_html" };

/** rootDomain = domaine racine de la company (scope). url = page demandée par le modèle. */
export async function browsePage(rootDomain: string, url: string): Promise<BrowseOutcome>;
```

Garde-fous internes : (a) normaliser `url`, rejeter schéma non-http(s) ; (b) host doit être `=== rootHost` ou sous-domaine de `rootHost` → sinon `out_of_scope` ; (c) bloquer IP privées/loopback/link-local (regex sur l'host résolu) → `blocked_host` ; (d) re-vérifier l'host APRÈS redirection (`res.url`) ; (e) `AbortController` 8s ; (f) `content-type` text/html sinon `not_html`.

### Fix 2 — Nouveau : `lib/campaign-engine/research-agent-tools.ts`

Construit le `ToolSet` AI SDK v6 (`tool` re-exporté par `ai`), avec mémoïsation intra-run et timeout par outil.

```ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { withTimeout } from "@/lib/utils/with-timeout";
import { scrapeCompanyWebsite } from "./sources/website";
import { scrapeJobPostings } from "./sources/jobs";
import { fetchRecentNews } from "./sources/news";
import { detectTechStack } from "./sources/tech-stack";
import { browsePage } from "./sources/browse-page";

export interface ToolLedger {
  attempted: number;
  succeeded: number;
  errors: Array<{ source: string; error: string }>;
  // résultats bruts collectés pour R3.4 (news/jobs/tech/linkedin)
  collected: { news: NewsItem[]; jobs: JobPosting[]; techStack: TechEntry[]; website: WebsiteResult | null };
  memo: Map<string, unknown>; // clé `${name}:${JSON.stringify(args)}` (R2.5)
}

export function newToolLedger(): ToolLedger;

export interface BuildToolsArgs {
  rootDomain: string | null;
  companyName: string;
  enrichApollo?: (args: { domain: string | null }) => Promise<unknown>; // P1-10, conditionnel
}

/** N'ajoute un outil que si sa dépendance existe (pas de fetchWebsite sans domaine ; pas d'enrichApollo sans impl). */
export function buildResearchTools(args: BuildToolsArgs, ledger: ToolLedger): ToolSet;
```

Chaque `execute` : (1) clé mémo → si présent, retour immédiat ; (2) `withTimeout(fn(), 8000)` ; (3) succès → push dans `ledger.collected`, `succeeded++`, retour `{ ok:true, data }` (tronqué) ; (4) échec/null → `errors.push`, retour `{ ok:false, error }` (R2.6, jamais throw). Schémas zod : `fetchWebsite{}`, `browsePage{ path: z.string() }` (relatif au rootDomain), `fetchJobs{}`, `fetchNews{}`, `detectTechStack{}`.

### Fix 3 — Nouveau : `lib/campaign-engine/research-agent.ts` (cœur)

```ts
import { Output, stepCountIs, hasToolCall, type PrepareStepFunction } from "ai";
import { z } from "zod";
import { anthropic, getModelForTask } from "@/lib/ai/ai-provider";
import { tracedGenerateText } from "@/lib/ai/traced-ai";
import { buildResearchTools, newToolLedger } from "./research-agent-tools";
import type { SynthesizedFields } from "./brief-synthesizer";

/** Schéma de sortie = champs synthétisés du IntelligenceBrief (types.ts:6-20). */
const briefOutputSchema = z.object({
  websiteSummary: z.string().nullable(),
  painPoints: z.array(z.string()).max(5),
  bestAngle: z.string().nullable(),
  competitorDetected: z.string().nullable(),
  communicationStyle: z.object({
    formality: z.enum(["formal","casual","mixed"]),
    preferredLength: z.enum(["short","medium","long"]),
    tone: z.string(),
  }).nullable(),
  publicContent: z.array(z.object({
    type: z.enum(["linkedin_post","blog_post","podcast","talk","tweet"]),
    title: z.string(), quote: z.string(), url: z.string(), date: z.string(),
  })),
  warmthSignals: z.array(z.object({
    type: z.enum(["mutual_connection","shared_community","alumni","shared_investor","past_interaction"]),
    detail: z.string(),
  })),
});

export interface RunResearchAgentArgs {
  tenantId: string;
  companyName: string;
  domain: string | null;
  contact: { firstName: string|null; lastName: string|null; title: string|null; linkedinUrl: string|null } | null;
  maxSteps?: number;        // défaut 8 (R1.3)
  enrichApollo?: BuildToolsArgs["enrichApollo"]; // P1-10
}

export interface RunResearchAgentResult {
  synthesized: SynthesizedFields;
  attempted: number; succeeded: number;
  errors: Array<{ source: string; error: string }>;
  collected: ToolLedger["collected"]; // news/jobs/tech pour R3.4
  steps: number;
}

// prepareStep : extraction (≥ moitié des steps, ou step ayant un gros tool result) → Haiku ; sinon Sonnet.
const routeStep: PrepareStepFunction = ({ stepNumber }) => {
  const light = getModelForTask("lightweight"); // claude-haiku-4-5
  return stepNumber > 0 && light ? { model: light } : {}; // step 0 = planning (Sonnet par défaut)
};

export async function runResearchAgent(a: RunResearchAgentArgs): Promise<RunResearchAgentResult> {
  const ledger = newToolLedger();
  const tools = buildResearchTools(
    { rootDomain: a.domain, companyName: a.companyName, enrichApollo: a.enrichApollo },
    ledger,
  );
  const result = await tracedGenerateText({
    model: anthropic("claude-sonnet-4-6"),
    system: RESEARCH_SYSTEM,           // « creuse jusqu'à dossier complet, suis /pricing /about /customers, n'invente rien »
    messages: [{ role: "user", content: buildSeedPrompt(a) }],
    tools,
    stopWhen: stepCountIs(a.maxSteps ?? 8),
    experimental_output: Output.object({ schema: briefOutputSchema }),
    prepareStep: routeStep,
    _trace: { agentId: "research-agent-brief", tenantId: a.tenantId, inputPreview: a.companyName },
  });
  const out = result.experimental_output; // typé via le schéma (R1.5)
  return {
    synthesized: { ...out, publicContentDepth: out.publicContent.length },
    attempted: ledger.attempted, succeeded: ledger.succeeded, errors: ledger.errors,
    collected: ledger.collected, steps: result.steps?.length ?? 0,
  };
}
```

Note API vérifiée (`ai@6.0.199` .d.ts) : `generateText` accepte `stopWhen`/`experimental_output`/`prepareStep` ; `tracedGenerateText` les spread (`traced-ai.ts:76,96`) et retourne le résultat brut → `result.experimental_output` disponible. `Output`, `stepCountIs`, `hasToolCall`, `tool`, `PrepareStepFunction` sont tous exportés par `"ai"`.

### Fix 4 — `build-intelligence-brief.ts` : insérer le chemin agent (R1.1, R4.3)

Remplacer le bloc `:50-69` :

```ts
// Avant (:51-69) : fetchAllSources + synthesizeBrief inconditionnels.
// Après :
let synthesized; let sources;
const useAgent = process.env.RESEARCH_AGENT_ENABLED === "1";
if (useAgent) {
  try {
    const r = await runResearchAgent({
      tenantId, companyName: company.name, domain: company.domain, contact,
    });
    synthesized = r.synthesized;
    sources = {
      news: r.collected.news, jobs: r.collected.jobs, techStack: r.collected.techStack,
      linkedin: null, // linkedin reste hors boucle (R2.4-adjacent ; pas d'outil li)
      attempted: r.attempted, succeeded: r.succeeded, errors: r.errors,
    };
  } catch (err) {
    if (isBudgetError(err)) throw err;               // R4.2 — ne PAS fallback
    sources = await fetchAllSources(company.domain, contact?.linkedinUrl ?? null, company.name);
    synthesized = await synthesizeBrief({ website: sources.website, ...sources }, company, contact); // R4.3
  }
} else {
  sources = await fetchAllSources(company.domain, contact?.linkedinUrl ?? null, company.name); // chemin actuel (R4.5)
  synthesized = await synthesizeBrief({ website: sources.website, ...sources }, company, contact);
}
// … suite inchangée (:71-108) : briefData + upsert.
```

`isBudgetError(err)` = `err?.name === "BudgetExceededError"` (cf. `enforceLlmBudget`, `traced-ai.ts:84`). Le reste (`briefData`, upsert tenant-scopé, TTL) **inchangé** → R3.1/R3.2.

## Data model

**Aucun changement.** Réutilise `intelligenceBriefs` (upsert `build-intelligence-brief.ts:99-106`). Aucune migration.

## Flux (ordre des appels + gates)

```
buildIntelligenceBrief(companyId, tenantId, contactId)
 ├─ getCachedBrief (TTL+tenant)            [:27]  → hit ? return
 ├─ load company/contact (tenant-scopé)    [:32-48]
 ├─ RESEARCH_AGENT_ENABLED ?
 │   ├─ OUI → runResearchAgent
 │   │        ├─ tracedGenerateText  → enforceLlmBudget (GATE budget, throw=stop)  [traced-ai:84]
 │   │        ├─ boucle: prepareStep route modèle → tool calls (memo+timeout)      [stepCountIs(8)]
 │   │        └─ experimental_output (schéma) → SynthesizedFields
 │   │        catch budget → THROW ; catch autre → fallback ↓
 │   └─ NON / fallback → fetchAllSources + synthesizeBrief        [:51-69 actuel]
 ├─ briefData + upsert (conflit tenantId+companyId+contactId)     [:99-106]
 └─ rowToBrief → IntelligenceBrief
       ↳ lu plus tard read-only par prospect-context (P0-2)        [prospect-context:182-188]
```

## Failure handling / Security

- **Fail-open vers le déterministe (R4.3)** : motivé — la recherche est une dépendance optionnelle de la génération (le câblage P0-2 dégrade déjà sur brief vide). Un échec d'agent ne doit jamais bloquer la production d'un brief firmographique.
- **Fail-closed sur budget (R4.2)** : motivé — re-tenter en fallback brûlerait encore du budget chez un tenant déjà au cap ; on propage `BudgetExceededError`.
- **Outils fail-soft (R2.6)** : chaque `execute` retourne `{ok:false}` au lieu de throw → le modèle pivote, la boucle survit.
- **Tenant-scoping** : aucune requête DB dans l'agent ; les données company/contact sont passées par valeur depuis `buildIntelligenceBrief` (déjà tenant-scopé `:35,45`). L'upsert reste scopé `tenantId`.
- **SSRF / scope (R2.2.1/2.2.2)** : `browsePage` restreint au domaine racine, bloque IP privées, re-check post-redirection, schéma http(s) only. C'est la seule surface réseau pilotée par le modèle → durcie.
- **Idempotence** : upsert sur clé unique (inchangé) ; mémoïsation intra-run évite les refetch ; pas d'effet de bord hors écriture du brief.
- **Budget tokens (R4.4)** : `maxSteps=8`, résultats outils tronqués (3000 chars), `maxOutputTokens` borné, coût loggé `llm_calls`. Cible : ≤ ~4x le coût mono-call actuel.

## Open questions

1. `prepareStep` routing — heuristique « step>0 = Haiku » est grossière ; alternative = forcer Sonnet quand le step précédent a posé un appel outil « planning » et Haiku pour les steps post-fetch. À calibrer en éval avant d'activer en prod (`RESEARCH_AGENT_ENABLED`).
2. Faut-il un outil `fetchLinkedIn` dans la boucle ? Aujourd'hui non (scraper bloqué par authwall, `linkedin.ts:36`) ; laissé hors boucle, `linkedin:null`. À revoir si une source LinkedIn fiable arrive (P1-10/Apollo).
3. Budget total du run vs timeout Inngest si l'agent est déplacé dans `inngest/research-agent.ts` (aujourd'hui chemin synchrone via `research/route.ts`). À trancher au câblage Inngest si on veut de l'async.
