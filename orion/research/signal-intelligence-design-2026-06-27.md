# Signal Intelligence — sous-système produit-intégré

## 0. Résumé exécutif

Signal Intelligence est le sous-système qui répond aux trois questions du founder — **quels** signaux observer pour son entreprise, **comment** les chercher, **comment** s'en servir — en se branchant sur les coutures déjà présentes dans Elevay, sans rewrite. Pilier 1 (DÉCOUVERTE) : une **ordonnance de signaux** par tenant (table `signal_prescriptions`) alimentée par trois voies — entretien d'onboarding LLM, auto-reco déterministe dérivée de l'ICP, boucle closed-won — éditable dans `settings/signals`. Pilier 2 (ACQUISITION) : une interface `SignalSource` unifiée + un registre de connecteurs (ATS publics, SEC, BODACC, GitHub, Apollo, Crunchbase, Unipile…) qui écrivent tous via un choke-point `recordSignal`. Pilier 3 (ACTIVATION) : scoring (`priority_score`), timing Kairos, angle/canal/séquence, autopilot sous gates, surfaces UI — tous lisant un contrat unique. La colonne vertébrale commune est `lib/signals/taxonomy.ts` (à créer, rapport §4.4), dont `toCanonical()` ferme le défaut #1 (multipliers morts). Le **MVP** = le Compound Signal Agent du hackathon (rapport §5) branché sur le bus naissant : un slice de bout-en-bout qui démontre les trois piliers sur une company froide.

L'architecture cible (table `signals`, bus, séquence de migration additive) est spécifiée dans `_reports/signals-world-class-2026-06-27.md` §4 et n'est pas répétée ici — ce document opérationnalise les trois piliers par-dessus.

---

## 1. Vue d'ensemble — le golden path d'un signal

```
                    PILIER 1 — DÉCOUVERTE                         PILIER 2 — ACQUISITION
   ┌──────────────────────────────────────────────┐   ┌────────────────────────────────────────┐
   │ "quels signaux pour MON entreprise ?"          │   │ "comment les chercher ?"                │
   │                                                │   │                                          │
   │  (a) entretien onboarding (LLM)                │   │  SignalSource registry                   │
   │      api/onboarding/signal-interview [NOUVEAU] │   │      lib/signals/sources/registry.ts     │
   │      ctx: tenant-settings.ts:43-46,66,90-93    │   │      [NOUVEAU, miroir de                 │
   │  (b) auto-reco ICP (pur, déterministe)         │   │      company-enrichment/registry.ts:14] │
   │      handler onboarding/completed               │   │   ┌── apollo-client.ts:84,316           │
   │      (émis save/route.ts:254-264)              │   │   ├── crunchbase-client.ts:42,76        │
   │  (c) boucle closed-won → propose                │   │   ├── tech-detect/index.ts:23           │
   │      deal/closed (deals/[id]/route.ts:177)     │   │   ├── recherche-entreprises:37,60       │
   │      lit getSignalMultipliers:150-197          │   │   ├── ATS/SEC/GitHub  [NOUVEAUX]         │
   │            │                                    │   │   └── Unipile / RB2B / Snitcher         │
   │            ▼                                    │   │            │ collect()/ingestWebhook()  │
   │  signal_prescriptions [NOUVELLE TABLE]          │   └────────────┼─────────────────────────────┘
   │  db/schema/intelligence.ts (≈:222)             │                │
   │  = l'ordonnance éditable settings/signals:225  │                ▼
   └────────────────────┬───────────────────────────┘   ┌────────────────────────────────────────┐
                        │ "active" = câble le routage     │  recordSignal()  [NOUVEAU — bus §4.5]    │
                        │ writeTriggerConfig triggers:110 │  lib/signals/bus.ts                      │
                        ▼                                  │   1 toCanonical()  taxonomy.ts [NOUVEAU] │
   ┌────────────────────────────────────────────┐         │   2 verifySources  verify-source.ts:26   │
   │            NORMALISATION / BUS               │◀────────│   3 classifySignalConfidence cs.ts:67    │
   │  table signals (rapport §4.3)               │         │   4 ttl/expiresAt  freshness.ts:70       │
   │  un seul écrivain, dédup event-grain        │         │   5 dedupKey + onConflictDoUpdate        │
   └────────────────────┬───────────────────────┘         │   6 emit signals/recorded                │
                        │ activeSignals(subject)            └────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │                              PILIER 3 — ACTIVATION  "s'en servir au mieux"                       │
   │                                                                                                  │
   │  SCORING            getSignalMultipliers:150 → bestMultiplierForCompany signal-score-daily:70    │
   │                     → computePriorityScore priority-score.ts:47-50  → companies.priorityScore    │
   │  TIMING (Kairos)    signal-monitor.ts:135 → signals/fresh-detected → decideAcceleration:138      │
   │                     → UPDATE sequenceEnrollments.nextStepAt=now  signal-accelerate-cadence:119   │
   │  ANGLE/CANAL        tamSignalsToAngleSignals signal-opener:79 → pickBestSignal outbound-meth:210 │
   │                     → generateOpener:162 → pickSequenceForSignal triggers:143                    │
   │  AUTOPILOT          api/sequences/[id]/autopilot:12 (trier sur priorityScore) → enforceApproval  │
   │                     :128 → evaluateSend sending-gate.ts:186                                        │
   │  SURFACES           signal-chip:37 · company-signals:18 · why-line:46 · hot-to-call:72 · up-next  │
   └────────────────────┬─────────────────────────────────────────────────────────────────────────┘
                        │ deal won/lost
                        ▼
   ┌──────────────────────────────────────────────┐
   │  MESURE + APPRENTISSAGE                        │
   │  recordDealOutcome signal-outcomes.ts:56       │
   │  → signal_outcomes (type CANONIQUE)            │
   │  → getSignalMultipliers:150 (Bayésien, k≥10)   │──┐ reboucle sur SCORING + TIMING + voie (c)
   └───────────────────────────────────────────────┘  │
              ▲                                         │
              └─────────────────────────────────────────┘
```

Invariant : aucune source ne touche `signals` ni `companies.properties` directement ; tout passe par `recordSignal`, qui appelle `toCanonical` avant tout `INSERT`. C'est ce qui rend le défaut #1 (taxonomies divergentes → multipliers morts) structurellement impossible.

---

## 2. Pilier DÉCOUVERTE — quels signaux pour mon entreprise

### 2.1 Le manque actuel

L'onboarding capture l'ICP (firmo + targeting) et le persiste dans `tenants.settings` (flat) + `icps`/`icp_criteria` via `upsertRankOneProfileFromUiState` (`api/onboarding/save/route.ts:187-229`). Mais **aucune notion de "signaux choisis par ce tenant" n'existe** : les `PLAYBOOKS[slug].signals` (`lib/onboarding/playbooks.ts:58-189`) sont calculés à la volée et jamais persistés ; `custom_signals` (`intelligence.ts:664-713`) est le seul self-service, mais c'est un détecteur booléen company-grade créé à la main, sans lien avec une recommandation. La liste de détecteurs `DEFAULT_SIGNALS` (`tam-stream/signals/index.ts:10-16`) est identique pour tous les tenants. Conclusion : le système ne **choisit** pas, ne **découvre** pas, ne **retire** pas de signal pour un tenant donné (rapport couche 1, D1/D4/D5).

### 2.2 Data model — `signal_prescriptions` (l'ordonnance)

Nouvelle table Drizzle dans `db/schema/intelligence.ts`, à côté de `signalOutcomes:222`. C'est la **couche config** manquante (quels signaux ce tenant traque + pourquoi + action), distincte de l'observation (`signals`, rapport §4.3), de l'attribution (`signal_outcomes`) et du FIT (`icp_criteria`). Tenant-scoped, optionnellement ICP-scoped (même pattern que `customSignals.icpId:696`).

```ts
// db/schema/intelligence.ts (à côté de signalOutcomes:222) — NOUVELLE TABLE
export const signalPrescriptions = pgTable("signal_prescriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  icpId: text("icp_id"),                       // null = tenant-wide (cf. customSignals.icpId:696)

  // EXACTEMENT UN des deux (CHECK num_nonnulls=1)
  signalType: text("signal_type"),             // clé CANONIQUE (taxonomy.ts §4.4)
  customSignalId: text("custom_signal_id"),    // FK custom_signals.id

  category: text("category").notNull(),        // 'fit'|'intent'|'timing'|'warm_path' (SIGNAL_CATEGORY signal-detectors.ts:33)
  source: text("source").notNull(),            // 'apollo'|'crunchbase'|'tam_stream'|'signal_monitor'|'unipile'|'bodacc'|'ats_public'|'sec_edgar'|'github'|'custom'|'manual'
  ttlDays: integer("ttl_days"),                // null = fait structurel (warm_path)

  // ACTION ROUTÉE (garde-fou §3.5 : pas d'action = on ne track pas)
  routedAction: jsonb("routed_action").notNull().default({}),
  // { kind:'sequence', sequenceTemplateKey?, triggerSignalType? } | {kind:'kairos'} | {kind:'alert'} | {kind:'angle', angleType} | {kind:'none'}

  origin: text("origin").notNull(),            // 'interview'|'auto_reco'|'learned'|'manual'
  rationale: text("rationale").notNull(),      // founder-facing
  evidence: jsonb("evidence").notNull().default({}),
  // learned → {lift,won,lost,baselineWinRate,sampleSize} | auto_reco → {profile,playbookSlug,rule} | interview → {questionKey,answerSummary}

  status: text("status").notNull().default("proposed"),   // 'proposed'|'active'|'retired'
  priorityHint: integer("priority_hint").notNull().default(100),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedByUserId: text("decided_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("signal_prescriptions_tenant_idx").on(t.tenantId),
  index("signal_prescriptions_tenant_status_idx").on(t.tenantId, t.status),
  uniqueIndex("signal_prescriptions_dedup_idx").on(t.tenantId, t.icpId, t.signalType, t.customSignalId),
  // CHECK: num_nonnulls(signal_type, custom_signal_id) = 1
  // CHECK: status <> 'active' OR routed_action->>'kind' <> 'none'
]);
```

Pourquoi une table et pas un champ `tenants.settings.recommendedSignals` : (1) cycle de vie `proposed/active/retired` avec décideur horodaté que la boucle (c) écrit en continu ; (2) `routedAction` + `evidence` typées par signal, impossibles à plaquer sur un JSONB flat ; (3) jointure indexée pour que l'activation lise "ce type est-il dans l'ordonnance active ?". Les maps hardcodées `SIGNAL_CATEGORY` (`signal-detectors.ts:33-40`) et `SIGNAL_TTL_DAYS` (`signal-detectors.ts:49-56`) deviennent les **valeurs par défaut** des prescriptions.

Type partagé (`lib/signals/discovery/types.ts`, NOUVEAU) :

```ts
export interface SignalPrescription {
  id: string; tenantId: string; icpId: string | null;
  signalType: string | null; customSignalId: string | null;
  category: "fit" | "intent" | "timing" | "warm_path";
  source: string; ttlDays: number | null; routedAction: RoutedAction;
  origin: "interview" | "auto_reco" | "learned" | "manual";
  rationale: string; evidence: Record<string, unknown>;
  status: "proposed" | "active" | "retired"; priorityHint: number;
}
export type RoutedAction =
  | { kind: "sequence"; sequenceTemplateKey?: string; triggerSignalType?: string }
  | { kind: "kairos" } | { kind: "alert" } | { kind: "angle"; angleType: string } | { kind: "none" };
export type SignalPrescriptionDraft = Omit<SignalPrescription, "id" | "tenantId" | "status">;
```

Choke-point d'écriture unique (`lib/signals/discovery/prescribe.ts`, NOUVEAU) :

```ts
export async function upsertPrescriptions(
  tenantId: string, drafts: SignalPrescriptionDraft[],
  opts: { status: "proposed" | "active"; decidedByUserId?: string },
): Promise<{ created: number; updated: number; prescriptions: SignalPrescription[] }>;
// onConflictDoUpdate sur (tenantId, icpId, signalType, customSignalId) → idempotent.
// Cap doux : warn si > 5 actifs (garde-fou §3.5 sur-saturation).
// Valide routedAction.kind !== 'none' quand status='active'.
```

### 2.3 Les trois voies de découverte

Les trois produisent le **même** `SignalPrescriptionDraft[]` et passent par `upsertPrescriptions`.

**Voie (a) — Entretien d'onboarding (LLM, checklist rapport §3.1).**
Branchement : nouvel endpoint SSE `POST /api/onboarding/signal-interview` (squelette copié de `api/tam/build/route.ts:180-569`), inséré **après** le save ICP (`onboarding/save/route.ts:229`) et **avant** `step:"complete"` (`:232-264`). UI : nouvelle étape dans `onboarding-v2-wrapper.tsx` entre l'ICP et le redirect (l'insertion exacte est après le `handleConfirm`/POST save, lignes 182-200), OU relançable post-onboarding depuis `settings/signals`.

```ts
// lib/signals/discovery/interview.ts (NOUVEAU)
export interface InterviewContext {           // pré-rempli depuis l'onboarding déjà capturé
  productDescription?: string;                // tenant-settings.ts:43
  salesMotion?: string;                       // tenant-settings.ts:44
  primaryChallenge?: string;                  // tenant-settings.ts:46
  targetIndustries?: string[];                // tenant-settings.ts:90
  targetSeniorities?: string[];               // tenant-settings.ts:93
  companyInvestors?: string[];                // tenant-settings.ts:66
  playbookSlug: PlaybookSlug;                 // resolvePlaybook(industry) playbooks.ts:261
}
export type ChecklistKey =                    // miroir EXACT de §3.1
  | "acv" | "cycle_length" | "first_party_surface" | "daily_volume" | "data_budget"
  | "anti_icp" | "geo_dominant"
  | "buying_committee" | "pain_trigger" | "champion_mobility" | "network_warm"
  | "closed_won_commonality" | "negative_signals";
export async function* runSignalInterview(ctx: InterviewContext, history: InterviewTurn[]):
  AsyncGenerator<{ type:"question"; questionKey:ChecklistKey; text:string } | { type:"prescriptions"; drafts:SignalPrescriptionDraft[] }>;
```

L'agent (`tracedGenerateObject`, Sonnet, prompt grounded comme `custom-signals/generator.ts:36-113`) ne pose **que** les questions dont la réponse n'est pas déjà dans le contexte, déduit `Motion/ACV/first-party` (livrable §3.1), puis émet 3-5 drafts `origin:"interview"`, `evidence:{questionKey, answerSummary}`, persistés `status:"proposed"`. UX : mini-chat 5-6 tours dans le wizard ("Quel est ton ACV moyen ?" → boutons `<5k / 5-25k / 25-100k / >100k`), dernière bulle = carte récap "Voici les 4 signaux recommandés" → CTA "Valider l'ordonnance" → `upsertPrescriptions(..., {status:"active"})`.

**Voie (b) — Auto-recommandation ICP (pur, déterministe — le filet de sécurité).**
Branchement : étape `recommend-signals` ajoutée dans le handler Inngest `onboarding/completed` (émis `onboarding/save/route.ts:254-264`), après le TAM build. Zéro LLM, Layer-1 comme `resolvePlaybook` (`playbooks.ts:261-270`). Garantit que l'ordonnance n'est **jamais vide** même si le founder saute l'entretien.

```ts
// lib/signals/discovery/auto-recommend.ts (NOUVEAU)
export function classifyProfile(p: ProfileInputs): "A" | "B" | "C" | "D";   // pur, arbre §3.2
export function recommendSignalsFromProfile(p: ProfileInputs): SignalPrescriptionDraft[];
// Table §3.2 codée en dur. PROFIL A (founder-led/pre-PMF/no first-party) → exactement :
//  job_change (warm_path, source unipile|bodacc, ttl 60, action sequence)
//  investor_overlap (warm_path, source tam_stream, ttl null, action angle) — si companyInvestors.length
//  funding (timing, source apollo|crunchbase, ttl 180, action sequence)
//  hiring (timing, source apollo|ats_public, ttl 30, action sequence)
// Refuse Bombora/G2 pour A/B (garde-fou §3.2). Labels depuis PLAYBOOKS[slug].signals (playbooks.ts:58-189).
```

Émet `origin:"auto_reco"`, `status:"active"` (déterministe + conservateur) ; l'entretien (a) raffine ensuite ; `upsertPrescriptions` déduplique → relancer est idempotent.

**Voie (c) — Boucle closed-won (propose add/retire).**
Branchement : étape `propose-prescription-changes` dans le handler Inngest `deal/closed` (émis `deals/[id]/route.ts:177-179`) — asynchrone, ne bloque pas le stage change.

```ts
// lib/signals/discovery/learn.ts (NOUVEAU)
export async function proposeSignalChangesFromOutcomes(tenantId: string): Promise<PrescriptionProposal[]>;
// 1. getSignalMultipliers(tenantId) (signal-outcomes.ts:150-197) — déjà Bayésien, clamp [0.5,2.5], k≥10
// 2. active = prescriptions WHERE status='active'
// 3. ADD    : multipliers[type] >= 1.5 ET type ∉ active                       → proposal add
// 4. RETIRE : prescription active ET multipliers[type] <= 0.7 ET sampleSize>=10 → proposal retire
// 5. JAMAIS auto-appliquer : tout en status='proposed', le founder valide. Gate totalOutcomes >= 10 (MIN_SAMPLE_SIZE signal-outcomes.ts:33).
```

UX : bandeau "Suggestions de tes deals gagnés" dans `settings/signals` → "Le signal *levée de fonds* a un lift de 2.1× sur tes 14 derniers deals. L'ajouter ?" boutons `Ajouter`/`Ignorer` ; symétrique pour retire.

### 2.4 La sortie — l'ordonnance éditable

API (NOUVELLE) `app/api/signals/prescription/route.ts` :

```
GET   /api/signals/prescription        → { active: SignalPrescription[], proposed: SignalPrescription[] }
POST  /api/signals/prescription        → upsert draft manuel (origin:'manual')
PATCH /api/signals/prescription/[id]   → { status:'active'|'retired', routedAction?, ttlDays? }
```

`PATCH status:'active'` exécute l'activation (`lib/signals/discovery/activate.ts`, NOUVEAU) : (1) valide `routedAction.kind !== 'none'` ; (2) si `kind==='sequence'` ET `triggerSignalType ∈ KNOWN_SIGNAL_TYPES` (`triggers.ts:27-37`) → câble `writeTriggerConfig(seq.campaignConfig, [...types])` (`triggers.ts:110-130`) ; (3) si `customSignalId` → déclenche `custom-signal/backfill` si `backfilledAt` null ; (4) si `signalType` built-in → vérifie source registrée (`DEFAULT_SIGNALS` `tam-stream/signals/index.ts:10-16`), warning UI si `isAvailable()` faux (clé manquante) ; (5) stamp `decidedAt` + `decidedByUserId`.

UI : extension de `settings/signals/page.tsx` (qui ne liste aujourd'hui que les `custom_signals`, `:225-303`). Ajout en tête : section "Votre ordonnance de signaux" (prescriptions `active`, chaque ligne = nom + badge `category` + source + pill TTL + action routée + chip origine + `Éditer`/`Retirer`) ; section "Suggestions" (`proposed`). Le formulaire "New signal" existant (`:181-221`) crée toujours un `custom_signals` ET, en plus, une prescription `source='custom'` qui le route. Chat (registry CLE-14, `page.tsx:132-152`) : ajouter `settings.reviewPrescription` (`mutating:false`) et `settings.runSignalInterview` (`confirm:'risky'`).

---

## 3. Pilier ACQUISITION — comment chercher ces signaux

### 3.1 L'interface `SignalSource` unifiée

Le repo a deux patterns de "source enregistrée" mais aucun ne couvre l'acquisition multi-source : `RegisteredSignal`/`SignalDetector` (`tam-stream/signals/types.ts:40-48`) est couplé Apollo (`SignalInput = {search, enriched}`, `:31-34`) et mono-payload ; `CompanyEnrichmentProvider` (`company-enrichment/types.ts:84-101`) a la bonne métadonnée (priority, `isAvailable()`, coût, geo) mais sort du firmo, pas un signal daté. La couche d'acquisition fusionne les deux + trois champs neufs (`subjectType`, `rgpdBasis`, `freshnessModel`).

```ts
// lib/signals/sources/types.ts (NOUVEAU)
export interface SubjectRef {                 // découplé d'Apollo (≠ SignalInput types.ts:31-34)
  subjectType: "company" | "person"; tenantId: string;
  companyId?: string; contactId?: string;
  domain?: string | null; name?: string | null; linkedinUrl?: string | null;
  siren?: string | null; cik?: string | null; githubOrg?: string | null; geo?: GeoRegion;
  apollo?: { search?: OrgSearchOrganization; enriched?: ApolloOrganization | null }; // build TAM only
}
export type FreshnessModel = "poll" | "webhook" | "on-demand";
export type RgpdBasis = "public_record" | "legitimate_interest" | "consent_first_party" | "broker_dpa";

export interface RawSignal {
  rawType: string;                            // vocabulaire propre de la source ; le bus mappe vers canonique
  subjectType: "company" | "person";
  value: boolean; reason: string;
  sources: Source[];                          // events.ts:31-42 ; HEAD-check par le bus
  confidence?: number; firedAt?: string | null;
  detail?: Record<string, unknown>; sourceEventId?: string; // → dedupKey
}
export interface SignalSource {
  name: string; produces: readonly CanonicalSignalType[];   // types CANONIQUES
  subjectType: "company" | "person";
  freshnessModel: FreshnessModel; rgpdBasis: RgpdBasis;
  costCentsPerCall: number; requiredEnv: readonly string[]; geoAffinity?: GeoRegion[];
  isAvailable(): boolean;                     // défaut = requiredEnv.every(k => !!process.env[k])
  collect(subject: SubjectRef, ctx: SignalSourceContext): Promise<RawSignal[]>;   // PULL, ne throw jamais → []
  ingestWebhook?(payload: unknown, ctx: SignalSourceContext): Promise<{ subject: SubjectRef; signals: RawSignal[] } | null>; // PUSH
}
```

Le registre est une copie exacte du pattern `company-enrichment/registry.ts:14-61` (dédup par `name`, `isAvailable()` silencieux, lazy defaults) : `lib/signals/sources/registry.ts` + `register-defaults.ts` (NOUVEAUX). Pont vers l'existant : les 5 détecteurs TAM (`DEFAULT_SIGNALS`, `signals/index.ts:10-16`) deviennent des `SignalSource` sans réécriture via `asSignalSource(reg)` (`lib/signals/sources/adapters/tam-detector-source.ts`, NOUVEAU) qui reconstruit `SignalInput` depuis `SubjectRef.apollo`. Résultat : **un seul registre** héberge détecteurs TAM, connecteurs keyless et sources webhook.

### 3.2 Catalogue de connecteurs priorisé

Multiplicateur de faisabilité dominant = "client déjà câblé dans le repo" → trois tiers (détail complet rapport §2(d), §5.3).

**Tier S — réutilisent un client existant (heures) :**

| # | Connecteur | produces | Sujet | Endpoint / réutilise (file:line) | Env | Fraîcheur | Coût | RGPD |
|---|---|---|---|---|---|---|---|---|
| S1 | Apollo job-postings | hiring | company | `num_current_job_openings` `apollo-client.ts:81,260` ; `isApolloAvailable()` `:316` | `APOLLO_API_KEY` | poll/on-demand | inclus | broker_dpa |
| S2 | Tech-detect | tech_stack_change, tech_adoption | company | `detectTechStack(domain)` `tech-detect/index.ts:23` + diff snapshot | — | poll | 0 | public_record |
| S3 | Crunchbase | funding | company | `enrichOrganization(domain)` `crunchbase-client.ts:76` ; `isCrunchbaseAvailable()` `:42` | `CRUNCHBASE_API_KEY` | poll | inclus | broker_dpa |
| S4 | BODACC + recherche-entreprises FR | leadership_change, funding | company | `recherche-entreprises.api.gouv.fr/search` `:16` ; BODACC Opendatasoft ; `isSireneAvailable()` `recherche-entreprises-client.ts:37`, `companyDetailBySiren` `:60` | — | poll | 0 | public_record |

**Tier A — nouveaux connecteurs keyless (≈ demi-journée chacun, NOUVEAUX fichiers) :**

| # | Connecteur | produces | Endpoint | Env | Coût | RGPD | Fichier |
|---|---|---|---|---|---|---|---|
| A1 | Greenhouse | hiring | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | — | 0 | public_record | `lib/integrations/ats/greenhouse-client.ts` |
| A2 | Lever | hiring | `GET api.lever.co/v0/postings/{company}?mode=json` | — | 0 | public_record | `lib/integrations/ats/lever-client.ts` |
| A3 | Ashby | hiring | `POST api.ashbyhq.com/posting-api/job-board/{board}` | — | 0 | public_record | `lib/integrations/ats/ashby-client.ts` |
| A4 | SEC EDGAR | funding (Form D/8-K) | `efts.sec.gov` full-text + `data.sec.gov/submissions/CIK{10}.json` | `SEC_USER_AGENT` reco | 0 | public_record | `lib/integrations/sec-edgar-client.ts` |
| A5 | GitHub | tech_adoption | `GET api.github.com/orgs/{org}/repos` + stars snapshot/diff | `GITHUB_TOKEN` opt. | 0 | public_record | `lib/integrations/github-client.ts` |

**Tier B — conditionnels :** B1 Unipile job-change (person-grain, warm n°1, `UNIPILE_API_KEY`+`UNIPILE_DSN`, consent_first_party, `lib/context/relationship-graph.ts`) ; B2 RB2B (person US, webhook, **bloqué EU**) ; B3 Snitcher (company EU, reverse-IP sans PII, **autorisé EU**, legitimate_interest).

Ordre de bataille (impact × faisabilité) : `S1,S2,S4` → `A1-A3` (hiring gratuit le plus dense) → `S3,A4` → `A5` → `B1` → `B2/B3`. C'est exactement le mix PROFIL A du rapport. L'alias-map (`taxonomy.ts`) doit être étendue pour chaque `rawType` neuf : `greenhouse_job/lever_job/ashby_job/apollo_job_openings → hiring`, `sec_form_d → funding`, `bodacc_modification_dirigeant → leadership_change`, `github_repo_push → tech_adoption`, `unipile_position_change → job_change`, `rb2b_page_view/snitcher_visit → website_visit`, `yc_company → null` (trait, drop). TTL canoniques déjà dans `freshness.ts:31-60` ; ajouter `job_change:60`.

### 3.3 Trois modes d'orchestration → un bus

Les trois appellent le **même** `recordSignal` (rapport §4.5, `lib/signals/bus.ts` NOUVEAU) qui normalise (`toCanonical`), HEAD-check (`verify-source.ts:26`), classe la confidence (`confidence-state.ts:67`), calcule `expiresAt` (`freshness.ts:70`), déduplique (event-grain), upsert, émet `signals/recorded`.

**Mode A — Build TAM (batch live).** Branchement : la boucle `DEFAULT_SIGNALS.map` (`tam-stream/per-company.ts:256-282`). Dual-write additif après `signalsBySlot[key] = payload` (`:263`) : `await recordSignal({ tenantId, subjectType:"company", companyId, source:`tam_${key}`, raw:{...payload} }).catch(()=>{})`. Fan-out optionnel des sources keyless company (`listAvailableSources({freshness:"poll", rgpdAllowed})`) gardé par flag `TAM_FANOUT_SOURCES`.

**Mode B — Cron de veille (polling).** Branchement : `inngest/signal-monitor.ts:31-62` (cron `0 */4 * * *`) → `checkCompanySignals` `:157`. Remplacer le hand-roll news+jobs (`:170-223`) et `persistSignal` JSONB (`:228-252`) par une itération sur `listAvailableSources({freshness:"poll", rgpdAllowed: rgpdFor(tenantId)})` → `recordSignal` par `RawSignal`. L'émission Kairos `signals/fresh-detected` (`:136-149`) reste inchangée mais lit désormais le multiplier sur le **type canonique** (bug #1 mort).

**Mode C — À la demande (Compound Signal Agent).** Nouveau `app/api/signals/compound/route.ts` (SSE, copie `tam/build/route.ts:180-569`) → `fanoutEvidence(subject, ctx)` (`lib/signals/compound/fanout.ts`, NOUVEAU) qui fan-out parallèle sur une company, stream chaque preuve via `recordSignal`, puis `synthesize.ts` (Sonnet, `tracedGenerateObject`) ré-enregistre la synthèse comme signal dérivé `compound_whynow`. Draft → `generateOpener` → send-gate.

**Mode webhook (RB2B/Snitcher).** Nouveau `app/api/webhooks/signals/[source]/route.ts` → vérifie signature → `getSource(params.source).ingestWebhook(payload, ctx)` → `recordSignal`. Gate RGPD : RB2B (person) refusé si tenant EU ; Snitcher (company) autorisé.

| Mode | Driver (file:line) | Action de branchement | Écrit via |
|---|---|---|---|
| A build TAM | `per-company.ts:256-282` | dual-write après `:263` + fan-out flaggé | `recordSignal` |
| B cron veille | `signal-monitor.ts:31-62 → :157` | remplacer hand-roll + `persistSignal:228` | `recordSignal` |
| C on-demand | `api/signals/compound/route.ts` (NOUVEAU) | `fanoutEvidence` → `synthesize` | `recordSignal` |
| webhook | `api/webhooks/signals/[source]/route.ts` (NOUVEAU) | `source.ingestWebhook` | `recordSignal` |

---

## 4. Pilier ACTIVATION — s'en servir au mieux

### 4.1 Le prérequis : `toCanonical()` aux 3 lookups

Le minimum vital pour activer la chaîne sans toucher la formule (`priority-score.ts:47-50`) ni les détecteurs : créer `taxonomy.ts` (rapport §4.4) et insérer `toCanonical()` aux trois lookups défaillants.

- **Scoring** — `signal-score-daily.ts:85-88` : `const canon = toCanonical(s.type); if (!canon) continue; if (!isSignalFresh(canon, detectedAt, now)) continue; const mult = multipliers[canon];`. Aujourd'hui `multipliers[s.type]` lit `funding_recent` contre une map keyée `funding` → `undefined` → plancher 1.0× partout.
- **Timing** — `signal-monitor.ts:133-135` : `const canon = toCanonical(signal.signalType); const mult = canon ? (multipliers[canon] ?? 1) : 1;` avant le test `>= KAIROS_WEIGHT_THRESHOLD (1.5)`. Aujourd'hui le producer `signals/fresh-detected` (`:138`) est câblé mais **affamé** (mult toujours 1.0 < 1.5 → jamais émis).
- **Écriture** — `persistSignal` (`signal-monitor.ts:240`) : `type: toCanonical(signal.signalType)` ferme la boucle (l'attribution `recordDealOutcome` lit déjà le canonique via `detectActiveSignals`).

### 4.2 Scoring (sans le bug)

Formule intacte : `computePriorityScore({signalMultiplier, fitScore, accessibility})` `priority-score.ts:47-50` = `mult × fit × access`. Trois branchements : (1a) multiplier quotidien `bestMultiplierForCompany` `signal-score-daily.ts:70-91` (canonicalisé ci-dessus) ; (1b) bonus `scoreSignals` `score-with-signals.ts:33-69` (lit déjà canonique via `detectActiveSignals` `signal-detectors.ts:144` ; après flip-reads, remplacer par `activeSignals(subject)` du bus) ; (1c) attribution `recordDealOutcome` `signal-outcomes.ts:56-115` → `getSignalMultipliers` `:150-197` (Bayésien, clamp [0.5,2.5], floor 1.0× sous k=10) — **correcte**, le bug est que (1a) lisait un vocabulaire que (1c) n'écrit jamais.

### 4.3 Timing (Kairos)

Producer `signal-monitor.ts:135` (fix ci-dessus) → event `signals/fresh-detected {tenantId, companyId, signalType, signalFiredAt, signalMultiplier}` (`signal-accelerate-cadence.ts:39-47`). Consumer intact : `signalAccelerateCadence` `:49-135` → `decideAcceleration` `priority-score.ts:138-158` (enrollment `active` ET signal <24h ET mult ≥1.5 ET `nextStepAt>now`) → `UPDATE sequenceEnrollments SET nextStepAt = now` `:119-124`. Deuxième producer à câbler : `realtime-signal-handler.ts:19-52` (notif-only aujourd'hui) doit `recordSignal()` + émettre `signals/fresh-detected` → c'est ce qui fait que emails/meetings nourrissent enfin Kairos (rapport step 6).

### 4.4 Angle / canal / séquence

Chaîne : `tamSignalsToAngleSignals` `signal-opener.ts:79-98` (map `TAM_SIGNAL_TO_ANGLE` `:37-42`, filtre stale via `TAM_SIGNAL_TTL_DAYS` `:52-57`) → `pickBestSignal` `outbound-methodologies.ts:210-232` (priorité `common_investor:11/funding:10/hiring:9/...` + boost relevance) → `generateOpener` `:162-219` (`SIGNAL_ANGLES[best.type]` `:159` + `getMethodology(seniority)` `:144`) → `pickSequenceForSignal` `triggers.ts:143-153` (via `matchesTrigger` `:89-103` contre `campaignConfig.triggerSignalTypes`). Le **canal** n'est aujourd'hui modélisé nulle part (implicite dans la séquence choisie) ; la couche `CANONICAL[t].channel` (taxonomy.ts) le rend explicite. Deux angles à ajouter dans `SIGNAL_ANGLES` : `job_change`, `website_visit`. Pour brancher un nouveau type partout : 1 ligne `CANONICAL` + 1 entrée `SIGNAL_ANGLES` (+ `LABEL_WHEN_FALSE` `signal-chip.tsx:29-35` si chip).

### 4.5 Autopilot sous gates

Route `POST /api/sequences/[id]/autopilot` `route.ts:12-191`, body `{minScore=50, maxEnroll≤100}`. **Point critique** : le tri actuel est `ORDER BY contacts.score DESC` (`:81`) = fit ICP seul, ignorant le multiplier de signal. Fix : le `leftJoin companies` existe déjà (`:72`, pour l'anti-ICP) → trier par `companies.priorityScore DESC` (sortie de `signal-score-daily`), `contacts.score` en tie-break. Gates inchangés : anti-ICP `checkContactEligibility` `:96-101` ; suppression `loadSuppressedEmails` `:85` ; HITL `enforceAgentApprovalMode({action:"sequence-enrollment", confidence:0.9})` `:128-132` (`confirm:always` → toujours déféré en "Needs you" via `recordAgentAction` `:135-147`). À l'envoi (pas à l'enrollment) : `evaluateSend(args)` `sending-gate.ts:186` (opt-out → suppression → email-status → lawful-basis → targeting SAFE_MODE → sending-identity, fail-closed).

### 4.6 Surfaces UI via un contrat unique

Le contrat = la ligne `signals` normalisée + champs dérivés de `CANONICAL`. Après unification, chaque surface lit `activeSignals(subject)` et dérive label/couleur/cap de `CANONICAL[type].category` :

| Surface | file:line | Lit | Dérivé de CANONICAL |
|---|---|---|---|
| Chip | `signal-chip.tsx:37-180` | `SignalPayload{value,reason,sources[],confidence,computedAt}` (`events.ts:100-106`) | `LABEL_WHEN_FALSE[k]` → `labelOf(canonical)` |
| Company-signals (inbox) | `lib/inbox/company-signals.ts:18-32` | `properties.signals[]`, relevance high\|medium + `filterFreshSignals` | `category` (warm_path toujours surface) |
| Why-line | `lib/inbox/why-line.ts:46-79` | `intentLabel` via `INTENT_FRIENDLY` `:13-25` | angleKey → phrase |
| Hot-to-call | `api/dashboard/hot-to-call/route.ts:72-328` | opens/clicks/visits → `HotSignalKind` | `website_visit` (intent, TTL 7) |
| Up-next | `lib/home/up-next.ts:150-179` | `Actualite{kind}` + `ACTUALITE_KIND_CAPS` `:140-145` | `category` → kind |

### 4.7 La boucle d'apprentissage

```
deal won/lost → recordDealOutcome (signal-outcomes.ts:56) → detectActiveSignals(props, deal.createdAt) (signal-detectors.ts:144, asOf garde le crédit)
  → INSERT signal_outcomes (signalType CANONIQUE :103-112)
  → getSignalMultipliers (:150, Bayésien k≥10) → multipliers[canonical]
       ├→ bestMultiplierForCompany → priority_score (signal-score-daily.ts:87)
       ├→ ≥1.5 → signals/fresh-detected → Kairos (signal-monitor.ts:135)
       └→ proposeSignalChangesFromOutcomes → voie (c) discovery (learn.ts)
```

La boucle est cassée à un seul endroit aujourd'hui : le cron écrit `properties.signals[]` avec `funding_recent/hiring_surge` (`signal-monitor.ts:240-246`) alors que l'attribution lit les sous-arbres canoniques. Canonicaliser **l'écriture** (`persistSignal` → `toCanonical`) ferme tout.

---

## 5. Carte des questions signal (la checklist du système)

Référence opérationnelle. Statut Elevay : Répondu / Partiel / Absent + file:line. (Détail exhaustif des 8 couches dans la conception `[pilier:question-map]`.)

| # | Question | Qui/Quoi répond | Statut (file:line) |
|---|---|---|---|
| **DÉCOUVERTE** ||||
| D1 | Quels types ce tenant doit-il suivre ? | Config tenant (ordonnance) | **Absent aujourd'hui** → résolu par `signal_prescriptions` (§2). Liste hardcodée `DEFAULT_SIGNALS` `signals/index.ts:10-16` |
| D3 | Le tenant peut-il déclarer un signal propre ? | Config + LLM | **Répondu** — `custom_signals` `intelligence.ts:664-713`, plan via `generator.ts:36` |
| D4/D5 | Le catalogue évolue/qui décide ? | Boucle + agent | **Absent** → résolu par voies (a)+(c) (§2.3) |
| D6 | Company ou person-grain ? | Modèle de données | **Partiel** — company quasi-exclusif ; person = `contacts.properties.latestSignal` `latest-signal.ts:27` |
| D7 | Company froide, quels signaux ? | Détecteurs API | **Partiel** — funding/hiring/investor au build `per-company.ts:386` ; cold sans signal = fit seul |
| **DÉFINITION** ||||
| DF2 | Quelle fenêtre (TTL) ? | Règle (table TTL) | **Partiel — DOUBLE source** `signal-detectors.ts:49-56` vs `freshness.ts:31-60` (collapse = rapport step 1) |
| DF3 | FIT/INTENT/TIMING/WARM ? | Règle catégorie | **Partiel** — 2 classes `SIGNAL_CATEGORY:33-40` ; les 4 via `taxonomy.ts` |
| DF5/DF6 | Nom canonique ? | Taxonomie | **ABSENT — défaut #1** ≥6 vocabulaires ; prouvé `signal-score-daily.ts:87` vs `:182-193` |
| DF7 | Un trait (YC) = signal ? | Règle | **Partiel** — `yc_company` reste détecteur `signals/index.ts:15` → drop dans alias |
| **ACQUISITION** ||||
| A1 | Quelle source/API ? | Adaptateur source | **Partiel** — firmo/funding/hiring/tech câblés ; ATS/SEC/BODACC absents → §3.2 |
| A3 | Quel coût par acquisition ? | Budget/compteur | **Absent** — `costCentsPerCall` ajouté par `SignalSource` (§3.1) |
| A4 | Base légale RGPD ? | Règle conformité | **Absent** — `rgpdBasis` ajouté par `SignalSource` ; gate EU/FR au registre |
| A5 | Si la source tombe ? | Dégradation | **Répondu** — détecteurs never-throw `signals/types.ts:36-43` ; `Promise.allSettled` `signal-monitor.ts:78` |
| A6 | Persistance ? | Modèle | **Partiel — triple JSONB** → table `signals` (rapport §4.3) |
| **QUALITÉ** ||||
| Q1 | URL vérifiée ? | HEAD-check | **Répondu** — `verifySources()` `verify-source.ts:26-61` ; cache `signal_url_cache` `coaching.ts:48` |
| Q2 | Confidence classée ? | Classifieur 4-états | **Partiel** — `classifySignalConfidence` `confidence-state.ts:67` UI-only, jamais scorée |
| Q4 | Dédup (1 identité) ? | Clé dédup | **Partiel** — par type `signal-monitor.ts:165` ; pas de `dedupKey` event-grain → bus |
| Q5/Q6 | Faux positifs / convergence 2-sources ? | Filtres/gate | **Absent** — anti-ICP en aval `signal-to-sequence.ts:85` ; convergence à construire |
| **SCORING** ||||
| S1 | Quel poids ? | Boucle (lift Bayésien) | **Répondu mais court-circuité** — `computeMultiplier` `signal-outcomes.ts:122` (bug DF6) |
| S2 | Combiner signal×fit×accès ? | Règle pure | **Répondu** — `priority-score.ts:47-50` |
| S3 | Decay ? | Règle | **Partiel** — binaire `isSignalFresh` `freshness.ts:80` |
| S4 | Per-tenant ou global ? | Boucle | **Répondu** — `getSignalMultipliers` `:150` + `anonymized_signal_benchmarks` `agent.ts:97` |
| **ACTIVATION** ||||
| AC1 | Déclenche une action ? | Worker auto-enroll | **Répondu** — `signalAutoEnroll` `signal-to-sequence.ts:42-371` |
| AC2 | Quelle séquence/angle ? | Picker + routing | **Partiel** — `pickSequenceForSignal` `triggers.ts:143` (whitelist jamais matchée, DF5) |
| AC4 | Timing/Kairos ? | Worker | **Partiel** — câblé `signal-monitor.ts:138` mais inerte (mult=1.0, DF6) |
| AC5 | Sous quels gates ? | Garde | **Répondu** — anti-ICP, suppression P0-5, approval `confirm:always` `:243-279` |
| AC8 | Email/meeting → action ? | Worker | **Absent (action)** — `evaluateSignalsRealTime` notif-only `real-time-detector.ts:107` |
| **MESURE** ||||
| M1 | Mène au closed-won ? | Ledger | **Répondu** — `recordDealOutcome` `signal-outcomes.ts:56`, `signal_outcomes` `intelligence.ts:222` |
| M4 | Retirer un signal inutile ? | Boucle/gouvernance | **Absent** → voie (c) retire (§2.3) |
| M5 | Cycle de vie (tombstone) ? | Modèle | **Absent** — `signals[]` append-only → `invalidatedAt`/`supersededById` (rapport §4.3) |
| **GOUVERNANCE** ||||
| G1 | Isolation tenant ? | Scope | **Répondu** — `eq(tenantId)` partout |
| G2 | RBAC détection ? | Auth | **Partiel** — `api/signals/route.ts:25` auth-only, pas admin |
| G4 | Opt-out propage au signal ? | Suppression | **Partiel** — sur l'envoi (`loadSuppressedEmails`), pas sur le signal stocké |

---

## 6. Comment ça se plug — carte d'intégration

| Composant nouveau | Couture existante (file:line) | Contrat de données | Additif / Modifié |
|---|---|---|---|
| `lib/signals/taxonomy.ts` | — (prérequis) | `CANONICAL`, `ALIAS`, `toCanonical()` | **Nouveau module** |
| `toCanonical()` insert | `signal-score-daily.ts:85-88` | `multipliers[canon]` au lieu de `multipliers[s.type]` | **Modifié** (2 lignes) |
| `toCanonical()` insert | `signal-monitor.ts:133-135` | gate Kairos sur type canonique | **Modifié** (2 lignes) |
| `toCanonical()` insert | `signal-monitor.ts:240` (`persistSignal`) | `type: toCanonical(...)` | **Modifié** (1 ligne) |
| tri autopilot | `api/sequences/[id]/autopilot/route.ts:81` | `ORDER BY companies.priorityScore DESC` (join déjà à `:72`) | **Modifié** (1 ligne) |
| `signal_prescriptions` | `db/schema/intelligence.ts:222` (à côté) | schema Drizzle §2.2 | **Additif** (migration) |
| `lib/signals/discovery/*` | onboarding flow + `deal/closed` Inngest | `SignalPrescriptionDraft[]` | **Nouveaux modules** |
| `api/onboarding/signal-interview` | après `onboarding/save/route.ts:229`, avant `:232` | SSE, copie `tam/build` | **Additif** (nouvel endpoint) |
| handler `recommend-signals` | `onboarding/completed` (émis `save/route.ts:254-264`) | étape Inngest | **Additif** |
| handler `propose-prescription-changes` | `deal/closed` (émis `deals/[id]/route.ts:177-179`) | lit `getSignalMultipliers:150` | **Additif** |
| `api/signals/prescription` + UI | étendre `settings/signals/page.tsx:225-303` + actions `:132-152` | l'ordonnance | **Additif** (UI au-dessus de l'existant) |
| `lib/signals/sources/*` | miroir `company-enrichment/registry.ts:14-61` | `SignalSource`, `SubjectRef`, `RawSignal` | **Nouveaux modules** |
| `asSignalSource(reg)` | `tam-stream/signals/index.ts:10-16` (`DEFAULT_SIGNALS`) | adapte `RegisteredSignal` → `SignalSource` | **Additif** (pont, zéro réécriture) |
| clients Tier A | — | Greenhouse/Lever/Ashby/SEC/GitHub | **Nouveaux modules** |
| `lib/signals/bus.ts` (`recordSignal`) | écrit table `signals` ; lit `verify-source.ts:26`, `confidence-state.ts:67`, `freshness.ts:70` | `RecordSignalInput`/`RecordSignalResult` | **Nouveau module** (choke-point) |
| dual-write Mode A | `per-company.ts:263` (après `signalsBySlot[key]=`) | `recordSignal(...).catch()` best-effort | **Additif** |
| refonte Mode B | `signal-monitor.ts:157` (`checkCompanySignals`) | `listAvailableSources` → `recordSignal` | **Modifié** (remplace hand-roll `:170-252`) |
| `api/signals/compound` | copie `tam/build/route.ts:180-569` | SSE evidence + synthèse | **Additif** (nouvel endpoint) |
| `api/webhooks/signals/[source]` | — | `ingestWebhook` | **Additif** |

Preuve que ça se plug sans rewrite : la formule `computePriorityScore` (`priority-score.ts:47-50`), le scorer 100-points (`scoring.ts`), les détecteurs TAM et le moteur d'attribution (`signal-outcomes.ts`) ne sont **jamais modifiés** — seulement lus via de nouveaux choke-points ou corrigés par insertion de `toCanonical()`. La table `signals` et `signal_prescriptions` sont additives (migration idempotente `db:push` localdev, `db:migrate:apply` via `DATABASE_URL_OWNER` prod). Le JSONB existant reste read-source jusqu'au flip-reads flaggé (rapport step 5).

---

## 7. MVP buildable + séquençage

Le plus petit slice de bout-en-bout qui démontre les trois piliers et se branche au Compound Signal Agent du hackathon : sur **une company froide**, dériver une mini-ordonnance (DÉCOUVERTE), fan-out 3-5 sources gratuites (ACQUISITION via le bus naissant), synthétiser un compound source + draft d'opener gated (ACTIVATION). Aucune des étapes ne dépend de la table `signals` complète : le bus peut d'abord écrire en mémoire/`properties` et streamer, la normalisation `toCanonical` étant le seul prérequis dur.

### Ce week-end (hackathon, ~24h / ~2.5 j-h)

| Chantier | Effort j-h | Plug point (file:line) | Dépendance |
|---|---|---|---|
| `lib/signals/compound/fanout.ts` (5 collecteurs parallèles + `verifySources`) | 0.5 | reuse Apollo MCP `apollo_organizations_job_postings`, `tech-detect/index.ts:23`, `crunchbase-client.ts:76`, Greenhouse/GitHub keyless | — |
| `lib/signals/compound/synthesize.ts` (Sonnet grounded, schema zod `{whyNow, angle, subSignals[{type,evidence,citationUrl}], confidence, draftOpener}`) | 0.5 | `anthropic("claude-sonnet-4-6")` `tam/build/route.ts:149` ; prompt grounded `custom-signals/generator.ts:36-113` | fanout |
| `app/api/signals/compound/route.ts` (SSE evidence + synthèse) | 0.5 | copie `tam/build/route.ts:180-569` | synthesize |
| Panneau UI "Deep Signal" (favicon + tick par source, carte compound) | 0.5 | `components/signal-chip.tsx` ; stream consumer | route |
| Wiring draft (`generateOpener`) + dégradation gracieuse + hardening démo | 0.5 | `lib/scoring/signal-opener.ts` ; send-gate `sending-gate.ts:186` | tout ce qui précède |

Note : le hackathon écrit l'évidence via `recordSignal` (qui appelle `toCanonical`) → il **dépend du prérequis** `taxonomy.ts`. Si le temps manque, `fanout.ts` peut écrire un `RawSignal[]` éphémère (pas de persistance) et `toCanonical` reste une fonction pure de 20 lignes, donc ~1-2h, à faire en premier. LinkedIn posts execs = SKIP v1 (rate-limit + ToS).

### V1 produit (post-hackathon)

Reprend le séquençage du rapport §6 (cœur unification, ~15-19 j-h) en y intercalant les piliers DÉCOUVERTE et ACQUISITION :

| Ordre | Chantier | Effort j-h | Plug point | Dépendance |
|---|---|---|---|---|
| 1 | `taxonomy.ts` + alias-map + tests (corrige défaut #1, prérequis) | 1 | — | — |
| 2 | Insert `toCanonical()` aux 3 lookups + tri autopilot | 0.5 | `signal-score-daily.ts:87`, `signal-monitor.ts:135,240`, `autopilot/route.ts:81` | étape 1 |
| 3 | Collapse les 2 tables TTL | 1 | `signal-detectors.ts:49-56` → `freshness.ts:31-60` | étape 1 |
| 4 | Table `signals` + migration additive (rapport §4.3) | 1.5 | `intelligence.ts:222` | — |
| 5 | `lib/signals/bus.ts` (`recordSignal`/`activeSignals`) + dual-write shadow | 3 | `per-company.ts:263`, `signal-monitor.ts:228` | étapes 1,4 |
| 6 | `SignalSource` registry + `asSignalSource` pont (Mode A/B sur le bus) | 2 | `signals/index.ts:10-16`, `company-enrichment/registry.ts:14` | étape 5 |
| 7 | `signal_prescriptions` + voie (b) auto-reco (déterministe, débloque l'ordonnance non-vide) | 2 | handler `onboarding/completed` | étape 1 |
| 8 | API `/signals/prescription` + UI ordonnance dans `settings/signals` | 2 | `settings/signals/page.tsx:225` | étape 7 |
| 9 | Voie (c) boucle closed-won (réutilise `getSignalMultipliers` à 100%) | 1.5 | `deal/closed` Inngest | étapes 7,5 |
| 10 | Flip-reads flag `SIGNALS_TABLE_READ` (débloque multipliers revenue) | 3 | `score-with-signals.ts:40`, `signal-score-daily.ts:76`, `recordDealOutcome:84` | étape 5 |
| 11 | Connecteurs Tier A keyless (Greenhouse/Lever/Ashby/SEC/BODACC) comme `SignalSource` | 6 | clients NOUVEAUX + registre | étape 6 |
| 12 | Voie (a) entretien LLM onboarding (seul net-new LLM) | 3 | `api/onboarding/signal-interview` | étapes 7,8 |
| 13 | Real-time persistence + producer Kairos + person-grain `job_change` Unipile | 6-7 | `real-time-detector.ts`, `relationship-graph.ts` | étape 10 |

Étapes 1-2 (~1.5 j-h) closent le défaut #1 et débloquent le classement revenue actuellement dégradé, sans aucune nouvelle table. Étapes 1-10 (~19.5 j-h) livrent les trois piliers branchés. Le scorer 100-points (`scoring.ts`) et la formule `priority_score` ne sont jamais touchés.