# MAITRISE GTM — 03 : Adaptation Verticale du Funnel Outbound

> Comment l'outbound B2B change STRUCTURELLEMENT par vertical — pas "tips pour vendre a X." Les differences fondamentales en signaux, channels, cycles, win rates, language register, et ce qui casse le playbook standard. Pour Elevay, profondeur prioritaire sur devtools / SaaS-for-SaaS / martech / DTC. Healthcare et cybersecurity en couverture lighter. Pret a etre converti en feature produit (vertical-aware orchestration) ET en thought leadership.

> **Polytropos applique :** la maitrise de l'outbound n'est pas un seul playbook. C'est un meta-playbook qui s'exprime differemment dans chaque vertical. Le SaaS-for-SaaS founder ecrit un email avec specificite extreme et zero "synergy." Le devtool founder envoie un lien GitHub qui pre-resout le bug. Le DTC founder DM sur Twitter avec un test concret. Memes principes. Mille visages. Le produit qui force tout le monde dans le meme template echoue par definition.

---

## 1. Premier principe

Tous les "tips for selling to {vertical}" sur le web sont superficiels. Ils donnent des nuances de language ("dans la finance, dites compliance, pas process"). Ils ratent ce qui compte vraiment : **l'architecture meme du funnel change par vertical**. Les signaux predictifs changent. Les canaux qui marchent changent. Les cycles changent par 5x ou 10x. Les win rates par segment changent. Le ratio de stakeholders change. La structure du procurement change.

Un seul exemple suffit pour montrer l'amplitude :

| Dimension | Devtools (PLG, founder buyer) | Cybersecurity (enterprise CISO) |
|---|---|---|
| Cycle | 1 semaine - 4 mois | 9-18 mois |
| Stakeholders | 1-3 | 5-12 |
| Reply rate cold | 1-3% | < 1% |
| Channel #1 | GitHub / HN / Reddit | Analystes (Gartner) |
| Acquisition principale | Activation usage trigger | Trigger reactif (breach/audit/mandate) |
| Sales rep adequat | Technical advocate / DevRel | Ex-defender + Gartner relations |
| Volume hebdo cold viable | 100 hyper-specifiques | 0 (orchestration ABM only) |
| ACV typique | $20-500 self-serve OR $25k-250k mid | $250k-5M |

C'est le meme metier en theorie ("vendre du SaaS B2B"). En pratique c'est deux disciplines differentes. Vouloir les unifier sous un seul playbook produit du noise dans les deux.

**Ce que la maitrise verticale ajoute :** la capacite de generer le bon funnel-architecture pour chaque vertical d'un meme tenant, sans configuration manuelle. C'est polytropos applique — le meme produit s'exprime differemment selon le vertical du prospect.

---

## 2. Baseline cross-vertical (les constantes 2026)

Avant les differences, ce qui ne change pas :

- **Reply rate cold email moyen** : 8.5% (2019) → 5% (2025) → **3.43%** (2026). Top quartile = 5.5%, elite = 10%+.
- **Spam complaints** montent 0.5% → 1.6% par email #4 ; unsubscribes 0.1% → 2%. Sequence sweet spot = 4-7 steps.
- **Achat B2B moyen** = 13 stakeholders, 89% des decisions cross-departments (Forrester State of Business Buying 2024).
- **Multi-canal** (email + LinkedIn + phone) = +287% engagement vs single-channel ; 3+ touchpoints = 8x reply.
- **Open rate est casse** depuis iOS 15 / MPP — Apple Mail = 49% des opens, preloads les pixels. Real opens ≈ 60% du reported.
- **Auto-replies** = 45% de tous les replies ; seulement 14% sont vraiment positifs.
- **Le signal de timing** (job change, funding, website visit) est le **plus gros driver unique** de reply rate — plus que copy, subject, ou personalization combined.

Maintenant, les differences.

---

## 3. DEVTOOLS / INFRASTRUCTURE / APIs

### 3.1 Buyer profile

**Real buyer ≠ user.** Les ICs (engineers individuel contributors) ne SIGNENT pas. Ils evaluent, advocate, adopt. Les buyers sont **VP Engineering, CTO, Eng Manager, ou Platform/SRE/Security lead** (le dernier groupe a la plus haute influence cross-stack).

**Discovery channels (ordre d'efficacite) :**
GitHub + Stack Overflow + HN + Reddit (r/programming, r/devops) + Discord/Slack communities + tech blogs + peer mentions (26%) + community mentions (13%) **>>> cold email (5.4% seulement)**.

**Trust hierarchy :** working code > benchmarks vs concurrent > peer en HN comment > engineering blog post > vendor case study > vendor claim. Le marketing vendor est tout en bas.

### 3.2 Signaux specifiques devtools

**Forts (predisent achat) :**
- Activation milestone hit (deployed first integration, processed first 1k requests, opened second project)
- Hit 80%+ du free-tier quota (le canonical "expand" trigger Datadog utilise)
- Pricing page visit APRES activation (pas avant)
- Documentation visits aux pages enterprise (SSO, SAML, audit logs, on-prem)
- Support questions integration-specific
- Comportement champion : forking repos, opening PRs, multiple devs from same org starring/forking
- Job posting "DevOps Engineer using [your tech stack]" ou "migrating to Kubernetes/Postgres/Snowflake"
- Tech stack change (StackShare/BuiltWith delta, GitHub repo language shift)

**Inutiles ou trompeurs :**
- Raw signups (cold signups → reaching out est "a losing strategy" per Correlated)
- Newsletter opens
- Whitepaper downloads (devs traitent comme data funnel)
- LinkedIn job titles seuls (un "Senior Engineer" chez Stripe ≠ "Senior Engineer" chez startup 5-personnes)

### 3.3 Messaging adaptations

**Insider language :** noms specifiques de frameworks ("we batched the Drizzle inserts in a single transaction"), specific failure modes ("p99 latency", "cold start", "tail latency"), benchmark numbers, version numbers, github links.

**Instant deletion :** "synergy," "revolutionary," "seamless," "high-velocity," "AI-driven," "rock-star engineers," "10x productivity," "transform your engineering team," "unlock developer experience."

**Code-switch — meme value prop, 3 audiences :**
- VP Eng : "Cuts incident MTTR by ~40% by surfacing the failing service before paging."
- CTO : "Reduces on-call burden so we kept our 3 senior eng instead of losing them to burnout."
- CFO/board : "Reduces SEV-1 incidents by 35%, avoids ~$X/yr in infra over-provisioning."

Le meme produit a besoin de 3 proof artifacts differents pour gagner le buying committee.

**Anti-patterns :**
- "Book a demo" avant de montrer le produit → 73% abandon
- Hidden pricing → instant trust loss
- "Hi {firstName}, noticed you're at {company}" → AI template, deletion
- Pitcher le dev directement pour "buy" — il ne signe pas

### 3.4 Funnel benchmarks

| Metrique | Range |
|---|---|
| Reply rate cold (a IC) | 1-3% |
| Reply rate triggered (activation-based) | 5-10% |
| Cycle | <$5k ACV : 1-4 semaines (PLG). $25-100k : 2-4 mois. $100k+ : 4-9 mois. |
| Win rate | <$10k ACV : ~31% / $100k+ : ~15% |
| ACV distribution | **Bimodal** : $0-500 self-serve OR $25-250k mid OR $500k+ enterprise. **Tres peu de milieu.** |
| Stakeholders | 1 self-serve / 3-5 mid / 7-13 enterprise |
| % Series A devtools enabling PLG | 50% (vs 39% all industries) |

### 3.5 Sales cycle structure

```
1. Free tier signup / activation        (no human contact)
2. Usage threshold reached              (THE buying signal — 80% of plan)
3. Champion identification              (who in the org cares?)
4. Internal mapping                     ("help map their organization")
5. Manager / VP Eng evaluation          (security review, integration plan)
6. Procurement + security questionnaire (where deals stall — 90 days)
7. Contract                             (legal redlines on data residency)
```

**Stalls :** security questionnaire (90 jours), legal redlines DPA, "we already have something" inertia.

**Evidence qui bouge :** SOC 2 + ISO 27001 day 1, public status page, public security.txt, named-customer references same vertical/stage.

**POC :** working in their environment <1 jour. Sandbox + sample data table stakes. Production POC with real data <2 semaines pour enterprise.

### 3.6 Cultural / psychological

**Earns credibility instantly :** open-source repo, technical blog post solving an obscure bug, founder ex-engineer at known company, transparent docs, GitHub issues answered <24h, public Slack with engaged founder.

**Destroys credibility instantly :** "Schedule a 15-min discovery call," gated whitepaper, "AI-powered" without mechanism, slow doc updates, closed-source SDKs without audit.

**Insider knowledge tells :** knows difference between SOC 2 Type I and Type II, knows what "blast radius" means, references specific RFCs, mentions trade-offs honnetement ("we're slower than X for {use case}, faster for {other}").

**Communautes :** Hacker News, Lobsters, GitHub topic threads, language Discords (Rust/Go/Elixir/Python), specific Slacks (Kubernetes, MLOps, Locally Optimistic, Data Engineering), r/devops, r/sre, r/programming, dev.to, daily.dev.

### 3.7 Cold email exemple — ce qui marche

```
Subject: question on your Postgres migration

Saw your job post for a Senior Platform Eng "comfortable 
with Postgres → CockroachDB migration." We sit in that 
exact stack — Stripe, Replicate, Cursor all moved off RDS 
in the last 12mo using {tool} and one of them (Replicate) 
wrote it up: {link}.

If useful, the gotcha none of them caught was {specific 
technical detail}. Happy to share the runbook even if 
{tool} is wrong fit.

{first name}
```

**Mechanism :** triggered par signal (job post), specifique (Postgres → CockroachDB), peer references in same stage/stack, leads with give (runbook), no demo ask, no "synergy."

**Wrong vertical translation (meme offre, salespeak) :**
```
Subject: Quick question

Hi {firstName}, hope you're well! I'm reaching out because 
I noticed {company} is scaling fast and I wanted to share 
how our AI-powered platform is helping companies like yours 
unlock developer productivity by 10x. Could we schedule a 
15-min discovery call this week?
```

Deleted in 1.5 secondes. No specificity, "AI-powered" trigger, generic peer claim, demo-first ask.

### 3.8 Ou le playbook standard CASSE pour devtools

- **"Higher volume = more replies"** → faux. Devs route generic outreach to spam. **100 hyper-specifiques outperforment 1000 generiques.**
- **"Multi-touch sequences"** → diminishing returns. Devs voient les follow-ups comme harassment. **3 max** si no response.
- **"Demo as primary conversion"** → backwards. PLG signup → activation → reach out est le bon path.
- **"SDR/BDR cold-calling"** → mostly useless. Replace par technical BDRs / "developer advocates" qui repondent aux questions specifiques.

**Replace par :** product-led signals, community presence, technical content, founder-in-the-loop, middle-out (dev adoption + manager pitch simultaneously).

### 3.9 Donnees specifiques

- Cold email channel effectiveness : **5.4%** des devs decouvrent produits via cold email (lowest of any tech vertical)
- LinkedIn for devs : 30% acceptance rate, 35% in tech specifically. Devs least responsive to InMail.
- PLG free trial → paid : ~25% average pour trials, 30-39% avec PQL signal
- Freemium → paid : 12% median visitor → trial ; ~9% trial → paid average

---

## 4. SAAS-FOR-SAAS / REVOPS / SALES TOOLS — Le vertical d'Elevay lui-meme

### 4.1 Buyer profile

**Titles :** RevOps Director, VP Sales Ops, Head of GTM, Head of Demand Gen, Director Marketing Ops. Founder/CEO at <50-person companies.

**Sophistication :** **La plus haute de tous les verticals.** Ils utilisent 23 outils en moyenne. Ils ont ete pitched par chaque autre vendor. **Ils reverse-engineer les outreach pour s'inspirer.**

**Discovery :** Slack groups peer-to-peer (Pavilion, RevGenius, Wizards of Ops, Modern Sales Pros, ProductLed, Demand Curve), LinkedIn (ou ils vivent), G2/Capterra a evaluation, podcasts (30 Minutes to President's Club, Pavilion's Topline). **Cold email est performatif** — ils le critiquent publiquement.

### 4.2 Signaux

**Forts :**
- Hired new RevOps/Sales Ops leader (60-90 jours avant tool buying)
- Funded round (Series A/B = stack rebuild)
- Public posting "we use [competitor]" ou migrated off
- Switched CRM (HubSpot → Salesforce ou vice versa = ~6mo de stack chaos = budget loosens)
- Hiring sales reps at scale (2x AE roles open)
- **Posted in community asking for tool recommendations** (most undervalued signal — direct intent)
- Conference attendance (SaaStr, Dreamforce, Sales Hacker, Outreach Unleash)

**Inutiles :**
- "Decision maker title" at companies where no GTM motion exists (pre-revenue)
- LinkedIn engagement on vendor content (compliance gesture, not intent)
- "Growing fast" signals — every B2B SaaS claims that

### 4.3 Messaging

**Insider language :** "RevOps stack," "ICP refresh," "lead-to-opp conversion," "MQL→SQL handoff," "pipeline coverage," "GTM motion," "AE quota attainment," "channel mix," "expansion ARR," "NDR." **Mention specific competitors by name** with trade-offs (signal of confidence).

**Deletion triggers :** "Drive predictable pipeline," "transform your sales process," "AI-powered prospecting," "10x your outbound." **This audience built these phrases — they spot template instantly.**

**Code-switch :**
- VP Sales : "Closes the gap between AE pipeline gen activity and what your CRO sees in board decks."
- RevOps Director : "Auto-creates the multi-touch attribution view that's been a manual sheet update every Monday."
- CRO : "Cuts the time-to-quota for new hires from 4mo to 2.5mo by surfacing the next best action."

**Anti-pattern :** Pitcher feature-parity vs un established player — they assume parity within 12mo. **Pitcher mechanism (how it does it differently) wins.**

### 4.4 Funnel benchmarks

| Metrique | Range |
|---|---|
| Reply rate cold | **1-3% (lower than average)** — they route everything to spam. Top performers 5-7% avec specificity + signal extremes. |
| Cycle | 30-90j SMB, 3-6 mois mid, 6-9 mois enterprise |
| Win rate | Lower than other categories pour vendor proliferation — they shortlist 5-10, not 2-3 |
| ACV | $5-50k SMB, $50-200k mid, $200k+ enterprise (per-seat pricing common) |
| Stakeholders | 5-8 typical (RevOps + sales + marketing + finance + IT) |
| Replacement market | ~70% des deals = competitive replacements, not greenfield |

### 4.5 Sales cycle structure

```
1. Awareness via peer/community            (NOT vendor outreach)
2. G2/Capterra research                    (lecture des reviews, surtout negatifs)
3. Shortlist 3-5 vendors
4. Demo round-robin                        (back-to-back pour comparison)
5. POC avec leur data                      (mandatory pour > $25k)
6. Pricing negotiation                     (audience BRUTAL — 25-40% off list common)
7. Procurement + InfoSec review
8. Contract
```

**Stalls :** POC ROI proof point (need measurable lift number), price-anchoring vs concurrent.

### 4.6 Cultural / psychological

**Earns credibility :** Founder posts on LinkedIn about own RevOps mistakes ; transparent pricing ; **"we don't do X" disclaimer** (anti-feature) ; references named at companies they know.

**Destroys credibility :** "Industry-leading," "best-in-class," "trusted by" without naming, gated demo qui est en fait sales call, "AI-powered" sans mechanism, marketing-team-written cold emails (recognized par le tone).

**Insider tells :** Difference between LeanData et Distribution Engine (lead routing), HubSpot Operations Hub vs Workato vs Zapier (automation tier), Outreach vs Salesloft pricing model. **"L'integration avec Apollo est broken since their April release"** earns instant credibility.

**Communautes :** Pavilion, RevGenius, Wizards of Ops Slack, Modern Sales Pros, ProductLed, GTM Partners, RevOps Co-op, Demand Curve.

### 4.7 Cold email exemple — ce qui marche pour RevOps

```
Subject: how Cribl handles SQO→Closed Won attribution

Saw your post in RevGenius asking how teams handle 
attribution when ABM and inbound overlap on the same 
logo. We hit the same wall last year — ended up writing 
a piece on it: {link}.

One specific thing in that post: when {Cribl-style 
company} hit it, they were running Salesforce Campaigns 
+ UTM-only and had a 22% logo dispute rate at QBR. The 
fix that worked: {specific tactical detail}.

Happy to share the SQL query we used (no pitch, 
genuinely useful).

{first name}
```

**Mechanism :** community signal (post in their Slack), peer name in same archetype, specific failure metric (22% dispute rate), teach-don't-pitch close, **"no pitch" disclaimer** (this audience needs it).

### 4.8 Ou le playbook casse pour RevOps

- **"Personalize at scale"** → cette audience a CONSTRUIT scaled personalization. Ils detectent les AI-personalized openers (Sales Navigator scrape patterns). **Real specificity wins ; "noticed you went to Stanford" loses.**
- **"Push for the demo"** → cette audience demos for sport. Pushy = lose deal.
- **"Multi-channel cadence over 21 days"** → annoying. They want **signal-relevance, not cadence-relevance.**

### 4.9 Donnees

- Channel effectiveness : **LinkedIn DMs > email > phone** (cette audience deteste les calls). LinkedIn connect rate 35-50% in tech.
- Win rate inversement correle avec vendor count in shortlist — be 1 of 3, not 1 of 7.
- 7-8% per-quarter trial-to-paid pour opt-in PLG ; 17-18% on credit-card-required trials.

### 4.10 Implication majeure pour Elevay

**Elevay vend exactement a ce vertical.** L'audience la plus skeptique, la plus pattern-aware, la plus over-prospected. Implication : **chaque email envoye par Martin a un prospect Elevay est juge par quelqu'un qui a construit des outils de scaled personalization lui-meme**. Le moindre hint de template = mort instant.

Le produit Elevay doit ETRE le case study de sa propre audience. Si Martin envoie un email RevOps avec une tournure que la cible aurait elle-meme rejetee → credibilite brulee. C'est le test le plus dur. Si Elevay survit ce test, il survit partout.

---

## 5. MARKETING TECH / ADTECH

### 5.1 Buyer profile

**Titles :** CMO, VP Marketing, Director Demand Gen, Head of Growth, Marketing Ops Manager. CMO at >$50M, VP/Director $5-50M, founder/Head of Growth <$5M.

**Mood :** **Brulees.** Carrying two headaches : seulement 41% peuvent prove ROI ; 25% du budget estimated wasted on metrics qui ne translatent pas en revenue. Les CFOs leur demandent des hard ROI numbers qu'ils ne peuvent pas produire.

**Discovery :** Newsletters (Marketing Brew, Demand Gen Report, MarTech.org), LinkedIn (ou ils vivent), CMO Slack groups, conferences (B2BMX, MarTech Conference), peer in network.

**Sophistication :** Variable. Strategic CMOs highly sophisticated ; tactical Demand Gen often hands-on but pattern-blind to vendor tactics they'd reject from their own SDRs.

### 5.2 Signaux

**Forts :**
- New CMO/VP Marketing hired (rebuild stack within 6mo)
- Funding event (martech budget jumps 30-50% post-Series B)
- Tech stack switch (BuiltWith delta on tracking pixels, marketing automation)
- Public earnings/board pressure on CAC ou pipeline
- **Layoffs in marketing → consolidation → "replace 3 tools with 1" buying mode** (very hot in 2026)
- Webinar attendance, podcast download (warmer than form fill)

**Inutiles :**
- Whitepaper downloads (compliance gesture)
- LinkedIn likes on posts (no signal)
- "Engaged" in nurture campaigns (gamed metric)

### 5.3 Messaging

**Insider :** "Pipeline coverage," "MQL→SQL," "ABM tier 1/2/3," "intent data," "buyer group," "dark social," "demand capture vs creation," "in-market accounts," "SQO velocity." Reference frameworks (April Dunford, Chris Walker dark funnel, MEDDPICC).

**Deletion :** "Revolutionary AI marketing platform," "drive ROI," "unlock growth," "predictable pipeline" (everyone says this), "10x your demand gen."

**Anti-pattern :** Showing them how *you* do outreach as a brag — they grade it. **Be honestly imperfect.**

### 5.4 Funnel benchmarks

- Reply rate : 1-3% — most over-prospected audience apres RevOps
- Cycle : 60j SMB, 3-6 mois mid, 6-12 mois enterprise
- ACV : $5-25k SMB, $25-100k mid, $100k-1M enterprise
- Replacement-rate market : 60%+ deals switch from competitor
- **Churn : tres elevee in martech — 15-30% annual gross churn common** ; le vertical le plus high-churn de B2B SaaS
- Trend 2026 : AI-built tools displacing existing martech (vendors losing seats to in-house Claude/GPT builds)

### 5.5 Cycle, communautes, evidence

Cycle : CMO/VP intent → Demand Gen Director research → Marketing Ops vets technical fit → Demos with 3-5 vendors → **Reference calls** (heavily weighted) → Procurement + IT/security review → Contract.

**Stalls :** ROI proof, integration cost (rip-and-replace pain), "we just bought X 6 months ago." **Champions get burned because previous tool didn't deliver — risk-aversion runs high.**

**Earns credibility :** Real attribution data, named customers in same segment, **specific lift numbers ("11% lift in MQL→SQL," not "300% better")**, founder-as-thought-leader (Chris Walker, Sangram Vajre archetype).

**Communautes :** Pavilion, Demand Curve, Exit Five, Cabal, Demandbase Community, MarketingProfs, GTM Partners.

### 5.6 Donnees

- 40% du marketing budget reportedly wasted (median estimate by leaders)
- 67% des dashboards "show success that fails to translate to revenue"
- Per-seat pricing dying — 70% des nouveaux contrats martech 2026 shift vers platform/usage-based

---

## 6. E-COMMERCE / SHOPIFY ECOSYSTEM

### 6.1 Buyer profile

**Buyer = founder-merchant** (sub-$10M GMV) ou **Head of Ecom / Ops** ($10-100M) ou **VP Digital / CMO** ($100M+).

**Personality :** Action-oriented, scrappy, paranoid sur CAC. Run their own LinkedIn. Live in DTC Slack groups.

**Discovery :** **Twitter/X (DTC Twitter is a real thing), Shopify App Store, eCommerceFuel, Triple Whale community, Workspace6, Foundr DTC Newsletter, podcasts (DTC Podcast, Lenny Rachitsky, Andrew Faris)**. Cold email mid-effective.

### 6.2 Signaux

**Forts :**
- Recently launched Shopify store (BuiltWith new Shopify install <90 jours)
- Switched themes (active redesign = open to new tools)
- Hired their first marketer (typically "Head of Growth" hire)
- Running paid ads heavily (visible Meta Ad Library, Google Ads transparency)
- **Plus tier upgrade (Shopify Plus = budget exists)**
- App install of complementary tool (e.g., installed Klaviyo = ready for SMS = ready for postpurchase = ready for reviews)
- **Holiday seasonality :** planning starts April-May for Q4 in US (EU starts July). **Outbound is hopeless Nov 1 - Jan 15** (operators heads-down on BFCM).

**Inutiles :**
- LinkedIn job titles (founders use "CEO" but might be 1-person shop)
- Static GMV estimates (Similarweb is wildly inaccurate for DTC)
- Generic "ecommerce" lists from Apollo

### 6.3 Messaging

**Insider :** "BFCM," "AOV," "LTV:CAC," "ROAS," "POAS," "bottom-funnel," "creative testing," "post-purchase," "subscription rate," "winback flow," "abandoned cart sequence." Reference Klaviyo, Triple Whale, Northbeam, Postscript, Yotpo by name.

**Deletion :** Generic "scale your DTC brand," "increase sales by 30%," "AI-powered shopping," "boost conversions" (everyone says this). They've heard it all.

**Code-switch :**
- Founder ($1-10M GMV) : "Get LTV up by ~$8 per customer with one new email flow."
- Head of Ecom ($10-100M) : "Backfill a winback flow we A/B tested at AG1 — added 4% to total revenue."
- VP Digital (>$100M) : "Subscription rate from 8% → 14% over 90 days at Magic Spoon, holds during BFCM."

### 6.4 Funnel benchmarks

| Metrique | Range |
|---|---|
| Reply rate | **3-7% — better than other verticals** (founders read founders) |
| Cycle | **Le plus rapide de tous les B2B verticals — 1-14 jours pour <$5k tools**, 30-60 jours pour $10k+ |
| ACV | $0-500/mois SMB self-serve, $500-5k/mois mid, $5k+ enterprise/Plus |
| Win rate | 25-40% — high parce que cycle court, low risk |
| Stakeholders | 1-2 (founder + maybe operator). Procurement non-existent for sub-$5k. |
| App store flywheel | install → trial → paid in 14 days for ~30% of installs |

### 6.5 Sales cycle

```
1. App store discovery OR peer recommendation in DTC slack
2. Install / free trial
3. Self-serve evaluation (often within 24h)
4. Decision (founder makes call usually that week)
```

Pour merchants plus gros : Heard from peer → Demo (informal, often async loom) → Sandbox / trial install → Decision.

**Stalls :** integration with their stack (Klaviyo, Recharge, Gorgias must work), trust ("will this slow my site?"), price anchoring vs alternative app.

### 6.6 Cultural / psychological

**Earns credibility :** Founder posts BFCM results on Twitter ; "How we do X at $50M GMV" thread ; ex-DTC operator-turned-founder ; transparent A/B test data ; integrating with les outils qu'ils aiment deja.

**Destroys credibility :** Generic SaaS branding, talking like a software company instead of an operator, slow Shopify App Store approval, doesn't know what GMV vs revenue is, "B2B" jargon.

**Communautes :** **DTC Twitter (where deals happen), eCommerceFuel ($25k+ revenue gated community), Triple Whale Slack, Workspace6, Limited Supply (Nik Sharma), DTC Newsletter, r/Shopify, r/ecommerce**.

### 6.7 Cold email — ce qui marche pour DTC

```
Subject: re: AG1's BFCM email flow

Saw you mentioned in your last newsletter that 
subscription is your #1 lever for 2026. Skimmed AG1's 
recent email — they swapped their winback flow last 
quarter and 4% of total revenue moved into it.

One detail: they sent the winback at day 32, not 21. 
Counterintuitive but worked at their AOV ($79). Wrote 
up the test: {link}.

If you're A/B testing winback timing, happy to share 
their exact send schedule.

{first name}
```

### 6.8 Ou le playbook casse pour DTC

- **"6-touch sequence over 21 days"** → DTC founders make decisions in <72h or never. Touch 3 = irrelevant.
- **"LinkedIn for B2B"** → DTC operators live on Twitter/X, not LinkedIn.
- **"Schedule a demo"** → many DTC tools win avec async Loom or trial-no-call.
- **"Discovery call"** → founder-merchants don't take 30-min discovery. They want a 5-min Loom or trial.

### 6.9 Donnees

- Reply rate to merchants : 3-7% (higher than tech)
- App store conversion : install → trial → paid ≈ 25-40% pour top apps
- Best channel : **Twitter DM > email > LinkedIn DM > cold call (basically dead in DTC)**
- Decision speed : 24h-7 jours pour sub-$5k apps ; 14-60 jours pour $10k+

---

## 7. FINTECH (couverture)

### 7.1 Buyer profile et signaux

**Titles :** CFO, VP Finance, Head of Treasury (corp fintech) ; Chief Risk Officer, Chief Compliance Officer (banking infra) ; CTO + Head of Engineering (developer fintech) ; Head of Product, VP Engineering (embedded fintech).

**Sophistication :** **Highest paranoia of any vertical.** Personal regulatory liability creates risk-aversion that dwarfs cost concerns.

**Signaux forts :**
- Regulatory deadline announced (EU DORA, US data privacy law, OCC bulletin)
- Compliance audit cycle approaching (annual SOC 2, PCI DSS, ISO 27001)
- **Recent enforcement action against peer (industry-wide buying frenzy)**
- New funding (Series B+ → compliance tooling becomes priority)
- Hired Compliance Officer / Risk Officer (60-90 jours signal)
- Bank partnership announced (BaaS arrangements trigger formal diligence)

### 7.2 Funnel benchmarks

- Reply rate : 1-2% (cold), 4-7% (warm/triggered)
- Cycle : **9-18 mois enterprise fintech, 12-24 banques/insurers**
- ACV : $25k SMB, $100-500k mid, $1M+ enterprise
- Stakeholders : **9-18** (CFO, CIO/CTO, CRO, CCO, Legal, Procurement, Ops, Product, Board)
- **Procurement : 47-page security questionnaire is normal** ; deals stall 90 jours easily

### 7.3 Cycle structure (Insivia 4-stage)

```
1. Trust formation     (you must look "compliant" before pitching)
2. Risk reduction      (questionnaires, certifications)
3. Internal alignment  (champion sells internally)
4. Decision justification (post-decision blame insurance)
```

**Most teams only address stage 4.** Engineering compliance readiness upfront compresses **18mo → 9mo**.

### 7.4 Insider language vs deletion triggers

**Insider :** "OCC bulletin," "Reg E," "BSA/AML," "KYC/KYB," "CIP," "SOC 2 Type II," "PCI DSS Level 1," "OFAC," "FedNow," "RTP," "ISO 20022," "PSD2," "DORA," "GLBA." **Cite specific framework + version.**

**Deletion :** "Disrupt finance," "AI-powered banking," "future of fintech," "frictionless compliance" (compliance officers HATE "frictionless"). Compliance buyers want **friction in the right places**.

### 7.5 Earns credibility instantly

Cite specific OCC bulletin number ; reference actual regulation paragraph ; pre-built "compliance deck" delivered in first email ; ex-regulator on team.

### 7.6 Donnees

- 9-18 mois cycle median
- Procurement adds 30-45 jours to verbal commit
- Ready-made compliance pack reduces cycle by **30-50%**

---

## 8. CYBERSECURITY (couverture)

### 8.1 Buyer profile

**Real buyer = CISO** at enterprise ; **CIO + IT Director + CFO** at mid-market ; **CTO + Founder** at startups.

**Critical fact :** **CISOs at enterprise sont influencers, NOT final approvers** — procurement, IT, sometimes CFO sign off. SMB CISO has full purchasing authority.

**Mood :** Pattern-blind to vendor outreach. **Receive 60 cold emails/week, reject most in <5 seconds.**

### 8.2 Signaux

**Forts (massively dominant) :**
- **Recent breach disclosure (8-K filing, news mention)**
- Audit failure (PCI DSS, SOC 2, HITRUST)
- New compliance mandate (NYDFS Part 500 amendment, CMMC for DoD contractors, DORA for EU)
- Hired CISO (60-90 jours window before tooling buy)
- Recently raised insurance premium / cyber insurance application
- Vendor consolidation initiative (CFO-mandated)

**77% of cybersecurity spending is reactive** — triggered by incident or audit failure. Demand creation is secondary to reactive moment capture.

### 8.3 Funnel benchmarks

- Reply rate cold email : **<1% (one of lowest in B2B)** ; orchestrated multi-channel ABM = 4x lift
- Cycle : 128 jours pour $50-100k ACV deals + 30-45 jours procurement ; 9-18 mois pour $250k+
- ACV : $25-50k SMB, $50-250k mid, $250k-5M enterprise
- Stakeholders : 5-12 (CISO + IT + procurement + legal + parfois board pour >$500k)
- **Vendor count : 4,000+ active cybersecurity vendors → buyers shortlist via analyst quadrants**

### 8.4 Insider vs deletion

**Insider :** Specific MITRE ATT&CK technique IDs (T1078, T1190), CVE numbers, NIST controls (CSF 2.0, 800-53), specific frameworks (SOC 2 CC6.1, ISO 27001 A.9), vendor categories (XDR, EDR, ASM, SASE).

**Deletion :** "Revolutionary AI security platform," "next-gen cybersecurity," "unprecedented protection," **"FUD" — fear-uncertainty-doubt is dead post-2020.** CISOs see through it.

### 8.5 Donnees

- 99% des cold emails to CISOs fail
- 4x engagement avec multi-channel ABM + intent signals
- 68% of buyers read 3+ pieces of content avant engagement
- Webinar conversion 23% (vs B2B average 12%)

### 8.6 Implication

Outbound demand-creation mostly fails in cybersecurity. **Smart vendors invest in analyst relations + Gartner inclusion** > SDR teams. PLG ne marche pas — security buyers won't run unverified tools on prod.

---

## 9. HR TECH / PEOPLE OPS (couverture)

### 9.1 Profile et signaux

**Buyer :** CHRO leads economic decision ; **IT integrates and gates** ; Legal/Compliance reviews ; Finance signs off ; Payroll specialist tactical user.

**Signaux forts :** New CHRO/VP People hired (60-90 jours signal) ; Funded round + hiring spree ; Layoffs (consolidation buying) ; Switched HRIS (Workday → BambooHR ou vice versa) ; **Open enrollment season (Aug-Nov US benefits buying)** ; Acquisition (M&A integrates HR systems) ; Compliance update.

### 9.2 Funnel & messaging

- Reply rate : 2-4% (warmer audience que RevOps/martech)
- Cycle : 60-90 jours SMB, 4-6 mois mid, 6-12 mois enterprise
- Stakeholders : 6-13 (heavier than most pour data sensitivity)

**Insider :** "HRIS," "ATS," "open enrollment," "I-9," "Form 5500," "ACA," "EEO-1," "FMLA," "ADA," "headcount planning," "comp bands," "9-box."

**Channel dominant :** **LinkedIn** — c'est le seul vertical ou LinkedIn outperforme email significativement.

### 9.3 Communautes

SHRM, ATD, HR Tech Conference, Josh Bersin Academy, Hung Lee's Recruiting Brainfood, People Ops community Slack, Lattice/15Five communities.

---

## 10. HEALTHCARE IT (couverture)

### 10.1 Profile

Hospital systems : CMO + CNO + CIO + CFO + Chief Compliance + Chief Quality. **6-10 stakeholders minimum.**

### 10.2 Signaux

**Forts :** RFP issued (capital cycles every 3-7 years) ; New CIO/CMO/CNO hired ; M&A activity ; Quality metric failure (CMS Star ratings, HEDIS, Joint Commission) ; New regulatory mandate (CMS Interoperability Rule, ONC HTI-1, HIPAA TEFCA).

### 10.3 Funnel

- Reply rate cold : 1-3% (heavily gatekept)
- Cycle : **8 mois average ; 12-24 mois enterprise health systems**
- ACV : $50k-5M+ (massive range)

**Insider :** "EHR," "EMR," "FHIR," "HL7," "ICD-10," "CPT codes," "CMS-HCC," "value-based care," "ACO," "MIPS," "HEDIS," "RWD/RWE," "TEFCA," "21st Century Cures."

Cold outbound a yield minimal — relationships, conferences, et **KLAS rankings drive the funnel**.

---

## 11. VERTICAL SaaS — Legal, Construction, Manufacturing (couverture)

### 11.1 Le test critique

**Buyer = practitioner-operator** (managing partner, project manager, plant manager) more often than dedicated IT.

**Sales reps must be domain experts.** SaaStr's headline finding : "the biggest challenge with vertical SaaS is your sales team has to be domain experts." Generic SaaS reps fail.

### 11.2 Insider vs outsider

**Per vertical :**
- Legal : "trust accounting," "IOLTA," "matter management," "billable hour realization," "WIP," "conflicts check."
- Construction : "submittal," "RFI," "pay app," "punchlist," "as-built," "bond," "liens."
- Manufacturing : "MRP," "BOM," "MES," "PLM," "OEE," "takt time," "yield."

**Using the wrong vocab = instant outsider tag.**

### 11.3 Funnel

- Reply rate : 3-7% (domain-expert outbound outperforms because so few vendors get it right)
- Cycle : 12-18 mois legal, 6-12 mois construction, 9-18 mois manufacturing
- Win rate : **HIGHER than horizontal (40%+ for shortlisted)** parce que parity is rarer

### 11.4 Ou le playbook casse

- Generic SaaS sales reps can't pass "vocabulary test" in first call → deal dies
- Self-serve PLG works less often (workflows trop specialized)
- **Trade shows + association memberships > most digital outbound**

---

## 12. Tableau cross-vertical synthese

| Vertical | Reply rate | Cycle | ACV typique | Stakeholders | Best channel | Hot signal |
|---|---|---|---|---|---|---|
| **DevTools** | 1-3% cold, 5-10% triggered | 1sem-9mo | $0-250k | 1-13 | Activation + community | Hit 80% quota |
| **SaaS-for-SaaS / RevOps** | 1-3% | 30-270j | $5k-200k | 5-8 | LinkedIn DM | New RevOps hire |
| **MarTech** | 1-3% | 60j-12mo | $5k-1M | 5-10 | LinkedIn + email | New CMO + funding |
| **E-commerce / Shopify** | 3-7% | 1j-60j | $0-5k/mo | 1-2 | **Twitter DM + email** | Plus tier upgrade |
| **Fintech** | 1-2% cold | 9-18mo | $25k-1M | **9-18** | Email + conference | Reg deadline |
| **Cybersecurity** | <1% | 128j-18mo | $50k-5M | 5-12 | **Analyst-led** | Breach/audit |
| **HR Tech** | 2-4% | 60j-12mo | $5k-250k | 6-13 | **LinkedIn dominant** | New CHRO |
| **Healthcare IT** | 1-3% | 8-24mo | $50k-5M | 6-10 | Conference/RFP | RFP issued |
| **Vertical SaaS (legal/construction/mfg)** | 3-7% | 6-18mo | $5k-500k | 3-8 | Trade shows | Trade-specific trigger |

---

## 13. Patterns invariants cross-vertical

Au-dessus du niveau vertical, des patterns sont stables :

### 13.1 Le signal-trigger bat le persona-based partout

A travers chaque vertical, la presence d'un trigger event (regulation, hire, funding, tech change, audit) outperform cold persona-based outreach **3-10x**. Aucune exception.

### 13.2 Multi-channel = lift partout (mais le mix change)

Cross-vertical : multi-channel = +287% engagement vs single. Mais le mix optimal change radicalement :
- Devtools : **email + GitHub interaction + Discord**
- RevOps : **LinkedIn DM + email + community Slack**
- DTC : **Twitter DM + email + Loom**
- Fintech : **email + conference + analyst report**
- HR Tech : **LinkedIn dominant + email**
- Cybersecurity : **analyst + conference + email** (cold call almost dead)

### 13.3 Sequence length varie par decision speed

- DTC / devtools : **3 max** (founders decident vite ou jamais)
- SaaS for SaaS / martech : **4-7** (audience saturee, every step needs new value)
- Fintech / healthcare / cybersecurity : **5-7** (longer trust formation)

### 13.4 Le mensonge cross-vertical : "il existe le meilleur cold email"

Le meme offre a besoin de **3+ language registers** (IC / manager / exec) AND **2+ vertical translations** (e.g., devtools vs DTC) pour landed. Le generator par-prospect d'Elevay doit code-switch, pas template.

### 13.5 Volume vs qualite

Saturation hits differemment par vertical :
- Devtools / RevOps : satures a 100/sem cold ; 10 hyper-specifiques outperform.
- Fintech / cybersecurity : satures a 50/sem ; orchestration > volume.
- DTC / vertical SaaS : less saturated (<30/sem typical) ; signal-quality stays linear longer.

---

## 14. Implications pour Elevay (le meta-vertical layer)

Elevay vend autonomous GTM aux SaaS founders. Cinq implications structurelles :

### 14.1 Elevay's own vertical = SaaS-for-SaaS

L'audience la plus skeptique, pattern-aware, et over-prospected en B2B. **Plan accordingly :** extreme specificity, founder-as-content, no template tones, signal-driven over volume. Le moindre detail template = mort credibilite. Si Elevay survit ce test, il survit partout.

### 14.2 Per-customer adaptation requirement is severe

Un SaaS founder qui vend Postgres tooling vs un SaaS founder qui vend Shopify apps vs un SaaS founder qui vend RevOps tooling ont **completely different signal sets, channels, cycle lengths, language registers**. **A one-size playbook will fail.** Le produit doit avoir vertical-aware orchestration as a core feature, not a roadmap.

### 14.3 Le vertical-aware orchestration est un real moat

La plupart des outbound tools traitent tous les B2B de la meme facon. Les adaptations par vertical (channel mix, signal weighting, sequence length, language anti-patterns) doivent etre encodees comme **vertical profiles** dans Elevay's signal-scoring et copy-generation pipelines. Aucun concurrent ne fait ca au niveau structurel.

### 14.4 Deux invariants channel-mix a encoder

- **Phone wins for finance/manufacturing**, LinkedIn pour tech/HR/marketing/recruiting, email pour SaaS founders, **Twitter/X pour DTC**.
- Multi-channel = +287% lift. Single-channel cold outbound is a doomed default.

### 14.5 Sequence-length invariant

4-7 steps pour la plupart des verticals ; **3 max pour devtools/DTC** (founder-led merchants), **5-7 pour fintech/healthcare/cybersecurity** (longer trust formation).

---

## 15. Conversion en feature produit

### 15.1 Vertical Profile data model

```typescript
interface VerticalProfile {
  id: 'devtools' | 'saas_for_saas' | 'martech' | 'dtc' | 'fintech' | 
      'cybersecurity' | 'hrtech' | 'healthcare_it' | 'vertical_saas';
  
  // Buyer
  primary_buyer_titles: string[];
  decision_authority_level: 'high' | 'medium' | 'low';
  buying_committee_size: { min: number; max: number; typical: number };
  
  // Signal weighting
  signal_weights: {
    [signal_type: string]: number;  // 0-1 multiplier on base signal score
  };
  signal_blacklist: string[];  // signals known to be useless in this vertical
  
  // Channel weights
  channel_mix: {
    email: number;
    linkedin: number;
    phone: number;
    twitter?: number;        // primarily DTC
    community?: number;      // primarily devtools, RevOps
    trade_show?: number;     // primarily vertical SaaS
  };
  
  // Sequence config
  optimal_sequence_length: { min: number; max: number };
  
  // Messaging
  insider_lexicon: string[];      // words that earn credibility
  deletion_triggers: string[];     // words/phrases that kill emails
  trust_evidence_required: string[];  // SOC 2, named customers, etc.
  
  // Cycle
  expected_cycle_days: { min: number; median: number; max: number };
  expected_acv_range: { min: number; max: number };
  expected_reply_rate: { cold: number; triggered: number };
  expected_win_rate: { acv_band: string; rate: number }[];
  
  // Anti-patterns
  playbook_failures: string[];     // standard practices that fail here
  required_substitutions: string[]; // what replaces them
}
```

### 15.2 Vertical detection

Quand un prospect entre dans le system :
1. Detecter le vertical depuis : industry classification (Apollo/Crunchbase), tech stack (BuiltWith/StackShare), website content analysis (LLM-based), self-declared
2. Charger le `VerticalProfile` correspondant
3. Le systeme entier (signal scoring, channel selection, copy generation, cycle expectations, pre-send review) opere selon ce profile

### 15.3 Pre-send review extension

Le pre-send review existant doit etre vertical-aware :
- Detecter les `deletion_triggers` du vertical du prospect dans le draft → block
- Verifier la presence d'au moins 2 `insider_lexicon` words pour les verticals haute-skepticisme (RevOps, devtools, fintech)
- Adapter le `length_target` au vertical (50-80 mots devtools/DTC, 80-120 fintech/healthcare)
- Validate le CTA strength selon le vertical (soft only pour saturated verticals)

### 15.4 Cadence engine extension

Le cadence engine existant doit ajuster :
- Steps count : floor au minimum vertical, cap au max
- Channel sequence : start by vertical-dominant channel
- Holiday awareness : DTC mute Nov 1 - Jan 15, fintech mute mid-December

### 15.5 Diagnostic vertical-aware

Le diagnostic surgical (morceau 01) calcul des P de pathologies en general. Avec vertical profile, ces P se mettent a jour :
- Si vertical = devtools et reply rate < 1% : P(B.1 AI-detection) saute a 0.65 (plus haut que baseline 0.45)
- Si vertical = DTC et sequence > 3 steps : P(E.3 too long sequence) saute a 0.70
- Si vertical = cybersecurity et channel = email-only : P(channel-mismatch) saute a 0.80

Vertical-aware diagnostic = bien plus precis que vertical-blind.

---

## 16. Sources & confidence

**Confidence par section :**
- Devtools (Section 3) : **Maximale** — multi-source convergence, Correlated, Mark Pearce, daily.dev, Helen Min
- SaaS-for-SaaS / RevOps (Section 4) : **Maximale** — direct observation de l'audience, Pavilion/RevGenius community data
- MarTech (Section 5) : **Haute** — DemandScience, MarTech.org, Hiring Signals research
- E-commerce / DTC (Section 6) : **Haute** — DTC Twitter direct observation, Foundr, eCommerceFuel data
- Fintech (Section 7) : **Haute** — Insivia, FinTechtris, Relevant
- Cybersecurity (Section 8) : **Haute** — CSO Online, Security Boulevard, Autobound CISO data
- HR Tech (Section 9) : **Moyenne-haute** — IncreaWorks, TechTarget
- Healthcare IT (Section 10) : **Moyenne** — Responsify, Inventive
- Vertical SaaS (Section 11) : **Haute** — SaaStr direct quote, OMERS Ventures, LegalTechMG

**Sources primaires :**
- The DevTools Sales Playbook — Correlated
- B2B Developer Marketing — daily.dev
- Insivia FinTech Sales Cycles
- Why 99% of Cold Emails to CISOs Fail — Security Boulevard
- The Biggest Challenge with Vertical SaaS — SaaStr
- Forrester State of Business Buying 2024
- Pavilion / RevGenius community direct observation
- DTC Twitter / DTC Newsletter / Foundr DTC

**Limitations :**
- Reply rate et cycle benchmarks par vertical varient avec ICP definition. Calibrer par tenant data sur 90j.
- Vertical SaaS (legal/construction/manufacturing) couvert lighter — chaque sub-vertical merite sa propre profondeur.
- Edge verticals non couverts ici : edtech, govtech, climate tech, biotech infra. A ajouter au catalog selon demande clients.
