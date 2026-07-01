# Budget features payantes à tester — FuseAI
_Préparé par : Senior PM — 2026-04-15_

## Principe d'évaluation

Pour chaque feature derrière un paywall, on évalue **ce qu'elle révèle** stratégiquement × **le coût minimum pour y accéder** × **la rareté de l'info ailleurs**. ROI = `(intelligence gain) / (€ + h d'analyse)`.

Trois niveaux :
- **Tier 1 — gratuit / déjà crawlé** : ce qu'on apprend sans payer
- **Tier 2 — $119–$399/mo** : ce que débloquent Launch et Scale
- **Tier 3 — $599–$799/mo + managed services** : ce que débloque Copilot

---

## Tier 1 — gratuit (déjà exploité)

| Source | Intelligence captée | Coût |
|---|---|---|
| Site marketing complet (13 pages) | Positioning, messaging, social proof, stack modules | 0 |
| Sitemap.xml | 60+ blog posts, hidden pages (`/product/manage`, 4 `/solutions`) | 0 |
| Legal pages (ToS, Privacy, Sending) | 90-day guarantee conditions, Google Workspace usage, compliance posture | 0 |
| Blog `vs-*` (18 posts) | Leur propre view du paysage concurrentiel + pricing déclarés | 0 |
| API docs publiques | 6 endpoints, rate limits, schema data, MongoDB inference | 0 |
| Signup UI (sans créer compte) | Stack frontend (Next.js, PostHog, Sentry, Stripe, reCAPTCHA), absence d'OAuth | 0 |
| Network requests signin | Produits analytics utilisés, tech choices | 0 |

**Intelligence captée gratuitement = ~70 % de la valeur d'un audit complet.**

Les 30 % restants nécessitent l'accès au produit.

---

## Tier 2 — Free account ($0) + Launch ($119 annuel / $159 mensuel)

### 2.1 Free tier ($0) — À PRIORISER

**Ce qu'il débloque** :
- Interface de l'app (dashboard, navigation, data model visible)
- 2 000 crédits : ~400 emails ou ~40 enrichments waterfall
- Website visitor ID (person + company)
- Premium enrichment via 20+ providers
- 2 séquences automatisées (email, LinkedIn, power dialer)

**Ce qu'on apprend** :
- Qualité réelle de l'enrichment waterfall vs. claims → on prend 10 prospects connus (équipes BCG, Google, startups Y Combinator) et on mesure match rate + accuracy
- Structure UX du dashboard : leurs objets principaux, leur IA (SalesGPT), le flow d'onboarding
- Si le chat NL existe et sa qualité sur requêtes types ("Find 50 SaaS France 10-50 emp")
- Qualité des signaux : quels types sont proposés, à quelle fréquence, via quel feed
- Le wizard/onboarding flow : combien d'étapes, quels fields, quelles intégrations poussées en premier
- Les paywalls : voir précisément ce qui est bloqué avec quel copy

**Contraintes** :
- reCAPTCHA au signup → difficile à automatiser ; signup manuel requis
- Email vérifié probablement requis → utiliser un email `+fuse@domain.com` ou alias
- Pas de carte bancaire (free tier)
- **Pas de risque financier** : $0
- Time-to-insight : 2-4 heures d'exploration produit

**ROI : 🟢 élevé**. À faire.

### 2.2 Launch ($119 annuel, ou $159 pour 1 mois)

**Ce que ça débloque en +** :
- 60 000 crédits/mois (12K emails, 1,2K waterfall email, 300 waterfall phone, 600 signal agents)
- **API access** — tester les 6 endpoints en production sur un échantillon contrôlé
- CRM + Slack intégrations
- Séquences illimitées
- Real-time buying intent signals (c'est le vrai produit Signals)

**Ce qu'on apprend en plus** :
- **La vraie qualité des signaux d'intent** (verrouillé en Free) — c'est leur différenciateur principal vs 11x/Artisan
- Comment l'API se comporte en vrai : latence, qualité des `status: catch-all` vs `valid`, response schema complet (vs sample doc)
- L'intégration CRM : schema des objets synchronisés, fréquence, déduplication, conflits
- Les limites de rate réelles (50/min, 2K/day — tester jusqu'au rate limit)

**Coût minimum** : $159 pour 1 mois en mensuel (évite le commit annuel). Refund policy : aucune (sauf 90-day guarantee à des conditions strictes impossibles à satisfaire en analyse).

**ROI : 🟡 moyen–élevé**. **Condition** : s'engager à 1 mois seulement (159 $), avec scope d'analyse défini upfront (tester 3 workflows : bulk enrich 200 contacts, 1 séquence email+LI sur 50 leads réels de notre prod, 1 campagne signal). Ne pas dépenser avant cadrage explicite avec toi.

**Budget recommandé : $159** si on veut tester Signals + API. Sinon, Free suffit pour 70 % de la valeur restante.

---

## Tier 3 — Scale ($299 annuel) / Copilot ($599 annuel)

### 3.1 Scale ($299 annuel / $399 mensuel)

**Ce que ça débloque en +** :
- 200 000 crédits/mois (4K waterfall emails, 1K waterfall phones, 2K signal agents)
- **Multi-line parallel phone dialer** avec unlimited connected numbers
- **Advanced SalesGPT deep research queries** ← c'est leur feature AI la plus "avancée"
- Shared team workspace
- Unlimited seats

**Ce qu'on apprend en plus vs Launch** :
- Qualité du power dialer multi-line (parity avec Nooks ?)
- **Vraie profondeur du SalesGPT** — l'évaluation à $399 du niveau "deep research" AI. Important pour évaluer leur moat "Sales Super Intelligence".

**ROI : 🟡 moyen**. Le delta principal = dialer multi-line et SalesGPT deep. Si on ne fait pas de téléphonie, on rate la moitié. **Condition** : seulement si le Free + Launch revèlent que SalesGPT est leur vrai moat.

**Budget recommandé : $399 pour 1 mois** ($399 mensuel > $299×1 annuel mensuel payable) — **seulement si Tier 2 montre que la profondeur AI doit être évaluée en détail**.

### 3.2 Copilot ($599 annuel / $799 mensuel)

**Ce que ça débloque en +** :
- 500 000 crédits/mois
- Dedicated onboarding & priority Slack channel
- Fully managed email and LinkedIn infrastructure setup
- Priority access to new features

**Ce qu'on apprend en plus vs Scale** :
- Le **onboarding managé** — observer la méthodologie "forward-deployed" qu'ils vendent. On parle à un humain de leur équipe, on voit leurs templates, leurs scripts.
- La **gestion d'infra email/LinkedIn** — comprendre leur stack de warmup (Mailreef ? Instantly ? custom ?)
- L'accès aux features en preview

**ROI : 🔴 faible rapport €/info** à ce stade. On paie surtout pour des services humains — utile si on veut du service design intelligence, pas du produit intelligence.

**Budget NON recommandé** sauf raison spécifique (ex : étudier un competitor forward-deployed qui vend de la sales methodology embedded dans produit, cf Monaco).

### 3.3 Enterprise — hors scope

Custom pricing + dedicated GTM engineer = probablement $2K-$5K+/mo. Zéro ROI pour analyse concurrentielle ponctuelle.

---

## Recommandation de budget global

### Option A — Minimum viable (gratuit)

**Dépense : $0**
- Free tier + analyse déjà faite
- 70 % de la valeur

**Limite** : on rate la qualité réelle des signaux, la profondeur du SalesGPT, le comportement de l'API sous charge, et le detail de l'UX dashboard.

### Option B — Intelligence ciblée (recommandée) ⭐

**Dépense : $159** (Launch 1 mois) + **~6 heures d'analyse produit**
- Free tier → UX dashboard + workflow onboarding (2h)
- Launch 1 mois → Signals qualité réelle + API test + CRM sync (4h)
- Post-analyse : downgrade / cancel avant renouvellement

**Intelligence gain vs Option A** : +25 %. **ROI maximal**.

### Option C — Audit complet

**Dépense : $159 (Launch) + $399 (Scale 1 mois, plus tard) = $558** total, séquentiel
- Mois 1 : Launch. Analyse Signals + API + CRM.
- Mois 2 : upgrade Scale. Analyse SalesGPT deep + dialer multi-line.
- Annulation mois 3.

**Intelligence gain vs Option B** : +5 %. **ROI marginal bas**. À envisager seulement si SalesGPT devient un élément critique dans notre réflexion produit.

### Option D — Déconseillée

Copilot à $799/mo pour service humain = non pertinent pour analyse produit. Enterprise = hors scope.

---

## Décision à prendre

**Recommandation finale : Option B — $159**.

Avant de dépenser, attendre ton go explicite. Si OK, je :
1. Crée un compte Free avec email dédié (`elevay-analysis@...`)
2. Fais l'audit Free (2-4h)
3. Sur base de l'audit Free, je te redemande confirmation pour passer à Launch ($159) OU je recommande de s'arrêter si le Free a révélé suffisamment.

**Zero dépense sans validation explicite de ta part** — conformément au brief et à la règle CLAUDE.md "check spending cap before any charge".
