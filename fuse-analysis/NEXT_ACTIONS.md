# NEXT_ACTIONS — ce qu'on fait de l'analyse FuseAI
_v1.1 · 2026-04-15 · pour Martin · basé sur findings ANALYSIS.md §12-13ter + audit LeadSens 2026-04-15_

Classement par **ROI réel** (impact × faisabilité, pas par taille). Deadlines indicatives si on part demain.

## État (2026-04-15 19h)

| # | Statut | Notes |
|---|---|---|
| N1 — Publier BATTLECARD | 🟡 Produit | `fuse-analysis/BATTLECARD.md` livré, en attente de diffusion |
| N2 — Taxonomie 3-adversaires homepage | ✅ **Shipped** | Commit `bca94b0` — nouvelle section "Landscape" entre WHY ELEVAY et FOUNDATIONS. TypeScript check OK. |
| N3 — Fix label "6-digit code" | ✅ **N/A, déjà mieux** | Audité : LeadSens utilise magic link (base64url, 24h TTL) et copy dit "verification link". On fait déjà mieux que Fuse — aucune action. |
| N4 — check-email.js scan multi-folders | ✅ **Shipped** | Commit `f62129b` — scanne INBOX+Notification+Newsletter+Spam, extrait alphanumériques. Validé regex. |
| N5 — Pricing v3 AI Credits pool | 🔴 **Attend décision** | Touche Stripe prod. Accord Martin requis avant spec/build. |
| N6 — 30-day performance guarantee | 🔴 **Attend décision** | Légal/CGV — nécessite review conseil juridique. |
| N7.1 — Page SEO vs-FuseAI FR | ✅ **Draft shipped** | `fuse-analysis/seo-pages/leadsens-vs-fuseai-fr.md` (200 lignes). Ready for review + CMS publication. |
| N7.2–N7.10 — 9 autres pages SEO vs | 🟡 En attente | ~3-4h/page ; peut être exécuté une par une |
| **N8 — Person-level email waterfall** | 🟡 **Kiro spec ready** | `_specs/FUSE-GAP-1-person-email-waterfall/` — office-hours + requirements + design + tasks (965 lignes). Attend : (1) décision Dropcontact/Hunter contrats, (2) accord sur caps par plan. |
| N9 — Signals externes | 🔴 Attend décision | Spec Kiro à écrire si accord de principe |
| N10 — Website visitor ID | 🔴 Attend décision | Spec Kiro à écrire si accord de principe |
| N11 — Power Dialer | ✅ **SKIP 2026 confirmé** | Recommandation assumée : refuser le terrain, ce n'est pas notre ICP. |



## 🟢 À faire maintenant (cette semaine — effort < 2 jours)

### N1 — Publier BATTLECARD.md dans l'onboarding commercial
**Pourquoi** : dès le prochain deal face à Fuse, tu as un tract prêt. Sans ça on improvise.
**Quoi** : `fuse-analysis/BATTLECARD.md` produit ce jour. Relecture, accord sur les formulations, puis partage à l'équipe / à tes conseillers GTM.
**Effort** : 30 min relecture.
**Validation** : te reste juste à dire "OK approuvé".

### N2 — Installer les 3 adversaires dans la homepage
**Pourquoi** : cadre de lecture clair pour le prospect (Fuse le fait très bien, on a moins de clarté actuellement sur `/api/apps/web/src/app/(marketing)/page.tsx`). Convertit l'analyse en positioning livré.

**Cadre proposé** (en s'inspirant mais en nous différenciant de Fuse) :

> **Legacy CRM** (Salesforce, HubSpot) : tu remplis à la main, tu payes par siège.
> **AI SDR v1** (11x, Artisan) : tu automatises l'envoi spam, pas les conversations.
> **Outbound-stack fragmenté** (Apollo + Instantly + Clay + CRM + …) : 5 abonnements, zero vision unique.
> **LeadSens** : le CRM qui se remplit seul, parle français, et a une mémoire de conversation qui comprend *ton* ICP — pas 800M profils génériques.

**Effort** : 1 jour design + copy + A/B setup.
**Dépendance** : validation copy par Martin.

### N3 — Fix le label "6-digit code" signup à alphanumérique OU passer en purement numérique
**Pourquoi** : Fuse envoie un code alphanumérique (`FDCAE3`) avec un label "6-digit code" → UI confuse, testé live. C'est un *anti-pattern* qu'on ne reproduit pas. Vérifier notre propre signup email verif et s'assurer de la cohérence label/réalité.
**Quoi** : audit notre `(auth)/signup` et `(auth)/verify-email` routes. Si on génère alphanumérique, soit on change label soit on change format.
**Effort** : 1-2 h audit + fix.
**Validation** : checklist QA.

### N4 — Étendre `_tools/check-email.js` pour scanner Notification + Spam
**Pourquoi** : pendant le signup FuseAI, l'email de vérif est arrivé dans le folder `Notification` de Zoho (auto-route). Le tool ne scanne que `INBOX` et a timeout silencieux. **Gap d'outil autonomy**. Toute recherche future sur un nouveau SaaS échouera pareil.
**Quoi** : modifier `_tools/check-email.js` pour poll sur `['INBOX', 'Notification', 'Newsletter', 'Spam']` en ordre.
**Effort** : 30 min.
**Validation** : re-run sur l'email Fuse déjà lu → retrouver.

## 🟡 À faire ce mois (effort 3-10 jours)

### N5 — Pricing v3 : introduire une unité de consommation unifiée optionnelle
**Pourquoi** : WS-2 pricing v2 vient de merger avec 3 tiers + usage events. Le finding majeur de Fuse = **leur modèle à crédits unifiés** (1 monnaie pour data + outreach + signaux + AI research). C'est élégant et c'est une différenciation forte des CRMs classiques.

**Pas une copie** : on ne remplace pas notre modèle, on **ajoute une couche "credits" par-dessus les quotas** pour les actions AI haute-valeur.

**Proposition** :
- Garde les tiers actuels (Free trial 14d / Starter $49 / Pro $99)
- Ajoute un **"AI Credits" pool** mensuel optionnel par tier :
  - Starter : 10 000 AI credits/mo (inclus)
  - Pro : 50 000 AI credits/mo (inclus)
  - Top-ups : $19 pour 10K crédits supplémentaires (marge 2-3× sur coût LLM)
- **Unit cost table** : SalesGPT deep research = 50 cr, waterfall email = 30 cr (person-level via futur wedge), signal monitor = 50 cr/mo, meeting summary = 10 cr, pipeline analysis = 20 cr
- **Affiché en tout-en-un** en prix : $49/mo = 500 emails + 1K contacts + 10K AI credits

**Pourquoi c'est mieux que Fuse** : on garde la lisibilité "je paye pour utilisateurs + quotas" ET on ajoute la flexibilité "j'achète plus d'AI si besoin". Fuse force tout le monde dans les crédits et cache le haircut 2× — nous on restons transparents.

**Important** : **ne jamais faire le double-pricing** (5 cr publique / 10 cr in-app). Les coûts crédits doivent être **identiques partout**.

**Effort** : 
- Design pricing : 1 jour
- Refactor billing.ts + usage-events pour typer "AI credit consumption" : 2 jours
- UI "Credits pool" dans `/settings/billing` : 1 jour
- Stripe products update + migration : 2 jours
- Total ~1 semaine

**Dépendance** : accord Martin sur le principe.

### N6 — "Skin in the game" : 30-day performance clause dans nos CGV
**Pourquoi** : Fuse a une **90-day performance guarantee** dans leur ToS. Conditionnelle à 10K+ messages et 1K+ calls, donc **impossible à déclencher**. Mais le pattern marketing est fort.

**Notre version à plus haute valeur signal** : garantie plus courte, critère plus simple, moins "trap".

**Proposition** : 
> "Si après 30 jours d'usage et import de ton pipeline, tu ne vois pas 3 meetings nouveaux attribués à LeadSens, on rembourse et on archive ton workspace en lecture seule pour 12 mois (au cas où tu changes d'avis)."

**Effort** : 
- Négociation wording avec conseil juridique : 2 h
- Update ToS + CGV : 1 jour
- Copy homepage + checkout : 1 jour
- Alerting backend (3 meetings detected ou non à J+30) : 1 jour
- Total ~2 jours dev + 1 jour légal/copy

### N7 — Librairie SEO "vs-competitor" (18 pages cible)
**Pourquoi** : Fuse a **18 pages `/blog/fuseai-vs-*`** qui occupent le SERP sur `[competitor] alternative`. Pour nous, ce serait les 10 concurrents directs sur lesquels on veut capter l'intent.

**Targets priorité** (ordre) :
1. LeadSens vs FuseAI (le plus chaud maintenant)
2. LeadSens vs Attio (cousin GTM-native, premium)
3. LeadSens vs Salesforce (incumbent)
4. LeadSens vs HubSpot (incumbent SMB)
5. LeadSens vs Apollo (wedge outbound)
6. LeadSens vs Clay (enrichment)
7. LeadSens vs Lightfield (aspirationnel direct)
8. LeadSens vs Monaco.com (aspirationnel direct)
9. LeadSens vs Outreach (sequence tool)
10. LeadSens vs Pipedrive (SMB CRM)

**Structure de chaque page** (copie le pattern Fuse mais en **français** pour SEO français qu'ils n'occupent pas) :
- TL;DR avec tableau
- "What is [competitor]" avec fondateurs, pricing, stack
- Comparaison feature-by-feature (≥8 dims)
- Pricing comparison (avec leurs gotchas quand applicable — e.g. Fuse double-pricing)
- "When to choose [competitor]" (honesty wins)
- "When LeadSens wins" (ICP-specific)
- CTA : signup free trial ou book demo

**Effort** : 
- 3-4 h par page, peut être split : 1 humain + 1 IA review + 1 humain final
- Pour 10 pages : ~30 h développement, ~5 jours calendaires
- CMS + SEO setup : 1 jour initial
- Publication progressive : 1/semaine pendant 10 semaines

**Dépendance** : budget d'attention éditorial ; peut être un side-project asynchrone.

## 🔴 À considérer ce trimestre (effort > 10 jours, impact différenciateur)

### N8 — Person-level email enrichment (pour fermer le gap DB)
**Pourquoi** : notre plus grand gap actuel vs Fuse côté prospection. Apollo account-level + LLM fallback = ok pour researcher une company, mais quand un user dit "enrich ce nouveau contact [nom, job title, company]", on retourne pas d'email.

**Approche** :
- Option A : partenariat Hunter / Findymail / Kaspr / Dropcontact (français) → API waterfall
- Option B : partenariat RocketReach / ContactOut
- Option C : build un waterfall interne avec 3-5 providers

**Recommandation** : Option A + B combinés. Commencer avec Dropcontact (français, RGPD, ~€0.05/contact validé) pour différenciation "EU-first" + Hunter en secondaire.

**Effort** :
- Partenariats + contrats : 1-2 semaines
- Waterfall engine (TypeScript) + caching + confidence scoring : 1 semaine
- Integration dans chat tool `enrichContact` existant : 3 jours
- Pricing model (quels tiers ont accès) : 2 jours
- Total ~1 mois

**Impact** : ferme le gap DB sans monter une DB maison (qui serait du suicide économique).

### N9 — Signals externes (hiring, funding, job change) via API provider
**Pourquoi** : Fuse a 12 agent templates dont 9 sur hiring/headcount. C'est leur pilier Signals. LeadSens n'a que des "custom signals" tenant-level + lifecycle Apollo. Gap réel.

**Approche** :
- **Hiring / job posting** : TheirStack, JobsPikr, ou scraping direct LinkedIn Jobs (risqué)
- **Funding** : Crunchbase API, Dealroom
- **Job change** : UserGems, Champify (data partnership)
- **News mentions** : NewsAPI, PRNewsWire RSS
- **LinkedIn post keyword** : phantombuster ou scraping direct (risqué)

**Recommandation minimale** (MVP) : TheirStack pour hiring + Crunchbase pour funding + UserGems pour job change. 3 sources = on matche 80% des use-cases Fuse avec 1/4 de la surface.

**Effort** :
- Partenariats : 2 semaines
- Backend signals ingestion pipeline (Inngest-based) : 1 semaine
- UI Signals feed + alert routing (déjà amorcé dans `/settings/custom-signals`) : 1 semaine
- Credits pricing : 1-2 jours (e.g. 100 cr / signal agent actif / mois)
- Total ~5 semaines

### N10 — Website visitor ID (RB2B-style, person-level)
**Pourquoi** : Fuse claim 30% person-level visibility via IP + cookie. C'est leur feature la plus moat-y.

**Approche** : partenariat RB2B (provider de référence) ou alternative FR. Exposer un script JS à installer sur le site client, côté nous on déduit person+company via IP→consumer-data enrichment.

**Effort** :
- Partenariat : 1 semaine
- Backend ingestion pipeline : 1 semaine
- UI Website Intent feed : 1 semaine
- Credits pricing : 2 jours
- Total ~1 mois

**Risque** : ICP très B2B-spécifique. Si nos clients ne sont pas B2B avec site web, c'est une feature qui ne convertit pas.

### N11 — Power Dialer (défaire Fuse sur son terrain)
**Pourquoi** : c'est leur feature "table-stakes" pour Scale tier. Sans ça on perd systématiquement les équipes outbound-heavy.

**Recommandation** : **ne pas faire** en Q2. Notre ICP est founder-led sales, pas SDR 200 appels/jour. Le power dialer vaut le coût d'implémentation (Plivo integration, compliance TCPA/GDPR, UI complexe) seulement si on pivote vers SDR teams.

**Si on doit le faire** :
- Plivo ou Twilio Voice integration : 2 semaines
- UI power dialer (parallèle multi-line) : 2 semaines
- Call recording + transcription + coaching : 3 semaines
- Compliance (GDPR + opt-outs) : 1 semaine
- Total ~2 mois

**Décision recommandée** : **SKIP pour 2026**. Positionner LeadSens explicitement anti-cold-calling. Slogan candidat : "Founder-led sales doesn't scream into phones. It listens."

## Décisions à prendre

**Accord explicite nécessaire** de Martin sur :

- [ ] N2 — Adopter la taxonomie "3 adversaires" dans la homepage ?
- [ ] N5 — Pricing v3 avec AI Credits pool (1 semaine dev) ?
- [ ] N6 — 30-day performance guarantee dans les CGV ?
- [ ] N7 — Librairie SEO `vs-*` en français (~5 jours pour 10 pages) ?
- [ ] N8 — Partenariat Dropcontact + Hunter pour person-level email (~1 mois) ?
- [ ] N9 — Signals externes hiring/funding/job change (~5 semaines) ?
- [ ] N10 — Website visitor ID (~1 mois) ?
- [ ] N11 — Power Dialer : **recommandation = SKIP 2026**. Accord ?

## Anti-patterns Fuse à ne PAS importer

Quoi qu'on fasse, on n'imite pas ceci :

1. **Double-pricing publique/interne** (5 cr vs 10 cr pour email) — destructeur de trust
2. **Stats "Product Impact" à 0 %** sur pages produit — placeholder never shipped
3. **Blog contradictoire** avec sa propre grille pricing (60K vs 50K crédits)
4. **Copy recyclé mot-pour-mot** entre pages (`/fuse-agent` = clone `/signals` + `/prospect`)
5. **"Customer Knowledge Graph" marketing** alors que l'implémentation = juste un formulaire URLs + Competitors
6. **404 dans la nav** (`/directory` et `/solutions` footer-listed mais inexistants)
7. **Pas d'OAuth au signup** (réel anti-friction)
8. **12 templates Signals = 9 hiring**. Si on fait Signals, viser la diversité (hiring + funding + news + technographics + reviews), pas la profondeur sur une seule verticale.

## Si on oublie tout — les 3 choses

1. **Adopter la taxonomie 3-adversaires dans notre positioning** (N2)
2. **Lancer la librairie SEO `vs-competitor`** (N7) — 18 pages Fuse font chaque semaine du SERP gratuit, on n'en a aucune
3. **Ne pas faire Power Dialer** (N11). C'est leur force, c'est pas notre bataille. Refuser le terrain.

---

**Source data** : 
- FuseAI findings : `fuse-analysis/ANALYSIS.md` (14 sections, 707 lignes)
- LeadSens state : audit 2026-04-15 via Explore agent
- In-product tests Fuse : Free account `fuse-signup@elevay.dev`, 50/2000 credits used

Mise à jour de cette note : quand une décision est prise, marquer dans checklist + créer spec correspondante dans `_specs/`.
