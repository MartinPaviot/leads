# Monaco — Bilan complet, classification 6-étapes, gaps Elevay et plan d'onboarding

**Date** : 2026-05-06
**Auteur** : Synthèse expert produit + lentille philosophique Iliade/Odyssée
**Sources** :
- 5 mois de research accumulée (`_research/teardown-monaco/`, `_reports/monaco-*`, `_research/monaco-team-analysis.md`, `_research/monaco-vs-elevay-mapping.md`)
- Re-extraction live du 2026-05-06 (`teardown-monaco-v3/` — 15 screenshots full-page + 8 fiches de poste verbatim + 13 pages texte/HTML brut)
- Trust Center, Status Page, Subprocessors, Auth0 login
- Vérification croisée code Elevay (28 skills, 116 chat tools, 5 migrations DB additives)

---

## AVANT-PROPOS — POURQUOI LA LENTILLE HOMÈRE

Monaco n'est pas un CRM. C'est une mise en machine de la **methodologie de Sam Blond** (CRO Brex, $0→$1B ARR), encodée dans un produit AI-native. Pour comprendre les choix produit, il faut comprendre que Monaco rejoue à la lettre quatre archétypes de l'épopée homérique :

| Archétype grec | Concept | Chez Monaco | Implication produit |
|---|---|---|---|
| **Mètis** (μῆτις) | Ruse contextuelle d'Ulysse — l'intelligence qui s'adapte au contexte changeant, pas la force brute | "Contextual relevance" — les messages s'adaptent au business context et aux intent signals du prospect | Pas de templates rigides ; des prompts qui se reconfigurent par compte |
| **Kairos** (καιρός) | Le moment opportun, pas le temps mesuré (chronos). Le coup juste à l'instant juste | "Autopilot — Monaco decides who to enroll, when to start, and how to follow up" | L'AI ne lance pas une cadence à blanc : elle attend le signal (funding, hiring, job change) |
| **Mnemosyne** (Μνημοσύνη) | Mère des Muses. Sans mémoire, pas de chant. Sans capture, pas de pipeline | "Capture every interaction" — "Trusted history: what happened, when, who, what changed" | Architecture event-driven, Databricks data warehouse, embedding pipeline |
| **Xenia** (ξενία) | Hospitalité sacrée — l'invité reçu comme un dieu | Forward-Deployed AE — "the AE is like having a sales exec on our team" (Catheryn Li, Simple AI) | Le client n'est jamais seul ; un humain Monaco est embedded |

**La thèse** : Monaco gagne parce qu'il ne combat pas la nature du fondateur (qui veut juste "selling, not logging"), il l'**aligne avec les forces qui marchent depuis 3000 ans** — récit, mémoire, hospitalité, ruse temporelle. Notre écueil avec Elevay : on a copié la mécanique, pas le tellurisme. Ce document corrige.

---

## PARTIE 1 — BILAN COMPLET DE TOUT CE QU'ON A ACCUMULÉ

### 1.1 Identité, équipe, funding

| Champ | Valeur |
|---|---|
| Tagline officielle | *"The first revenue engine for startups"* |
| Sous-titre | *"The AI native platform that replaces legacy CRM and disparate sales point solutions"* |
| Fondation | 2024 (stealth) — Public beta 2026-02-11 |
| HQ | San Francisco, on-site only (5 jours/semaine, zéro remote) |
| Headcount | ~40 personnes |
| Funding | $35M ($10M seed + $25M Series A) |
| Lead investor | Founders Fund (Peter Thiel) |
| Co-investisseurs (logos page Company) | Founders Fund, Human Capital, Greenoaks |
| Angels (publics) | Patrick & John Collison (Stripe), Garry Tan (YC), Neil Mehta (Greenoaks), Peter Thiel, Ryan Petersen (Flexport) |
| Status (2026-05-06) | All Systems Operational — 99.98% uptime web app, 100% public API, 99.59% data processing, 100% email open tracking |
| Compliance | SOC 2 Type 1 (March 16, 2025), Penetration Test, Vanta-monitored |

### 1.2 Les 4 fondateurs (page /company)

1. **Sam Blond** — Co-Founder & CEO. Ex-Founders Fund partner, ex-CRO Brex. Vision, methodology, GTM publique.
2. **Brian Blond** — Co-Founder. Ex-Human Capital partner, ex-MD Sutter Hill, multi-time CRO. Operations / Forward-Deployed AE org.
3. **Malay Desai** — Co-Founder & CTO. Ex-Salesforce VP Product/Eng, ex-Clari SVP Engineering. Architecture AI-native, ML.
4. **Shek Viswanathan** — Co-Founder & CPO. (Note: research précédente indiquait "Abishek Viswanathan ex-CPO Apollo" — la page Company affiche "Shek Viswanathan, Co-Founder & CPO, Ex-CPO Apollo, Qualtrics". C'est la même personne, surnom Shek = Abishek.) Vision produit, AI workflows.

### 1.3 Stack technique — vérité officielle (Trust Center subprocessors)

12 subprocessors déclarés au Trust Center :

| Subprocessor | Catégorie | Usage déclaré | Implication produit |
|---|---|---|---|
| **Amazon Web Services** | Cloud provider | Compute and data plane IaaS | Pas GCP, pas Azure. Tout AWS. |
| **Auth0** | Customer identity | Secure JWT token minting and validation | Login client = Auth0. Pas de SSO custom maison. |
| **Databricks** | Data storage/processing | Analytics data warehouse | **Critique** — c'est le vrai cerveau. Pas Snowflake, pas BigQuery. Databricks = ML-native, supports embedding pipelines + Delta Lake. |
| **Datadog** | Cloud monitoring | All telemetry data | RUM + APM + logs unifiés. Confirme l'observabilité Datadog (cookies vus en analyse réseau précédente). |
| **GitHub** | Version control | `monacoinc` Github org | Code source là, probablement Actions pour CI. |
| **Google Workspace** | Workforce identity | Employee identity and SSO | Equipe interne sur Google. |
| **Linear** | Collaboration | Project management | Linear, pas Jira/Asana. Culture eng moderne. |
| **OpenAI** | Engineering | "Powers a significant portion of our chat experience" | **Confirme OpenAI comme LLM principal**. Anthropic mentionné dans l'AI Engineer JD ("OpenAI, Anthropic, or open-source") mais non listé en subprocessor — soit non utilisé en prod, soit ajouté hors disclosure. |
| **Retool** | Engineering | Internal tools (`retool.corp.monaco.com`) | Dashboards opérationnels internes. Pas de back-office custom. |
| **Slack** | Collaboration | "Internal and customer communication channels" | **Critique** — confirme que les canaux clients passent par Slack. C'est le canal principal du forward-deployed AE. |
| **Tailscale** | IT | VPN provider | Modern remote-friendly VPN. |
| **Vanta** | Security | Continuous compliance monitoring | SOC 2 auto-managed via Vanta. |

**Stack absente du subprocessor list mais inférée des fiches de poste 2026-05-06** :
- React + TypeScript (Frontend Engineer JD)
- Go ou JS/TS + Python (Backend + Platform JD)
- RAG, vector databases, embeddings (AI Engineer JD)
- Streaming UI (SSE/WebSocket pour chat) (Frontend JD)
- Event-driven pipelines, queues, orchestration (Senior Platform Engineer JD)

**Stack absente du subprocessor list mais inférée du marketing site (analyse réseau)** :
- Next.js App Router + Turbopack (marketing site)
- Vercel hosting (marketing site)
- CloudFront CDN (`cdn.monaco.com`)
- Snitcher + RB2B + GTM + GA4 + Google Ads (analytics)

**Important** : aucun ETL externe (Fivetran, Airbyte). Tout passe par leur propre pipeline event-driven.

### 1.4 ICP exact (cité verbatim depuis le JD Forward-Deployed AE 2026-05-06)

> *"Our ICP (Know This Cold)*
> - *VC-backed B2B startups (pre-seed through Series B)*
> - *Sales-led GTM motion (not PLG-first)*
> - *Decision makers are typically Founder/CEO, CRO, VP of Sales, or Head of GTM*
> - *Primarily US-based companies*
> - *Currently running a fragmented stack (HubSpot or Attio + Apollo or Clay + Outreach or Lemlist)*"

**ACV** : $25K-$100K (cycles 2-4 semaines)

### 1.5 Modèle économique — pricing caché

- Pas de page /pricing (404 vérifié 2026-05-06)
- Demo-gated (boutons "Request demo" partout, pas de "Sign up")
- Login via Auth0 sur `app.monaco.com` — page minimaliste : *"Welcome to Monaco — Your next-generation revenue platform"*
- Distribution mix :
  - **Inbound dominant** : "We are primarily inbound today" (verbatim Forward-Deployed AE JD 2026-05-06)
  - **Réseau founders + community-led** (Monaco Invitational poker tournament, 200 founders)
  - **Distribution via Founders Fund + investor portfolio**
  - SaaStr AI Workshop (4 deals 5-figure en <3 semaines)

### 1.6 Forces structurelles (ce qu'on doit comprendre, pas seulement copier)

1. **La methodologie de Sam Blond est l'algorithme** — pas de ML mystique. Le scoring, le coaching, la cadence : c'est le playbook Brex distillé en prompts. Sa moat est **15 ans d'expérience compressée**.
2. **Le forward-deployed AE est un humain ET un canal de distribution**. Ils vendent pour le client (visible) ET ils sont la voice-of-customer pour Monaco eng (invisible). Double rôle.
3. **Architecture event-driven authentique** — Databricks + streaming + embedding pipelines. Pas un wrapper RAG sur Postgres.
4. **Réseau founders** : ils n'ont pas un produit qu'on achète, ils ont un **club** dans lequel on entre. La référence devient le mécanisme de distribution.
5. **Public beta deliberée** : ils n'ouvrent PAS la vanne. Each customer = 1 forward-deployed AE = scaling contrôlé.

### 1.7 Faiblesses structurelles (où on peut frapper)

1. **Modèle non-scalable** : ~40 humains pour ~20-30 clients high-touch. Au-delà, soit ils dégradent le service, soit ils embauchent linéairement.
2. **Monaco utilise Snitcher + RB2B sur son propre site MAIS ne propose PAS de visitor ID en feature** (ironique, gap visible).
3. **Pas de blog public** (404), pas de pricing public, pas de case studies indépendants (zéro G2/Capterra).
4. **Pas de free tier, pas de self-serve** : barrière d'entrée volontaire qui exclut 95% des early-stage founders.
5. **Pas de mobile** (web-only).
6. **Email-only outbound** (pas de phone dialer, pas de LinkedIn automation, pas de SMS).
7. **Pas d'API publique exposée** (statut.monaco.com mentionne "Public API" comme système monitoré, mais aucune doc visible — vraisemblablement réservée aux integrations partner).
8. **Cible étroite** : VC-backed B2B sales-led US. Tout francophone, tout PLG, tout bootstrap est exclu.

---

## PARTIE 2 — CLASSIFICATION 6-ÉTAPES DU PROCESS MONACO

Le produit Monaco se découpe officiellement en **2 mouvements + 6 étapes** (verbatim depuis /product 2026-05-06) :

```
MOUVEMENT 1 — DRIVE DEMAND
  Étape 1 : Build TAM
  Étape 2 : Overlay signals
  Étape 3 : Execute sequences

MOUVEMENT 2 — INCREASE CONVERSION
  Étape 4 : Capture Activity
  Étape 5 : Track Pipeline
  Étape 6 : Ask Monaco
```

Chaque étape ci-dessous est documentée selon la grille :
- **Promesse Monaco verbatim** (quote exacte depuis /product)
- **Sub-features officielles** (3 par étape, verbatim)
- **UI observée** (compilation des frames vidéo + screenshots produit)
- **Lentille Homère** (l'archétype antique qui éclaire le choix)
- **Signaux clients** (ce que les testimonials disent de cette étape spécifiquement)
- **Stack technique inférée** (du sub-processor + JD vers cette étape)
- **Rôle humain Monaco** (qui parmi les 8 fiches de poste actuelles porte cette étape)
- **Tout ce qu'on a accumulé sur ce step** (research précédente)

---

### ÉTAPE 1 — BUILD TAM • Drive Demand
*"La carte avant le voyage"*

**Promesse verbatim** :
> *"Your TAM is built and improved for you. Your Monaco account is pre-built with your entire TAM on Day 1. Your TAM is automatically updated and improved over time as your company grows."*

**Sub-features officielles (verbatim)** :
1. **Pre-built TAM** — *"Monaco automatically builds your TAM from a world database of billions of data points."*
2. **Grounded in your ICP** — *"Your TAM is shaped from your ICP, your existing customers, and the accounts already in your email history."*
3. **AI scoring** — *"Built-in ML scoring using firmographics and signals with clear 'why this account' explanations."*

**UI observée** (frames vidéo Feature 1-1, 2-1, 3-1, screenshot 1-build-tam.png) :
- Table dense ~36px row height, colonnes : Account · Status · Score · Industries · Connected to · Custom signal columns (e.g. "Common Investor?", "Sales-led growth?")
- Score = badge composite "A | 🔥 Burning" (lettre A-D + emoji feu + label "Burning"/"Warm"/"Cool"/"Cold")
- Status = pill couleur (Prospecting = violet, New = gris, Customer = vert, Disqualified = rouge foncé, Inbound = ambre, Nurture = magenta, Opportunity = pourpre)
- "Connected to" = avatar + nom du team member ayant la relation chaude
- Logos auto-fetched des domaines (Clearbit-style)
- Comptes affichés (réels) : Judgment Labs, Bluenote, Nowadays, Parley, Backops, Flowline Health, Solve Intelligence, Juicebox, Delve, Sphinx, Casca

**Lentille Homère** — *La carte avant le voyage*. Avant qu'Ulysse parte, son père Laërte connaît la mer. Le TAM pré-construit, c'est la carte d'Ithaque dépliée avant de hisser les voiles. Le fondateur ne dessine pas le monde, il **commence par le voir entièrement**. C'est l'inversion de Salesforce où le fondateur passe 6 semaines à importer ses contacts.

**Signaux clients (verbatim)** :
- Amy Yan (Co-Founder, Nowadays) : *"We had our TAM built on day 2 and we're running outbound sequences that same day. I can't imagine how painful this would have been without Monaco."*
- Sean McCarthy (Co-Founder, BackOps) : *"Monaco feels like the future of sales. It replaced our CRM, outbound tools, and half the manual work overnight."*

**Stack technique inférée** :
- Base de données prospect propriétaire (Databricks) — pas de dépendance Apollo (différentiateur clé vs nous)
- ML scoring : feature pipeline (Senior Platform Engineer JD : *"Support ML workflows: training data, evaluation, embeddings, feature pipelines"*)
- Embedding pipeline pour le "ICP grounding" depuis email history
- "Why this account" = LLM explanation layer (RAG sur les features ML)

**Rôle humain Monaco qui porte cette étape** :
- **Forward-Deployed AE** : "Be a FDAE: Lead the onboarding and kickoff, align on ICP, buyer titles, AI signals, TAM, and outbound strategy for each new customer." (verbatim JD)
- **Client Operations** : "Build and deliver high-quality TAMs, signals, and outbound setups." (verbatim JD)
- **AI Engineer** : "Build and iterate on RAG systems (chunking, embeddings, retrieval, prompt composition)." (verbatim JD)
- **Senior Platform Engineer** : "Build scalable pipelines and event-driven systems for ingesting, transforming, and serving data."

**Tout ce qu'on a accumulé sur Build TAM** :
- Research initiale (2026-03-30) : confirmed pre-built TAM, ML scoring, "why this account" explanations
- Frame analysis (2026-03-31) : 5 cartes "A | 🔥 Burning" verticales (Judgment Labs, Bluenote, Nowadays, Parley, Backops)
- Conformity checklist (2026-04-18) : Elevay 12/12 features parity sur la table TAM
- Parity diff (2026-04-21) : streaming TAM build avec 4 signaux built-in (investor_overlap, funding_recent, hiring_intent, yc_company)
- Honest comparison (2026-04-18) : Elevay = 70% reality (Apollo paid plan obligatoire ; scoring fire-and-forget)
- Vs-Elevay mapping (2026-05-06) : 75% couvert (gap : ML scoring vrai vs rule-based)

---

### ÉTAPE 2 — OVERLAY SIGNALS • Drive Demand
*"Lire les augures"*

**Promesse verbatim** :
> *"Segment with AI, prioritize with signals. Monaco overlays custom signals on top of your target accounts to prioritize who to reach out to, when, and why."*

**Sub-features officielles (verbatim)** :
1. **AI semantic search** — *"\"Crypto companies,\" \"B2B companies manufacturing fasteners\" \"Companies hiring RAG engineers\"."*
2. **Custom signals** — *"Common investors, job postings, current tech stack, and anything else you can imagine."*
3. **Inbound signals** — *"Track website visitors, demo requests, and other high signal inputs."*

**UI observée** (frames Feature 1-2, screenshot 2-overlay-signals.png) :
- Same table as TAM mais avec popover "Reasoning" overlay
- 2 tabs dans popover : **Reasoning** (texte AI-generated avec citations) + **Sources** (article cards avec favicons)
- Exemple capturé : "Judgment Labs common investors with Monaco include Founders Fund." → sources : company website, news articles ("AI Acquisitions", "The State of Generative AI in...")
- Multi-industry tagging : Fintech / Payment / Personal / Crypto / Investment / Sweetbee
- Chip de signal binaire : Yes (vert solide) / Medium (vert dashé chez Elevay, pas vu chez Monaco) / No (gris strikethrough)

**Lentille Homère** — *Lire les augures*. Avant la bataille, l'aède Calchas lit le vol des oiseaux : signal annonciateur. Monaco rejoue la divination d'Apollon — le funding round, le hiring spike, le tech stack change : ce sont les augures. La question n'est pas "qui correspond à mon ICP" mais "**quels présages disent que c'est le moment**". Kairos, pas chronos.

**Signaux clients (verbatim)** :
- Ben Dopfner (Founder, Vesto) : *"The AI actually knows which opportunities to prioritize and automates my follow-up. It's like having a world class CRO as a copilot."*

**Stack technique inférée** :
- **Visitor ID** : ils utilisent Snitcher + RB2B sur leur propre site mais l'INTÈGRENT dans le produit ("Track website visitors" verbatim). Probablement reverse-IP + person-level deanonymization.
- **AI semantic search** : embeddings + similarity search (pgvector ou Pinecone, non disclosé)
- **Custom signals "anything you can imagine"** : LLM judge + URL HEAD checks + keyword filters (architecture similaire à ce qu'on a fait dans `lib/custom-signals/detector.ts`)
- **Inbound signals** : webhook ingestion, attribution, deduplication

**Rôle humain Monaco** :
- **AI Engineer** : "Build and iterate on RAG systems" + "Orchestrate multi-step AI workflows"
- **Client Operations** : "Run onboarding calls, align on ICP, TAM, signals, and outbound strategy"
- **Senior Platform Engineer** : "event-driven systems for ingesting, transforming, and serving data"

**Tout ce qu'on a accumulé sur Overlay Signals** :
- Research initiale : 4 signal types (common investors, job postings, tech stack, web activity)
- Conformity checklist : Elevay 4/5 (gap : visitor ID)
- Honest comparison : 75% reality (signaux statiques snapshot Apollo, pas temps-réel ; pas de visitor ID ; reasoning peut halluciner)
- Vs-Elevay mapping : 80% couvert (gaps : tech stack delta, web activity tracking)

---

### ÉTAPE 3 — EXECUTE SEQUENCES • Drive Demand
*"L'éloquence en marche"*

**Promesse verbatim** :
> *"AI-assisted outbound, end to end. Demand gen that runs itself — with your guardrails. Monaco doesn't just recommend outreach. It executes it."*

**Sub-features officielles (verbatim)** :
1. **Pre-built sequences** — *"Opinionated templates you can customize quickly."*
2. **Autopilot** — *"Monaco decides who to enroll, when to start, and how to follow up - without blasting your whole TAM."*
3. **Contextual relevance** — *"Messages that adapt to business context and intent signals."*

**UI observée** (frames Feature 2-2, 3-2, screenshot 3-execute-sequences.png) :
- Vertical timeline : numbered steps + connecting lines
- Wait periods : "Wait 3 business days" / "Wait 5 business days"
- Detail panel right : Recipient (Alex Shan) · Subject ("Congrats on the fundraise!") · **Gift integration: Veuve Clicquot Yellow Label Brut 750ml avec image** · personalized message
- Approval controls : thumbs-down (Reject) + white pill button "Start"
- Sender header inférée : "Sam Blond to Alex Shan (Co-Founder)"

**Lentille Homère** — *L'éloquence en marche*. L'Iliade s'ouvre par la colère d'Achille mais elle se résout par la rhétorique de Priam venu chercher le corps de son fils. Le mot juste, au moment juste, dans le contexte juste : c'est ce que Monaco automatise. *"Demand gen that runs itself — with your guardrails"* = Hermès, messager des dieux, mais sous l'autorité de Zeus (le fondateur). Le **gift physique Veuve Clicquot** est le don d'hospitalité (xenia) — on n'envoie pas seulement un email, on offre.

**Signaux clients (verbatim)** :
- Phillip Smart (CEO, Parley) : *"It feels like I have a machine running in the background getting all these meetings set up for me."*
- Catheryn Li (Co-Founder, Simple AI) : *"Monaco is more than technology. The forward deployed AE is like having a sales exec on our team."*

**Stack technique inférée** :
- **Email sending** : non disclosé (pas SES dans subprocessors mais pourrait l'être indirectement via AWS) — le système Email Open Rate Tracking sur status page suggère une infra dédiée
- **Personnalisation LLM** : OpenAI (subprocessor) + RAG sur le contexte prospect
- **Autopilot scheduler** : event-driven Inngest-style ou cron + queue (Senior Platform Engineer JD: "queues, warehouses, orchestration")
- **Gift integration** : likely Sendoso ou Reachdesk API — non disclosé

**Rôle humain Monaco** :
- **Forward-Deployed AE** : "Run full-cycle sales - prospecting, sequencing, and outreach directly inside Monaco across email and LinkedIn." (verbatim JD)
- **Founding Customer Success** : "Enable teams on outbound success by advising on sequence copy, strategy, and execution." (verbatim JD — c'est CS qui CONTINUE à coacher l'outbound après l'onboarding)

**Tout ce qu'on a accumulé sur Execute Sequences** :
- Research : pre-built templates, autopilot, contextual personalization, **gift physique (Veuve Clicquot Yellow Label)**
- Conformity checklist : 5/7 (gaps : sender header complet "From X to Y", per-sequence approve/reject, gift integration)
- Honest comparison : 85% reality (cron 2 min latency, approval mode global vs per-sequence, fallback silencieux template brut si LLM fail)
- Vs-Elevay mapping : 95% couvert (4 frameworks BASHO/Challenger/Problem-Solution/Product-Led, anti-pattern detection, knowledge base)

---

### ÉTAPE 4 — CAPTURE ACTIVITY • Increase Conversion
*"Mnemosyne, mère des Muses"*

**Promesse verbatim** :
> *"Capture every interaction. Replace your legacy CRM. Monaco is not a CRM you maintain. It is the system that maintains itself."*

**Sub-features officielles (verbatim)** :
1. **Structured signals** — *"Every interaction is captured, summarized, and attached to the right account, contact, and opportunity."*
2. **Auto-enrichment** — *"Accounts and contacts stay complete and up to date automatically."*
3. **Trusted history** — *"What happened, when, who was involved, and what changed — all in one place."*

**UI observée** (screenshot 4-capture-activity.png + frames Feature 1-2 email card) :
- Split-screen 60% video / 40% AI notes
- Live video feed (Alex Shan, Judgment Labs)
- Meeting Notes panel structuré :
  - **Summary** : "Great first call with Alex at Judgment Labs. Strong interest in Monaco's agent capabilities..."
  - **Key Points** : "Current CRM is HubSpot", "Point solutions are Apollo and Fireflies"
  - **Budget and Team Size** : "Current budget is $30,000", "Sales team size is 4"
- Email card : "Response" header gray + body text + "1 hr ago" + "Email" badge + blue line left (timeline indicator)

**Lentille Homère** — *Mnemosyne, mère des Muses*. Sans mémoire, pas de chant. Sans capture, pas de pipeline. L'aède (le fondateur-vendeur) ne peut chanter l'Iliade que parce que les Muses lui rappellent chaque détail. Monaco devient les Muses : "It is the system that maintains itself." Le fondateur ne se souvient plus parce qu'il n'a plus à se souvenir — la machine se souvient pour lui. C'est l'opposé de Salesforce où l'humain est le scribe forcé.

**Signaux clients (verbatim)** :
- Alex Berkovic (Co-Founder, Sphinx) : *"Monaco made our legacy CRM feel instantly obsolete."*
- Sean McCarthy : *"It replaced our CRM, outbound tools, and half the manual work overnight."*

**Stack technique inférée** :
- **Meeting recording** : built-in (pas de Recall.ai mentionné en subprocessor — ils ont peut-être fait leur propre intégration MS Teams/Zoom/Meet via API OAuth direct)
- **Speech-to-text** : OpenAI Whisper probablement (subprocessor OpenAI couvre ça)
- **Email sync** : Gmail/Outlook OAuth (non listé en subprocessor donc probablement direct API call sans broker)
- **Structured extraction** : LLM + structured outputs (verbatim JD : "prompt engineering, structured outputs, and tools")
- **Auto-enrichment** : leur base prospect propriétaire (Databricks)
- **Datadog** pour monitoring (Email Open Rate Tracking visible sur status page = système autonome)

**Rôle humain Monaco** :
- Aucun rôle humain direct sur la capture — c'est de la pure infra
- **Founding Customer Success** veille à la qualité : *"surfacing product feedback and market insights to Product and Engineering"*

**Tout ce qu'on a accumulé sur Capture Activity** :
- Research : structured extraction (Budget, Team Size, Current CRM, Competitors, Point Solutions)
- Conformity checklist : 9/10 (gap : "Updating..." live during meeting vs post-call extraction)
- Honest comparison : 75% reality (extraction post-call pas live, webhook Recall.ai dependency, email sync silencieux fix le 18/04, pas de meeting link detection robuste)
- Vs-Elevay mapping : 60% couvert (gap critique : meeting recording natif, on dépend de Recall.ai)

---

### ÉTAPE 5 — TRACK PIPELINE • Increase Conversion
*"Le pilote regarde la mer, pas le sextant"*

**Promesse verbatim** :
> *"Your pipeline manages itself. Your pipeline should reflect what's happening, not what got logged. Stages, risks, and next steps that reflect reality — not rep hygiene. Monaco does the updating, You do the selling."*

**Sub-features officielles (verbatim)** :
1. **Signal-based stages** — *"Meetings, email threads, call momentum, and stakeholder engagement drive pipeline changes."*
2. **Risk detection** — *"Detection before it's obvious. Ghosting, stalls, and weak engagement flagged early with clear reasons."*
3. **Auto-filled fields** — *"Things like number of calls, stakeholders involved, usage signals, and 'why now' are pulled from real interactions."*

**UI observée** (screenshot 5-track-pipeline.png + frames Feature 3-2 Kanban) :
- List view + detail panel à droite (~35/65)
- Cards : Dust ($55K), Judgment Labs ($30K, selected with priority icon), Vellum AI ($45K)
- Detail panel "Overview" :
  - **Summary** auto-généré : "Judgment Labs in active evaluation stage; first Monaco demo completed and follow-up sessions scheduled. Slack channel and product materials shared; next step is deeper walkthrough... broader stakeholder group. Owner Sam Blond. Expected Close Date: November 30, 2025"
  - **Timeline** : "October 27, 2025: Monaco <> Judgment Labs follow-up scheduled to go deeper on TAM, sequences, and pipeline..."
- Kanban (frame 3-2) : Discovery (20 deals, $817K) | Proposal (8 deals, $327K) | colonnes avec count badges et $ totals
- Deal cards : logo + name + value (compact, ~80px tall)
- Border colorée pour risk-based : red/orange/green

**Lentille Homère** — *Le pilote regarde la mer, pas le sextant*. Ulysse pilote son navire en regardant les étoiles, les vagues, le vent — il ne note pas les coordonnées dans un journal. Le pipeline-qui-se-tient-à-jour est le sextant remplacé par la mer elle-même : *"reflect reality, not rep hygiene"*. La discipline CRM (saisir les notes, mettre à jour les stages) est l'hygiène administrative que Monaco supprime — l'humain redevient pilote, pas comptable.

**Signaux clients (verbatim)** :
- Hari Raghavan (CEO, Autograph) : *"We've tried every modern CRM and sales tool. Monaco is the best and it's not even close."*
- Graham Cummings (CRO, Datawizz) : *"Monaco lets us punch way above our weight. We're a 3-person team running GTM like a 20-person sales org."*

**Stack technique inférée** :
- **Signal-based stage transitions** : event listener sur Capture Activity → rule engine ou LLM judge qui décide des transitions
- **Risk detection** : ML model (Senior Platform Engineer JD : "feature pipelines") + rule-based (ghosting = N jours sans réponse)
- **Auto-filled fields** : LLM extraction sur conversations + cascade vers deal properties
- **Auto-summary** : LLM summarization sur la timeline du deal

**Rôle humain Monaco** :
- **Forward-Deployed AE** : "Partner closely with the product team to surface recurring deal blockers - your pipeline data directly shapes the roadmap" (verbatim JD)
- **Founding Customer Success** : "Build post-sales playbooks, health scoring, and account planning processes from the ground up" (verbatim JD)

**Tout ce qu'on a accumulé sur Track Pipeline** :
- Research : Kanban kanban-with-dollar-totals, Discovery 20 deals/$822K, Proposal 9/$362K
- Frame analysis : real AI/dev-tool companies (Flint $45K, LangSmith $40K, Delve $80K, Campfire $42.5K, Sphinx $30K, Serval $15K, Backops $36K, Vellum AI, Parestisa $12K)
- Conformity checklist : 11/11 (full parity)
- Honest comparison : 80% reality (auto-filled fields jamais testés en prod, stage transitions par LLM 1x/jour pas signal-driven temps-réel, timeline dépend du sync email)
- Vs-Elevay mapping : 85% couvert

---

### ÉTAPE 6 — ASK MONACO • Increase Conversion
*"Le mentor d'Athéna"*

**Promesse verbatim** :
> *"Your CRO Copilot. Using Monaco is like having the world's best CRO leading sales at your startup."*

**Sub-features officielles (verbatim)** :
1. **Prioritized actions** — *"Monaco tells you the most important actions you can take to close more revenue."*
2. **Ask Monaco** — *"Chat with Monaco to receive sales feedback and uncover trends across the business."*
3. **Proactive insights** — *"Monaco gives you information about your business proactively."*

**UI observée** (screenshot 6-ask-monaco.png) :
- "Ask AI" floating panel sparkle icon header
- User query : *"How could I have done a better job on the Judgment Labs demo?"*
- AI response BRUTALEMENT spécifique :
  - **Title** : "You Lost Control - This Demo Was About You, Not Their Pain"
  - "You let the intro linger, and waited too long to set agenda or show the product, wasting Alex's attention."
  - "Demo focused on Monaco's features, not Judgment Labs' pain. Alex mentioned frustration with his existing set of tools and you never asked why."
  - "Ended without a time confirmed calendar invite sent for the onboarding call. This introduces risk that the opportunity will be delayed and time kills all deals."
- Quick-action menu : Overview / Outbound Sequences / Summary / Opportunities + chat input

**Lentille Homère** — *Le mentor d'Athéna*. Dans l'Odyssée, Athéna prend la forme de Mentor pour conseiller Télémaque. Pas de flatterie, pas de douceur : la vérité dure qui force la croissance. Monaco joue Athéna : *"You Lost Control"* — c'est exactement le ton d'Athéna à Télémaque hésitant. Le coaching Monaco N'EST PAS un assistant, c'est un mentor. Et le mentor dit *"this demo was about you, not their pain"* parce qu'il a vu les 33 minutes de transcript et identifié le moment exact où le founder a perdu le fil.

**Signaux clients (verbatim)** :
- Ben Dopfner : *"The AI actually knows which opportunities to prioritize and automates my follow-up. It's like having a world class CRO as a copilot."*

**Stack technique inférée** :
- **Chat experience** : OpenAI ("Powers a significant portion of our chat experience" — subprocessor verbatim)
- **RAG sur transcripts** : meeting recordings → embeddings (Databricks) → retrieval pour citations exactes
- **Tool calling** : multi-step orchestration (AI Engineer JD : "agents, tools, memory, retries, fallbacks")
- **Streaming UI** : SSE/WebSocket (Frontend Engineer JD : "streaming responses")
- **Quick-action menu** : pre-built prompts router

**Rôle humain Monaco** :
- **Founding Customer Success** : "Serve as the voice of the customer internally" + "Drive net revenue retention" — c'est le HUMAIN qui complète le coaching AI
- **Sam Blond himself** : sa methodology est encodée dans les system prompts — il *est* l'AI dans ce sens

**Tout ce qu'on a accumulé sur Ask Monaco** :
- Research : floating overlay 400x350px (vs Elevay full-page choice), brutally honest coaching tone
- Conformity checklist : 12/12 (full parity sauf overlay vs full-page)
- Honest comparison : 85% reality (coaching qualité = qualité données capturées, pre-send analysis tout neuf)
- Vs-Elevay mapping : 95% couvert (28 skills, 11 tool groups, multi-step orchestration)

---

## PARTIE 3 — CHANGEMENTS DÉTECTÉS LE 2026-05-06 vs RESEARCH PRÉCÉDENTE

| Domaine | Avant (research mars-avril) | Aujourd'hui (re-extraction 06/05) | Implication |
|---|---|---|---|
| **Site map** | 7 pages | Confirmé : 7 pages (/, /product, /company, /privacy, /terms, /security, /vulnerability-disclosure). /pricing, /careers, /blog : 404. | Pas de changement structurel. Toujours la même surface minimaliste. |
| **Sous-domaines** | app.monaco.com inféré | Confirmé : `app.monaco.com/login` (Auth0), `status.monaco.com` (Datadog), `trust.monaco.com` (Vanta), `cdn.monaco.com` | Trust Center NEW (probablement post-SOC 2 mars 2025) |
| **Fiches de poste** | 8 jobs (incluant "Founding Account Manager") | **8 jobs** mais "Founding Account Manager" → **"Founding Customer Success"** | Évolution org : ils ont décidé que le post-sales CS est plus stratégique qu'un AM transactionnel. Le rôle est maintenant "human layer between platform and customers". |
| **Stack LLM** | "OpenAI ou Anthropic" (JD) | **OpenAI confirmé seul subprocessor**. Anthropic absent. | OpenAI est leur fournisseur principal. Anthropic peut-être en pilote/dev. |
| **Data warehouse** | Inféré | **Databricks confirmé** | Architecture analytique sérieuse, pas Postgres/MySQL pur. |
| **CS/onboarding** | "Client Operations" rôle récent | Confirmé + intensifié : "Onboarding is where Monaco wins or loses" verbatim | Le bottleneck est l'onboarding, pas la tech. |
| **Distribution** | Mix outbound/inbound non clair | **"We are primarily inbound today"** verbatim Forward-Deployed AE JD | Ils ne font pas de cold outreach. Tout est inbound + reseau Founders Fund. |
| **Public API** | Non confirmée | Status page liste **"Public API"** monitoring (100% uptime) | Existe mais non documentée publiquement. Probablement réservée aux partenaires/integrations. |
| **Email tracking** | Inféré | **"Email Open Rate Tracking"** dans status page (système séparé) | Système dédié monitoré indépendamment — confirmé qu'ils tracent pixel + reply rates en infra propre. |
| **Compliance** | Inféré | **SOC 2 Type 1 (March 2025)** + Penetration Test + Vanta | Ils sont compliance-ready pour vendre à mid-market post-Series B. |

---

## PARTIE 4 — CE QUE MONACO A INTÉGRÉ QU'ELEVAY N'A PAS ENCORE (par étape)

Pour chaque étape, le format est :
- **Ce que Monaco fait** (vérifié) → **État Elevay** → **Delta tech à coder** → **Effort** → **Priorité**

### Étape 1 — Build TAM

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| Base de données prospect propriétaire (Databricks-backed, "billions of data points") | Apollo API only (60M orgs, dépendance externe payante) | (a) Waterfall multi-provider (Apollo + Lusha + ZoomInfo + LinkedIn Sales Nav) ; (b) cache-first dans notre Postgres ; (c) fallback CSV import + LLM enrich | **L** (3-4 semaines, multi-provider integration) | P1 |
| ML scoring (vrai modèle entraîné sur closed-won) | Rule-based heuristic + LLM judge | Pipeline d'entraînement : extract closed-won features → train gradient boosting → serve via API. Plus expérimentation A/B vs rule-based. | **L** (4-6 semaines) | P2 |
| TAM streaming en mode "live cards apparaissent" | Stream NDJSON déjà en place (sprint α-δ) | ✅ Parité acquise | — | — |
| "Connected to" (warm intro paths) | Owner + avatar | ✅ Parité acquise | — | — |
| Custom signal columns user-configurable | `/settings/signals` 3-tier detector | ✅ **Parité dépassée** (self-serve vs AE-mediated) | — | — |

### Étape 2 — Overlay Signals

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| **Visitor ID inbound (website visitors as signals)** | ❌ Absent | Intégrer Snitcher / RB2B / Clearbit Reveal en mode subscription. Webhook → entity match dans le TAM → trigger sequence | **L** (2-3 semaines) | **P0** |
| Demo request inbound capture | Form + webhook ingestion existante (`inbound-lead-enrichment`) | Vérifier que ça matche bien sur l'account cible et que ça remonte comme signal "Hot" dans le dashboard | **S** (2-3 jours) | P1 |
| Tech stack delta tracking (changement détecté périodiquement) | Apollo retourne tech stack mais pas le delta | Cron weekly diff Apollo → emit signal "tech_stack_changed" | **S** (1 semaine) | P3 |
| AI semantic search NL → TAM filter | SmartSearchBar + parse-nl API existant | Vérifier que ça gère bien des requêtes structurées comme "Companies hiring RAG engineers" (job title + signal combiné) | **M** (1 semaine) | P2 |
| Signal reasoning factual (anti-hallucination) | LLM reasoning sans verification | Source verification (URL HEAD check), citation enforcement, confidence scoring 4-state | **M** (1-2 semaines) | P1 |

### Étape 3 — Execute Sequences

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| **Per-sequence Approve/Reject buttons** (thumbs-down + Start) | Mode global `agentApprovalMode` | UI per-sequence : button pair sur chaque draft + state `pending_approval` en DB | **M** (2-3 jours) | **P0** |
| Header "From [sender] To [recipient]" complet | Affiche "To [contact]" mais pas sender | Cosmétique : ajouter sender info dans UI sequence detail | **S** (<1h) | P0 |
| Gift physique intégré (Veuve Clicquot via Sendoso/Reachdesk) | ❌ Absent | Décision produit : on n'intègre PAS (choix fondateur). Documenter que c'est un trade-off conscient. | **N/A** | SKIP |
| Latence step scheduling (Monaco quasi-temps-réel ?) | Cron 2 min | Migrer les triggers post-meeting follow-up vers webhook event-driven (pas cron) | **M** (1 semaine) | P2 |
| Personnalisation fail silent | Si LLM échoue, fallback template avec `{{firstName}}` brut sans avertir | Notification utilisateur "personalisation failed, generic template used" + retry queue | **S** (1-2 jours) | P1 |
| Reply rate / open rate tracking en infra dédiée | Existe via Resend tracking + DB | Vérifier robustness : pixel privacy iOS15 (49% MPP preload), spam complaint rate, bounce rate | **M** (1 semaine) | P1 |

### Étape 4 — Capture Activity

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| **Meeting recording natif (sans Recall.ai)** | Recall.ai dependency | Intégration directe Zoom/Meet/Teams API OAuth + Whisper STT. Plus robuste, moins coûteux à scale. | **XL** (4-6 semaines) | P2 (utile mais pas blocant) |
| **Live "Updating..." pendant meeting** | Extraction post-call | WebSocket streaming + LLM batch-extraction pendant le call | **XL** (3-4 semaines) | P3 |
| Meeting card 60/40 split video+notes | Page `/meetings/[id]` avec sections | Refonte UI vers split-view 60/40 + video player intégré | **M** (1 semaine) | P3 |
| Auto-extract Budget / Team Size / CRM / Competitors / Point Solutions | Skill `enrichment-email-extract` + `meeting structured notes` | ✅ Couvert end-to-end | — | — |
| Display structurée 👥📋💰🔧 sur account page | Card "Meeting Intelligence" avec icônes | ✅ Parité acquise | — | — |
| Auto-enrichment continu (refresh périodique) | À la création initial via Apollo | Cron periodic re-enrichment (mensuel) avec freshness scoring | **M** (1 semaine) | P2 |
| Email sync OAuth refresh resilience | Token expire silently | Fix appliqué le 18/04 avec notification "Email sync disconnected" | ✅ | — |

### Étape 5 — Track Pipeline

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| Signal-based real-time stage transitions | Cron 1x/jour 9am via `autoPipelineStep` | Event-driven : email envoyé → si contient pricing → propose stage Proposal | **M** (1-2 semaines) | P2 |
| Auto-filled deal fields (testé end-to-end en prod) | `syncSignalsToDeal` théorique | Test E2E avec vraies données + monitoring + alerts si extraction ratée | **S** (1 jour) | **P0** |
| Risk detection avec "clear reasons" | Stalled/frozen badges | Chaque alert doit avoir un *why* explicable (LLM-generated reason avec citations transcripts) | **M** (1 semaine) | P1 |
| Deal summary auto-generated avec timeline | Summary + activity timeline | ✅ Parité acquise | — | — |
| Kanban dollar totals dans column headers | Stage names sans totals dans certaines vues | Vérifier que les totals sont visibles partout | **S** (<1h) | P1 |

### Étape 6 — Ask Monaco

| Capacité Monaco | État Elevay | Delta tech | Effort | Prio |
|---|---|---|---|---|
| Floating overlay 400x350px (panel non-bloquant) | Full-page chat | Mode floating + full-page toggle | **M** (1 semaine) | P2 |
| Coaching depuis transcript exact (citations time-stamped) | Coaching depuis email summary | Pipeline RAG : transcript chunks + embeddings + citations time-stamped dans la réponse | **M** (1-2 semaines) | **P0** |
| Quick-action menu (Overview / Sequences / Summary / Opportunities) | Suggestions data-driven | ✅ Parité (suggestions) | — | — |
| Tone "brutally specific" coaching | Prompt agressif déjà en place | Vérifier en eval que le ton est consistant — pas d'adoucissement par sécurité | **S** (1 jour) | P1 |
| Multi-step orchestration (10 steps) | `stepCountIs(10)` | ✅ Parité acquise | — | — |
| Voice input + file upload | Mic Web Speech + paperclip files | ✅ Parité dépassée | — | — |

---

## PARTIE 5 — CE QUE MARTIN DOIT FAIRE MANUELLEMENT AVEC CHAQUE CLIENT

> Tant que les gaps tech (Partie 4) ne sont pas comblés, Martin DOIT incarner le forward-deployed AE chez chaque client. Pas en option : **par contrat de service**. Sinon les clients ne tirent pas la valeur de Monaco-équivalent et churn.

### Le rôle "Forward-Deployed Founder" de Martin (analogue Monaco Forward-Deployed AE)

**Posture** : ce n'est pas du support. Pas du onboarding. C'est de la **co-execution stratégique** sur les 30 premiers jours, dégressive ensuite. La raison fondamentale : *"l'AE humain compense les bugs de l'AI"* (research Monaco) — sans Martin dans la boucle, les premiers ratés AI détruisent la confiance avant que la machine ne s'auto-corrige.

### Checklist par étape — actions manuelles obligatoires de Martin

#### Étape 1 — Build TAM (J0 à J7)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| Kickoff call 60 min avec founder client : ICP discussion verbatim | 1x à J0 | Le système ne devine pas l'ICP correctement à 100%. Martin doit le faire dire au founder, l'écrire, le valider avant que la machine construise. |
| Run TAM build en live avec founder pendant le call | 1x à J0 | Monaco fait pareil — le forward-deployed AE est devant l'écran avec le founder. Vérifier que les premiers résultats sont pertinents. |
| Review manuelle des 50 premiers comptes scorés A | 1x à J1 | Si la machine score "A" un compte hors-ICP, Martin doit le détecter et corriger les signaux de pondération avant de laisser tourner. |
| Tech stack alignment : vérifier que les signaux configurés (investor overlap, tech stack, hiring) sont les bons pour CETTE entreprise | 1x à J1 | Un client SaaS dev tools n'a pas les mêmes signaux qu'un client healthtech. |
| Email connection : vérifier OAuth refresh + first sync | 1x à J0 | Si le sync casse silencieusement, le ML scoring "grounded in email history" est faux. |
| Closed-won import (CSV ou intégration HubSpot/Attio) | 1x à J0-J3 | Le ICP grounding nécessite des historiques de wins. Sans ça, score basé sur ICP texte seul → moins précis. |

#### Étape 2 — Overlay Signals (J3 à J14)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| Configurer 3-5 custom signals avec le founder | 1x à J3 | "Common investor with [client]?", "Hiring [our buyer persona]?", "Using [our competitor]?". Sans ça, le TAM est trié par firmographic seulement. |
| Visitor ID setup (en attendant que la feature soit native) | 1x à J3 | Installer manuellement Snitcher/RB2B/Clearbit Reveal sur le site du client + webhook vers notre API. Document explicite. |
| Premiere review hebdomadaire des signaux remontés | Hebdo S1-S4 | Detect early si la qualité du reasoning est insuffisante (citations bidons, signaux sans valeur). |
| Conversation avec founder sur les signaux d'achat spécifiques à son industrie | 1x à J7 | Ex : SaaS B2B = funding + hiring. DevTools = activation milestone. Healthtech = RFP cycles. Adapter les signaux. |

#### Étape 3 — Execute Sequences (J7 à J21)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| **Co-écrire les 3 premières séquences avec le founder** | 1x à J7 | Pas de templates plug-and-play. Martin écrit avec le founder à partir de leur tone of voice. Capture de "voice samples" en interview voix (Sam Blond fait pareil). |
| **Review manuelle de chaque email avant envoi sur S1-S2** (mode `agentApprovalMode = manual`) | Quotidien S1-S2 | Le LLM peut encore halluciner sur la personnalisation. Sans review, premier email raté = brand burn. |
| Migration vers `agentApprovalMode = ask` à S3 | 1x à J21 | Une fois que la qualité est prouvée (>20 emails reviewed without correction), passer au mode "AI envoie sauf si vous bloquez dans 30 min". |
| Configurer cadence (J+0, J+3, J+7, J+14, J+30) basée sur ICP du client | 1x à J7 | Devtools : 7 jours tendres. Fintech : 14 jours. Healthtech : 30+ jours. Ne PAS appliquer le même intervalle partout. |
| **Coaching follow-up post-meeting** : exemple précis du coaching que l'AE devrait faire | 1x post-premier-meeting | Montrer au founder ce que "ne pas perdre le contrôle du demo" veut dire en pratique — c'est le levier cognitif principal. |

#### Étape 4 — Capture Activity (J0 perpétuel)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| Vérifier OAuth Gmail/Outlook + Calendar + Recall.ai bot | 1x à J0 + check hebdo S1-S4 | Le système est aussi bon que la qualité du sync. Si tokens expirent silently, tout l'effet "every interaction captured" tombe. |
| Premiere review du structured extraction sur 5 meetings | Apres 5 meetings | Vérifier que Budget / Team Size / CRM / Competitors sont correctement extraits. Recalibrer prompts si erreurs. |
| Décision sur les meetings sans link Zoom/Meet (téléphone, en personne) | Hebdo | Soit on dit au client "ces meetings ne sont pas capturés", soit on lui propose une alternative (audio upload manuel). |
| Confirmer que les emails B2B internes du founder ne polluent pas les signaux | 1x à J3 | Filtres exclusion pour @ourcompany.com etc. |

#### Étape 5 — Track Pipeline (J7 perpétuel)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| Setup pipeline stages avec le founder (pas génériques) | 1x à J7 | "Discovery / Proposal / Closed Won/Lost" générique = inutile. Martin doit faire dire au founder ses stages réels (souvent 5-7 stages avec définitions spécifiques). |
| Review hebdo du risk detection : pourquoi ce deal est "stalled" ? | Hebdo S1-S4 | Si le système flag à tort, le founder perd confiance. Premier flag faux = déconfiance permanente. |
| Confirmer que `syncSignalsToDeal` tourne en prod et que les fields s'auto-fillent | Apres 3 deals avancés | Test E2E sur vrai data. |
| Review du auto-summary deal : trop générique ? trop concis ? | Hebdo | Recalibrer prompts si les summaries ratent les nuances importantes. |

#### Étape 6 — Ask Monaco / Coaching (J14 perpétuel)

| Action manuelle Martin | Fréquence | Pourquoi |
|---|---|---|
| **Premier coaching session "human + AI"** post-premier-meeting du founder | 1x à J14 | Martin assiste à la session de coaching AI avec le founder. Il complète, nuance, illustre. C'est l'XENIA — recevoir le founder dans la pratique du coaching. |
| Exemples concrets de "you lost control" avec les transcripts réels | Mensuel | Transformer le coaching abstrait en levier comportemental concret. |
| Curating une bibliothèque de plays gagnants par vertical du client | Mensuel | Le coaching est aussi bon que les patterns vus. Construire la bank chez Elevay. |

### Cadence proposée du temps de Martin par client

| Phase | Durée | Temps Martin | Touchpoints |
|---|---|---|---|
| **Onboarding white-glove (J0-J7)** | 7 jours | ~6h | Kickoff (1h), TAM run-through (1h), ICP review (1h), check-ins quotidiens 30min |
| **Co-execution (J7-J21)** | 14 jours | ~4h/sem | Daily review session 30min, weekly strategy call 1h |
| **Activation (J21-J60)** | 40 jours | ~2h/sem | Weekly call 1h, Slack async 1h |
| **Steady state (J60+)** | continu | ~30min/sem | Bi-weekly call, Slack reactive |

**Total** : ~30h sur les 60 premiers jours par client, puis 2h/mois en steady state. Cela définit ta capacité maximale : **~5-7 clients en parallèle en phase d'onboarding** (vs Monaco qui dédie 1 AE pour 3-5 clients).

---

## PARTIE 6 — CE QUI DOIT ÊTRE DANS L'ONBOARDING ELEVAY POUR ÊTRE AU NIVEAU MONACO

> Le but : transformer les actions manuelles de Martin (Partie 5) en **flow automatique guidé** dans l'onboarding produit. Chaque action manuelle = un step d'onboarding ou une checklist de validation.

### Architecture cible : "Onboarding-as-FDAE"

L'onboarding Elevay doit incarner un **Forward-Deployed AE virtuel** : il pose les questions qu'un humain Monaco poserait, vérifie la qualité des réponses, et bloque le user à chaque step jusqu'à ce que la qualité soit suffisante.

**Principe** : *"Onboarding is where Monaco wins or loses"* (verbatim Client Operations JD). On reprend ce principe verbatim.

### Les 7 phases d'onboarding (durée totale : 30-45 min en self-serve, ou 60-90 min avec Martin présent)

#### Phase 1 — Diagnostic d'entrée (5 min)
- Quelle est ta situation actuelle ? (Founder solo / 2-3 fondateurs avec un SDR / equipe sales 5+ / etc.)
- Combien de deals as-tu fait jusqu'ici ?
- Quelle stack as-tu actuellement ? (HubSpot/Attio + Apollo/Clay + Outreach/Lemlist détecté → on dit "tu vas pouvoir tout remplacer")
- ICP à 1 phrase

**Validation requise** : ICP doit contenir au moins (industry, company size range, buyer persona) — si manquant, on insiste avant d'avancer.

#### Phase 2 — ICP & TAM (10 min)
**Inspiré du Client Operations role : "Run onboarding calls, align on ICP, TAM, signals, and outbound strategy"**

- Question : "Liste tes 5 meilleurs clients (closed-won)"
- Si vide : "Liste tes 5 prospects idéaux"
- Question : "Liste 3 entreprises que tu NE veux PAS comme clients" (anti-ICP)
- Génération TAM : 100 comptes scorés affichés en streaming live
- **Validation requise** : User doit cliquer sur 3 comptes A/Burning et confirmer qu'ils sont pertinents. Si <60% de pertinence, retour au step ICP. Si user ignore = warning ("votre TAM peut être imprécis").

#### Phase 3 — Email & Calendar Connection (5 min)
- Connect Gmail OR Outlook (OAuth)
- Connect Google Calendar OR Microsoft Calendar (OAuth)
- Connect Recall.ai (ou OAuth direct Zoom/Meet/Teams quand ce sera prêt)
- **Validation requise** :
  - Email sync test : count des emails sent/received last 7 days. Doit être > 0.
  - Calendar test : count des events upcoming next 7 days. Doit être > 0.
  - Si zéro → diagnostic ("OAuth scope manquant ? Email vide ?")

#### Phase 4 — Signal Configuration (5 min)
**Inspiré du Forward-Deployed AE role : "align on ICP, buyer titles, AI signals, TAM, and outbound strategy"**

- Pre-built signals proposés (selon ICP) : funding_recent, hiring_intent, investor_overlap, tech_stack_change, engagement_signal
- Custom signal creation guidée : 3 questions
  1. "Quel signal indique qu'un compte est mûr pour acheter ton produit ?" (ex: "embauche un Head of Growth")
  2. "Quel investisseur commun signale une chaîne de relations ?"
  3. "Quel concurrent signale un déclencheur de switch ?"
- **Validation requise** : 3 custom signals minimum. Si <3 → blocker.

#### Phase 5 — Voice & Sequences Setup (10 min)
**Inspiré du Founding CS role : "Enable teams on outbound success by advising on sequence copy, strategy, and execution"**

- Voice capture : input 5 emails déjà envoyés par le founder OU 1 vidéo loom 60s "présente-toi à un prospect comme tu le ferais en direct"
- LLM extrait tone of voice (formal / casual / direct / storytelling)
- Génération de 3 séquences (ICP-fit + voice-fit) en preview
- User peut éditer chaque step
- **Validation requise** : User doit approuver au moins 1 séquence et la lancer en mode `manual` (chaque envoi requiert approval). Mode `ask` ou `auto` débloqué après 20 emails reviewed.

#### Phase 6 — Pipeline Setup (5 min)
- Question : "Comment nommes-tu tes stages aujourd'hui ?" (free input)
- Détection automatique des stages depuis email history si possible
- Suggestions de stages par défaut (Discovery / Demo / Proposal / Negotiation / Closed Won|Lost)
- **Validation requise** : User confirme ou édite les stages.

#### Phase 7 — Coaching activation (5 min)
- Premier coaching prompt : "Pose-moi une question sur ton pipeline" (forcer l'usage)
- Démo de la quick-action menu
- Premier follow-up auto-généré sur un meeting passé (si un meeting existe déjà)
- **Validation requise** : User a fait au moins 1 query → confirme qu'il a compris la valeur.

### Checklist "à niveau Monaco" — sortie d'onboarding

À la fin de l'onboarding, le système vérifie que :

| Critère | État cible | Si non |
|---|---|---|
| ✅ TAM construit avec ≥100 comptes scorés | Accounts table populated, ≥3 accounts A/Burning | Bloquer + retry TAM build |
| ✅ ICP validé avec 3 examples positifs | `tenant.icp.confidence > 0.7` | Insister + question hint |
| ✅ Email sync working (>10 emails sync) | `email_sync.last_run < 1h ago AND emails_count > 10` | Retry OAuth + diagnostic |
| ✅ Calendar sync working (≥1 event sync) | `calendar_sync.last_run < 1h ago AND events_count > 0` | Retry OAuth + diagnostic |
| ✅ ≥3 custom signals configurés | `count(custom_signals) >= 3` | Forcer création |
| ✅ ≥1 sequence approuvée et démarrée | `count(sequences WHERE status='running') >= 1` | Forcer creation |
| ✅ Pipeline stages définis | `count(deal_stages) >= 3` | Suggérer defaults |
| ✅ ≥1 coaching query effectuée | `count(chat_queries WHERE user_id = X) >= 1` | Demander une question |
| ✅ Voice profile capturé | `tenant.voice_profile != null` | Demander 5 emails ou voice memo |
| ✅ Closed-won examples imported (si pertinents) | `count(closed_won_imports) >= 3` | Optional, but warning |

### Différentiateur volontaire vs Monaco — Self-serve depuis le début

Monaco bloque l'onboarding derrière un Forward-Deployed AE humain. Elevay réplique le **rôle** de cet AE en pure software (l'onboarding wizard ci-dessus) ET garde Martin disponible en **upgrade payant** ("Founder onboarding session — 30 min").

**Pricing implicite** :
- **Self-serve** ($X/mois) : onboarding wizard automatique
- **Founder-led** ($Y/mois, +$Z une fois) : Martin fait la session de 30 min et configure manuellement

**Effet** : économie d'échelle (1 Martin pour 100 clients self-serve) + offre premium pour ceux qui veulent l'XENIA humaine.

### Métriques d'efficacité de l'onboarding

| Métrique | Cible Monaco-équivalent | Mesure Elevay |
|---|---|---|
| Time-to-first-value (TAM built + 1st sequence sent) | ≤ 2 jours (Amy Yan : "We had our TAM built on day 2 and we're running outbound sequences that same day") | Track `tenant.created_at` → `first_sequence.sent_at`. Cible : <48h. |
| Time-to-first-meeting | "Within days" (verbatim) | Track `tenant.created_at` → `first_meeting.booked_at`. Cible : <14 jours. |
| Onboarding completion rate | Pas disclosed Monaco | Track % users qui passent les 7 phases. Cible : >70%. |
| Activation rate (J7) | Pas disclosed Monaco | Track % qui ont envoyé ≥10 emails à J7. Cible : >50%. |
| Retention M1 (J30) | Pas disclosed Monaco | Track % avec activité > 0 à J30. Cible : >80%. |

---

## PARTIE 7 — SYNTHÈSE EXÉCUTIVE — 5 ACTIONS PRIORITAIRES (P0)

Si Martin doit choisir 5 chantiers à attaquer dans l'ordre, voici les priorités absolues issues de cette analyse :

| # | Chantier | Étape Monaco | Pourquoi P0 | Effort | Owner |
|---|---|---|---|---|---|
| 1 | **UI per-sequence Approve/Reject buttons** | Étape 3 | Sans ça, Martin doit tenir le rôle FDAE manuellement à perpétuité. Avec, le founder peut être human-in-the-loop sans Martin. | M (2-3j) | Code Agent |
| 2 | **Visitor ID intégration (Snitcher/RB2B)** | Étape 2 | Le seul gap visible vs Monaco que les reviews indépendants flag (MarketBetter 4/8). Et Monaco ne l'a même pas — on les dépasse. | L (2-3 sem) | Code Agent |
| 3 | **Onboarding wizard 7-phases avec validation gates** | Tout | Sans ça, chaque client requiert 30h de Martin. Avec, on scale à 50+ clients. | L (3-4 sem) | UX + Code |
| 4 | **Coaching from real transcripts (RAG time-stamped citations)** | Étape 6 | Le coaching est notre différentiateur le plus visible (vs ChatGPT). Sans transcript-grounded coaching, c'est juste du LLM générique. | M (1-2 sem) | AI Engineer |
| 5 | **Auto-fill deal fields E2E test en prod** | Étape 5 | La feature existe en code mais jamais tournée en prod sur vraie data. Risque silencieux : démo bidon car les fields sont vides. | S (1j) | QA Agent |

---

## PARTIE 8 — SYSTÈME DE NOTATION / SCORING DE NOTRE ÉTAT

Format : *score actuel* → *cible Monaco-équivalent* → *cible Monaco-supérieur*

| Étape | Score Elevay actuel | Cible Monaco-equiv | Cible Monaco+ |
|---|---|---|---|
| Étape 1 — Build TAM | 70% | 85% (waterfall multi-provider + ML scoring) | 95% (CSV import fallback + LLM enrich self-serve) |
| Étape 2 — Overlay Signals | 75% | 90% (visitor ID + factual reasoning) | 95% (real-time signal feed) |
| Étape 3 — Execute Sequences | 85% | 95% (per-seq approve UI + low latency) | 98% (multi-channel email+LinkedIn+phone) |
| Étape 4 — Capture Activity | 75% | 90% (live extraction + native meeting recorder) | 95% (mobile capture) |
| Étape 5 — Track Pipeline | 80% | 90% (real-time stage transitions + tested auto-fill) | 95% (predictive close date ML) |
| Étape 6 — Ask Monaco | 85% | 95% (transcript citations + floating overlay) | 98% (proactive insights pushed) |
| **MOYENNE** | **78%** | **91%** | **96%** |

---

## ANNEXE A — INVENTAIRE DES FICHIERS DE RESEARCH UTILISÉS

**Research précédente** :
- `_research/teardown-monaco/teardown.md` (15.8KB)
- `_research/teardown-monaco/technical-and-community.md` (33.9KB)
- `_research/teardown-monaco/jobs-and-twitter-deep.md` (32.9KB)
- `_research/teardown-monaco/feature-video-frame-analysis.md` (7.3KB)
- `_research/monaco-team-analysis.md` (analyse 4 fondateurs + virtual team)
- `_research/monaco-vs-elevay-mapping.md` (skills mapping ETAPE par ETAPE)
- `_reports/monaco-conformity-checklist.md` (94% parity)
- `_reports/monaco-vs-elevay-honest.md` (79% reality)
- `_reports/monaco-competitive-playbook.md` (positioning playbook)
- `_reports/monaco-parity-diff.md` (TAM streaming sprint)
- `_research/ui-teardown/monaco-ui.md` (design forensics)

**Re-extraction live 2026-05-06** (`teardown-monaco-v3/`) :
- 15 screenshots full-page (homepage + 6 sub-pages + 3 sub-domaines + login + 4 trust tabs)
- 8 fiches de poste (txt + png) — toutes les positions actuelles
- 13 fichiers texte/HTML brut

---

## ANNEXE B — MAPPING FICHE DE POSTE → COMPÉTENCE INTÉGRÉE PRODUIT

Quelle compétence chaque rôle injecte-t-il dans le produit ?

| Fiche de poste | Compétence injectée dans le produit |
|---|---|
| AI Product Designer | UX patterns non-déterministes ; design system pour AI outputs ; "making unreliable data feel stable" |
| AI Engineer | RAG infra + agentic workflows + prompt engineering + structured outputs + memory + retries/fallbacks + LLM orchestration |
| Backend Product Engineer | Product features end-to-end ; Go/JS/TS + Python ; API ergonomics ; "AI to move faster" (=Cursor/Claude Code intégré dans dev workflow) |
| Frontend Engineer | Chat UI + copilots + agent-driven workflows + streaming + partial state + dynamic UI |
| Senior Platform Engineer | Event-driven pipelines + ML infra (training data, evaluation, embeddings, feature pipelines) + distributed systems + observability ML/data |
| Client Operations | Onboarding playbooks + TAM/signals/outbound configurations + speed-to-value + customer feedback loop to product |
| Forward-Deployed AE | Sales execution full-cycle + onboarding kickoff + ICP/buyer titles/signals/TAM/outbound strategy alignment + voice-of-customer to product roadmap |
| Founding Customer Success | Post-sales lifecycle + TAM refinement on expansion + outbound success advisory (ongoing!) + health scoring + account planning + voice-of-customer |

---

## ANNEXE C — VERBATIM CRITIQUES À MÉMORISER

Cinq phrases verbatim de Monaco qui devraient être encadrées dans le bureau de Martin :

1. *"Onboarding is where Monaco wins or loses."* (Client Operations JD)
2. *"Your pipeline should reflect what's happening, not what got logged. Stages, risks, and next steps that reflect reality — not rep hygiene. Monaco does the updating, You do the selling."* (/product Step 5)
3. *"It is the system that maintains itself."* (/product Step 4)
4. *"This is not a relationship management role - it's a revenue and strategy role that happens to sit post-sale."* (Founding Customer Success JD)
5. *"Monaco doesn't just recommend outreach. It executes it."* (/product Step 3)

Chacune révèle un principe : (1) onboarding = différentiateur ; (2) pipeline = reality not bureaucracy ; (3) self-maintaining = zero data entry ; (4) CS = revenue not relationship ; (5) execution = autonomy not suggestion.

---

## FIN

**Ce livrable est exhaustif sur ce qui a été collecté. Les angles morts résiduels** (à explorer dans des cycles futurs) :
- L'expérience produit interne en compte payant (impossible sans Auth0 access — Martin pourrait demander un demo)
- Les patterns UX exacts du dashboard `/insights` Monaco (pas vu en frame video, juste mention)
- Le contenu des Slack channels customer Monaco (privés)
- Les notes de coaching réelles produites par Ask Monaco sur 30+ deals (privées)
- L'API publique Monaco (existe mais non documentée)

Pour combler ces angles morts : suggérer à Martin de **demander un demo Monaco** sous identité néitre (founder d'une startup AI early-stage US-based) — c'est le seul moyen de voir l'expérience complète et le forward-deployed AE en action.
