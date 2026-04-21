# LeadSens — Onboarding A→Z — Audit exhaustif pour restitution LLM

Date : 2026-04-21
Source : `app/apps/web/src/components/onboarding-wizard.tsx` + `app/apps/web/src/app/api/onboarding/**` + `app/apps/web/src/inngest/onboarding-functions.ts` + `app/apps/web/src/lib/tenant-settings.ts` + `app/apps/web/src/lib/icp-constants.ts`

---

## 0. Synthèse executive

Wizard modal fullscreen **7 étapes** (`welcome → connect → privacy → product → icp → building → ready`). 5 formulaires + 1 écran d'attente + 1 écran récap.

**AI à 3 endroits** :
1. Après l'étape 1, en arrière-plan : 2 appels `claude-sonnet-4-6` (intelligence extraction + ICP inference avec thinking 4k tokens) + 1 skill Apollo `icp-identification`.
2. Au clic "Build my prospect list" (fin étape 5) : 1 appel `claude-sonnet-4-6` qui génère 2-4 stratégies de recherche Apollo.
3. Post-completion, Inngest : embeddings OpenAI sur companies + contacts (`text-embedding-3-small`), fire-and-forget.

**15 data points collectés** répartis comme suit :
- Identité (4) : fullName, companyName, domain, role
- Provider (1) : emailProvider
- Sync prefs (4) : contactCreationMode, backsyncRange, defaultDataVisibility, doNotTrackDomains
- Product (3) : productDescription, salesMotion, primaryChallenge
- ICP (5) : targetIndustries, targetCompanySizes, targetGeographies, targetSeniorities, targetDepartments (+ aiTone modifié silencieusement en coulisse, + targetRoles dérivé)

**Tous ne sont pas utilisés.** Verdict en partie 3.

**Philosophy gap vs Lightfield/Monaco/Attio** : LeadSens est un wizard "collect → confirm → build". Les 3 benchmarks sont "connect → infer → play". Notre wizard force le user à **prévoir** son business, les autres **observent** son business pour le proposer. C'est l'écart critique.

---

## 1. Architecture & flow

### Entry point
`/home` (`app/apps/web/src/app/(dashboard)/home/page.tsx`) hydrate `/api/home/hydrate` → détecte `needsOnboarding: true` → monte `<OnboardingWizard>` en modal. L'URL ne change pas (c'est un overlay).

### Persistence
- Chaque `setStep` déclenche POST `/api/onboarding/save` avec `{ step: "_current", currentStep: "<stepName>" }` → écrit dans `tenants.settings.onboardingCurrentStep`.
- Au reload, `/api/onboarding/status` renvoie ce `onboardingCurrentStep`, la prop `initialStep` remet le wizard à cet endroit, et un banner "Welcome back — picking up where you left off" s'affiche (dismissable).
- Étape `"building"` est transiente : le serveur la remappe à `"icp"` à la lecture (l'utilisateur ne doit jamais la reprendre en plein TAM build).

### Fullscreen modal
`position: fixed; inset: 0; z-index: 50; display: flex; align-items: center`.
- role=dialog + aria-modal=true + aria-labelledby
- Focus trap (Tab cycle on ~30 lignes)
- Live region polite qui annonce `Step X of 7: <label>`
- Pas de close button : user verrouillé jusqu'à complétion OU reload

### Complétion
Au clic final ("Go to your engine") :
- `onboardingCompleted: true`, `onboardingCompletedAt: ISO`, `onboardingCurrentStep: undefined`
- Inngest event `onboarding/completed` fire
- `window.location.href = "/?firstTime=true"` (hard reload, pas SPA push)

---

## 2. Étape par étape

### Étape 1/7 — `welcome` — "Your profile" / header "Tell us about you"

> **Subtitle** : "Your name, company, and website so Elevay can tailor every action to your context."

**Progressbar** : "1/7 · Your profile"
**Estimated time displayed** : "~5 min left" (en réalité c'est plus faible si email connecté et TAM rapide, davantage si LLM lent)

**Champs collectés** :

| Field | Type UI | Default | Validation | Persist key |
|---|---|---|---|---|
| `fullName` | text input | `session.user.name` | required, `.trim()` non vide | `users.firstName` + `users.lastName` (split naïf 1er espace), `settings.onboardingFullName` |
| `companyName` | text input | depuis domaine (`domain.split(".")[0]`, capitalized) | required | `tenants.name`, `settings.onboardingCompanyName` |
| `domain` (website) | text input | depuis `userEmail` SI le domaine n'est pas un provider perso (regex `/gmail|yahoo|hotmail|outlook|icloud|aol|proton/i`) | required, regex `/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/` | `settings.companyDomain` |
| `role` | pill single-select | `"Founder"` | required (default) | `settings.onboardingRole` |

**Options role (4+1)** : `["Founder", "Sales / Growth", "Marketing", "RevOps", "Other"]`

**Bouton** : Continue (disabled tant que name + company + domain valide)

**AI** : aucune dans l'UI. Mais au clic Continue, lancement **parallèle fire-and-forget** de :
- `POST /api/onboarding/analyze-website` { domain } → 2 appels LLM Claude Sonnet 4.6 (cf section 4)
- `POST /api/onboarding/enrich-icp` { domain } → skill `icpIdentificationSkill` (Apollo)

Résultats stockés dans le state `websiteAnalysis`, utilisés pour pre-remplir les steps 4 et 5.

**Downstream consumers** (qui lit ces champs plus tard) :

| Champ | Consumers (fichier:usage) |
|---|---|
| `onboardingFullName` | `api/emails/route.ts:136` (signature), `api/chat/route.ts` (prompt) |
| `onboardingCompanyName` | `api/tam/route.ts:118` (businessContext LLM), `lib/emails/welcome.ts` |
| `companyDomain` | `api/tam/route.ts:103` (exclusion self-domain), `lib/tenant-settings.ts:270` (ignored domains), `api/opportunities/route.ts`, `api/contacts/route.ts`, `api/email/sync/route.ts`, `inngest/sync-functions.ts` |
| `onboardingRole` | `api/chat/route.ts:148` (system prompt), `api/chat/suggestions/route.ts:11`, `api/emails/route.ts:136` (signature), `api/dashboard/summary/route.ts:272` |

**Justification** : fondation identitaire absolue — sans ces 4 champs, le tenant n'est pas initialisé et Elevay ne peut rien personnaliser.

**Critique PM** :
- ❌ **Progress bar dit `"Your profile"` mais le header du step dit `"Tell us about you"`** → incohérence. À harmoniser.
- ❌ **Split fullName sur le 1er espace** : casse prénoms composés (`Jean-Marie de la Tour`), noms-particules, mononymes. Risque : toute colonne `firstName` est fausse pour 10-15% des users. **Recommandation : stocker `fullName` unique, ne splitter qu'à l'affichage.**
- ❌ **Le role pill-select est single-select mais visuellement identique** aux multi-selects de l'étape ICP → ambiguïté. Ajouter un cue radio (cercle plein vs vide) ou un label "(choose one)".
- ❌ **Pré-remplissage silencieux** de `companyName = capitalize(domain.split(".")[0])` donne "Elevay" pour `elevay.dev` — OK mais "Renault-trucks" devient "Renault-trucks" (ASCII kebab preservé), et les sous-domaines composés foirent.
- ⚠️ Écrit `tenants.name` + `users.firstName/lastName` sans diff-check : si un teammate a déjà renommé le tenant, refaire l'onboarding écrase brutalement.
- ⚠️ **Aucun feedback visuel** pendant les fetches async (analyze-website + enrich-icp qui durent 5-15s) — l'user ne sait pas qu'on est en train de travailler pour lui.
- 💡 **Lightfield** : pas de step "role" — inféré de la signature email après Gmail connect. Pas de step domaine — extrait de `user.email`.
- 💡 **Monaco** : après validation du domaine, affiche LIVE le logo récupéré + 3-5 teasers de TAM matchs plausibles ("your competitors are already on Monaco: X, Y, Z"). Le wizard devient "confirm" pas "collect".
- 💡 **Attio** : pas de step séparé — ces données se remplissent inline dans le header du workspace.

---

### Étape 2/7 — `connect` — "Connect your email & calendar"

> **Subtitle** : "We sync your conversations and meetings to keep full context on every deal."

**Progress bar** : "2/7 · Connect"

**Contenu** :
- 4 bénéfices non-interactifs (icon + title + desc) :
  1. `<Mail>` Email conversations — Auto-create contacts from your inbox
  2. `<Calendar>` Calendar & meetings — Prep, summaries, and follow-ups
  3. `<MessageSquare>` Full context — Every interaction searchable
  4. `<Zap>` Personalized outreach — Emails reference your actual history
- 2 boutons OAuth : **Google** / **Microsoft** (SVG logos officiels)
- Si déjà connecté : badge vert "Email & calendar connected"

**Actions** :
- Google : `saveOnboardingData({ emailProvider: "google", step: "connect", currentStep: "connect" })` puis `signIn("google", { callbackUrl: "/home?onboarding=resume-connect" })`
- Microsoft : idem mais `signIn("microsoft-entra-id")`
- Skip for now : `setStep("product")` (saute le step privacy !)

**Champ principal** : `emailProvider` = `"google"` | `"microsoft"` (string)

**Flow OAuth** : NextAuth redirige le browser vers Google/Microsoft. Au retour, le user atterrit sur `/home?onboarding=resume-connect`, le wizard reprend à step `connect` et auto-détecte la connexion via `hasGoogle || hasMicrosoft`.

**AI** : aucune.

**Downstream consumers** :
- Les tokens OAuth stockés via next-auth alimentent `api/email/sync/route.ts`, `inngest/sync-functions.ts`, tous les send mailbox paths.
- `emailProvider` utilisé dans `settings/mail-calendar` page pour afficher l'UI adaptée.

**Justification** : brique fondamentale — sans email connecté, Elevay est un CRM vide. La promesse "autonomous GTM engine" tombe.

**Critique PM** :
- ❌ **"Skip for now" est un bouton primary** (gradient-brand full-width) — visuellement incitatif. Le user qui ne sait pas clique ici. **Recommandation : secondary link minuscule + bouton primary explicite "Connect" désactivé tant qu'une OAuth n'est pas faite**.
- ❌ **Pas de warning sur les features dégradées** si skip. "Inbox will be empty. Auto-capture off. No warm lead detection." doit apparaître.
- ❌ **Pas de preview de ce qui sera capté** avant le redirect OAuth (Lightfield affiche "~2,400 emails à importer" pré-OAuth en scannant le mail count Gmail-light).
- ❌ **Les 4 bénéfices sont génériques** — une preview réelle ("Here's an example: we'd turn this email thread into a contact + deal") serait 10x plus convaincante.
- ⚠️ **Flow de skip crée un 6-step alors que la progress bar affiche toujours 7** → menteur. Recalculer total dynamiquement.
- ⚠️ Si Microsoft échoue (EntraID app mal configurée), le user revient sur `/home` sans message d'erreur visible.
- 💡 **Lightfield** : explique chaque permission Gmail avant l'OAuth (privacy-first), et demande le range backsync AVANT le redirect (pour set expectations).
- 💡 **Monaco** : propose Slack + LinkedIn en plus, en commençant par le plus facile (Slack) pour une quick-win avant le gros (Gmail).
- 💡 **Attio** : connect = optionnel. L'user peut importer CSV ou démarrer vide.

---

### Étape 3/7 — `privacy` — "Control what gets synced"

> **Subtitle** : "You can change these anytime in Settings."

**Progress bar** : "3/7 · Sync settings"

**4 sections** (toutes obligatoires de fait, toutes ont un default) :

#### 3.1 `contactCreationMode` — "Record creation"
Segmented (après fix de compression du 2026-04-21 : grille 3-col. Avant : 3 rows stacked.)

| Value | Label | Short | Icon | Default |
|---|---|---|---|---|
| `selective` | Selective | You only | Eye | ✅ |
| `always` | Always | All emails | Users | |
| `disabled` | Disabled | Off | EyeOff | |

**Sémantique** (`lib/tenant-settings.ts:283-288`) :
- `disabled` → aucune création auto de contact
- `always` → création pour INBOUND et OUTBOUND
- `selective` (default) → création uniquement sur OUTBOUND (emails envoyés par le user) = founder-led safe default

#### 3.2 `backsyncRange` — "How far back"
Segmented 4-col (déjà compact).

| Value | Label | Desc | Days |
|---|---|---|---|
| `1m` | 1 mo | Quick | 30 |
| `3m` | 3 mo | Recommended | 90 (default) |
| `6m` | 6 mo | Deep | 180 |
| `12m` | 1 yr | Full | 365 |

#### 3.3 `defaultDataVisibility` — "Default visibility"
Segmented 3-col (après fix du jour).

| Value | Label | Short | Icon | Default |
|---|---|---|---|---|
| `everyone` | Everyone | All members | Users | ✅ |
| `team` | Team | Your team | Shield | |
| `private` | Private | Only you | EyeOff | |

⚠️ **"team" est un placeholder** : commenté "today behaves like everyone" dans `tenant-settings.ts:64`. **Non fonctionnel.**

#### 3.4 `doNotTrackDomains[]` — "Do not track"
Tag input. Pre-rempli avec les **17 providers perso auto-exclus** (codés en dur dans `DEFAULT_IGNORED_DOMAINS` du wizard) :
`gmail.com, googlemail.com, yahoo.com, yahoo.fr, hotmail.com, hotmail.fr, outlook.com, outlook.fr, live.com, icloud.com, aol.com, protonmail.com, proton.me, me.com, mail.com` (15 dans le wizard + 4 extras dans `buildIgnoredDomains` de tenant-settings.ts : `msn.com, yandex.com, zoho.com, gmx.com, fastmail.com` — divergence).

Après fix : le placeholder du tag input intègre maintenant "Add domain (17 personal providers already excluded)".

**Persist** : `settings.contactCreationMode`, `settings.backsyncRange`, `settings.doNotTrackDomains[]`, `settings.defaultDataVisibility`.

**AI** : aucune.

**Downstream consumers** :
- `contactCreationMode` → `shouldAutoCreateContact()` (`tenant-settings.ts:280`) → sync-functions.ts, reply-handler.ts
- `backsyncRange` → `backsyncRangeToDays()` (`tenant-settings.ts:258`) → historical fetch dans `api/email/sync/route.ts`
- `doNotTrackDomains` → `buildIgnoredDomains()` (`tenant-settings.ts:263`) → concat avec les 20 providers codés en dur
- `defaultDataVisibility` → consulté dans les capture paths pour poser `visibility` sur emails/meetings/contacts

**Justification** : privacy-first + trust building. Le "you can change later" minimise la friction.

**Critique PM** :
- ❌ **"team" option mensongère** — comportement identique à "everyone" aujourd'hui. **À retirer OU préciser "(coming soon)"**.
- ❌ **`defaultDataVisibility` est inutile en single-founder mode** (99% des tenants au stade onboarding = 1 seat). **Masquer le bloc si `tenant.seatCount === 1`**, afficher seulement quand un 2e user rejoint.
- ❌ **`backsyncRange` proposé sans coût** — "12 mois" est tentant mais peut faire exploser la facture LLM si chaque email est résumé. **Ajouter un teaser de coût** : "~$5 in AI credits" à côté de "1 yr".
- ❌ **17 providers perso auto-exclus invisibles** — l'user ne sait pas lesquels. **Afficher en chips désactivés** ("gmail.com ×" grisé, non-retirable).
- ⚠️ **`contactCreationMode = "always"` est dangereux** pour B2C users : 90% des emails sont non-pro → CRM pollué de vrais amis/famille.
- ⚠️ **Divergence de listes** : 15 providers dans le wizard `DEFAULT_IGNORED_DOMAINS` vs 20 dans `buildIgnoredDomains`. À unifier (single source of truth).
- ⚠️ **Step trop lourd vertical** : 4 sections denses. Après fix (compression 2 blocs en grille 3-col + safety overflow), devrait tenir dans 512px viewport. À vérifier visuellement.
- 💡 **Lightfield / Monaco** : step privacy complètement dégagé de l'onboarding. Defaults raisonnables posés, fine-tune dans Settings plus tard.
- 💡 **Attio** : idem — privacy preferences vivent dans Settings.

---

### Étape 4/7 — `product` — "What do you sell?"

> **Subtitle** : "We'll use this to write relevant emails and coach your pitch." (+ " Analyzing your site…" si `analyzingWebsite`)

**Progress bar** : "4/7 · Your product"

**3 champs** :

| Field | Type | Default | Validation | Persist key |
|---|---|---|---|---|
| `productDesc` | textarea (rows=2) | **pré-rempli depuis websiteAnalysis.productDescription** si présent et pas un placeholder (`/unknown\|n\/a\|<\|>/i`) | `.trim().length >= 10` | `settings.productDescription` |
| `salesMotion` | pill single-select | `"Founder-led sales"` | required (default) | `settings.salesMotion` |
| `challenge` | pill single-select | aucun | required | `settings.primaryChallenge` |

**Options salesMotion (4)** : `["Founder-led sales", "Small sales team", "SDR / AE split", "Product-led (PLG)"]`
**Options challenge (4)** : `["Finding leads", "Getting responses", "Closing deals", "Expanding accounts"]`

**Action onNext** :
- `saveOnboardingData({ productDesc, salesMotion, challenge, step: "product" })`
- `applyWebsiteAnalysis()` — applique le résultat du LLM sur l'ICP state (industries, sizes, seniorities via fuzzy match, geographies, **aiTone silencieusement**)
- `setStep("icp")`
- Si `!websiteAnalysis && !analyzingWebsite && domain` : re-lance `/api/onboarding/analyze-website` **avec** le productDesc entré par l'user (retry "smart")

**AI** : indirecte — le `productDesc` textarea est **souvent pré-rempli par le LLM** du step 1, et `aiTone` est **modifié en catimini** via `applyWebsiteAnalysis`.

**Downstream consumers** :

| Champ | Consumers |
|---|---|
| `productDescription` | TAM (`api/tam/route.ts:119`), chat system prompt (`api/chat/route.ts`), sequence generator, prospect-context, draft-proposal skill, re-engage, campaigns |
| `salesMotion` | **1 seul vrai usage** : TAM businessContext (`api/tam/route.ts:120`). Passé aussi dans chat system prompt (`api/chat/route.ts:146`) et chat tool schema, mais ces intégrations ne pivotent pas le comportement — c'est du contexte consommable mais non-opérationnel. |
| `primaryChallenge` | **1 seul vrai usage** : sous-titre home dashboard (`home/page.tsx:273-281`, 4 strings différentes selon la valeur). TAM businessContext l'injecte aussi. |

**Justification** :
- `productDesc` = critique, alimente tous les prompts.
- `salesMotion` = initialement pensé pour piloter les templates de sequences (founder-led ≠ SDR-driven). **Non implémenté.**
- `primaryChallenge` = initialement pensé pour personnaliser le dashboard. **Seul le sous-titre change.**

**Critique PM** :
- ❌ **`salesMotion` et `primaryChallenge` sont des "lakes sans embouchure"**. Collectés, présents dans les LLM contexts, mais ne pivotent presque rien. Décision : **soit on les exploite vraiment** (templates de sequences différents, dashboard layouts différents par challenge, onboarding path qui change), **soit on les supprime**.
- ❌ **`productDesc` pré-rempli sans attribution** — le user croit l'avoir écrit lui-même. **Recommandation** : afficher au-dessus du textarea un badge `<Sparkles> AI suggested from yourdomain.com — edit freely`.
- ❌ **Si le LLM website échoue**, textarea vide. Pas de fallback / exemples sectoriels. Offrir 2-3 exemples "starter" ("e.g. API platform for fintech companies to embed payments…").
- ❌ **`primaryChallenge = "Expanding accounts"` déclenche le sous-titre home "Expansion signals across your accounts" mais aucune feature d'expansion signals n'existe**. Over-promise.
- ❌ **Question "Biggest challenge" ambiguë** : le user pense qu'on va optimiser l'engine pour ce challenge, en fait c'est un texte de header. **Soit faire le vrai boulot de personnalisation**, soit reformuler en "What will you focus on this quarter?" (descriptif pas impactant).
- ⚠️ **Validation >= 10 chars** sur productDesc — un "dev tools SaaS" (15 chars) passe mais est inexploitable. Better: `>= 30 chars` + count displayed.
- 💡 **Lightfield** : ne demande PAS de product desc — l'infère des emails sortants récents. `salesMotion` n'existe pas — inféré de la company size. `challenge` idem — inféré des patterns de mail (beaucoup de cold sans replies = "Getting responses").
- 💡 **Monaco** : demande product avec **textarea géant**, multi-ligne, avec prompt "add case studies / competitors / customer examples" pour enrichir. Pas de pills pour motion/challenge — ce sont des traits inférés.
- 💡 **Attio** : pas de step product — la connaissance du product se construit dans le CRM via entités won/lost deals.

---

### Étape 5/7 — `icp` — "Who do you sell to?"

> **Subtitle** : si `websiteAnalysis` → `"We pre-filled this from your website. Adjust anything that doesn't fit."` sinon → `"We'll find companies that match{emailConnected ? " and flag warm ones" : ""}."`

**Progress bar** : "5/7 · Your customer"

**Bloc `buildError`** : rendu si un précédent build a échoué. Affiche message + bouton "Retry".

**Bloc `confidenceGaps`** : si le LLM retourne des gaps, un panneau bleu "Quick questions to refine your targeting" affiche ces questions — **en lecture seule, sans input**. Pur bruit visuel.

**5 champs** (tous multi-select sauf indiqué, tous pre-remplis depuis websiteAnalysis) :

| Field | Widget | Options count | Source | Persist key |
|---|---|---|---|---|
| `industries` | TagInput (search dropdown) | 113 industries Apollo/LinkedIn taxonomy | `targetIndustries` filtrées | `settings.targetIndustries[]` |
| `companySizes` | PillSelect | 8 ranges Apollo | `targetCompanySizes` filtrées | `settings.targetCompanySizes[]` |
| `geographies` | TagInput | ~120 (régions + pays + US states) | `targetGeographies` | `settings.targetGeographies[]` |
| `targetSeniorities` | TagInput (required) | 10 niveaux Apollo | fuzzy match sur `targetRoles` OR default `["C-Suite", "VP", "Director"]` | `settings.targetSeniorities[]` |
| `targetDepartments` | TagInput | 22 départements Apollo | fuzzy match sur `targetRoles` | `settings.targetDepartments[]` |

**Options complètes** (source `icp-constants.ts`) :

- `INDUSTRIES` (113) : `Accounting, Airlines/Aviation, Alternative Medicine, Animation, Apparel & Fashion, Architecture & Planning, Automotive, Aviation & Aerospace, Banking, Biotechnology, Broadcast Media, Building Materials, Business Supplies and Equipment, Capital Markets, Chemicals, Civil Engineering, Commercial Real Estate, Computer & Network Security, Computer Games, Computer Hardware, Computer Networking, Computer Software, Construction, Consumer Electronics, Consumer Goods, Consumer Services, Cosmetics, Defense & Space, Design, E-Learning, Education Management, Electrical/Electronic Manufacturing, Entertainment, Environmental Services, Events Services, Facilities Services, Farming, Financial Services, Fine Art, Food & Beverages, Food Production, Fund-Raising, Furniture, Gambling & Casinos, Glass Ceramics & Concrete, Government Administration, Graphic Design, Health Wellness and Fitness, Higher Education, Hospital & Health Care, Hospitality, Human Resources, Import and Export, Individual & Family Services, Industrial Automation, Information Services, Information Technology and Services, Insurance, International Trade and Development, Internet, Investment Banking, Investment Management, Law Practice, Legal Services, Leisure Travel & Tourism, Logistics and Supply Chain, Luxury Goods & Jewelry, Machinery, Management Consulting, Maritime, Market Research, Marketing and Advertising, Mechanical or Industrial Engineering, Media Production, Medical Devices, Medical Practice, Mental Health Care, Mining & Metals, Music, Nanotechnology, Newspapers, Non-Profit Organization Management, Oil & Energy, Online Media, Outsourcing/Offshoring, Package/Freight Delivery, Packaging and Containers, Paper & Forest Products, Performing Arts, Pharmaceuticals, Photography, Plastics, Primary/Secondary Education, Printing, Professional Training & Coaching, Public Relations and Communications, Publishing, Real Estate, Recreational Facilities and Services, Renewables & Environment, Research, Restaurants, Retail, Security and Investigations, Semiconductors, Shipbuilding, Sporting Goods, Sports, Staffing and Recruiting, Supermarkets, Telecommunications, Textiles, Think Tanks, Translation and Localization, Transportation/Trucking/Railroad, Utilities, Venture Capital & Private Equity, Veterinary, Warehousing, Wholesale, Wine and Spirits, Wireless, Writing and Editing`

- `COMPANY_SIZES` (8) : `1-10, 11-50, 51-200, 201-500, 501-1,000, 1,001-5,000, 5,001-10,000, 10,001+` — converti en format Apollo `"min,max"` via `sizesToApolloRanges()`.

- `SALES_MOTIONS` (4) : `Founder-led sales, Small sales team, SDR / AE split, Product-led (PLG)`

- `JOB_SENIORITIES` (10) : `Owner, Founder, C-Suite, Partner, VP, Head, Director, Manager, Senior, Entry`

- `JOB_DEPARTMENTS` (22) : `Engineering, Sales, Marketing, Finance, Operations, IT, Human Resources, Legal, Product, Design, Customer Success, Business Development, Data Science, Security, DevOps, Support, Research, Consulting, Supply Chain, Procurement, Communications, Strategy`

- `GEOGRAPHIES` (~120) : régions (16), pays majeurs (~55), US regions (5), US states (26).

**Champ dérivé** : `targetRoles = [...targetSeniorities, ...targetDepartments].join(", ")` — **string** passée aux consumers non-taxonomy (TAM prompt, find-contacts, scoring).

**Champ modifié silencieusement** : `aiTone` — si `websiteAnalysis.suggestedTone` existe et que le current value est "Direct" (default), remplacé par la suggestion LLM ("Formal" | "Direct" | "Casual").

**Validation `canContinueICP`** : `industries.length > 0 && companySizes.length > 0 && targetSeniorities.length > 0`.

**Bouton** : "Build my prospect list" `<Target>` → déclenche `handleBuildTAM` qui passe à step `building`.

**AI** : indirectement. Tout le pre-fill vient du LLM du step 1. Pas de nouvel appel LLM ici.

**Downstream consumers** :
- `targetIndustries/Sizes/Geographies` : TAM search (traduit en Apollo criteria par le LLM du TAM), scoring, chat context
- `targetSeniorities/Departments` : find-contacts Apollo filter (seniorities hardcodés dans `api/onboarding/find-contacts/route.ts:47`), scoring
- `targetRoles` (derivé) : tous les prompts (sequences, chat, scoring, find-contacts, tam)
- `aiTone` : email drafts (`campaigns/generate`), chat (`chat/route.ts:147`), re-engage (`skills/intelligence/re-engage-stalled/handler.ts:131`), prospect-context, sequence-generator

**Justification** : ICP = cœur du GTM. Sans ciblage, aucune pertinence downstream.

**Critique PM** :
- ❌ **`confidenceGaps` affichés mais non actionnables** — feature incomplète. Soit transformer en mini-form (radio/input inline par gap), **soit supprimer le panneau**.
- ❌ **`aiTone` modifié silencieusement** — violation du principe "no surprises". Afficher un toggle explicite ou au moins un note "Email tone: {tone} (AI-suggested, change in Settings)".
- ❌ **`INDUSTRIES` non catégorisées** — 113 options plates dans un search dropdown. Pénible à naviguer. **Ajouter des groupes** (Tech, Finance, Health, Services, Manufacturing…) ou des "presets" verticaux ("I sell to Tech SaaS" → pré-remplit 10 industries).
- ❌ **Pas de `count estimate live`** : "Your criteria match ~4,200 companies in Apollo" → le user clique "Build" dans le noir. Ajouter un bouton "Preview matches" qui affiche count + 5 logos avant de s'engager sur le build complet.
- ❌ **Les `CHALLENGES` du step 4 ne sont pas leveragés ici** — si le user a dit "Getting responses", ce step devrait être **expédié** (les responses dépendent du messaging, pas du ciblage). Paradoxe.
- ⚠️ **`targetRoles` dérivé mais stocké** — si l'user édite seniorities/departments plus tard dans `settings/icp`, `targetRoles` n'est pas re-dérivé → désync. Bug potentiel.
- ⚠️ **Fuzzy match `.includes` bidirectionnel** pour splitter `targetRoles` en seniorities/departments donne des matches foireux ("Senior" (seniority) matche "Senior Manager" mais aussi "Senior Engineer" sans ambiguïté — OK — mais matche aussi tout département finissant par "Senior" si présent).
- 💡 **Lightfield** : ne demande pas l'ICP — l'infère des deals/emails won passés + contacts les plus engagés. Pitch : "Ton ICP semble être X, Y, Z — confirme ?". Mode confirmation pas collection.
- 💡 **Monaco** : **même inference** mais avec PREVIEW LIVE des 10 top-fit companies rankées avant que le user confirme l'ICP. Le user voit la conséquence avant de valider les inputs.
- 💡 **Attio** : ICP n'est pas dans l'onboarding — c'est un record modifiable dans le workspace, filtrable, dashboardable. Pas coincé dans un wizard one-shot.

---

### Étape 6/7 — `building`

> **Titre** : "Building your pipeline..." — "This takes about 30 seconds."

**Pas de progress bar visible** (absente dans cet état).

**Stages animés** (timer-driven, découplés des callbacks API) :

| Stage | Label | Icon | Timing |
|---|---|---|---|
| 0 | Searching company databases... | Globe | début |
| 1 | Validating company data... | Target | +1.5s |
| 2 | Enriching company profiles... | Building2 | +4s |
| 3 | `emailConnected ? "Cross-referencing your inbox..." : "Scoring against your criteria..."` | Mail / Zap | +7s |
| 4 | `Found {tamProgress.found} companies` | Check | après vrai TAM count |
| 5 | Building your pipeline... | Check | fin |

**Séquence d'APIs réellement appelées** (sequential) :
1. `POST /api/onboarding/save` (step: "icp") — save ICP state
2. `POST /api/tam` → LLM génère stratégies + exécute Apollo search × 3 pages par stratégie + enrich chaque org → crée rows `companies`
3. `GET /api/accounts?pageSize=1` — get total count
4. `GET /api/accounts?pageSize=200` — récupère les 200 pour scoring + preview
5. `POST /api/score` (chunked via `chunkedBulkCall`) — scoring ML de tous les IDs
6. `POST /api/onboarding/find-contacts` — Apollo search × top 10 companies × 3 contacts max
7. `POST /api/embed` × 2 (companies + contacts) — fire-and-forget
8. `GET /api/onboarding/email-intelligence` (si emailConnected) — fire-and-forget
9. `POST /api/onboarding/save` (step: "complete") → déclenche Inngest `onboarding/completed`

**Preview** : top 5 companies avec logo + name + industry affichés en live dans un panel `First matches`.

**Gestion d'erreur** : `try/catch` autour de tout le flow. En cas d'échec de `/api/tam`, retour à `step: "icp"` avec `buildError`.

**AI** :
- 1 appel LLM Claude Sonnet 4.6 dans `/api/tam` (génération stratégies)
- ML scoring (non-LLM, algorithmique, `api/score`)
- Embeddings OpenAI `text-embedding-3-small` (fire-and-forget)

**Downstream** : alimente tout le CRM (companies, contacts, scores, embeddings pour RAG).

**Critique PM** :
- ❌ **"30 seconds" est mensonger** — en réel, TAM + scoring + find-contacts = 40-120s selon plan Apollo + latency LLM. **Afficher un compteur live** : "Found 143 companies... 287... 412..."
- ❌ **Stages animés découplés** — stage 2 s'affiche à 4s même si Apollo n'a rien renvoyé. **Honnêteté** : lier les stages aux vrais callbacks (stage 1 → "Apollo returned X orgs", stage 2 → "N enriched", stage 3 → "scoring X/Y").
- ❌ **Si `/api/tam` échoue, toute l'animation est perdue** → re-attente identique + pas de diagnostic. Offrir un fallback "skip TAM, I'll seed from email only" ou "try with a narrower criteria".
- ❌ **Top companies preview montre 5 logos mais sans scores** — pourquoi pas "Acme (score 87) — matches on size + industry" ? Le scoring est déjà calculé.
- ⚠️ **Embeddings fire-and-forget** : si OpenAI down, pas de signal au user. OK pour UX mais fait un CRM partiellement RAG-ready silencieusement.
- 💡 **Monaco** : affiche les VRAIES companies trouvées en live avec raisons de match. Le user voit son pipeline se construire.
- 💡 **Lightfield** : pas de TAM batch — email scan prioritaire remplit le CRM instantanément avec les VRAIS contacts déjà en convo. TAM batch optionnel après.

---

### Étape 7/7 — `ready` — "Your sales engine is ready"

**Pas de progress bar** (le banner "Welcome back" non plus — car complétion imminente).

**Icône check vert central** (`#22c55e`).

**3 stat cards** (grille 3-col) :
1. `{tamProgress.found}` companies found
2. `{contactsFound}` contacts identified
3. Si emailConnected : `{emailIntelligence?.icpMatches}` in your inbox (avec loader si null) — sinon : "-" / "connect email"

**Top décision-makers preview** : 5 contacts si `topContacts.length > 0`, avec icon Users + name + title (si présent).
Sinon, **Top companies preview** : 5 companies avec logo + name + industry.

**Quick wins panel** (5 liens a-href) :
- `/accounts?sort=score` — Target — Review your top accounts
- `/sequences` — Send — Launch your first sequence
- `/settings/mailboxes` — Inbox — Connect a sending mailbox
- `/settings/data-model` — Database — Customize your data model
- `/chat` — MessageSquare — Ask Elevay anything

**Bouton principal** : "Go to your engine" → `onComplete()` → `window.location.href = "/?firstTime=true"` (hard reload).

**Persist au clic** :
- `onboardingCompleted: true`
- `onboardingCompletedAt: ISO`
- `onboardingCurrentStep: undefined`
- Welcome email envoyé (idempotent sur `welcomeEmailSentAt`)
- Inngest event `onboarding/completed` → contact discovery + embeddings (retry de ce qu'on a déjà fait synchrone en step 6)

**AI** : aucune dans cet écran.

**Downstream** : flag `onboardingCompleted` contrôle l'affichage du wizard partout.

**Critique PM** :
- ❌ **Quick wins uniformes** — 5 liens identiques visuellement, aucune hiérarchie. **1 primary CTA + 4 secondary** mieux. Ou laisser une seule "Top action" contextualisée (ex: si `topContacts.length > 0` → "Send your first sequence to {topContacts[0].name}?").
- ❌ **`emailIntelligence.icpMatches` loader perdu** — async, peut rester en spinner si query lente. User quitte le wizard en ratant la proof. **Better** : si la query dépasse 3s, afficher "0+ matches" + info "we'll finish analyzing in background".
- ❌ **Si `contactsFound = 0`** (cas commun — founder tenant vide), stat card "0 contacts identified" démotive. **Hide or pivot** : "We'll identify contacts as your sync runs".
- ⚠️ **`/?firstTime=true`** : le home page use `firstTime` param pour afficher welcomeBanner mais remplace l'URL à `/` — la redirection redémarre au root, pas à `/home` (cohérent avec le dashboard route au root ? À vérifier).
- ⚠️ **Contact preview sans score** — score contact est peuplé mais non affiché. Loupé.
- 💡 **Monaco ready screen** : offre **1 action à 1-click** (ex: "Lance ta 1ère sequence sur ces 5 contacts ?" avec preview du 1er email pré-généré).
- 💡 **Attio** : pas de ready screen — le CRM EST la ready screen. On atterrit direct dans une view pre-populée.

---

## 3. Champs collectés : consommés vs orphelins

### ✅ Healthy (utilisés partout)
| Champ | Nb consumers | Criticité |
|---|---|---|
| `companyDomain` | 10+ | Critique (sync, TAM, scoring) |
| `productDescription` | 7+ | Critique (tous prompts LLM) |
| `targetIndustries/Sizes/Geographies/Seniorities/Departments` | 5+ | Critique (TAM + scoring + contacts) |
| `targetRoles` (dérivé) | 6+ | Critique (prompts, find-contacts) |
| `aiTone` | 6+ | Importante (tous drafts LLM) |
| `onboardingFullName` | 3 | Normale (signature) |
| `onboardingCompanyName` | 3 | Normale (welcome, TAM context) |
| `onboardingRole` | 5 | Normale (chat, signature) |
| `emailProvider` | 3 | Critique (sync path) |
| `contactCreationMode`, `backsyncRange`, `doNotTrackDomains` | 3 | Importante (sync) |

### ⚠️ Sous-utilisés (à justifier ou supprimer)
| Champ | Usages réels | Recommandation |
|---|---|---|
| `salesMotion` | 1 vrai (TAM prompt) + 2 inertes (chat context) | **Exploiter** via templates de sequences différenciés par motion. OU supprimer. |
| `primaryChallenge` | 1 vrai (home subtitle) + 2 inertes | **Exploiter** via dashboards personnalisés, premier onboarding path différent. OU supprimer. |
| `defaultDataVisibility = "team"` | 0 (placeholder) | **Implémenter** le team scoping OU retirer l'option. |

### ❌ Orphelin visible
- `confidenceGaps` (output LLM du step 5) : **affiché en lecture, jamais capté en input**. Pur bruit visuel actuellement.

### 🚫 Définis dans `TenantSettings` mais **JAMAIS demandés dans l'onboarding**
| Champ | Consumer existant | Impact |
|---|---|---|
| `companyInvestors[]` | Signal `investor-overlap` (`skills/signals/investor-overlap/handler.ts`) | **Signal MORT** car data vide. Débloquerait la fonctionnalité "Common Investor?" sur TAM. |
| `language` | (défini, non consommé aujourd'hui) | À inférer de `navigator.language` |
| `timezone` | (défini, non consommé aujourd'hui) | À inférer de `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `knowledge[]` | Chat system prompt, TAM businessContext | User doit aller dans Settings → pas découvert |
| `agentApprovalMode` | Agent dispatching | Default `"auto"` = envoi sans validation — peut surprendre |
| `llmMonthlyCostCapUsd` | `enforceLlmBudget` — throw `BudgetExceededError` | Pas demandé → cap jamais posé → facture illimitée si `12m` backsync + TAM massif |
| `pipelineStages[]` | Opportunities, scoring | Configuré dans autre page Settings, pas découvert dans onboarding |

---

## 4. AI touchpoints — récap chiffré

| Moment | Appel | Modèle | Input | Output | Coût approx |
|---|---|---|---|---|---|
| Post welcome, bg | `analyze-website` Step 1 | `claude-sonnet-4-6` | scraped HTML (titre, meta, headings, body 3k chars, pricing signals, image alts) + productDescription optionnel | `websiteIntelligenceSchema` : companyDescription, productDescription, pricingModel, targetMarketSignals, competitorClues, maturitySignals | ~$0.01 (cacheControl: ephemeral) |
| Post welcome, bg | `analyze-website` Step 2 | `claude-sonnet-4-6` + thinking 4k tokens | output step 1 + inference rules | `icpInferenceSchema` : targetIndustries[], targetCompanySizes[], targetRoles, targetGeographies[], suggestedTone, confidence, reasoning, confidenceGaps[] | ~$0.05 |
| Post welcome, bg | `enrich-icp` skill | Apollo orgs API via `icpIdentificationSkill` | domain | ICP structuré (industries, sizes, geographies) | ~$ Apollo plan |
| Step 5→6 | `tam` strategy LLM | `claude-sonnet-4-6` (fallback `gpt-4o-mini`) | businessContext (companyName, productDescription, salesMotion, primaryChallenge, industries, sizes, geographies, targetRoles, knowledge) + Apollo format rules | `searchStrategySchema` : 2-4 stratégies (label, reasoning, filters Apollo) | ~$0.02 |
| Step 5→6 | Apollo orgs search × N | Apollo search API | filters | 100 orgs × 3 pages = 300/stratégie | Apollo plan |
| Step 5→6 | Apollo enrichOrganization × M | Apollo enrich API | domain | profil complet (employees, revenue, funding, tech stack, description) | Apollo plan |
| Step 5→6 | `score` ML | local Node scoring | companyIds + settings | scores 0-100 | — |
| Step 5→6 | `find-contacts` | Apollo people search | domain + roleTitles + seniorities hardcoded | 3 contacts × 10 top companies = 30 max | Apollo plan |
| Post complete, Inngest | `onboarding-completed` handler | Apollo + OpenAI | top 20 companies | 3 contacts × 20 + embeddings | Apollo + ~$0.001 embeddings |

**Total coût LLM/Apollo par user (hors plan Apollo) : ~$0.08-0.50** selon taille ICP et nb enrichissements.

---

## 5. Recommandations priorisées

### P0 — Bugs / dettes critiques (semaine courante)
1. **`defaultDataVisibility="team"` — retirer ou implémenter**. Aujourd'hui identique à "everyone", mensonge UI.
2. **`confidenceGaps` actionnables** — transformer en mini-form inline (radio/input par gap) ou supprimer le panneau.
3. **`aiTone` modifié silencieusement** — exposer à l'user avec toggle explicite, OU supprimer la modification auto.
4. **Progress bar `X/7` alors qu'1 étape est skippée** — recalculer total dynamiquement, ou afficher "~X of ~7".
5. **Cacher `Default visibility` en single-seat tenant** — inutile 99% du temps.
6. **Harmoniser titres** : progressbar "Your profile" vs header "Tell us about you" — choisir une voix.

### P1 — Friction évitable (sprint suivant)
7. **Inférer `language` et `timezone`** silencieusement depuis `navigator.language` + `Intl.DateTimeFormat().resolvedOptions().timeZone`, persister.
8. **Step 5 : count Apollo live** — "Your criteria match ~X,XXX companies" avant Build.
9. **Step 4 : attribution du pre-fill** — badge `<Sparkles> AI suggested from yourdomain.com — edit freely`.
10. **Step 2 : remplacer "Skip for now"** par lien secondaire + liste visible des features dégradées.
11. **Step 6 : stage animations couplées aux vrais callbacks** (pas setTimeout découplés).
12. **fullName single-field** : arrêter de splitter au 1er espace, garder `fullName` pour display.
13. **Ajouter `companyInvestors[]` collection** (tag input 1-2 min) — débloque le signal investor-overlap déjà codé.

### P2 — Improvements product (2-4 semaines)
14. **Exploiter `primaryChallenge`** — 4 onboarding paths différents (dashboard customisé, 1ère quick win adaptée, sequence template différente) par value. OU supprimer le champ.
15. **Exploiter `salesMotion`** — templates de sequences distincts par motion (founder-led = personnel + direct ; SDR/AE = structuré + scalable ; PLG = produit-led ; small team = pragmatique). OU supprimer.
16. **Ready screen : 1ère action à 1 click** — "Preview your first sequence to {topContacts[0].name}?" avec email pré-généré.
17. **Email inference avant ICP** — si email connecté, auto-infer ICP depuis emails sortants récents et passer le step 5 en mode "confirm" plutôt que "collect" (Lightfield move).
18. **Step 3 : afficher coût estimé du backsync** — "~$N in AI credits" à côté de 12 mois.
19. **Ajouter `agentApprovalMode` et `llmMonthlyCostCapUsd`** sur un écran optionnel "Advanced settings" (skippable).

### P3 — Refonte stratégique (trimestre)
20. **Compression à 4 steps max** : Profile+Domain → Connect → Confirm ICP (pré-inférée) → Ready. Supprimer privacy (→ Settings), product (→ inféré).
21. **Progressive disclosure** — remplacer le wizard modal par des cards dans le home qui se déplient. "Connect mail" n'est plus une étape 2/7 mais une card persistante tant que non connectée. La personnalisation (ICP, privacy) se fait via suggestions inline.
22. **Pre-activation moment** — avant même ICP, montrer un vrai prospect avec profil enrichi (Monaco move). "Here's a company that matches what we inferred — tell us if this is relevant?".

### P4 — UX polish
23. Role pill-select → ajouter visual cue single-select (radio style).
24. Ready quick wins → 1 primary + 4 secondary, ou 1 CTA contextualisée unique.
25. Reprise de session : le banner "Welcome back" ne doit s'afficher que si `currentStep !== "welcome"` OU interrompu ≥ 30s.
26. Step 3 : afficher les 17 providers auto-exclus en chips désactivés (visibilité) plutôt qu'en texte.
27. Step 5 : catégoriser les 113 `INDUSTRIES` par verticales (Tech, Finance, Health, Services, Manufacturing, Consumer, Public, Other) + "presets" (ex: "Tech SaaS").

---

## 6. Benchmark Lightfield / Monaco / Attio

| Dimension | LeadSens actuel | Lightfield | Monaco | Attio |
|---|---|---|---|---|
| **Structure** | Modal fullscreen 7 steps | Inline progressive | Modal 3-4 steps | Pas de wizard |
| **Email connection** | Step 2, skippable easily | Step 1, obligatoire | Step 1, obligatoire | Optionnel |
| **ICP** | Multi-select filters 113 industries | Inferred depuis emails passés | Inferred + live preview companies | Record modifiable dans CRM |
| **Product desc** | Textarea pre-filled LLM | Inféré emails sortants | Textarea géant multi-ligne | Via skill agent |
| **First value moment** | Step 7 (30-90s wait) | 5s après email connect (1ère insight) | Step 2-3 (live prospect list) | Workspace live direct |
| **Privacy config** | Step 3 dense (4 sections) | Settings only | Settings only | Settings only |
| **Personalization channel** | Pills + multi-select | Inference from data | Inference + confirm | Progressive via usage |
| **Completion** | "Go to engine" → dashboard vide | Pas de completion explicite | CTA "Enroll 1 prospect" | Pas de completion |
| **Nb de questions au user** | ~15 champs | ~3-5 (nom, domaine, OAuth) | ~6-8 (avec preview intermédiaire) | ~2-3 (identité + connect) |
| **Philosophy** | Collect → Confirm → Build | Connect → Infer → Play | Connect → Preview → Confirm | Connect → Play → Config-via-usage |

**Verdict** : LeadSens collecte **4x plus** que les benchmarks pour une value similaire côté user. L'inférence LLM existe (step 1) mais reste en "assist pre-fill" au lieu de devenir le mode par défaut.

---

## 7. Fix appliqué aujourd'hui (2026-04-21) — Step 3 privacy compression

**Problème** : step 3 overflow la hauteur du card sur viewports ~600-720px. `overflow: hidden` du card clippait le StepFooter.

**Diff effectué** dans `app/apps/web/src/components/onboarding-wizard.tsx` :
- `CREATION_OPTIONS` et `VISIBILITY_OPTIONS` : suppression du champ `desc` (long), ajout d'un champ `short` (2 mots), icon 13px → 12px
- Section "Record creation" : 3 rows stacked full-width (~108px) → grille 3-col segmented (~44px) = **gain ~64px**
- Section "Default visibility" : idem = **gain ~64px**
- Wrapper content : ajout `min-h-0 overflow-y-auto` en filet de sécurité
- Spacing : `space-y-3` → `space-y-2.5` (gain 3px)
- Cells : `leading-tight` pour compact
- "Do not track" : helper text "17 providers excluded" fusionné dans le placeholder du tag input (gain ~14px)

**Total estimé** : **~145px gagnés en hauteur** sur le step 3.

**À vérifier visuellement** : user test `design-priv-test@elevay.dev` ou nouveau user sur viewport 600-720px. La vérif live Playwright n'a pas pu être faite dans cette session (profil browser verrouillé malgré kills).

---

## Fin du rapport
