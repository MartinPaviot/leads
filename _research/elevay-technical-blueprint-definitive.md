# ELEVAY — Blueprint Technique Definitif

_Compile: 2026-05-03_
_Sources: 12 agents de recherche, 200+ sources web, donnees production reelles_

---

## RESUME EXECUTIF POUR MARTIN

Ce document contient TOUT ce qu'il faut pour construire Elevay au niveau d'ambition x1000.
Chaque section = une piece du puzzle avec: architecture, code, couts, timeline, risques.

**Chiffres cles a retenir:**
- Onboarding (10K emails): $33, 15-30 min
- COGS par user: $34-98/mois (selon usage)
- Pricing minimum viable: $149-199/mois
- Cold start du bandit: 200-500 sends pour battre random
- Deal prediction avec 100 deals: 96.7% AUC (SmallML Bayesian)
- Real-time coaching latence: <3 sec (speech → suggestion)
- Email delivrabilite warmup: 6-8 semaines en 2026
- Moat infranchissable: 12-24 mois de compounding data

---

## TABLE DES MATIERES

1. [Architecture Globale](#1)
2. [Onboarding "Brain Scan"](#2)
3. [Signal Reasoning Engine](#3)
4. [Context Assembly Engine](#4)
5. [Message Generation & Voice Augmentation](#5)
6. [Conversation Management](#6)
7. [Real-Time Call Coaching](#7)
8. [Deal Intelligence](#8)
9. [Learning Engine (Contextual Bandits)](#9)
10. [Knowledge Graph](#10)
11. [Deliverability Infrastructure](#11)
12. [Privacy & Compliance](#12)
13. [Infrastructure & Stack](#13)
14. [Cost Model Complet](#14)
15. [Implementation Phases](#15)

---

<a id="1"></a>
## 1. ARCHITECTURE GLOBALE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ELEVAY PLATFORM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │   DATA LAYER    │  │  INTELLIGENCE    │  │    ACTION LAYER       │  │
│  │                 │  │  LAYER           │  │                       │  │
│  │ Gmail/O365 sync │  │                  │  │ Email send (warmed)   │  │
│  │ Calendar sync   │  │ Signal Reasoning │  │ LinkedIn (future)     │  │
│  │ Enrichment APIs │→ │ Context Assembly │→ │ Calendar booking      │  │
│  │ Web tracking    │  │ Voice Augment    │  │ CRM auto-update       │  │
│  │ Signal feeds    │  │ Deal Scoring     │  │ Notifications         │  │
│  │ Meeting audio   │  │ Call Coaching    │  │ Meeting prep          │  │
│  │                 │  │ Conversation Mgr │  │ Follow-up sequences   │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────────┬───────────┘  │
│           │                    │                         │              │
│  ┌────────▼────────────────────▼─────────────────────────▼───────────┐  │
│  │              KNOWLEDGE GRAPH (PostgreSQL + pgvector)               │  │
│  │  Entities: people, companies, deals, interactions, signals        │  │
│  │  Temporal: bi-temporal facts (valid_from/until + created/expired)  │  │
│  │  Embeddings: 1536-dim vectors for similarity (text-embedding-3)   │  │
│  │  Relationships: knows, works_at, participated_in, similar_to      │  │
│  └────────────────────────────────┬──────────────────────────────────┘  │
│                                   │                                      │
│  ┌────────────────────────────────▼──────────────────────────────────┐  │
│  │              LEARNING ENGINE                                       │  │
│  │  Thompson Sampling (factored bandits: timing, subject, body, CTA) │  │
│  │  Feedback loops: trust, policy, signal scoring, message quality    │  │
│  │  SmallML Bayesian deal prediction (transfer learning)             │  │
│  │  Cross-user aggregated metrics (k-anonymity, differential privacy)│  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              TRUST & SAFETY                                        │  │
│  │  Progressive autonomy (observe → suggest → gate → autonomous)     │  │
│  │  Deliverability monitor (bounce <0.5%, spam <0.1%)                │  │
│  │  Confidence scoring (0-1 per action, escalate if <0.7)            │  │
│  │  Human gate (approval queue with batch review)                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              CHAT INTERFACE                                         │  │
│  │  NL queries + proactive intelligence + deal coaching               │  │
│  │  Strategic co-pilot + notification stream (max 2/day)             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Choice | Justification |
|-------|--------|---------------|
| Framework | Next.js 15 (App Router) | Deja en place, SSR + API routes |
| Database | PostgreSQL (Supabase) + pgvector | Single store, ACID + vectors, 471 QPS@99% recall |
| Queue | Inngest (event-driven) + Trigger.dev (long jobs) | Zero-infra, serverless-first |
| LLM | Claude Haiku (bulk) + Sonnet (generation) + Opus (strategy) | 70/25/5% split = -60% cout |
| Email infra | Mailforge domains + custom SMTP | $2-3/mailbox, purpose-built cold |
| STT | AssemblyAI Universal-Streaming | 307ms median, 2.1% WER |
| Meeting bot | Recall.ai | Cross-platform, per-speaker audio |
| Hosting | Vercel Pro (Phase 1-2), Hetzner+Coolify (Phase 3) | Fast start, migrate at scale |
| Monitoring | PostHog (analytics) + Sentry (errors) + GlockApps (delivrabilite) | Free tiers to start |

---

<a id="2"></a>
## 2. ONBOARDING "BRAIN SCAN"

### Objectif

Connecte email + calendar → en 15-30 min, le systeme a:
- Analyse 10K+ emails, identifie tous les contacts
- Reconstruit le funnel reel (qui → repondu → meeting → client)
- Infere l'ICP des DATA (pas une declaration)
- Appris la voix du founder (style fingerprint)
- Construit le relationship graph

### Pipeline technique

```
[OAuth Connect] 
    → [Gmail API / Microsoft Graph, paginated 500/page]
    → [Pre-processing local: strip HTML, parse headers, thread reconstruction]
    → [Anthropic Messages Batch API (Haiku 4.5)]
    → [Entity Resolution + Graph Build]
    → [Style Fingerprinting (Sonnet, 1 call)]
    → [ICP Synthesis (Sonnet, 1 call)]
    → [Present results to user]
```

### Extraction schema (par email, Haiku batch)

```json
{
  "entities": {
    "people": [{"name": "", "email": "", "role_hint": "", "company_hint": ""}],
    "companies": [{"name": "", "domain": ""}]
  },
  "classification": {
    "category": "prospect|client|partner|internal|newsletter|transactional",
    "deal_signal": "none|interest|objection|commitment|close|churn_risk"
  },
  "sentiment": { "overall": -1.0, "formality": 0.5 },
  "outcome": {
    "meeting_scheduled": false,
    "action_items": []
  },
  "style_features": {
    "avg_sentence_length": 12,
    "question_frequency": 0.3,
    "greeting_style": "casual",
    "sign_off_style": "Best"
  }
}
```

### Couts

| Etape | Modele | Cout pour 10K emails |
|-------|--------|---------------------|
| Extraction + classification | Haiku Batch (50% off) | $11.25 |
| Thread-level analysis (2K threads) | Haiku Batch | $5.00 |
| Entity resolution | Local (SpaCy + Dedupe) | $0 |
| Style fingerprint | Sonnet (1 call, 15 examples) | $0.10 |
| ICP synthesis | Sonnet (1 call) | $0.10 |
| **Total** | | **~$17 par user** |

### Entity Resolution

```typescript
// Signals de merge (confiance decroissante):
// 1. Email exact match → 100%
// 2. Meme domaine + substring nom → 95%
// 3. Initiales match + meme domaine → 85%
// 4. Jaro-Winkler > 0.92 + meme thread → 80%

// Relationship strength (RFM-inspired):
function computeStrength(edges: EmailEdge[]): number {
  const recency = Math.pow(2, -daysSinceLast / 30); // half-life 30 jours
  const frequency = Math.log(totalInteractions + 1) / Math.log(max + 1);
  const reciprocity = bidirectional / total;
  return 0.35 * recency + 0.30 * frequency + 0.20 * reciprocity + 0.15 * depth;
}
```

### ICP Inference (Bayesian, small data)

Avec 10-15 conversions positives, le modele Beta-Binomial peut deja inferer:

```python
# "73% confiant que les VP Eng @ SaaS 50-200 personnes sont votre meilleur segment"
# Posterior se resserre a chaque nouveau deal close
```

Minimum pour inference fiable: 30+ outcomes positifs.

### Voice Fingerprint

25+ dimensions mesurees → "style card" de ~200 mots pour la generation future:

```
Style du founder:
- Ton: technique, direct, pair-a-pair
- Phrases: courtes (8-12 mots), actives
- Ouverture: "[Prenom] —" sans "Hi" ni "Hello"
- Cloture: "Dis-moi si ca t'interesse." (pas de "Best regards")
- Specificites: utilise des tirets, pose des questions techniques
- Evite: emojis, exclamations, formules creuses
```

---

<a id="3"></a>
## 3. SIGNAL REASONING ENGINE

### Sources de signaux (par priorite)

| Source | Signal | Predictive power | Cout | Implementation |
|--------|--------|-----------------|------|----------------|
| Email du user | Reply patterns, engagement drop | 60%+ (proprietaire) | $0 | Deja synce |
| Job changes | VP/C-suite rejoint ICP | 3x conversion (90j window) | $0.01-0.05/lookup | Apollo/PDL API |
| Funding events | Series A-C dans ICP | 2-3x (60j window) | Crunchbase/news API | RSS + scraping |
| Tech adoption | Installe/desinstalle stack | 2x (30-90j) | BuiltWith / HG Insights | API $100-300/mo |
| Web activity | Visite pricing/demo page | 2.5-3x (7j) | PostHog + Clearbit Reveal | JS snippet |
| Content engagement | Like/comment/share relevant | 1.5x | LinkedIn API (limits) | Social listener |

### L'innovation: raisonnement sur CLUSTERS (pas signaux individuels)

Un signal seul = 5-15% correlation. Cluster de 3+ signaux en 14j = 40-60%.

```typescript
interface SignalCluster {
  account_id: string;
  signals: Signal[];
  velocity: number;        // signals/day (acceleration)
  causal_chain: boolean;   // funding → hiring → tech adoption = causal
  pattern_match: number;   // similarity to won-deal clusters (0-1)
  composite_score: number; // weighted combination
}

function evaluateCluster(signals: Signal[], account: Account): Assessment {
  // Temporal: 3 signaux en 14j vs 3 en 6 mois = completement different
  const velocity = signals.length / daySpan(signals);
  
  // Causal: funding → hiring → adoption est une CHAINE, pas du bruit
  const causalChain = detectCausalPattern(signals);
  
  // Historical: pattern match vs deals gagnes
  const similarity = compareToWonDeals(signals, account);
  
  // Score composite avec temporal decay
  const score = computeWeightedScore(signals, {
    velocity_weight: 0.25,
    causal_weight: 0.20,
    similarity_weight: 0.30,
    signal_strength_weight: 0.25
  });
  
  return {
    score,
    reasoning: `Pattern similar to ${similarity.matched_deals} won deals`,
    recommended_action: determineAction(score, account),
    urgency: velocity > 0.3 ? 'high' : velocity > 0.1 ? 'medium' : 'low'
  };
}
```

### Temporal decay par type de signal

| Type | Half-life | Justification |
|------|-----------|---------------|
| Intent (pricing visit) | 14 jours | Buying window court |
| Job change | 90 jours | Onboarding period |
| Funding | 60 jours | Capital allocation period |
| Tech adoption | 90 jours | Implementation decision window |
| Champion activity | 30 jours | Relationship freshness |

### Signal velocity (le vrai predicteur)

L'acceleration (2eme derivee) est plus predictive que le score absolu:
- Score=60, acceleration=+5/semaine → MEILLEUR que
- Score=80, acceleration=-3/semaine

Un deal qui accelere va closer. Un deal qui decelere va stall.

---

<a id="4"></a>
## 4. CONTEXT ASSEMBLY ENGINE (<30 sec)

### Budget de latence

```
Layer 1: Identity Resolution (cache, instant)           50ms
Layer 2: Behavioral Intelligence (API calls paralleles)  5-10s
Layer 3: Situational Intelligence (enrichment + LLM)    10-15s
Layer 4: Relationship Intelligence (graph query)         100ms
Layer 5: Strategy Synthesis (LLM reasoning)              3-5s
─────────────────────────────────────────────────────
TOTAL:                                                  18-30s
```

### Enrichment waterfall (cout-optimise)

```
Champ EMAIL:
  1. Cache local (0 credit) → si miss:
  2. Hunter.io ($0.01) → si miss:
  3. Apollo ($0.02) → si miss:
  4. Clearbit ($0.45) → stop

Champ COMPANY:
  1. Cache local → si miss:
  2. PDL ($0.01-0.10) → si miss:
  3. Clearbit ($0.45)

Champ JOB TITLE:
  1. Email signature parsing (gratuit, 85% precision)
  2. LinkedIn (si disponible via enrichment)
  3. Apollo/PDL fallback
```

### Cout moyen par prospect enrichi: $0.50-1.50

### Output: Dossier d'intelligence

Le LLM recoit toutes les data brutes + signal cluster + relationship path et produit un dossier structure avec STRATEGIE D'APPROCHE (pas juste des donnees).

---

<a id="5"></a>
## 5. MESSAGE GENERATION & VOICE AUGMENTATION

### Architecture

```
Input:
  - Style card du founder (200 tokens, cache)
  - Dossier prospect (2000 tokens)
  - 3 examples d'emails du founder qui ont marche (3000 tokens, cache)
  - Signal cluster + recommended angle (500 tokens)
  - Bandit action selection: (timing, subject_angle, tone, CTA_type)

Model: Claude Sonnet 4.6
Output: Email draft + confidence score

Cout: ~$0.024/email (avec prompt caching sur style card + examples)
```

### Anti-Gemini: haute perplexite

Le filtre Gmail Gemini mesure la "perplexity" du texte. Strategies:

1. **Style humain appris** — pas un pattern AI generique
2. **Informations surprenantes** — references que seul un humain qui a recherche connaitrait
3. **Structure variable** — jamais le meme format email apres email
4. **Facts verifiables** — vrais events, vraies personnes, vrais chiffres

### Factored bandits pour l'optimisation

Pas UN bandit qui choisit l'email entier. QUATRE bandits independants:

| Bandit | Actions | Reward signal |
|--------|---------|---------------|
| Timing | 24 slots (heure × jour) | Open rate |
| Subject | 5-10 angles (ROI, social proof, question, insight, urgence) | Open rate |
| Body | 3-5 templates (court/long, technique/business, story/direct) | Reply rate |
| CTA | 3-5 types (question, resource, meeting, intro) | Reply rate + meeting rate |

Chaque bandit apprend independamment → combinaisons non-intuitives emergent.

---

<a id="6"></a>
## 6. CONVERSATION MANAGEMENT

### State machine email

```
NEW_LEAD → SEQUENCE_ACTIVE → (reply) → CLASSIFY_REPLY
                                          ├── INTERESTED → BOOK_MEETING → HUMAN_OWNED
                                          ├── OBJECTION → COUNTER_ARGUE (max 2x) → ESCALATE
                                          ├── QUESTION → ANSWER + FOLLOW_UP
                                          ├── NOT_NOW → PAUSE + NURTURE (J+45)
                                          └── DNC → REMOVE (immediate)
```

### Intent classification

- LLM zero-shot: 95% F1 (mais $0.003/reply)
- Fine-tuned RoBERTa: 99.2% avec 800 labels (inference $0)
- Hybride recommande: classifieur local + LLM si confiance <70%

### Escalation triggers (hard → soft)

**Hard (immediate):** DNC request, legal mention, VIP account, explicit meeting acceptance
**Soft (confidence-based):** AI confidence <70%, 3+ replies dans un thread, pricing discussion, sentiment frustration
**Behavioral:** Multiple stakeholders enter thread, competitor comparison request

### Multi-turn memory per thread

```json
{
  "thread_id": "abc",
  "state": "objection_handling",
  "commitments_made": [
    {"by": "us", "what": "Send case study", "when": "2026-05-04", "fulfilled": false}
  ],
  "objections_raised": ["pricing", "implementation timeline"],
  "questions_pending": ["data migration process"],
  "escalation_count": 0
}
```

Persiste en DB, injecte dans le contexte a chaque reply generation.

---

<a id="7"></a>
## 7. REAL-TIME CALL COACHING

### Architecture

```
Calendar event (30 min before)
  → Pre-meeting brief generation (Sonnet, $0.05)
  → Recall.ai bot joins meeting
  → WebSocket: per-speaker audio stream
  → AssemblyAI Universal-Streaming (307ms median)
  → Parallel:
      [1] Speaker diarization
      [2] Sentiment (800ms windows, roberta distilled)
      [3] Intent detection (objections, buying signals, methodology gaps)
  → Coaching card generation (Sonnet streaming, <1s first token)
  → WebSocket → companion UI overlay
  → Post-call (30s): summary + CRM update + action items + follow-up draft
```

### Budget latence total: 1.3-4 secondes

```
Audio processing:      25-50ms
STT (streaming):      200-300ms (AssemblyAI)
Turn detection:       100-300ms
NLU/Intent:           150-200ms
LLM coaching (TTFT):  250-1000ms
Network delivery:      50-100ms
```

### Ce que le coaching montre (pendant le call)

- Battlecard quand competitor mentionne
- Alerte monologue (>60% talk-time)
- Suggestion quand objection detectee (basee sur ce qui a marche historiquement)
- Rappel methodologie: "Tu n'as pas encore demande le budget"
- Score engagement prospect en temps reel

### Meeting bot: Recall.ai

- REST API: cree bot avec meeting link
- Bot rejoint comme participant (cross-platform: Zoom, Meet, Teams)
- WebSocket: audio per-speaker + transcripts + metadata
- Cout: pricing enterprise, estimer $0.35-1.00/heure de meeting

### Pre-meeting brief (genere automatiquement 30 min avant)

```
## [Prospect Name] @ [Company] — Meeting Prep
Quick Context: [1 phrase]
Last interaction: [date + summary]
Deal stage: [stage] | Risks: [flags]

Stakeholders presents:
- [Name] - [Title] - [Priorities from prior calls]

Methodology gaps (MEDDIC):
- Economic Buyer: [?]
- Metrics: [defined/not]

Suggested questions: [3, basees sur les gaps]
Competitive intel: [if applicable]
```

---

<a id="8"></a>
## 8. DEAL INTELLIGENCE

### Prediction avec small data: SmallML (Bayesian Transfer Learning)

**Resultat demontre: 96.7% AUC avec 100 observations.**

Architecture:
1. Pre-train sur data aggregate (patterns B2B generiques)
2. Hierarchical Bayesian pooling: population-level + per-company adaptation
3. Posterior narrows as data grows
4. Conformal prediction: uncertainty sets avec couverture garantie

### Feature engineering

```typescript
interface DealFeatures {
  // Engagement velocity (strongest predictor)
  email_velocity_7d: number;           // ratio this week vs last
  meeting_frequency_per_week: number;
  engagement_acceleration: number;     // 2nd derivative
  
  // Multi-threading depth
  unique_contacts_engaged: number;
  executive_sponsor_engaged: boolean;
  buyer_to_seller_activity_ratio: number;
  
  // Champion health
  champion_response_time_trend: number;
  champion_last_active_days: number;
  
  // Stage dynamics
  time_in_stage_vs_median_won: number;
  stage_regression_count: number;
  
  // Sentiment
  sentiment_trend: number;
  competitive_mention_count: number;
}
```

### Risk detection automatique

| Signal | Seuil | Severite |
|--------|-------|----------|
| Champion silencieux | 2x son temps de reponse moyen | CRITICAL |
| Engagement drop | <50% de la moyenne 4 semaines | HIGH |
| Multi-thread collapse | 1 contact actif (etait 3+) | HIGH |
| Stage stall | >1.5x median pour deals gagnes | MEDIUM→HIGH |
| Competitor mentionne | Toute mention en late stage | HIGH |

### Anti-fatigue des alertes

Max 3 alertes critiques/jour. Score composite:
```
show_alert = (deal_value × probability × confidence × actionability) > 0.4
```

### Evolution du modele par phase

| Phase | Deals | Approche |
|-------|-------|----------|
| 0-50 | Heuristiques (time-in-stage, activity level) |
| 50-200 | SmallML Bayesian avec priors transfer-learned |
| 200+ | Gradient boosting (XGBoost) avec feature engineering |
| 1000+ | Ensemble + DTW pattern matching + per-rep models |

---

<a id="9"></a>
## 9. LEARNING ENGINE (CONTEXTUAL BANDITS)

### Algorithme: Thompson Sampling (gagnant pour sales)

Pourquoi TS:
- Gere le delayed feedback naturellement (batch updates)
- Randomized exploration allege l'impact des delais
- Performance comparable aux bornes theoriques

### Architecture factored bandits

```
┌────────────────────────────────────────────┐
│           EMAIL BANDIT SYSTEM              │
├────────────────────────────────────────────┤
│                                            │
│  Context Builder:                          │
│  ├── Prospect: industry, size, role, stage │
│  ├── History: opens, clicks, replies       │
│  ├── Temporal: day, hour, timezone         │
│  └── Sequence position: step 1-7          │
│                                            │
│  Factored Action Space:                    │
│  ├── Timing bandit (168 slots)            │
│  ├── Subject bandit (10 angles)           │
│  ├── Body bandit (5 templates)            │
│  └── CTA bandit (5 types)                 │
│                                            │
│  Reward Pipeline:                          │
│  ├── Open (24h): w=0.05                   │
│  ├── Click (72h): w=0.10                  │
│  ├── Reply (7d): w=0.30                   │
│  ├── Meeting (14-30d): w=0.35             │
│  └── Deal proxy (model score): w=0.20     │
│                                            │
│  Training:                                 │
│  ├── Online: update apres chaque event    │
│  ├── Batch: retrain hebdo (delayed rewards)│
│  └── Warm-start: transfer from similar    │
│                                            │
└────────────────────────────────────────────┘
```

### Implementation (TypeScript, inspire SimpleBandit)

```typescript
class EmailBandit {
  private models: Map<string, ThompsonSamplingModel>;
  
  constructor() {
    this.models = new Map([
      ['timing', new ThompsonSamplingModel(168)],  // 24h × 7d
      ['subject', new ThompsonSamplingModel(10)],
      ['body', new ThompsonSamplingModel(5)],
      ['cta', new ThompsonSamplingModel(5)],
    ]);
  }
  
  selectActions(context: ProspectContext): EmailAction {
    return {
      timing: this.models.get('timing')!.sample(context),
      subject: this.models.get('subject')!.sample(context),
      body: this.models.get('body')!.sample(context),
      cta: this.models.get('cta')!.sample(context),
    };
  }
  
  update(action: EmailAction, rewards: Rewards) {
    this.models.get('timing')!.update(action.timing, rewards.open);
    this.models.get('subject')!.update(action.subject, rewards.open);
    this.models.get('body')!.update(action.body, rewards.reply);
    this.models.get('cta')!.update(action.cta, rewards.meeting);
  }
}
```

### Schedule d'exploration

```
Semaine 0-2:  Heuristiques (best practices: mardi-jeudi 8-10h, <80 mots)
Semaine 2-4:  Epsilon-greedy (epsilon=0.3) autour des heuristiques
Semaine 4-8:  Thompson Sampling warm-starte avec posterior des heuristiques
Semaine 8+:   TS plein avec 5% exploration floor permanent
```

### Cold start: combien avant de battre random?

| Scenario | Sends necessaires | Temps a 50/jour |
|----------|-------------------|-----------------|
| Basic MAB (pas de contexte) | 200-500 | 4-10 jours |
| Contextual (features simples) | 50-200 par action | 2-8 semaines |
| Avec warm-start/transfer | 50-70% reduction | 1-3 semaines |

---

<a id="10"></a>
## 10. KNOWLEDGE GRAPH

### Database: PostgreSQL + pgvector (pas Neo4j initialement)

Justification: pour <50K entites et queries depth 2-3, PostgreSQL avec recursive CTEs suffit. Neo4j ajoute une complexite ops non justifiee avant 100K+ entites avec path queries depth 4+.

### Schema

```sql
-- Entities
CREATE TABLE people (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  name text, email text, linkedin_url text,
  embedding vector(1536), -- pour similarity search
  created_at timestamptz, updated_at timestamptz
);

CREATE TABLE companies (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  name text, domain text, industry text,
  employee_count int, funding_stage text,
  embedding vector(1536),
  created_at timestamptz, updated_at timestamptz
);

-- Temporal relationships
CREATE TABLE employment (
  id uuid PRIMARY KEY,
  person_id uuid REFERENCES people(id),
  company_id uuid REFERENCES companies(id),
  title text, department text, seniority text,
  valid_from date, valid_until date, -- null = current
  confidence float, source text,
  created_at timestamptz
);

-- Relationships
CREATE TABLE relationships (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  person_a uuid REFERENCES people(id),
  person_b uuid REFERENCES people(id),
  strength float, -- 0-1, computed from interactions
  last_interaction timestamptz,
  source text -- 'email_exchange', 'meeting_together', 'linkedin'
);

-- Interactions
CREATE TABLE interactions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  type text, -- 'email_sent', 'email_received', 'meeting', 'call'
  timestamp timestamptz,
  participants uuid[], -- array of person_ids
  deal_id uuid, -- if associated with a deal
  sentiment float, summary text,
  metadata jsonb
);

-- Signals
CREATE TABLE signals (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  type text, source text, strength float,
  target_company uuid, target_person uuid,
  timestamp timestamptz, raw_data jsonb,
  decay_half_life_days int DEFAULT 30
);

-- Deals
CREATE TABLE deals (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  title text, stage text, amount numeric,
  probability float, -- model-predicted
  account_id uuid REFERENCES companies(id),
  champion_id uuid REFERENCES people(id),
  created_at timestamptz, expected_close date,
  features jsonb -- pre-computed deal features for ML
);

-- Embeddings index
CREATE INDEX ON people USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON companies USING hnsw (embedding vector_cosine_ops);
```

### Confidence decay

```typescript
function effectiveConfidence(fact: TemporalFact, now: Date): number {
  const ageDays = (now - fact.created_at) / 86400000;
  const decay = Math.exp(-0.693 * ageDays / fact.halfLifeDays);
  return Math.min(1.0, fact.baseConfidence * decay);
}
// Job title: halfLife=180, Email: halfLife=365, Intent: halfLife=14
```

---

<a id="11"></a>
## 11. DELIVERABILITY INFRASTRUCTURE

### Setup par user

| Composant | Quantite | Cout/mois |
|-----------|----------|-----------|
| Domaines secondaires | 3-5 | $7 (amorti) |
| Mailboxes (Mailforge) | 9-15 (3/domaine) | $27-45 |
| Warmup (Mailivery) | Inclus ou $29-79 | $29-79 |
| Monitoring (MailReach) | 1 | $9.60 |
| **Total infra email** | | **$73-139/user** |

### Warmup schedule (2026: 6-8 semaines obligatoires)

```
Semaine 1-2: 3-5 warmup/jour, 0 cold
Semaine 3-4: 15-25 warmup/jour, 5-10 cold/jour
Semaine 5-8: 30-40 warmup/jour, 15-25 cold/jour
Steady state: 10-15 warmup + 30-35 cold = max 50 total/mailbox/jour
```

### Seuils de survie

| Metrique | Seuil | Action si depasse |
|----------|-------|-------------------|
| Bounce | <2% (cible <0.5%) | Stop sending, verify list |
| Spam complaints | <0.1% | Reduce volume 50%, analyze content |
| Open rate | >50% (warmup), >30% (cold) | Check inbox placement |
| DMARC pass | 100% | Fix DNS immediately |
| Inbox placement | >85% | Pause domain, investigate |

### Domain rotation

- Duree de vie: 6-12 mois si bien gere
- Retirement si: placement <70%, blocklisted, spam >0.1%
- Stagger les achats (1-2 semaines entre chaque)
- Naming: variantes de la marque (tryelevay.com, getelevay.io, hielevay.com)

---

<a id="12"></a>
## 12. PRIVACY & COMPLIANCE

### Bases legales

| Donnee | Base GDPR | Notes |
|--------|-----------|-------|
| Emails du user (analyse) | Consentement (inscription au service) | Art. 6(1)(a) |
| Contacts professionnels (enrichissement) | Interet legitime | Art. 6(1)(f), LIA documentee |
| Cold email B2B | Interet legitime | Art. 14 notice obligatoire au 1er contact |
| Enregistrement calls | Consentement des parties | Le user est responsable |

### CAN-SPAM (obligatoire pour chaque email)

1. From/Reply-To precise
2. Subject non-trompeur
3. Adresse physique
4. Identification comme pub (1er email)
5. One-click unsubscribe (sans login)
6. Honorer opt-out en <10 jours business

### Architecture data

| Type de donnee | Action | Retention |
|---|---|---|
| Body email (user inbox) | Process → hash → delete raw | Raw: 30j max, hash: permanent |
| Entites extraites | Store | Jusqu'a suppression |
| LLM inputs/outputs | Discard apres processing | 0 retention |
| Enrichment responses | Store structured, discard raw | Raw 90j, structured permanent |
| Conversation transcripts | Hash + store summary | Summary permanent, raw 30j |

### SOC 2 path

Timeline: Type 1 en 3-4 mois ($5-20K), Type 2 en 6-12 mois
Outils: Vanta ou Drata ($10-15K/an) pour accelerer

---

<a id="13"></a>
## 13. INFRASTRUCTURE & STACK COMPLET

### Phase 1 (0-50 users): $90-150/mois infra

| Service | Cout |
|---------|------|
| Vercel Pro | $40/mo |
| Supabase Pro | $25/mo |
| Inngest Pro | $25/mo |
| Redis (Upstash) | $0-10/mo |
| Sentry (free tier) | $0 |
| **Total** | **$90-100/mo** |

### Phase 2 (50-500 users): $200-500/mois

Meme stack, scaled tiers. Connection pooling ajoute. Read replicas si necessaire.

### Phase 3 (500+ users): $300-800/mois

Migration vers Hetzner+Coolify (60-80% savings vs Vercel at scale).
Email engine extraite en service separe.

### Modular monolith (recommande pour 0-18 mois)

```
app/
  modules/
    email-engine/     # sending, deliverability, warmup
    intelligence/     # LLM orchestration, signal processing
    enrichment/       # API integrations, waterfall
    sequences/        # campaign management, state machine
    pipeline/         # deals, contacts, accounts
    coaching/         # meeting prep, real-time, post-call
    learning/         # bandits, feedback loops, ML
    auth/             # authentication, tenant isolation
  shared/
    queue/            # Inngest function definitions
    database/         # Prisma schema, migrations
    llm/              # model routing (Haiku/Sonnet/Opus)
```

---

<a id="14"></a>
## 14. COST MODEL COMPLET

### COGS par user par mois

| Usage | Light (50/mo) | Medium (200/mo) | Heavy (500/mo) |
|-------|---------------|-----------------|-----------------|
| LLM (generation + analysis) | $2.50 | $8.00 | $18.00 |
| Enrichment APIs | $1.50 | $6.00 | $15.00 |
| Email infra (amorti) | $25.00 | $40.00 | $60.00 |
| STT/meeting (2 meetings/mo) | $2.00 | $5.00 | $10.00 |
| Platform infra (amorti) | $3.00 | $3.00 | $3.00 |
| **Total COGS** | **$34** | **$62** | **$106** |

### Pricing et marge

| Prix | Light margin | Medium margin | Heavy margin |
|------|-------------|---------------|--------------|
| $99/mo | 66% | 37% | -7% (perte) |
| $149/mo | 77% | 58% | 29% |
| $199/mo | 83% | 69% | 47% |
| $299/mo | 89% | 79% | 65% |

**Recommandation: $199/mo avec cap sur le heavy usage, ou $149/mo + usage-based au-dela de 200 prospects/mois.**

### Cout de l'onboarding (one-time par user)

| Etape | Cout |
|-------|------|
| Email analysis (10K, Haiku batch) | $17 |
| Signal backfill (30 jours de signaux) | $5-10 |
| Domain setup + warmup (6-8 semaines) | $50-100 (amorti sur 12 mois = $4-8/mo) |
| **Total onboarding COGS** | **$22-27** |

Payback: 1er mois d'abonnement couvre le cout d'onboarding.

### Break-even pour le user

A $199/mo, le user doit generer au moins 1 deal/mois pour ROI positif.
A 5% reply rate × 20% meeting rate × 25% close rate × 200 prospects/mois:
→ 200 × 0.05 × 0.20 × 0.25 = **0.5 deals/mois**

Pour ACV >$5K: ROI positif des le 1er deal. Payback en ~2 mois.

---

<a id="15"></a>
## 15. IMPLEMENTATION PHASES

### Phase 0: Fondations (Semaine 1-4)

```
□ Email sync (Gmail OAuth + Microsoft Graph, bidirectionnel)
□ Calendar sync
□ Schema DB (PostgreSQL + pgvector sur Supabase)
□ Onboarding pipeline (batch API, extraction, entity resolution)
□ Style fingerprinting
□ ICP inference
□ Domaines + DNS + warmup demarre
□ Chat interface de base (query pipeline NL)
```

**Livrable**: le founder connecte son email, recoit son "brain scan" en 30 min.
**Cout dev**: 0 (toi + Claude Code)
**Cout infra**: ~$150/mo (Supabase + Vercel + domaines)

### Phase 1: Pipeline E2E (Semaine 5-10)

```
□ Signal detection (3 sources: job changes, funding, web visits)
□ Qualification LLM (score 0-1)
□ Enrichment waterfall (2-3 sources)
□ Context assembly (<30 sec)
□ Message generation (voice augmented)
□ Human gate (review queue dans le chat)
□ Envoi via infrastructure warmee
□ Tracking (opens, clicks, replies)
□ Reply classification + state machine basique
□ Progressive autonomy: mode SUGGEST
```

**Livrable**: le systeme propose des prospects + drafts, le founder approuve/modifie.
**KPI**: >80% approuve sans modification.

### Phase 2: Intelligence (Semaine 11-18)

```
□ Signal Reasoning Engine (clusters, causal, velocity)
□ Factored bandits (timing, subject, body, CTA)
□ Feedback loops actives (4 loops)
□ Deal tracking + basic scoring (heuristics)
□ Conversation management (multi-turn, objections)
□ Follow-up automatique (cadence adaptative)
□ Progressive autonomy: mode EXECUTE GATE
□ Deliverability monitoring + alertes
```

**Livrable**: le systeme execute, le founder review 1x/jour en batch.
**KPI**: >90% approuve sans modif pendant 2 semaines.

### Phase 3: Coaching (Semaine 19-26)

```
□ Meeting prep automatique (30 min avant)
□ Real-time call coaching (Recall.ai + AssemblyAI)
□ Post-meeting intelligence (summary, CRM update, follow-up draft)
□ Deal prediction (SmallML Bayesian, si 50+ deals)
□ Risk detection + alertes
□ Multi-stakeholder orchestration
□ Progressive autonomy: mode AUTONOME BORNE
```

**Livrable**: systeme full-lifecycle, founder ne fait que closer les meetings importants.

### Phase 4: Scale & Network Effects (Mois 7-12)

```
□ Cross-user intelligence (aggregated metrics anonymises)
□ Transfer learning (new users pre-calibres)
□ A/B testing automatise (bandits explore en continu)
□ Advanced RL (si assez de data)
□ API pour integrations
□ Multi-tenant (onboard les premiers users externes)
```

**Livrable**: produit commercialisable.

---

## RISQUES ET MITIGATIONS

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Domain brule avant assez de data | Moyen | Haut | Multi-domaine, monitoring strict, warmup patient |
| Gmail Gemini bloque les emails | Haut | Moyen | Voice augmentation, haute perplexite, human editing pass |
| Pas assez de deals pour calibrer le ML | Haut (early) | Moyen | SmallML Bayesian, transfer learning, mode heuristique |
| Cout LLM explose (boucles) | Moyen | Moyen | Hard cap par execution, model routing 70% Haiku |
| LinkedIn crackdown (enrichissement) | Haut | Moyen | JAMAIS scraper LinkedIn, utiliser des APIs officielles |
| GDPR plainte | Faible | Haut | LIA documentee, Art. 14 notice, one-click unsub |
| User over-trust (envoie du garbage) | Moyen | Haut | Progressive autonomy, confidence scoring, audit |

---

## CE QU'IL RESTE A FAIRE

1. **Toi**: Close 10 deals manuellement. Documente tout. C'est le training data.
2. **Ce document**: devient le product-spec.md pour la Phase 0.
3. **Premiere action technique**: Email sync + onboarding pipeline.

Le systeme complete (phases 0-4) se construit en 6-9 mois. Le moat infranchissable emerge a 12-24 mois de compounding. Chaque jour sans collecter d'outcome data est un jour perdu.
