# Audit approfondi — Onboarding end-to-end

## Vue d'ensemble
Flux en **7 étapes** (welcome → connect → privacy → product → icp → building → ready) qui construit progressivement le TAM + contacts. Combine scraping, analyse LLM, Apollo, enrichment, embeddings.
**État global :** fonctionnel, riche, avec frictions réelles et fortes dépendances externes.

---

## ÉTAPE 1 — Welcome ("Your profile")
**Fichier :** `components/onboarding-wizard.tsx:623-665`

### Inputs
| Champ | Type | Requis | Pré-remplissage |
|---|---|---|---|
| Your name | Text | ✓ | `userName` (user.name) |
| Company name | Text | ✓ | Domaine email capitalisé |
| Company website | Text + regex | ✓ | Domaine email extrait |
| Your role | PillSelect single | ✗ | "Founder" |

### Validation client
`fullName.trim() && companyName.trim() && domainValid (regex strict) && role`

### API "Next"
**`POST /api/onboarding/save` step="welcome"**
- Payload : `{ step, fullName, companyName, role, domain }`
- Serveur (`/api/onboarding/save:17-32`) : update `tenants.settings` (onboardingFullName, onboardingCompanyName, onboardingRole, companyDomain), puis `users` (firstName/lastName via split)

### Jobs parallèles déclenchés
- `POST /api/onboarding/analyze-website` → scraping + 2 passes LLM, populate `websiteAnalysis` (targetIndustries, sizes, confidenceGaps) — **5-10s**
- `POST /api/onboarding/enrich-icp` → Apollo lookup (funding, employees) — **3-8s**

### Gestion erreur
Fetch errors `.catch(() => {})` silencieux. Aucun feedback si échec. On passe à l'étape suivante même si l'analyse async plante.

### Back / Save / Skip
- Back : non (1ère étape)
- Save : oui (POST avant setStep) → fermer le modal garde les données
- Skip : non

---

## ÉTAPE 2 — Connect (email / calendar)
**Fichier :** `components/onboarding-wizard.tsx:511-553`

### UI
- Bouton Connect Google / Connect Microsoft (OAuth redirect via `signIn`)
- Badge "✓ Email & calendar connected" si `hasGoogle` ou `hasMicrosoft` (depuis `/api/onboarding/status`)

### API
1. Click Google/Microsoft → `POST /api/onboarding/save` step="connect" + emailProvider → puis `signIn(provider, { callbackUrl: "/home" })`
2. Continue → setStep("privacy")
3. Skip → setStep("product")

### Problèmes
- Save fire & forget (pas d'attente) — emailProvider peut manquer si save échoue
- Pas de moyen de déconnecter depuis le wizard
- Aucun retry sur échec save
- Si OAuth callback échoue : user revient sans indication claire — ambiguïté

### Back
Oui → setStep("welcome")

---

## ÉTAPE 3 — Privacy ("Control what gets synced")
**Fichier :** `components/onboarding-wizard.tsx:556-620`

### Inputs
| Champ | Options | Défaut |
|---|---|---|
| Record creation | disabled / selective / always | selective |
| Backsync range | 1m / 3m / 6m / 12m | 3m |
| Do not track domains | Free tag input | 13 domaines publics hardcodés (gmail, yahoo, hotmail…) |

### API "Next"
**`POST /api/onboarding/save` step="privacy"**
Payload : `{ step, contactCreationMode, backsyncRange, doNotTrackDomains }`
Serveur : update `tenants.settings` → setStep("product")

### Problèmes
- `await` sans catch → si save échoue, UI bloquée
- Pas de validation sur les domaines (format, limite)

### Back
→ setStep(emailConnected ? "connect" : "product") — logique inversée, peut prêter à confusion.

---

## ÉTAPE 4 — Product ("Tell us about what you sell")
**Fichier :** `components/onboarding-wizard.tsx:668-690`

### Inputs
| Champ | Type | Requis |
|---|---|---|
| What do you sell? | Textarea 2 rows | ✓ (≥10 chars) |
| Sales motion | PillSelect single | ✗ (défaut "Founder-led sales") |
| Biggest challenge | PillSelect single | ✓ (4 options) |

### Pré-remplissage
`productDesc` peut être auto-rempli depuis `websiteAnalysis.productDescription` (lignes 350, 398) — mais seulement si l'analyse async a terminé à temps.

### API "Next"
**`POST /api/onboarding/save` step="product"**
Payload : `{ step, productDesc, salesMotion, challenge }`

Si `!websiteAnalysis && !analyzingWebsite && domain` → relance `/api/onboarding/analyze-website`.

### Problèmes
- `await` save sans catch → UI bloquée si échec
- Pas de feedback pendant la relance d'analyse website

### Back
→ setStep(emailConnected ? "privacy" : "connect")

---

## ÉTAPE 5 — ICP ("Define your ideal customer")
**Fichier :** `components/onboarding-wizard.tsx:693-752`

### Inputs
| Champ | Type | Requis |
|---|---|---|
| Industries | TagInput multi (~50 options) | ✗ |
| Company size | PillSelect multi | ✗ |
| Geography | TagInput multi | ✗ |
| **Seniority level** | TagInput multi (JOB_SENIORITIES) | **✓** |
| Department | TagInput multi | ✗ |

### Pré-remplissage
Depuis `websiteAnalysis` (auto-populate si state empty) pour industries / sizes / geographies.
AI tone auto depuis `suggestedTone` (défaut "Direct").
**Seniority jamais auto-rempli** — user doit saisir.

### Confidence gaps
Si `websiteAnalysis.confidenceGaps` existe → affiche "Quick questions to refine your targeting" avec field / question / currentGuess. **Info-only, non interactif** (user doit manuellement ajuster les pills).

### Validation
`industries.length > 0 && companySizes.length > 0 && targetSeniorities.length > 0`

### Back
→ setStep("product"). Suivant = `handleBuildTAM` (étape 6).

---

## ÉTAPE 6 — Building (cascade de jobs lourds)
**Fichier :** `components/onboarding-wizard.tsx:755-812`

### Orchestration handleBuildTAM
```
1. POST /api/onboarding/save step="icp" (await)
2. POST /api/tam (await)  — LLM + Apollo search (create companies)
3. GET /api/accounts?pageSize=1 (await) — fetch total count
4. POST /api/score (fire & forget) — score companies
5. POST /api/onboarding/find-contacts (await) — contacts via Apollo
6. POST /api/embed (fire & forget) — RAG embeddings
7. GET /api/onboarding/email-intelligence (fire & forget)
8. POST /api/onboarding/save step="complete" (await) → Inngest "onboarding/completed"
9. setStep("ready")
```

### Timing UI (fake progress stages)
- 1500 ms → "Searching company databases…"
- 4000 ms → "Validating company data…"
- 7000 ms → "Enriching company profiles…"
- 7000 ms → "Cross-referencing your inbox…" (si email connecté) OR "Scoring against your criteria…"
- Post TAM → "Found X companies"
- Post score+find-contacts → "Building your pipeline…"

### `/api/tam` (lignes 66-291)
1. Rate limit check "enrich"
2. Apollo availability check (erreur 500 si pas de key)
3. Sélection modèle : Anthropic > OpenAI
4. Load tenant settings (product, sales motion, challenge, knowledge base)
5. **LLM pass 1** — genère 3-5 stratégies de recherche (`claude-sonnet-4-6`, temp 0.2, `searchStrategySchema`)
6. **Apollo search** — paginate (3 pages × 100) par stratégie, dédup par domain, enrich org, insert `companies` avec `source="tam"`, `search_strategy`, `enriched_at`
7. Response : `{ companiesCreated, companiesSkipped, strategies[] }`
8. **Timing : 10-30 s**

### `/api/score`
Per company : fit (ICP) + engagement (activities). Adaptive weighting : 100% fit si pas d'engagement, sinon 60/40. Update `score`, `scoreReasons`, `score_grade`, `scored_at`. **Timing : 5-15 s**

### `/api/onboarding/find-contacts`
Top 10 companies scorées → `companyContactFinderSkill` (Apollo) max 3/company → dédup email → insert → `leadQualificationSkill` (min score 40). Response : `{ contactsCreated, contactsQualified, contacts[] }`. **Timing : 15-30 s**

### `/api/embed`
Embed contacts (contactToText). Fire & forget. **10-30 s**

### `/api/onboarding/email-intelligence`
Aggrégations SQL : contacts count, companies with contacts, warm matches (TAM + email sync), follow-ups needed (> 7j no activity). **2-5 s**

### Gestion erreur
```ts
try { ... } catch (err) {
  setBuildError(err.message)
  setStep("icp")  // revient à ICP sans retry
}
```
Pas de retry button, pas de timeout UI, pas de fallback.

### Back
Non (pas de back pendant building).

---

## ÉTAPE 7 — Ready ("Your sales engine is ready")
**Fichier :** `components/onboarding-wizard.tsx:815-893`

### UI
Grid 3 colonnes :
- `{tamProgress.found}` companies
- `{contactsFound}` contacts
- (emailConnected) `{emailIntelligence.icpMatches}` in your inbox / (else) "-" connect email

Top 5 contacts, top companies preview (logo, name, industry).

### API
Aucun — juste affichage.

### "Go to your dashboard"
```ts
onComplete() → setShowOnboarding(false) → window.location.href = "/?firstTime=true"
```

`home/page.tsx:119-126` détecte `?firstTime=true` → affiche welcome banner avec `founderMetrics.totalAccounts` / `totalContacts`. Buttons : Review top accounts / Launch campaign / Ask Elevay.

---

## Endpoints API — référentiel

### `GET /api/onboarding/status`
Reads : companies, contacts, authAccounts (Google/Microsoft), tenants.settings, authUsers.
Retourne `{ isNew, accounts, contacts, hasGoogle, hasMicrosoft, hasEmail, needsOnboarding, email, name }`.
`needsOnboarding = !onboardingCompleted && isNew` — **bug potentiel P7** (voir edge cases).
**~100 ms**

### `POST /api/onboarding/save`
Parse step, update `tenants.settings` via `updateTenantSettings`. Si step="welcome" → update `tenants.name` + `users.firstName/lastName`. Si step="complete" → fire Inngest event `onboarding/completed`. **~50 ms**

### `POST /api/onboarding/analyze-website`
Payload : `{ domain, productDescription? }`
1. Scrape (timeout 8s/URL, tries https + https://www). Extract title, meta, OG, H1/H2, alt text, body 3000 chars, regex pricing/enterprise/self-serve/logos
2. LLM pass 1 : `websiteIntelligenceSchema` (companyDescription, productDescription, pricingModel, targetMarketSignals, competitorClues, maturitySignals). Few-shot : notion.so, gong.io, lemlist.com
3. LLM pass 2 : `icpInferenceSchema` (industries, sizes, roles, geographies, suggestedTone, confidence, reasoning, confidenceGaps). Thinking budget 4000 tokens
4. Error handling : catch → `{ error, domain, hadWebsiteContent }`
**Timing : 5-15 s**

### `POST /api/onboarding/enrich-icp`
`icpIdentificationSkill` (Apollo). **3-8 s**

### `POST /api/onboarding/find-contacts`
Top 10 scored companies → per-company Apollo search + qualify (score ≥ 40). **15-30 s**

### `GET /api/onboarding/email-intelligence`
Aggrégations warm matches + follow-ups. Pas d'indexes DB vérifiés sur `properties->>'source'`, `occurredAt`. **2-5 s**

### Inngest : `onOnboardingCompleted` (retries 2)
1. Load settings (targetRoles)
2. Top 20 companies by score DESC NULLS LAST
3. Per company : Apollo people search, max 3 contacts, dédup email, insert `auto_onboarding: true`
4. Embed top 50 companies (companyToText)
Dead letter logger. **30-60 s en background.**

---

## Edge cases

### E1 — Fermeture modal mi-parcours
Données déjà POST-ées en DB. Au retour, `/api/onboarding/status` détecte `needsOnboarding=true`, le wizard repart **de welcome** (pas du dernier step).
**Fix proposé :** persister `currentStep` dans settings + afficher "Resume your setup".

### E2 — /api/tam échoue
`tamRes.ok === false` → throw → catch → `setBuildError + setStep("icp")`. Pas de retry button.
**Fix :** retry button + fallback offline + meilleur messaging ("Apollo API key missing" vs "API error").

### E3 — OAuth callback échoue
next-auth redirige mais `/api/onboarding/save` a déjà stocké emailProvider. Ambiguïté : est-ce que Google est vraiment connecté ?
**Fix :** appeler `/api/onboarding/status` post-callback + toast error si auth failed.

### E4 — Return après onboarding partiel (TAM créé mais wizard pas terminé)
`isNew = (accounts==0 && contacts==0)` — si TAM a créé 150 companies, `isNew=false`, wizard pas relancé. `onboardingCompleted` reste false.
**Fix :** `needsOnboarding = !onboardingCompleted` (ignorer isNew).

### E5 — Confidence gaps read-only
UI montre "Current guess: SMB" sans bouton pour valider/corriger directement. User doit manuellement ajuster les pills.
**Fix :** ajouter boutons "Use this suggestion" / "Not quite" à côté de chaque gap.

### E6 — Fire & forget sur score/embed/email-intelligence
Ready step affiché sans scores peuplés. TAM companies non triées par score. Loader spinner côté UI mais pas de vraie progression.
**Fix :** au minimum await `/api/score` avant setStep("ready"), ou WebSocket push.

### E7 — Multi-tenant
OK — isolation tenant complète, pas de cross-contamination.

### E8 — Duplicate domain (welcome + manuel accounts)
TAM dédupe via `existingDomains.has(domain)`. Manuel POST `/api/accounts` crée une 2e entrée. Les deux coexistent mais find-contacts utilise la version TAM.

---

## Problèmes identifiés (priorisés)

| ID | Sévérité | Description | Mitigation |
|---|---|---|---|
| P1 | **Haute** | `/api/tam` sans retry button, perte users 5-10% si Apollo down | Ajouter retry + messaging spécifique |
| P3 | Moyenne | websiteAnalysis async non awaité → pre-fill ICP peut manquer | Await ou spinner dédié |
| P4 | Moyenne | Score/embed fire & forget → ready step affiché sans scores | Await score au minimum |
| P7 | Moyenne | `needsOnboarding = !completed && isNew` → si TAM créé mais pas finalisé, wizard disparaît | Changer en `!completed` seulement |
| P9 | Moyenne | Pas de timeout sur handleBuildTAM → UI peut paraître gelée | 60 s timeout + "Taking longer…" message |
| P10 | Moyenne | Pas de validation Zod runtime des réponses LLM | Ajouter parse strict |
| P5 | Basse | Confidence gaps non interactifs | Boutons inline d'acceptation |
| P6 | Basse | Close modal → restart depuis welcome | Persister currentStep |
| P8 | Basse | email-intelligence SQL non indexé | Vérifier indexes `properties->>'source'`, `occurredAt` |
| P2 | Basse | Email jamais validé (only domain) | Design |

---

## Points forts
- Architecture progressive en 7 étapes, pas d'overload
- Scraping léger (regex, pas de Chromium)
- LLM double passe (intelligence → ICP) réduit hallucinations
- Confidence gaps identifie les points faibles
- Saves granulaires par step (recoverable)
- Post-onboarding async (Inngest) : enrichit top 20 companies sans bloquer UI
- Multi-tenant strict

## Dépendances externes (criticité)
| Service | Endpoint | Risque |
|---|---|---|
| Anthropic Claude | analyze-website (×2), scoring | **Haute** — quota = TAM fail |
| OpenAI | Fallback LLM + embeddings | Basse |
| Apollo.io | TAM search, find-contacts, enrichment | **Haute** — payante, quota |
| OAuth Google/Microsoft | Connect step (optionnel) | Moyenne — callback pas gracieux |

---

## Fichiers critiques
| Fichier | Lignes | Rôle |
|---|---|---|
| `components/onboarding-wizard.tsx` | 1-898 | UI, state, handlers, orchestration |
| `api/onboarding/save/route.ts` | 1-87 | Persist par step |
| `api/onboarding/status/route.ts` | 1-79 | Detect needsOnboarding |
| `api/onboarding/analyze-website/route.ts` | 1-243 | Scrape + 2× LLM ICP |
| `api/onboarding/enrich-icp/route.ts` | 1-30 | Apollo enrichment |
| `api/onboarding/find-contacts/route.ts` | 1-130 | Decision-makers Apollo |
| `api/onboarding/email-intelligence/route.ts` | 1-68 | Warm matches SQL |
| `api/tam/route.ts` | 1-350 | LLM + Apollo TAM build |
| `api/score/route.ts` | 1-220 | Fit + engagement scoring |
| `api/embed/route.ts` | 1-220 | RAG embeddings |
| `inngest/onboarding-functions.ts` | 1-167 | Post-onboarding job |
| `app/(dashboard)/home/page.tsx` | 1-730 | Welcome banner |
