# FuseAI — Analyse concurrentielle exhaustive
_Préparé par : Senior PM — 2026-04-15_
_Sources : crawl direct tryfuse.ai (homepage, /pricing, /manifesto, /api, /product/{prospect,engage,signals,fuse-agent,manage}, /solutions/{founders,sales,marketing,revops}, /legal/{terms,privacy,sending-policy}, /faq, sitemap.xml, 6 articles vs-*, /blog/{ai-sdr-wave, sales-superintelligence, ai-sales-automation}). Screenshots + HTML bruts archivés dans `fuse-analysis/`._

---

## TL;DR exécutif

FuseAI = **GTM platform "suite intégrée"** (Prospect + Engage + Signals + Manage) construite sur un modèle de **crédits unifiés** à $159/mo Launch (annuel $119). Positionnement frontal vs. legacy (ZoomInfo, Outreach) ET vs. AI-SDR v1 (11x, Artisan), en répétant un cadre à 3 problèmes : **intent, data, deliverability**. La thèse long terme = "Customer Knowledge Graph" (digital twins de customer archetypes), mais le produit vendu aujourd'hui est très classique : base 800M contacts + waterfall 20+ providers + chat "SalesGPT" + parallel dialer + website visitor de-anon + CRM sync.

**Forces saillantes** : pricing model (crédits unifiés + tarifs publics transparents), achat de domaines+inboxes intégré, Chrome extension Sales Navigator scraper, contact-level visitor ID (pas juste company), 90-day performance guarantee dans le ToS, library massive de 18 pages `vs-*` pour SEO.

**Faiblesses & signaux de fragilité** : stats "Product Impact" **vides (`0%` `0h+`)** sur toutes les pages produit ; contradictions pricing entre la page publique et 5+ articles de blog (60K vs 50K credits ; Unlimited seats vs 3/5 users) ; `/directory` et `/solutions` listés dans la nav mais en 404 ; pas d'OAuth au signup ; Fuse Agent page a du copy recyclé mot-pour-mot des autres pages ; pas de warmup/deliverability mis en avant comme pilier (leur propre blog critique pourtant les AI-SDR v1 sur ce point exact).

**Recommandation stratégique** (synthèse § 5) : reprendre leur **taxonomie de positionnement** (Legacy vs AI-SDR-v1 vs Unified-native), leur **pricing à crédits unifiés** (monétisation par tâche, pas par siège), et leur **90-day guarantee** comme anti-friction sales. Ne pas recopier leur stack produit "suite" — c'est exactement le modèle qu'on doit désassembler avec un wedge chat-natif.

---

## 1. Architecture produit

### 1.1 Modules officiels (sitemap)

| Module | URL | Rôle déclaré |
|---|---|---|
| **Prospect** | /product/prospect | Découverte de leads, DB 800M+, waterfall enrichment, Chrome ext Sales Nav, export CSV/CRM |
| **Engage** | /product/engage | Email + LinkedIn + power dialer, "messages that sound like you", inbox unifié |
| **Signals** | /product/signals | Website visitor ID (people + company), intent feed, job change alerts |
| **Fuse Agent** | /product/fuse-agent | Interface "prompts-driven" pour executer tasks — "complete any task imaginable" |
| **Manage** | /product/manage ⚠️ caché du footer | Sync CRM, AI coaching on call training, automated ICP workflows |

**Observation** : `/product/manage` existe dans `sitemap.xml` mais n'est listé **ni dans le header, ni dans le footer**. Signe d'une feature non finalisée ou volontairement cachée. Pages `/solutions/{founders,sales,marketing,revops}` existent, `/solutions` (index) = 404.

### 1.2 Approche "suite intégrée" explicite

Leur copy martèle :
> "Replace your entire outbound stack for $159/month"
> "Unified platform that consolidates functionalities typically requiring 5+ separate systems"
> "Centralized data, engagement, and signals without stitching together tools"

Leur wedge = **founder-led sales / post-PMF startups / SMBs** avec ACV ≥ $5k. Ils admettent explicitement dans `vs-Clay` qu'ils ne sont **pas adaptés pré-PMF** ni aux deals < $5k ACV, ni à l'ABM/paid media.

### 1.3 Data model implicite

Les endpoints API + les captures produit révèlent :
- **Contact** (firstName, lastName, linkedIn, jobTitle, emails[], phones[], address, level, industry, department, subDepartment, campaignStatus)
- **Company** (name, domain, industry, address)
- **List** (entityType: contactList, isDynamic, companies count, contacts count, customColumns, exaList, completionStatus)
- **Bulk enrichment job** (asynchrone, "estimated waiting time: 3 minutes")
- **Email validation** (status: valid / invalid / do_not_mail / catch-all / risky)
- **Phone** (status: valid / invalid)
- Identifiants = MongoDB ObjectIds (`687f32e66dfb1c3242b26212`) → backend **Mongo**.

**Pas de "Deal" / "Opportunity" / "Stage" exposé** dans les endpoints publics → le module /product/manage est probablement léger ou en sync vers un CRM externe (Salesforce, HubSpot, Attio, Pipedrive, Zoho), pas un CRM natif complet.

### 1.4 Stack technique observé

Analyse des requêtes réseau sur `app.tryfuse.ai/signin` :
- **Next.js App Router** (paramètre `?_rsc=viple` = React Server Components payloads)
- **PostHog** (`us.i.posthog.com`) — product analytics, feature flags (`/flags/?v=2`)
- **Sentry** (self-hosted proxy `/monitoring?o=…&p=…`)
- **Stripe** (`m.stripe.com/6` — metric beacon)
- **Google reCAPTCHA v2** (checkbox "Je ne suis pas un robot", langue user-locale)
- Backend : api.tryfuse.ai (Basic Auth)
- Données : MongoDB
- Framer pour le site marketing (tryfuse.ai)

---

## 2. Pricing & monétisation

### 2.1 Grille officielle (page /pricing, 2026-04-15)

| Tier | Mensuel | Annuel (équiv. mensuel) | Crédits/mo | Seats | CTA |
|---|---:|---:|---:|---|---|
| Free | $0 | — | 2 000 | 1 | Self-serve |
| Launch | $159 | $119 (−25 %) | 60 000 | 1 | Self-serve |
| Scale ⭐ | $399 | $299 (−25 %) | 200 000 | Unlimited | Self-serve |
| Copilot | $799 | $599 (−25 %) | 500 000 | Unlimited | Contact Sales |
| Enterprise | Custom | — | Custom | Custom | Contact Sales |

### 2.2 Économie des crédits (la vraie mécanique)

| Action | Coût (crédits) | Free | Launch | Scale | Copilot |
|---|---:|---:|---:|---:|---:|
| Basic email enrichment | 20 | 100 | 3 000 | 10 000 | 25 000 |
| Waterfall email | 50 | 40 | 1 200 | 4 000 | 10 000 |
| Waterfall phone | 200 | 10 | 300 | 1 000 | 2 500 |
| Contact save / search | 2 | 1 000 | 30 000 | 100 000 | 250 000 |
| Email message (envoi) | 5 | 400 | 12 000 | 40 000 | 100 000 |
| LinkedIn message | 5 | 400 | 12 000 | 40 000 | 100 000 |
| Website visitor (person+co) | 5 | 400 | 12 000 | 40 000 | 100 000 |
| Signal monitoring agent | 100 | 20 | 600 | 2 000 | 5 000 |
| SalesGPT research query | 10 | 200 | 6 000 | 20 000 | 50 000 |
| Power dialer | 10 / min | 200 min | 6 000 min | 20 000 min | 50 000 min |

### 2.3 Lecture PM

**Ce qu'ils ont réussi**
- **Unité unique** : la même currency (crédits) rémunère data, outreach, signaux, AI. Un utilisateur choisit son mix. C'est une rupture vs. seats × features.
- **Économie révélée** : phone enrichment = 200 cr = **10× email**. Signal agent = 100 cr = **20× un send email**. Ils signalent que l'enrichment phone et les signaux sont leurs coûts marginaux les plus élevés → probablement underwater sur les tiers bas si les users poussent sur phone/signaux.
- **Contact save/search à 2 cr** → soft lock-in : browser la DB burn des crédits. Similaire au "export credit" d'Apollo mais plus granulaire.
- **Annual −25 %** toggle (vs typical SaaS 15–20 %) = aggressif pour verrouiller. Launch annuel $119 < Apollo Basic $49 mais > Apollo free, et fourni beaucoup plus d'actions.
- **Seats Unlimited dès Scale ($399)** si c'est vrai — destructeur face à Outreach ($100-160/seat) et Salesforce ($125-300/seat).

**Contradictions internes** (intelligence importante)
| Claim | Source | Valeur |
|---|---|---|
| Credits Launch | Page /pricing | 60 000 |
| Credits Launch | Blog vs-Apollo | 50 000 |
| Credits Launch | Blog vs-Artisan | 50 000 |
| Seats Scale | Page /pricing | Unlimited |
| Seats Scale | Blog vs-Apollo | 3 users |
| Seats Copilot | Page /pricing | Unlimited |
| Seats Copilot | Blog vs-Apollo + vs-Artisan | 5 users |
| Free credits | Page /pricing | 2 000 /mo |
| Free credits | Blog vs-Artisan | 5 000 one-time |
| Contacts DB | Page homepage + /product/prospect | 800M+ |
| Contacts DB | Page /api + FAQ | 700M+ |
| Starter math | Blog vs-11x table | "$159 mensuel / $199 annuel / Savings 25 %" ← **math fausse** ($159 − 25 % = $119, pas $199) |

→ Leur pricing a évolué récemment et le blog n'a pas suivi. **Un acheteur diligent remarquera** et utilisera ça en négo. Bon nous : toujours imprimer la page pricing + la confronter aux blogs dans la doc produit des SDRs.

### 2.4 Comparaison prix réels (revendiqués par eux-mêmes)

| Produit | Entry | Unit |
|---|---:|---|
| Apollo.io | Free → $59/mo basic → $99/mo pro | per user |
| ZoomInfo | $15 000–$20 000/an SMB, $50k–$100k enterprise | annual contract opaque |
| Outreach | ~$100–160/mo | per user |
| Instantly | $30–$77/mo | per user |
| Clay | $149 → $349 → $800/mo | per workspace |
| Unify | $1 740/mo | per workspace |
| **FuseAI Launch** | **$119 annuel** | per workspace (1 seat Launch → Unlimited Scale) |

### 2.5 Monétisation implicite

- Free tier = 2 000 cr/mo → 400 emails OU 100 basic enrichments OU 40 waterfall emails. **Trop faible** pour un SDR actif (un SDR fait 50-100 emails/jour = 1 000-2 000/mois). Free = évaluation seulement, pas usage réel.
- Launch 12 000 emails/mois = ~400/jour = 1 SDR sérieux. Cohérent avec "founders / solo SDR".
- Scale 40 000 emails/mois = 4-5 SDRs actifs. À $399, c'est $80/rep. Aggressif vs Outreach.
- **Copilot** a un boost de ROI modeste (500k cr pour $799 vs 200k pour $399) → le tier $399→$799 vend surtout du service (managed onboarding, priority Slack, managed email infra, fractional GTM engineer mentionné dans vs-Apollo). Classique "value → service" upsell.

---

## 3. Waterfall enrichment — les "20+ providers"

### 3.1 Claim officiel

"Plug into a global database across **20+ different providers** of **800M+ contacts** with 100% verified email and phone data" (/product/prospect).

### 3.2 Providers identifiés ou suggérés

**Non nommés explicitement sur le site** — c'est la norme dans le secteur. Le waterfall habituel dans l'industrie inclut : Apollo, ZoomInfo (difficile vu leur positionnement), People Data Labs, FullContact, Lusha, Cognism, Hunter, Snov, RocketReach, Clearbit, Kaspr, Datagma, LeadMagic, Contactout, DropContact, Findymail, Bouncer, Zerobounce, Neverbounce, Debounce, Million Verifier. Aucune liste publique chez Fuse.

### 3.3 UX transparence

Aucune indication que l'utilisateur voit **quel provider** a fourni chaque donnée. Champs dans l'API response (`/api/v1/bulk_enrichment/:id`) :
```
emails: [{ email, status }], phones: [{ phoneNumber, status }], 
primaryEmail, primaryPhone, lastPhoneEnrichment, lastEmailEnrichment
```
→ Pas de `source` / `provider` field exposé. Black box → l'utilisateur fait confiance au "100% guarantee or don't pay".

### 3.4 Guarantee

Claim : "100% accuracy guarantee with our data, or you don't pay for the results provided" (/product/prospect).

→ Cohérent avec le modèle à crédits : sur un email marqué "invalid" ou "catch-all", Fuse ne débite (probablement) pas les crédits. Pas de détail public sur le mécanisme de credit-back.

### 3.5 Signal concret : la qualité réelle

L'un de leurs endpoints API de démo montre :
```json
"emails": [{"email":"test@test.com","status":"catch-all"}]
```
`catch-all` = un domaine qui accepte tout mail mais ne garantit pas la livraison → statut intermédiaire. Présent dans leurs response samples = leur waterfall produit du catch-all (pas 100% valid). Important pour la délivrabilité.

---

## 4. Signals & Intent Data

### 4.1 Catégories de signaux revendiquées

- **Website visitor identification** — person-level ET company-level via "best-in-class IP and cookie based tracking" — "up to 30% visitor visibility" (/product/signals)
- **Job change alerts** avec identity resolution + waterfall enrichment
- **Funding rounds** (implicite via "external signals from ICPs : funding, job posting, news")
- **Hiring signals** (job postings)
- **Technographics** (évoqué en comparatif Artisan, pas central)
- **News mentions**
- **"Real-time event data to connect at perfect timing"**

### 4.2 Credit model

Signal Monitoring Agent = **100 cr/action** → coût le plus élevé après phone enrichment. Launch = 600 agents/mois, Scale = 2 000. Un "agent" = probablement une config de monitoring persistante, pas un signal individuel.

### 4.3 Surfaces produit

- **Real-time Slack alerts** (explicite dans /product/signals)
- Integration directe avec le produit Engage (convertir signal → séquence)
- Feed dans l'app (supposé — pas accessible sans compte)
- Pas de lead scoring explicite dans le marketing. Comparatifs disent "AI-driven lead scoring" mais aucune capture d'écran produit ne le démontre.

### 4.4 Cadre positionnement

Leur blog "Why the initial AI SDR wave fell flat" pose les **3 problèmes qui ont tué 11x/Artisan** :
1. "Couldn't tell who actually wanted to buy" (no intent)
2. "Used poor B2B data"
3. "Emails went to spam"

→ Les Signals = leur réponse au problème #1, le waterfall = réponse au #2. Le #3 reste le trou manifest : leur sending-policy public est vague, aucun pilier produit "warmup / deliverability" nommément. Contradiction avec leur propre diagnostic.

---

## 5. Séquences & Outreach

### 5.1 Canaux supportés

- **Email** (automation, warmup, inbox unifié)
- **LinkedIn** (automation, messages)
- **Power Dialer** (parallel dialing à partir de Scale = "Multi-line parallel phone dialer with unlimited connected numbers")
- Pas de SMS, pas de WhatsApp (absents), pas de Twitter/X DM

### 5.2 Personnalisation AI

Copy (/product/engage) :
> "AI crafts every email and LinkedIn message in your unique style… Our AI learns from every single touchpoint you make with customers, making it indistinguishable from manual messages."

Pas de mécanisme public de fine-tuning visible (pas de "training mode", pas de "style template", pas de "voice import"). Probablement un system prompt qui intègre historique de l'utilisateur.

### 5.3 A/B testing

**Non mentionné publiquement** comme feature explicite. Absence notable.

### 5.4 Infrastructure delivrabilité

**À partir de Copilot ($799)** : "Fully managed email and LinkedIn infrastructure setup". Sur Launch/Scale, rien de managé — l'utilisateur doit apporter son domain/inbox ou acheter via la plateforme (FAQ #7 : "purchase new domains and email inboxes with Microsoft / Google infrastructure").

**Sending policy** publiée (/legal/sending-policy) mentionne :
- Opt-out link obligatoire
- Compliance CAN-SPAM
- Domains ≥ 1 mois avec registrar transparent
- Interdictions : gambling, adult, weapons, drugs

**Ne mentionne PAS** : warmup protocol, daily sending limits, LinkedIn connection limits. Flou volontaire.

### 5.5 90-day performance guarantee (ToS)

> "Continued free access if customers don't achieve **five qualified responses** after meeting strict activity thresholds (**10 000+ messages, 1 000+ calls**, maintained deliverability standards)"

Lecture : **extrêmement haut bar** (10K emails + 1K calls pour être éligible au remboursement). Protège Fuse plus que l'utilisateur. Mais sert au marketing → bon pattern.

### 5.6 Inbox unifié

"All-in-one Inbox That Manages Itself" — AI priorise, organise, **répond aux inbound**. "Achieve inbox 0". Pas de capture d'écran publique.

---

## 6. CRM & Pipeline

### 6.1 CRM intégré ?

**Pas de CRM natif complet**. Le module `/product/manage` parle de "sync to your CRM for pipeline visibility" — c'est une **sync layer**, pas un CRM.

### 6.2 CRM supportés en sync

- Salesforce (mentionné partout)
- HubSpot
- Attio (intéressant, ils nomment Attio — signal qu'ils targetent la cible GTM-native)
- Pipedrive
- Zoho
- Snowflake, Redshift, BigQuery (pour exports data warehouse → Scale+ seulement)
- Slack (alerts)

### 6.3 Limites

- Pas de pipeline view native exposée
- "AI Native CRM for Deal Tracking" mentionné sur /product/manage mais **copy générique** ("AI-powered insights help track deal progress"). Zero capture produit.
- Déduplication : non adressée publiquement.

→ **Inférence** : Fuse pousse le data vers un CRM externe et laisse le client gérer son pipeline là-bas. Pas une replacement de Salesforce/HubSpot. Contradit leur copy "replace 5+ tools".

---

## 7. API publique

### 7.1 Base

- `https://api.tryfuse.ai`
- **Basic Auth** (pas OAuth, pas API key native — unusual)
- Rate limits : **50 POST/min, 2 000/day** (explicite)
- Gated à partir de Launch ($159/mo)

### 7.2 Endpoints documentés

| Méthode | Path | Usage |
|---|---|---|
| GET | `/api/v1/bulk_enrichment` | List bulk enrichment lists |
| GET | `/api/v1/bulk_enrichment/:id` | Retrieve one bulk list |
| POST | `/api/v1/bulk_enrichment` | Trigger bulk enrichment (max 100 inputs) |
| GET | `/api/v1/email_validation` | List validations |
| GET | `/api/v1/email_validation/:id` | One validation |
| POST | `/api/v1/email_validation` | Trigger email validation |

**enrichType** : `all`, `email`, `phone`.
**Inputs** : LinkedIn URL **OU** `{name, company, location}` tuple.
**Async** : "estimated waiting time: 3 minutes" pour enrichment.

### 7.3 Évaluation PM

- **Surface minime** — uniquement enrichment + validation. Pas d'endpoints exposés pour : lists, sequences, signals, contacts CRUD, inbox, call logs. L'API est un **produit d'enrichment, pas une API plateforme**.
- **Basic Auth** = friction pour intégrations modernes (tout le monde attend OAuth 2.0 ou API keys). Décision bizarre.
- **2 000 POST/jour** = plafond bas. Un use case "enrich toute ma DB de 100K contacts" nécessite 50 jours.
- Schema MongoDB-ish = leur modèle interne est exposé tel quel (IDs ObjectId) → facilité implémentation mais peu robuste en termes de versioning.

---

## 8. GTM & positionnement

### 8.1 Messaging principal

- Hero homepage : "**Superpower your outbound sales team**"
- Sous-titre : "The first sales platform where reps work alongside AI agents"
- Manifesto headline : "Building the Future of AI + Sales"
- Slogan répété : "Built to Make you Extraordinarily Productive"

### 8.2 Narratif

3 adversaires désignés :
1. **Legacy Salesforce/ZoomInfo** → "path dependence trap", "90 % of users find difficulty with engaging daily"
2. **AI-SDR v1 (11x, Artisan)** → "fell flat, lost 70-80 % customers within months", "shallow personalization"
3. **GTM agencies (Bettercontact style)** → "$5,000+/mo to manage legacy tools", "you don't own your infrastructure"

Position : **"Sales Super Intelligence"** = domain-specific AI + Customer Knowledge Graph + agentic workflows. Objectif "$5M/rep vs $1M/rep".

### 8.3 Social proof

- **YC W25** backing (badge news bar)
- Testimonials : Rob Thayer (Blackfin Square Group, Managed Telecom), Arman (Vetnio CEO, veterinarian SaaS), Adam Cohen (Weave CEO, dev tools)
- Stats affichées : 1 000 %+ ROI, 90 %+ accuracy, 90 % manual work eliminated
- **Aucun logo client** sur la homepage (pas de bandeau "Used by [big logos]") — faiblesse pour un YC post-seed.
- Pas de case study détaillé ; testimonials = 1 phrase.

### 8.4 Content strategy

- **18 pages `vs-*`** (vs Apollo, ZoomInfo, Outreach, Clay, Instantly, Lemlist, 11x, Artisan, Unify, Seamless, LeadIQ, BetterContact, Exa, RB2B, Sera, Vector, Full Enrich, Heyreach, 6sense, Salesloft, AI SDR generic)
- **Top-10 SEO articles** : "Top 10 YC sales platforms 2026", "Top 10 AI power dialers 2026", "Top 10 LinkedIn automation tools 2026", "10 best B2B data enrichment platforms 2026" — SEO tactical, se posent dans chaque liste.
- **Narrative blog** : "Sales superintelligence and the customer knowledge graph", "Why the initial AI SDR wave fell flat", "AI sales automation the new model for sales orgs" → thought leadership
- **Tactical blog** : "Cold email that gets replies", "The 30-second cold call script", "Pipeline stages", "North star metrics" → bas de funnel SEO, intent haute
- Rythme : ~3-5 posts/mois inféré des dates (articles datés Jan 2026, March 2026)

**Qualité content** : 
- Articles vs-* ont des tableaux de comparaison mais utilisent souvent du remplissage LLM ("AI-driven", "modern", "next-gen") — signe de génération automatisée.
- Quelques inconsistances factuelles (pricing tables contradictoires entre articles).
- Narrative pieces (sales-superintelligence) sont plus travaillés, clairement écrits par un humain/fondateur.

### 8.5 Founder-led narrative

Bio de Saurav Bubber injectée dans l'article vs-Artisan :
> "Co-founder Saurav Bubber was on the RevOps team at Deel as they scaled from $50M to $600M+ in less than three years. He experienced the challenges of building complex workflows with fragmented sales tools first-hand"

→ Leur "origin story" = RevOps pain at Deel hypergrowth. Credibility play pour les founder-led sales teams.

---

## 9. Forces (5-7 éléments notables)

| # | Force | Structurel / exécutionnel | Effort de rattrapage | Note |
|---|---|---|---|---|
| 1 | **Pricing à crédits unifiés** | Structurel (modèle économique) | Moyen (design pricing + metering) | Change la façon dont l'utilisateur raisonne : il optimise son mix data/outreach/signaux au lieu de comparer features siège-par-siège |
| 2 | **18 pages `vs-competitor`** | Exécutionnel (content SEO) | Faible–moyen (4-6 semaines) | Occupation terrain massif sur la query "[their-competitor] alternative" |
| 3 | **Achat de domaines + inboxes intégré** (FAQ #7) | Exécutionnel (intégration Google/MS) | Moyen (partenariat + reseller) | Réduit 80 % du time-to-first-send — énorme pour founder-led |
| 4 | **Contact-level visitor identification** (pas juste company) | Semi-structurel (data partnership + identity graph) | Élevé (RB2B, Retention rely on RB2B / IP-to-person providers) | Nécessite partenariat data layer |
| 5 | **90-day performance guarantee dans le ToS** | Exécutionnel (positionnement + légal) | Faible (juste l'écrire) | Reduction d'anxiété achat forte ; bar d'activation (10K+ msgs, 1K+ calls) les protège |
| 6 | **Chrome extension Sales Navigator scraper** | Semi-structurel (anti-LinkedIn cat-and-mouse) | Moyen–élevé (LinkedIn anti-scrape évolue) | Feature table-stakes AI-SDR ; si on veut parité, prioriser |
| 7 | **Stack "tout-en-un" apparent** avec narrative "remplace 5+ tools" | Exécutionnel (packaging) | Moyen | Le contenu produit est plus light que le marketing suggère, mais le **packaging + story** ont une résonance forte chez founder-led |

---

## 10. Faiblesses & angles morts

### 10.1 Signaux de fragilité visibles sur le site public

- **Product Impact metrics en `0 %` / `0h+` / `0x`** sur **toutes** les pages produit (prospect, engage, signals). Placeholder oublié ou chiffres non validés. Un acheteur sérieux qui zoom voit ça comme **preuve d'immaturité**.
- **`/directory` et `/solutions` listés en nav/footer mais 404**. Nav menteuse.
- **Copy recyclé mot pour mot** sur `/product/fuse-agent` (paragraphes clonés de Signals et Prospect). La "Fuse Agent" story n'est pas construite.
- **Pricing page vs 5+ blog posts : contradictions numériques** sur crédits + seats. Incohérence pub/internal.
- **`/product/manage` caché** (pas de lien depuis la nav). Feature non finie.

### 10.2 Gaps produit (promesses vs. réalité inférable)

- **Pas de CRM natif complet** : ils parlent de "consolidated platform" et "replace 5+ tools" mais le pipeline/deal management est une sync vers Salesforce/HubSpot/Attio, pas une vue native robuste.
- **Pas de conversation intelligence / call recording / coaching native** → concédé dans vs-11x ("11x's strength : Conversation Intelligence… we don't have this").
- **Pas de warmup / deliverability comme pilier** : leur propre manifeste l'identifie comme problème #3 des AI-SDR v1, mais ils ne l'offrent **qu'en Copilot ($799)**. Ask d'un founder-led au tier Launch : "quid de ma délivrabilité ?" → réponse vague.
- **Pas de marketing / ABM / paid media** → self-admit dans vs-Clay.
- **Pas d'OAuth au signup** → friction sur un segment "founder-led Google Workspace users".
- **Email verification status renvoie `catch-all`** dans leur propre doc API → donc leur waterfall produit des adresses ambigües, pas 100 % validées comme ils le claim.
- **SalesGPT = copilot générique**. Pas de démo publique de ce que fait ce chat. Probablement un GPT-4/Claude wrapper avec outils internes, sans différenciation structurelle visible.

### 10.3 Défauts narratifs

- **"Sales super intelligence" + "Customer Knowledge Graph"** = storytelling fort, mais **aucune démo produit** publique de ce que c'est concrètement. Risque : les acheteurs sophistiqués voient ça comme du vaporware.
- **Claim "1 000 %+ ROI"** sans détail — impossible à valider, contre-productif auprès de RevOps seniors.

---

## 11. Méthodologie & patterns à adopter

### 11.1 UX / produit
- **Crédits unifiés** avec cap mensuel clair par action : transparence + liberté de mix. À étudier pour notre propre pricing.
- **Inbox unifié "managed by AI"** : clair bénéfice (inbox 0, AI priorise, AI répond). Concept à assimiler, pas forcément à dupliquer.
- **Chrome extension** pour enrichment en-context : standard AI-SDR, à prévoir.

### 11.2 Pricing / packaging
- **Free tier à credits bas (2K)** = lead magnet, pas usage réel. Guide l'utilisateur vers Launch en 1-2 semaines.
- **Annual −25 % (vs 15-20 % standard)** = maximise lock-in early.
- **Seats unlimited dès Scale** = anti-incumbent differentiator puissant.
- **90-day performance guarantee** conditionnelle à activité haute = réduction d'anxiété achat + protection côté vendeur.

### 11.3 GTM / distribution
- **18 `vs-*` + 10-best-of SEO articles** = content machine pour top-of-funnel. Générés semi-automatiquement (on voit la signature LLM dans les tableaux). À répliquer mais avec plus de soin humain pour éviter les contradictions internes.
- **Positioning à 3 adversaires** (legacy / AI-SDR v1 / agencies) = cadre clair qui aide le prospect à se situer. Nous pouvons en faire un similaire (chat-first / schema-less memory / zero manual entry vs. classic CRM vs. AI SDR v1 vs. spreadsheets).
- **Founder origin story** (Saurav at Deel) répétée dans plusieurs articles = credibility play.
- **Manifesto dédié** (/manifesto) = page visitée par prospects sérieux et journalists/VC. On devrait en avoir une.

---

## 12. Recommandations priorisées

### Critères : Impact (sur notre produit), Effort (build), Urgence (table-stakes market)

| # | Élément à capter / considérer | Impact | Effort | Urgence | Priorité |
|---|---|---|---|---|---|
| R1 | **Crédits unifiés** comme modèle de pricing | 🟢 élevé | 🟡 moyen | 🟡 moyen | **P0** — étudier pour notre pricing V2 |
| R2 | **Taxonomie 3-adversaires** (legacy / AI-SDR v1 / agencies / ... + nous) dans nos docs GTM | 🟢 élevé | 🟢 faible | 🟢 élevé | **P0** — à poser cette semaine |
| R3 | **90-day performance guarantee** conditionnelle (activité → refund/extend) | 🟡 moyen | 🟢 faible | 🟡 moyen | **P0** — pur copy + légal |
| R4 | **Library `vs-competitor` SEO** (vs FuseAI, vs Apollo, vs Clay, vs 11x, vs Outreach...) | 🟢 élevé (T6M) | 🟡 moyen | 🟢 élevé | **P1** — sprint dédié |
| R5 | **Cadre "3 problems that killed AI-SDR v1"** (intent, data, deliverability) repris dans notre manifesto, puis marked où on est meilleur | 🟢 élevé | 🟢 faible | 🟡 moyen | **P1** — article de blog + keynote |
| R6 | **Contact-level visitor ID** (RB2B-style) comme feature wedge | 🟡 moyen | 🔴 élevé (data partnership) | 🟡 moyen | **P2** — après chat univ / memory |
| R7 | **Chrome extension** enrichment on any website / LinkedIn | 🟡 moyen | 🟡 moyen | 🟡 moyen | **P2** — si on sérialise SDR ICP |
| R8 | **Achat de domaines + inboxes intégré** (reseller Google/MS) | 🟡 moyen | 🔴 élevé (partenariats) | 🟢 faible aujourd'hui | **P3** — nice-to-have, pas urgent |
| R9 | **Conversation intelligence / call recording** (gap qu'ils concèdent vs 11x) | 🟢 élevé | 🔴 élevé (STT + LLM pipeline) | 🟡 moyen | **P2** — notre memory-graph s'y prête |
| R10 | Ne **pas** copier leur architecture "suite intégrée" | — | — | — | **Anti-recommandation** : notre wedge chat-natif + memory schema-less est exactement l'opposé et mieux positionné |

### Ce qu'on ne doit PAS imiter

- **Leur copy LLM-généré avec chiffres vides** (`0 %` Product Impact). Nos chiffres doivent être mesurés ou absents.
- **Les contradictions pricing** blog ↔ page publique. Source unique de vérité pour le pricing.
- **Le "Fuse Agent" vague** ("complete any task imaginable") sans démo concrete. Notre chat doit avoir des démos très précises et vidéo.
- **L'absence d'OAuth au signup**. On met Google + Microsoft dès le lancement.
- **La stack "suite" qui remplace 5 outils** — c'est le pitch d'incumbent. Notre thèse = "remplacer le CRM manuel par du chat + memory", pas "suite all-in-one".

---

## 13bis. Findings in-product (post-signup, Free tier)

_Compte créé 2026-04-15 : `fuse-signup@elevay.dev` / Free 2 000 crédits / workspace "Elevay"._

### 13bis.1 Onboarding flow (4 steps)

1. **Welcome** — "Are you ready to 10x your sales productivity?" + Get Started
2. **Name** — "What would you like to be called?" (pre-fill full name, editable)
3. **Plan selection** — Free / Launch / Scale / Copilot avec toggle Yearly (−25 %) / Monthly, **cards Annual affichent 12× crédits** (24K Free annuel, 720K Launch, etc.) — présentation qui suggère que l'annual = usage upfront non mensuel
4. **First steps** (4 sous-étapes dans sidebar) :
   - Select your plan (cochée auto après #3)
   - Create Company (Company Name, Website, Competitors, Members table — **Competitor URL requis pour save**, 422 backend sinon)
   - Integrations (listées plus bas)
   - Power Ups (JS tracking script setup, optionnel)

Pas d'OAuth au signup (email + password seulement), reCAPTCHA Google. Email verif code = **alphanumérique 6 caractères (FDCAE3)** malgré UI qui dit "6-digit code". Email sent from `no-reply@tryfuse.ai`, arrive en **~5-10 min**, Zoho auto-classe dans folder "Notification" (pas INBOX, pas Spam). Le tool `check-email.js` existant ne scanne que INBOX → **gap à fixer** pour le futur.

### 13bis.2 Navigation réelle (post-login)

```
Elevay (workspace)
├─ General
│  ├─ SalesGPT (Beta)                /               ← default landing
│  ├─ Smart Actions                  /signals/feed
│  └─ Insights                       /insights
├─ Signals
│  ├─ Agents                         /signals/agents
│  └─ Website Intent                 /signals/website-intent
├─ Prospect
│  ├─ Prospect Search                /prospects/search
│  └─ Prospect Lists                 /prospects/lists
└─ Engage
   ├─ Campaigns                      /engage/sequences  ← UI/URL mismatch
   ├─ Inbox                          /engage/inbox
   └─ Power Dialer                   /engage/power-dialer
```

**10 pages app**. UI label "Campaigns" → URL `/engage/sequences` (internal name = sequences, consumer-friendly rename).

### 13bis.3 SalesGPT (le chat, leur wedge)

- **Default landing page** post-login. Chat-first UX.
- 5 suggested prompts : Find Prospects / Create Prospect List / Research Market / Build Campaign / Enrich List.
- **Test** : "Find 50 SaaS companies in France with 10-50 employees" → "Thought for 31s" → auto-created list "SaaS Companies in France (10-50 Employees)" → 55 records générés en **arrière-plan async** ("may take a few minutes to finish, please check back shortly")
- Auto-nomme le chat dans l'historique : "French SaaS Compa..."
- Ne pose pas de question de clarification, pas de preview de filtres, pas de "voulez-vous que je…" — direct action.

**Qualité du résultat** (liste Araïko/Furious Squad/Webmecanik/Appvizer/Lanteas/Ideta/Alcmeon/Skezi/Kizeo/Wisembly/Screeb/Abraxio/Qualineo/Truckonline/Pricemoov/Sidely/Aimaira/Juriactes/Elevo/Staff&Go… = 20 sur page 1 / 55 total) :
- ✅ Couverture français décente, industries cohérentes (Computer Software dominant)
- ❌ **Data quality bugs** : Juriactes a **1 employé** (fails 10-50 filter) but "Match" ✓✓✓. Wisembly.com a **Industry/Country/Headcount vides** but "Match" ✓✓✓. Kizeo + Pricemoov ont **51 employés** (above range) but "Match"
- **Match column pattern** : les filtres sont **reifiés comme colonnes** (une colonne par critère avec badge "Match"/"No Match"). UX élégante — l'user voit WHY chaque société est dans la liste.
- Uniformité suspecte : **majorité à 11 employés** — soit les données sont stale soit le filter est biaisé vers le bas du range.

### 13bis.4 Architecture data révélée in-app

**Objets first-class** (via UI Settings + endpoints observés) :
- **Knowledge Hub** (parent) → contient N **Knowledge Profiles** (children)
  - Schema Profile : name + **Website URLs** (yours) + **Competitor URLs**
  - = leur implémentation du "Customer Knowledge Graph" marketing. **Bien plus simple** que le copy suggère ("digital twins of customer archetypes"). En pratique c'est un **scraping config pour URLs**.
- **ICP** (saved filter)
  - Schema : title + filters People (Job Title, Job Level, Person Industry, People Location) + filters Company (truncated in modal, ≥4 fields)
  - = config réutilisable pour Prospect Search / Agents
- **Prospect List** (2 types: People vs Companies)
  - **Gap data model** : SalesGPT a créé une *Company list* — le campaign builder ne montre que *People lists* → "No lists found". Pour lancer une campagne, il faut convertir.
- **Campaign** (type AI Personalized / Manual / From Template)
- **Agent** (Signals, 3 types: People / Company / Event)
  - **12 templates Event** : Job Opening w/ Keyword • Job Opening w/ Location • First Person Hired in Dept • First Person Hired Internationally • Employee Location in Two Countries • Person Discovery via Filters • Company Headcount Increased • Company Dept Headcount in Range • Company Headcount Growth • Someone Starts New Job • New Funding • LinkedIn Post w/ Keyword
  - **Classement** : 9/12 hiring/headcount, 1 job change, 1 funding, 1 LinkedIn post. **Absents** : technographics, G2/intent third-party, news/PR, M&A, layoffs, product launches
- **Credits** (1 unified currency, consumed per action)
- **Mailbox** (purchased domains + inboxes via Google/Microsoft)
- **Dialer phone numbers** (via Plivo)

### 13bis.5 Campaign builder (AI Personalized, step 1/2)

- Required : Campaign Name, **Channel** (Email / LinkedIn / Email+LinkedIn only), List of Leads, Start Date, Timezone (default America/Denver), **Appointment Link (Cal.com placeholder = saurav-bubber's own link**), Send-only-on-business-days toggle
- **No Phone/Dialer channel in sequence** — Power Dialer est un outil séparé driven by campaigns d'une autre façon
- Pas de SMS / WhatsApp / Ads

### 13bis.6 Insights (analytics)

- Tabs : **Campaigns / Website Intent / Power Dialer**
- Filtres : Email / LinkedIn / Dialer + Campaign + User + Time range
- **KPIs Campaigns** : Total Sent / Opened (rate) / Replies (rate) / Clicks / Bounced / **Positive Replies** (AI sentiment) / **Manual Sent vs AI Sent** (attribution tracking)
- **Performance Funnel** : Sent → Opened → Clicked → Replied (drop-off viz)
- Point notable : ils trackent séparément **AI-generated vs human-edited** messages — metric rare, utile pour mesurer l'adoption AI interne

### 13bis.7 Inbox (agent email manager)

- Tabs Email / LinkedIn
- Sub-filter Campaigns : **"Auto Replies"** (with count) = réponses AI-générées tracées comme une campagne virtuelle
- Views : Inbox / Sent / Unread / Archived / Spam / Trash

### 13bis.8 Intégrations (depuis Settings + onboarding)

**Inbox** : Gmail, Outlook (2)
**CRM** : HubSpot, Salesforce, Zoho CRM, Attio, Pipedrive (5)
**Social** : LinkedIn, Slack (2)
**Cachés (revealed via API calls)** : **Zapier** (`/api/v1/integrations/zapier/settings`), probablement via API key

**Absents** : Snowflake, Redshift, BigQuery (mentionnés dans blog vs-Clay mais **pas dans UI Free tier**) — probablement Enterprise-only

### 13bis.9 Pricing contradictions **confirmées in-app**

Comparaison **page publique /pricing** vs **page interne /select-plan** :

| Action | Public | Interne | Delta |
|---|---:|---:|---|
| AI Email Messages | 5 cr | **10 cr** | **2×** |
| AI LinkedIn Messages | 5 cr | **10 cr** | **2×** |
| Person & Company Website Visitors | 5 cr | **10 cr** | **2×** |
| Basic Email Enrichment | 20 | 20 | = |
| Waterfall Email | 50 | 50 | = |
| Waterfall Phone | 200 | 200 | = |
| Contact Save/Search | 2 | 2 | = |
| Signal Monitoring Agents | 100 | 100 | = |
| SalesGPT Research | 10 | 10 | = |
| Power Dialer | 10/min | 10/min | = |

→ **Messages et visitors 2× plus chers à l'intérieur**. Un user Launch qui budgétise via la page publique (60k cr → 12K emails) n'obtient en réalité que 6K emails. **Haircut caché de 50 %** sur les actions haute-fréquence. **Finding majeur** — à mettre en avant dans tout deck de positionnement.

Par ailleurs **annual cards affichent 12× crédits** (720k Launch annuel). Si ça reflète vraiment la contrainte d'usage, un user qui déplace sa consommation vers la fin de l'année peut fire-and-forget. Si c'est juste une présentation, l'user doit savoir que le vrai cap est mensuel.

### 13bis.10 Stack technique (révélée via CSP allowlist + network requests)

- **Frontend** : Next.js App Router + React Server Components (`_rsc=viple` payloads)
- **Deploy** : Vercel (`vercel.live`)
- **Auth** : **AWS Cognito** (`cognito-idp.us-east-1.amazonaws.com`)
- **Payments** : Stripe
- **Analytics** : PostHog + feature flags
- **Errors** : Sentry (self-hosted proxy)
- **In-app notifications** : **Knock** (`api.knock.app`)
- **Voice/telephony** : **Plivo** (`cdn.plivo.com`) — c'est eux qui alimentent le Power Dialer
- **Storage** : AWS S3 us-east-1, bucket `kompass-ai-public-bucket`
- **Captcha** : Google reCAPTCHA v2
- **Tried to load** : Meta Pixel (`facebook.net/fbevents.js`) → bloqué par leur propre CSP. Signe d'un tracking growth en cours de setup.

**Backend microservices** (4 révélés) :
- `core.backend.tryfuse.ai` — analytics, mailbox, billing, integrations, dialer, credits, api_keys
- `agents.backend.tryfuse.ai` — knowledge-hubs, profiles
- `webtraffic.backend.tryfuse.ai` — ingestion, ip-data, tag-script, icp-filters
- `linkedin.backend.tryfuse.ai` — auth

**Internal code name = "Kompass AI"** (bucket S3, commentaire dans UI). Pivot de KompassAI → FuseAI probablement récent (cohérent avec KompassAI présent comme "company" dans samples API docs publics).

### 13bis.11 Patterns concrets à retenir pour nous (mise à jour reco)

Nouveaux éléments à ajouter aux reco du §12 :

| Nouvelle reco | Source observation | Priorité |
|---|---|---|
| **R11** : Chat = default landing page post-onboarding (pas un dashboard tabulaire) | SalesGPT est le `/` app route chez eux, exactement ce qu'on vise | **P0** — cohérent avec notre thèse chat-first |
| **R12** : Afficher les filtres comme **colonnes avec "Match" badges** dans les résultats de recherche | Élégance UX observée sur Prospect Lists | **P1** |
| **R13** : Track **"AI-generated vs human-edited"** messages dans analytics | Metric unique chez Fuse, différenciateur "adoption AI" | **P1** |
| **R14** : "Competitor URLs" collectés en onboarding (data training) | Fuse le fait en step 2 du wizard, requis pour save | **P2** — nous collectons déjà via LinkedIn parsing, mais on pourrait rendre ça explicite |
| **R15** : **Ne PAS promettre un "Customer Knowledge Graph"** si l'implémentation est juste du scraping d'URLs — leur gap marketing↔produit est énorme | Leur "Knowledge Profile" = juste URLs + Competitors | **Anti-reco** — rester honnête sur ce qu'on offre |
| **R16** : Async background research avec notification (au lieu de streaming) | "Thought for 31s… check back shortly" pattern | **P1** — libère l'user pour faire autre chose |

### 13bis.11bis Tests approfondis Prospect Search + enrichissement (2ᵉ wave, Free tier)

**Test Smart Search (NL → filters)** — query : `"Heads of Sales at SaaS startups in Paris France with 20 to 100 employees"`

- **4 filtres auto-générés** par le LLM :
  1. People Location : `Paris, Île-de-France, France` ✅
  2. Job Title Keywords : `*head of sales*`, `head of sales`, **`SaaS`** ← mistranslation : "SaaS" injecté comme job keyword au lieu de Company Industry
  3. Department : `Sales` ✅
  4. Actual Employee Range : `1 applied` (probablement 20-100) ✅
- **349 records retournés**, 18 pages. Temps de réponse ~8 s.
- **Parsing NL gratuit** : 2k/2k crédits avant la recherche, 2k/2k après. Smart Search n'est pas facturé.

**Qualité des 20 premiers résultats** (p.1/18) :
- ✅ Noms réels de personnes (Milan Sordet, Guillaume Laurent, Géraldine Prot, Hubert Bigeard, Karim Berdaoui, Eric Didier, Virgile Mercier, Malcolm Rebourg…)
- ✅ Companies reconnues de la scène Paris : **Memo Bank, Prelude, Surfe, Livestorm, Furious Squad, Keewe, Episto, Jimini AI, Diffly, Wing**
- ❌ **Industry tagging faux** :
  - **Livestorm** tagué `Computer Hardware` (pure SaaS webinar)
  - **Jimini AI** tagué `Computer Hardware` (legal AI, SaaS)
  - **Furious Squad** tagué `Renewables & Environment` (project mgmt SaaS)
  - **Heschung** tagué `Luxury Goods & Jewelry` (fabricant de chaussures) → apparait dans résultats SaaS = filter trop lâche
  - **Native Union** tagué `Health, Wellness` (accessoires tech)
  - **Sporty & Rich** `Apparel & Fashion`
- **Précision sur critère "SaaS"** : ~7/20 réellement SaaS (35 %). Le reste = companies non-SaaS qui matchent juste sur "Head Of Sales" et "Paris"
- **Root cause** : le Smart Search a placé "SaaS" dans Job Title Keywords (un contact avec "SaaS" dans son titre) au lieu de Company Industry — donc le filtre SaaS n'est pas actif sur les companies. Confirme la faiblesse du NL→filter mapping.

**Test enrichment waterfall** — click sur bouton "Enrich" pour email de Milan Sordet (Episto) :

| Métrique | Valeur |
|---|---|
| Email retourné | `milan.sordet@episto.fr` ✅ format corporate FR cohérent |
| Latence | ~6 s (synchrone côté UX) |
| Crédits consommés | **50** (2000 → 1950 affichés "2k / 2k" → "1.9k / 2k") |
| Cohérence avec pricing page publique | ✅ Waterfall email = 50 cr annoncés publiquement |
| Phone nécessite enrich séparé | ✅ Bouton Email et Phone distincts — chacun consomme ses credits (50 cr vs 200 cr) |

→ **Pour un SDR Free tier : 2 000 crédits = max 40 emails waterfall** (ou 10 phones). C'est vraiment juste un "trial". Un SDR actif doit passer Launch immédiatement.

**Autres observations**
- Résultats toolbar dévoile un bouton **"Run Automation"** non documenté ailleurs — lance probablement une séquence sur les 349 records direct depuis la Search (skip la Prospect List intermediate). À creuser.
- Row **pas cliquable** pour detail panel Fuse → seul le click nom ou icône LinkedIn ouvre un tab externe vers LinkedIn. **Gap UX** vs Apollo/Clay qui ont un right-panel détail.
- Colonnes Search Results : Name / Job Title / Company / Email / Phone Number / Location / Person Industry. Pas de seniority, pas de start date, pas de department visible ici (contrairement à la Prospect List view du §13bis).
- "SaaS" dans Smart Search injecté comme keyword → un contact ayant `Head Of Sales SaaS EMEA` dans son titre serait privilégié. Ça explique pourquoi on voit des titres bizarres comme "Head Of Sales (global)".

### 13bis.12 Découvertes critiques à souligner

1. **La "Customer Knowledge Graph" de Fuse = URLs scraping** — très loin du marketing
2. **"Fuse Agent" page marketing = copy clone des autres pages** (product/signals et product/prospect) — la feature "agentic" n'est pas produitisée distinctement ; in-app c'est SalesGPT + les 12 agents templates, rien d'"agentic" au sens autonome (pas d'AutoGPT-like)
3. **Pricing visible à l'intérieur ≠ page publique** sur email/LinkedIn/visitors (×2 hidden haircut)
4. **Data model silo** : lists company vs people ne communiquent pas avec campaign builder
5. **Signals = hiring tracker essentiellement** (9/12 templates), pas un vrai intent engine multi-sources
6. **Pas d'OAuth signup** reste une friction premier contact
7. **Stack construit sur AWS Cognito + Plivo + Knock** → backend ops simple, peu de custom infra ; ils livrent vite mais n'ont pas de moat technique
8. **Pivot KompassAI → FuseAI** suggère un repositioning récent ; la vélocité de leur content SEO (18 vs-* posts) et l'usage libéral d'expressions LLM-générées dans ces articles suggère une team qui pousse fort sur SEO growth
9. **Smart Search NL→filter mistranslation observée live** : "SaaS" injecté comme Job Title Keyword au lieu de Company Industry → 35 % précision sur le critère SaaS dans les 20 premiers résultats. Leur translator LLM n'est pas schema-aware du côté Company taxonomy.
10. **Industry tagging DB faible** : Livestorm tagué "Computer Hardware", Jimini AI tagué "Computer Hardware", Furious Squad tagué "Renewables & Environment". Suggère que leur DB achète des industries d'un provider externe sans correction, ou que leur taxonomy est rigide et force un mapping discrète quand le vrai label manque.
11. **Free tier = 40 waterfall emails max** (2 000 cr / 50 cr). Impraticable pour un SDR sérieux. Upgrade Launch obligatoire dès qu'on commence.

---

## 13ter. Reco finales condensées

Top 5 à retenir si on ne garde qu'une liste actionnable :

1. **Chat-first home** (R11) — consolider notre thèse, ne pas dévier vers un dashboard tabulaire par défaut
2. **Pricing à crédits unifiés** (R1) — modèle à étudier pour notre V2, **mais être transparent** (pas de ×2 caché)
3. **"Match" columns** (R12) — technique UX à adopter sur nos résultats de recherche
4. **Library vs-competitor SEO** (R4) — créer ≥10 pages vs-FuseAI, vs-Apollo, vs-Clay, vs-11x… dans les 4 prochaines semaines
5. **3-adversaires framing** (R2) — poser notre propre taxonomie (legacy CRM / AI-SDR v1 / agencies / ... / nous) cette semaine dans nos assets GTM

---

## 13quater. Hygiène post-analyse

- Compte : `fuse-signup@elevay.dev` (Free, renews 2026-05-15), workspace "Elevay" — enregistré dans `_credentials/accounts.json`
- **Pas de dépense** effectuée. Free tier uniquement.
- Si tu veux pousser plus loin (Signals en prod, API en prod, SalesGPT deep research) → passer à Launch à **$119 annuel / $159 mensuel** (Option B du BUDGET.md), attendre confirmation avant achat.

---

## 14. Annexe — inventaire du crawl

| Type | Count |
|---|---:|
| Pages marketing crawlées | 13 (home, pricing, manifesto, api, faq, 5 product, 4 solutions) |
| Pages 404 (listées mais absentes) | 2 (/solutions, /directory) |
| Blog posts analysés en profondeur | 9 (sales-superintelligence, ai-sdr-wave, ai-sales-automation, vs-apollo, vs-clay, vs-zoominfo, vs-outreach, vs-unify, vs-instantly, vs-exa, vs-11x, vs-artisan) |
| Pages légales | 3 (ToS, Privacy, Sending Policy) |
| API endpoints documentés | 6 (2 GET + 1 POST × 2 produits) |
| Screenshots full-page | 40+ (marketing + in-app) |
| HTML bruts archivés | 15+ |
| **In-product screenshots** | 25+ (signup/onboarding/dashboard/settings/sequences/signals/inbox/insights) |
| **Knowledge Hub + ICP schema** | captés via modals |
| **12 Agent templates** | listés verbatim |
| **Pricing interne vs public** | comparaison tableau § 13bis.9 |

Tous les artifacts bruts sont dans `fuse-analysis/{pages,raw,snapshots,screenshots}/`.

**Compte actif** : `fuse-signup@elevay.dev` / Free / workspace Elevay — dispo pour re-test ciblé sans recréer de compte.
