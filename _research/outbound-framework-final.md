# LE FRAMEWORK OUTBOUND — VERSION DEFINITIVE

> Synthese du meilleur de toutes les sources : donnees plateforme (Gong 300M+ calls, 85M+ emails, Lavender, Cognism 200K calls), practitioners operationnels (Blond/Brex $400M, Efti/Close $50M, Coleman/Looker→Clari, 30MPC), institutional (YC, SaaStr, Bessemer), et les frameworks classiques corriges pour 2026.

---

## VARIABLES D'ENTREE — Ton contexte determine ton chemin

Avant de commencer, reponds a ces 5 questions. Elles routent tout le reste.

| Variable | Options |
|---|---|
| **Stade** | Pre-PMF (< 10 clients) / Post-PMF (10-50 clients) / Scaling (50+) |
| **ACV** | < $10K / $10-50K / $50-100K / > $100K |
| **Qui vend** | Founder solo / Founder + 1-2 AEs / Equipe structuree |
| **Awareness acheteur** | Sait qu'il a un probleme / Ne sait pas / Sait mais sous-estime |
| **Geo** | US / Europe du Nord / Europe du Sud / France / UK / Mix |

---

## ROUTING — Quel chemin prendre

```
SI Pre-PMF (< 10 clients):
    → CHEMIN A : Learning Mode
    → Focus : valider, pas vendre
    → Framework : conversations libres, wedge testing
    → Pas de scoring ICP, pas d'infrastructure lourde

SI Post-PMF + founder solo + ACV < $50K:
    → CHEMIN B : Founder-Led Signal-Based
    → Focus : 10-15 prospects/semaine, hyper-personnalises
    → Framework : Gap Selling + 4T + Triple
    → Cadence : 5-8 touches / 14-21 jours
    → Qualification : BANT filtre + Gap Selling discovery

SI Post-PMF + founder solo + ACV $50-100K:
    → CHEMIN C : Founder-Led Enterprise-Lite
    → Focus : 5-8 prospects/semaine, multi-threade
    → Framework : Challenger + Gap + SPICED
    → Cadence : 8-12 touches / 30-45 jours
    → Qualification : CHAMP + Gap + light MEDDIC

SI Scaling + equipe + ACV > $100K:
    → CHEMIN D : Full Enterprise
    → Focus : named accounts, ABM
    → Framework : Challenger + MEDDPICC + Miller Heiman
    → Cadence : 12-18 touches / 45-90 jours
    → Qualification : Full MEDDPICC
```

---

## LE FRAMEWORK COMPLET — 8 PHASES

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 0: FONDATION                                              │
│ Infrastructure, signaux, ICP                                     │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 1: CIBLER                                                  │
│ Liste, tiering, signal overlay, priorisation                     │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 2: CONTACTER                                               │
│ Multi-canal, signal-triggered, cadence adaptee au chemin         │
│                                                                   │
│ ┌──→ Pas de reponse → Nurture (Phase 2b)                        │
│ ├──→ Soft no → Re-engagement 30/60/90 (Phase 6)                 │
│ ├──→ Hard no → Retirer                                           │
│ └──→ Interet → PHASE 3                                           │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 3: QUALIFIER                                               │
│ Router par ACV + awareness                                       │
│                                                                   │
│ SI awareness = "ne sait pas" → Challenger insight d'abord        │
│ SI awareness = "sait" → Gap Selling discovery                    │
│                                                                   │
│ ┌──→ Non qualifie → Disqualifier ou nurture                     │
│ └──→ Qualifie → PHASE 4                                          │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 4: VENDRE                                                  │
│ Demo + objections + multi-threading                              │
│                                                                   │
│ ┌──→ Objections resolues → PHASE 5                               │
│ ├──→ "Faut en parler a..." → Champion Enablement (Phase 4.5)    │
│ ├──→ "Faut reflechir" → JOLT Effect (Phase 4.5)                 │
│ └──→ Dead signals → Disqualifier ou Phase 6                     │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 4.5: EMPECHER LE "NO DECISION"                            │
│ JOLT + Champion Enablement + Business Case                       │
│                                                                   │
│ ┌──→ Champion equipe + BC pret → PHASE 5                        │
│ └──→ Indecision non resolue → Phase 6                           │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 5: CLOSER                                                  │
│ Pricing + Nego + Procurement                                     │
│                                                                   │
│ ┌──→ Closed Won → PHASE 7                                       │
│ ├──→ Stalled → Phase 6                                           │
│ └──→ Walk away → Closed Lost                                     │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 6: RE-ENGAGER                                              │
│ Diagnostic root cause + Break-up + Trigger events                │
│                                                                   │
│ ┌──→ Re-engage → Retour phase appropriee                        │
│ ├──→ 60j silence → Closed Lost                                   │
│ └──→ Trigger event → Re-ouverture                                │
├─────────────────────────────────────────────────────────────────┤
│ PHASE 7: EXPANDER                                                │
│ Onboarding + Upsell + Referrals → Seeds → Phase 1               │
└─────────────────────────────────────────────────────────────────┘
```

---

## PHASE 0 : FONDATION

### 0.1 Pre-requis : valider le wedge (Chemin A uniquement)

**Si < 10 clients :**
- Formuler une hypothese ICP etroite (1 persona + 1 probleme + 1 segment de 50-100 comptes)
- 50 conversations de discovery. Pas de demo, pas de pitch. "Quel est ton plus gros probleme avec [X]?"
- Vendre agressivement pendant 2 semaines. Si ca ne mord pas → pivoter le wedge (Tom Blomfield/YC)
- Ne jamais donner gratuitement. Charger meme $500/mois pour valider le willingness-to-pay.
- Sortie : 10+ clients payants + process repeatable identifie

### 0.2 Infrastructure technique

| Composant | Quoi | Pourquoi |
|---|---|---|
| **Delivrabilite** | SPF + DKIM + DMARC + 3-5 domaines d'envoi + warm-up 2-4 sem + 30-50 emails/inbox/jour max | Sans ca, tout echoue. -30 a -50% delivrabilite pour ceux qui ignorent. |
| **Enrichissement** | Clay ($185/mois) — 78% email find rate vs 42% Apollo | La qualite de la liste determine tout. Verified = 2x reply, unverified = 5-6x worse que verified. |
| **Sequences** | Smartlead ou Instantly ($39-99) | Multi-domaine, warming automatique, cadence management. |
| **Emails** | Lavender (free-$29) | Users a 20.5% reply rate (4x industrie). Score avant envoi. |
| **CRM** | Folk ou Attio (free-$25) | Lightweight. Pas Salesforce pour 10-50 deals. |
| **Signaux** | LinkedIn Sales Nav + Google Alerts + Clay signals | Detection des trigger events en temps reel. |

### 0.3 Infrastructure signaux — la couche fondamentale

> "The classical approach to outbound is close to dead. One-off highly custom outbound almost always works." — Jason Lemkin

**Chaque outreach est DECLENCHE PAR UN SIGNAL.** Pas de cold generique.

| Signal | Puissance | Delai max | Donnee |
|---|---|---|---|
| Demande publique de recos | Maximale | < 4h | Intent explicite |
| Visites pricing/demo page | Tres forte | < 4h | 21x conversion si < 5 min (Landbase) |
| Job change / nouveau VP | Forte | < 24h | 10x prob de changer d'outils dans 90j |
| Funding / M&A | Forte | < 24h | Budget increase + expansion mode |
| Retrait outil concurrent | Forte | < 24h | Replacement window open |
| Intent tiers (Bombora, G2) | Moderee | < 48h | Research phase |
| Hiring dans ton domaine | Moderee | < 48h | Strategic priority indicator |

**Stacking :** 1 signal = 2-4x cold. 2-3 = 5-10x. 4+ = 10-20x.

**La regle :** les taux de reponse chutent de 80% apres 5 jours. Speed-to-signal est la metrique.

### 0.4 ICP — adapter au stade

| Stade | Approche ICP |
|---|---|
| < 10 clients | Hypothese simple : 3 criteres (industrie + taille + pain). Pas de scoring. |
| 10-50 clients | Analyser top 20% + bottom 20%. Identifier les patterns. Scoring light. |
| 50+ clients | ICP Score = (Firmo x 0.35) + (Techno x 0.25) + (Signaux x 0.25) + (Engagement x 0.15). Tiering formel. |

> Startups qui ne narrowent pas l'ICP : +50% churn a $2M ARR. L'anti-persona (qui NE PAS cibler) est aussi important que le persona. (Pavilion 2025)

---

## PHASE 1 : CIBLER

### 1.1 Construire la liste — la hierarchie (Sam Blond/Brex + Bessemer)

**Ordre de priorite :**
1. **Network-first** : connexions 1er et 2e degre (investors, anciens collegues, intros)
2. **Warm outbound** : utilisateurs deja dans ton produit, prospects qui ont engage avec ton contenu
3. **Signal-triggered cold** : prospects matchant l'ICP + affichant un signal actif
4. **Pure cold** : dernier recours, seulement si 1-3 sont epuises

> "Outbound to your 1st and 2nd degree connections rather than random people in your target market." — Sam Blond

### 1.2 Le tiered model (Ramp $1B ARR)

| Tier | Volume | Canal | Automation |
|---|---|---|---|
| **Tier 1** (highest-value + signal actif) | 5-10/semaine | Gmail personnel du founder. Manuel. Hyper-personnalise. | H (humain) |
| **Tier 2** (bon fit + signal) | 10-20/semaine | AI-generated, personnalise, envoye depuis Gmail (44% mieux que Outreach) | A+H |
| **Tier 3** (fit modere) | 20-50/semaine | Sequences automatisees via outils | A |

> Ramp Two-Day MVP Rule : si une idee outbound ne peut pas lancer en 48h, elle est reduite ou tuee.

### 1.3 Le nombre — adapter au chemin

| Chemin | Nouveaux prospects/semaine | Pourquoi |
|---|---|---|
| A (Pre-PMF) | 10-15 conversations | Apprendre, pas scaler |
| B (Founder, < $50K) | 10-15 prospects | 21-50 recipients = 6.2% reply. Qualite > volume. |
| C (Founder, $50-100K) | 5-8 prospects | Multi-threade, recherche profonde par account |
| D (Equipe, > $100K) | 3-5 accounts named | ABM full, coordonne sales+marketing |

### 1.4 Le contenu comme accelerateur (Chemin B et C)

> Inbound-led outbound convertit a 14.6% vs 1.7% pure cold. (Foundera)
> Members publiant 2x/semaine : +5x profile views. SSI > 70 = 2-3x reach. (LinkedIn data)

- 3-5 posts LinkedIn/semaine. AI draft + human edit. 30 min/jour.
- Chaque post = un insight de tes conversations avec les prospects (pas du thought leadership generique)
- "Give until they ask" (Hormozi) : donner tes secrets, vendre l'implementation

---

## PHASE 2 : CONTACTER

### 2.0 Routing cadence par chemin

| Chemin | Touches | Duree | Canaux |
|---|---|---|---|
| B (Founder, < $50K) | 5-8 | 14-21 jours | Email + Phone + LinkedIn |
| C (Founder, $50-100K) | 8-12 | 30-45 jours | Email + Phone + LinkedIn + Video |
| D (Equipe, > $100K) | 12-18 | 45-90 jours | Email + Phone + LinkedIn + Video + Direct Mail |

### 2.1 La cadence Chemin B (founder, < $50K ACV)

| Jour | Action | Script/Template | Auto |
|------|--------|-----------------|------|
| **1** | Email #1 (4T framework) | Voir 2.3 | A+H |
| **1** | LinkedIn : view profil + engage contenu | — | A |
| **3** | TRIPLE : Call + Voicemail + Email #2 | Voir 2.4 + 2.5 | H |
| **5** | LinkedIn : connexion + note perso | < 150 chars, pas de pitch | H |
| **10** | Email #3 : value-add (case study/insight) | Pas de CTA meeting. Juste de la valeur. | A+H |
| **14** | Email #4 OU Video 45s | Question binaire / 10-30-10 | A+H / H |
| **21** | Break-up email | +89% reply rate sur ce touch | A+H |

### 2.2 La cadence Chemin C (founder, $50-100K ACV)

| Jour | Action | Auto |
|------|--------|------|
| **1** | Email #1 (Challenger-style insight) | A+H |
| **1** | LinkedIn : engage contenu + view profil | A |
| **2** | Call + voicemail | H |
| **4** | Email #2 : nouvel angle + social proof | A+H |
| **5** | LinkedIn : connexion request | H |
| **8** | Video personnalisee 45s (10/30/10) | H |
| **10** | Email #3 : case study specifique | A+H |
| **14** | Call #2 (mentionner video + emails) | H |
| **17** | LinkedIn DM (si connecte) | H |
| **21** | Email #4 : question binaire | A+H |
| **28** | Email #5 : value-add final | A+H |
| **35** | Break-up email + dernier call | A+H / H |

### 2.3 Cold Email — le template qui marche (donnees Gong 85M emails)

**Structure 4T (Josh Braun) adaptee avec les data points :**

```
Subject: [1-4 mots, lowercase, question ou trigger]
        (21-40 chars = 49.1% open rate. Prenom = +22%)

Hey [Prenom],

[TRIGGER — 1 phrase. Le signal qui a declenche cet email.
 Pas "j'ai vu que tu travailles chez X." Mais une
 observation specifique : funding, hire, post LinkedIn,
 changement de stack, evenement.]

[THINK — 1 question qui fait reflechir. Pas un pitch.
 Pas "on aide les entreprises a..." Mais : "curieux —
 comment tu geres [probleme specifique] maintenant que
 [trigger event]?"]

[THIRD-PARTY — 1 phrase. Preuve. "[Entreprise similaire]
 a [resultat specifique en chiffres]."]

[TALK — Soft CTA. "Ca vaut qu'on en parle?"
 PAS "Book 30 min" (soft CTA = 4.2% vs hard 1.4%)]
```

**Longueur :** 50-80 mots. Au-dessus du fold iPhone. Pas de "show more" tap.

**Les tueurs de replies (Gong) :**
- Pitcher = **-57%**
- Hard CTA = **1.4%** vs soft 4.2% (3x moins)
- +200 mots = **-60%**
- Pas de deep personalization = **plafonner a 2-3%**
- Template generique = baseline 1-3%

**Alternative Chemin C — Challenger email (pour prospects qui ne savent pas qu'ils ont un probleme) :**
```
Subject: [insight counter-intuitive, 2-4 mots]

Hey [Prenom],

[REFRAME — 2 phrases. "La plupart des [role] pensent
 que [croyance commune]. En fait, d'apres les 50+ [role]
 a qui j'ai parle, [insight counter-intuitif]."]

[DATA — 1 phrase. Le chiffre qui rend ca indeniable.]

[IMPLICATION — 1 phrase. Ce que ca signifie pour EUX
 personnellement.]

[SOFT CTA — "Est-ce que ca resonne avec ce que tu vois?"]
```

### 2.4 Cold Call — le framework (Gong 300M calls + 30MPC)

**Opener founder (permission-based, ~11% succes Gong) :**
```
"Hey [Prenom], c'est [Ton Nom], founder de [Boite].
Je sais que j'appelle a froid — tu as 30 secondes
pour que je t'explique pourquoi?"
```

**Problem Proposition (les 30 secondes) :**
```
"La plupart des [leur role] a qui je parle depuis 6 mois
sont [probleme decrit visceralement — PAS generique].
J'ai construit [Boite] pour [1 phrase solution].
Est-ce que ca ressemble a quelque chose que tu vis?"
```

**Talk ratio optimal :** 55:45 (toi:prospect). Monologue ideal : 53 secondes (pas 25 sec = trop court, pas 2 min = trop long).

**Objections — Mr. Miyagi (30MPC) :**

49.5% sont dismissives (reaction, pas vraie objection). Agree → Incentivize → Test Drive.

| Si... | Alors... |
|---|---|
| "Pas interesse" | "Recu. Juste pour que personne ne rappelle — c'est que t'as deja une solution, tu geres en interne, ou c'est pas le moment?" → pivoter selon reponse |
| "Envoie un email" | "J'en envoie un bon. Pour que ce soit pertinent — [1 question discovery]?" |
| "On a deja [X]" | "Ok. Qu'est-ce que tu aimes? Et qu'est-ce que tu souhaiterais mieux?" |
| "Pas le temps" | "Total. 30 sec : [problem proposition]. Si c'est pas pertinent, je te laisse." |
| "C'est un cold call?" | "Oui. 30 sec et on voit si ca vaut le coup. Deal?" |

### 2.5 Voicemail (15-20 sec)

```
"Salut [Prenom], c'est [Nom], founder de [Boite].
[1 phrase trigger]. Je t'envoie un email.
[Numero], je repete [Numero]."
```

> Valeur reelle : +30-40% connexion au 2e appel (familiarite).

### 2.6 LinkedIn

- **Connexion (H) :** < 150 chars. Pas de pitch. "[Prenom], [observation sur leur contenu/trigger]. Je construis [Boite] sur ce sujet. Worth connecting."
- **Post-connexion (H) :** PAS de pitch. Valeur d'abord. "Merci. [Question liee a leur contexte]?"
- **Limites 2026 :** 80-100 connexions/semaine max. Automation = risque ban.

### 2.7 Video (10/30/10 — Morgan Ingram)

**10 sec :** "Hey [Prenom], la raison de cette video c'est [trigger]..."
**30 sec :** Value prop liee a leur probleme specifique (pas ton produit — leur probleme)
**10 sec :** "Ca vaut 15 min?" — soft CTA

> 3X reply rate vs texte. Mid-sequence (Jour 8-12) pour pattern interrupt quand l'email fatigue.

### 2.8 Arbre de decision post-sequence

```
RESULTAT DE LA SEQUENCE :

┌── Pas de reponse (apres tous les touches)
│   ├── SI signal actif existait → attendre prochain signal, relancer
│   └── SI pas de signal → nurture trimestriel. 1 touch/trimestre, valeur seulement.
│
├── "Pas maintenant" / Soft no
│   ├── Reponse : "Compris. Je note [date]. D'ici la, [insight] si utile."
│   ├── J+30 : value-add lie a un trigger event
│   ├── J+60 : check-in + nouveau signal
│   └── J+90 : re-engagement direct
│
├── "Pas interesse" / Hard no
│   └── Retirer. Revisiter SEULEMENT si trigger event majeur (nouveau leadership, funding).
│
├── "Envoie des infos" (stall)
│   ├── "Pour envoyer le bon truc — [question]?" (garder la conv)
│   └── Si insiste : 1 email (pas brochure). 1 phrase + 1 case study + 1 soft CTA.
│       Continuer la cadence.
│
└── INTERET / Meeting booke
    ├── RETIRER de toutes les sequences immediatement
    ├── Envoyer : confirmation + calendar + agenda 3 points
    └── → PHASE 3
```

---

## PHASE 3 : QUALIFIER

### 3.0 Routing par awareness acheteur

```
SI le prospect SAIT qu'il a un probleme:
    → Gap Selling (discovery-led)
    → Ecouter 80%, parler 20%
    → Mapper current state → quantifier impact → definir future state
    → Le gap SE VEND TOUT SEUL

SI le prospect NE SAIT PAS:
    → Challenger d'abord (insight-led), puis Gap
    → Enseigner le probleme : Warmer → Reframe → Data → Emotional Impact
    → ENSUITE seulement : discovery Gap Selling une fois l'awareness creee

SI le prospect SAIT mais SOUS-ESTIME:
    → Hybrid : Challenger reframe la magnitude, puis Sandler Pain Funnel pour internaliser
    → "Tu penses que ca coute X. En fait, quand on calcule [Y], c'est [Z]."
```

### 3.1 Gap Selling — la discovery (pour prospects aware)

**La formule :** Future State - Current State = Le Gap.
Plus le gap est large → plus d'urgence → moins de sensibilite au prix.

**5 elements du current state :**

| Element | Question | Pourquoi |
|---|---|---|
| Environnement | "Comment tu geres [X] aujourd'hui?" | Mapper la situation |
| Probleme | "Qu'est-ce qui ne marche pas?" | Identifier la douleur |
| Impact ($) | "Ca coute combien?" | Quantifier (LA question cle) |
| Root cause | "Pourquoi ca continue?" | Comprendre la persistance |
| Emotion | "Comment ca t'affecte?" | Le plus saute, le plus important |

**Les questions qui font la difference (Gong data) :**
- 11-14 questions ciblees = sweet spot. 20+ = interrogation mode = lost deals.
- Questions d'impact ($$) et de consequence = ce qui separe won de lost
- Etaler les questions sur TOUS les calls (discovery = processus continu, pas un event one-shot)
- Call optimale : 41-50 min. < 20 min = -42% advancement.

**Quantifier le gap :**
```
"D'apres ce que tu m'as dit, ce probleme te coute [$X/an].
Notre solution coute [$Y/an]. C'est la conversation."
```

### 3.2 Challenger — la conversation (pour prospects non-aware)

**Version founder (pas la version livre 2011 qui necessite des industry decks corporate) :**

1. **Warmer (60 sec)** : "J'ai passe [X] mois a parler a 50+ [leur role]. Voici le pattern que personne ne voit."
2. **Reframe** : Insight counter-intuitif et account-specific. Si le prospect est deja d'accord, ton reframe n'est pas assez tranchant.
3. **Data** : Un chiffre qui rend le probleme indeniable. Tes propres donnees ou industry.
4. **Emotional Impact** : "Pour toi personnellement, ca signifie [consequence sur TA carriere/bonus/reputation]."
5. **New Way** : L'approche (pas ton produit). "Les leaders dans ton espace font [X] differemment."
6. **Ton produit** : Seulement maintenant. Conclusion naturelle, pas pitch.

> Becc Holland (Flip the Script) : "Lead avec des problemes INCONNUS. Si le probleme etait assez gros et connu, ils chercheraient deja une solution."

### 3.3 Filtre rapide — BANT (Chemins B seulement, < $10K)

Score 0-3 par element. 10+ = qualifier. 7-9 = avancer en comblant. < 7 = nurture ou DQ.

- Budget : existe ou creatable?
- Authority : qui decide?
- Need : lie a une initiative ou juste curieux?
- Timeline : hard deadline ou "dans l'annee"?

### 3.4 SPICED (Chemins C et D, $50K+)

| Element | Ce que tu cherches | Question |
|---|---|---|
| **S**ituation | Contexte actuel | "Ou en etes-vous avec [X]?" |
| **P**ain | Friction specifique | "Qu'est-ce qui bloque?" |
| **I**mpact | Consequence ($$ + emotionnelle) | "Ca coute combien? Comment ca t'affecte?" |
| **C**ritical Event | Trigger de timing | "Y a-t-il un deadline, un renouvellement, un event qui drive le timing?" |
| **D**ecision | Qui + comment | "Qui d'autre est implique? Comment se prend cette decision?" |

> L'element unique de SPICED : **Critical Event**. C'est ce qui cree l'urgence naturelle — un renouvellement contrat, un audit compliance, un cycle budget. Sans Critical Event, le deal stalle indefiniment.
> Reps qui uncoverent efficacement l'Impact vendent 53% de plus. (Winning by Design internal data)

### 3.5 Decision de qualification

```
QUALIFIE (avancer vers Phase 4) si :
    ✓ Probleme reel identifie + quantifie en $
    ✓ Decision-maker identifie (meme si pas encore engage)
    ✓ Timeline ou Critical Event existant
    ✓ Le gap justifie ton prix (ratio 3-5x minimum)

NURTURE (pas maintenant, mais potentiel) si :
    ~ Probleme reel mais timing distant (> 6 mois)
    ~ Budget en attente de cycle
    ~ Reorg en cours
    → Touch trimestriel + monitoring signaux

DISQUALIFIER (walk away) si :
    ✗ Pas de probleme identifiable
    ✗ Contact sans autorite ni influence + bloque l'acces
    ✗ Pain vague + pas de cout mesurable + pas d'urgence
    ✗ 2+ red flags comportementaux
    ✗ Le gap ne justifie pas ton prix

RED FLAGS :
    - Communication unidirectionnelle (tu parles 90%)
    - Reponses > 48h sans explication
    - "C'est exactement ce qu'il nous faut" + zero timeline
    - Skip meetings / no-shows
    - Demande references mais ne les contacte jamais
    - Excessivement friendly mais aucun engagement concret
```

> 67% des ventes perdues = qualification insuffisante. Le reflexe "garder dans le pipe" est ton pire ennemi.

---

## PHASE 4 : VENDRE

### 4.1 La demo

**Regle zero :** No discovery, no demo. (Keenan)

**Structure Before/After :**
1. Framer le probleme (10 sec, mots du prospect)
2. Montrer la transformation (current → future state)
3. 2-3 features MAX qui mappent directement au gap identifie

**Pour chaque feature :** Orient → Demo → Value → Conversation
- "Ici, ca montre [X]."
- "Quand tu fais [X], [Y] se passe."
- "Ca t'aide a [outcome lie a LEUR probleme specifique]."
- "Comment ca se compare a ce que tu fais aujourd'hui?"

**Gong data sur les demos qui closent :**
- Reps qui passent 12.7% plus de temps sur les next steps closent significativement plus
- Laisser les prospects se parler entre eux en meeting groupe = signal de victoire
- Les deals qui closent ont une interactivite plus elevee ("speaker switches per minute")

### 4.2 Objections — le reflexe Gap

Face a une objection : **ne pas adresser l'objection. Retourner au gap.**

```
"Tu m'as dit que [probleme] te coute [$X/trimestre].
Le cout de ne rien faire sur 12 mois = [$Y].
Face a ce chiffre, est-ce que [objection] change l'equation?"
```

**Josh Braun :** "Stop handling objections. Prevent them." Label les negatifs en amont (accusation audit) : "Tu vas probablement penser que c'est plus cher que prevu..." → nommer le negatif le diffuse avant qu'il ne devienne une objection.

**Les 3 techniques Voss qui comptent en B2B < $100K :**
1. **Labeling** : "On dirait que [emotion/concern]..." + silence. Diffuse le negatif, renforce le positif.
2. **Calibrated Questions** : "Comment suis-je cense faire ca?" / "Qu'est-ce qui ferait que c'est un no-brainer?"
3. **Accusation Audit** : Lister tout le negatif avant qu'ils ne le disent. Ca perd son pouvoir une fois nomme.

### 4.3 Multi-threading

> Gong : +130% win rate avec multi-threading (deals > $50K). 4+ contacts = 58% win. Decision-maker non implique = 233% moins de chances.

**Comme founder, tu ES l'executif.** Tu ouvres peer-to-peer. Pas besoin d'escalader.

**Discuter prix et competition EARLY :**
- Prix au 1er call = +10% win rate. Dans le call : au mark 38-46 min.
- Competition early = +49% close probability. Late = win rates DECLINENT + deal sizes BAISSENT.

---

## PHASE 4.5 : EMPECHER LE "NO DECISION"

> 61% des deals perdus face a l'indecision. (Gartner). Pas face a un concurrent. C'est le #1 tueur de pipeline.

### Le JOLT Effect

Une fois l'intent d'achat etabli, approfondir le pitch echoue 84% du temps. FOMU > FOMO.

| Etape | Action | Script |
|---|---|---|
| **J**udge | Evaluer : peur de choisir ou peur de se tromper? | "Qu'est-ce qui te ferait hesiter meme si la solution est parfaite?" |
| **O**ffer | UNE recommandation. Pas plus d'options. | "Basee sur tout ce qu'on a discute, voici ce que je recommande. Voici pourquoi." |
| **L**imit | Arreter d'envoyer du contenu. Plus d'info = plus de paralysie. | "On a couvert beaucoup. Plutot qu'ajouter, quel point specifique te bloque?" |
| **T**ake risk off | Pilot, garantie, phased, clause sortie. | "Et si on demarrait un pilot 90j sur [perimetre reduit]?" |

### Champion Enablement

| Materiel | Pourquoi | Auto |
|---|---|---|
| One-pager par stakeholder role | Le champion doit vendre a des gens qui ont des concerns differentes | A+H |
| ROI Calculator pre-rempli | Avec LEURS chiffres de la discovery | A+H |
| Business Case in a Box | Probleme + solution + ROI + timeline + case study | A+H |
| FAQ Objections par role | Les 5 objections probables de chaque stakeholder | A+H |

**Script champion :** "Quand tu presentes a [DM], quelles objections tu anticipes? Preparons-les ensemble."

### Business Case Quantifie

> +48% win rates, +35% deal size, -25% cycle quand le BC est quantifie. (Value Selling research)

1. Cout du probleme (leurs chiffres) : $X/an
2. Valeur de la solution : $Y/an
3. Cout de la solution : $Z/an
4. ROI = (Y-Z)/Z
5. Payback = Z/(Y/12) mois
6. Cout de l'inaction = $X qui s'accumule chaque mois sans action

---

## PHASE 5 : CLOSER

### Pricing

| Principe | Donnee | Application |
|---|---|---|
| Ancrer haut | +15-20% valeur contrat | Presenter l'option premium d'abord |
| Chiffres precis | $9,700 > $10,000 | Signal de rigueur analytique |
| Good/Better/Best | Better = cible. Best = ancre. | Highlight "Most Popular" |
| Ne jamais discounter | Gong : discount = decline win rate + augmente churn | Trade value (implementation, support) pas prix |
| ROI next to price | Reframe la conversation | "$2,400/mois. Tu recuperes si tu closes 1 deal de plus/trim." |

**"Trop cher" — Gap response :** "Ca coute $X/trim de ne rien faire. Notre solution coute $Y/an. Tu perds plus en 1 trimestre d'inaction que 1 an de solution."

**Guidance founder :** Ne JAMAIS donner gratuitement. Meme le pilot doit couter quelque chose. Les pilots gratuits qui ne convergent pas sont un piege mortel. (Tom Blomfield/YC)

### Techniques de close

**Summary Close :** Recapituler tout ce qui a ete agree. Puis : "Ca capture tout? J'envoie l'accord."

**Mutual Action Plan :** Document co-cree. Chaque etape, owner, deadline. "Mappons les etapes ensemble."

> 40-60% des deals B2B meurent en "no decision". Le MAP convertit le vague en specifique.

### Procurement/Legal (Chemins C et D)

- Questionnaire securite pre-rempli (SOC 2, GDPR)
- Buffer 30-60 jours pour paper process
- Engager procurement/legal EARLY (pas a la fin — c'est la que ca tue)

---

## PHASE 6 : RE-ENGAGER

### Diagnostic root cause

| Cause | Question | Si oui |
|---|---|---|
| Champion failure | "Qui doit approuver?" | Offrir de joindre le meeting / equiper mieux |
| Gap valeur | "Si le budget etait illimite?" | Retourner a la discovery, le gap n'est pas assez large |
| Misalignment interne | "Tous alignes?" | Multi-threader — engager les dissidents |
| Blockers caches | "Quelqu'un a qui on n'a pas parle?" | Identifier et engager directement |
| Pas d'urgence | "Que se passe-t-il si rien ne change 6 mois?" | Retourner au JOLT / attendre trigger event |
| FOMU | "Qu'est-ce qui te ferait hesiter meme si c'est parfait?" | JOLT : offer une reco + take risk off |

### Break-up email (76% reply rate)

```
Subject: Fermeture de ton dossier

Je nettoie mon pipeline. Avant de fermer : tu es occupe
ou les priorites ont change — les deux OK.

J'ai ta permission de fermer?
```

> Loss aversion : annoncer la fermeture du dossier declenche la douleur de perdre une option. +89% reply sur ce touch.

### Trigger events — re-opener

| Trigger | Delai | Pourquoi ca marche |
|---|---|---|
| Nouveau leadership | < 48h | 10x prob de ramener new vendors dans les 90 premiers jours |
| Funding | < 48h | Budget expansion |
| Incident concurrent | < 24h | Confiance perdue |
| M&A / Reorg | < 48h | Besoin d'integration, nouveau budget |

> 4x conversion, 30% shorter cycles, 5x win rates quand premier a repondre.

### Quand Closed-Lost

- Choix explicite concurrent
- "Non" explicite
- Champion parti sans releve
- Budget tue
- 60 jours silence + zero next step

---

## PHASE 7 : EXPANDER

### Onboarding (tu ES le CS)

- Premier meeting schedule des que le deal close
- Time-to-value est LA metrique
- Documenter tout : objectifs, metriques succes, use cases, promesses

> "Own both the sale AND the onboarding. A great onboarding is the single biggest predictor of renewal." — Alex Kracov, Dock

### Referrals (Seeds) — la plus haute-levier source

- Demander en call, pas par email. Apres premiere valeur prouvee (30-90j) ou NPS 9-10.
- Preparer 3-5 noms (LinkedIn, filtres ICP).
- "Comment on trouve plus de leaders comme toi?"
- Drafter l'email d'intro pour eux.

> Seeds = meilleur taux de conversion de toutes les sources. Chaque client heureux → 1-3 intros. Phase 7 feed Phase 1.

### Upsell

Seulement apres valeur prouvee. JAMAIS pendant onboarding. JAMAIS apres incident support.

Signaux : plafond usage, growth equipe, workarounds construits, NPS 9-10.

### Transition — quand arreter le founder-led

| Signal | Next step |
|---|---|
| 10-20 clients closes | Considerer premier hire |
| > 20% temps sur sales | Deleguer |
| Process repeatable | Documenter |
| Premier hire | 2 AEs full-cycle, pas 1 (Sam Blond : A/B testing). Pas de SDR. |
| $3-5M ARR | VP Sales (Jason Lemkin). Pas avant. |

---

## SPECIFIQUES GEO

### Si tes prospects sont en Europe

| Facteur | Realite | Implication |
|---|---|---|
| Reply rates | 2-3x US (moins de saturation inbox) | L'opportunite est PLUS grande, pas plus petite |
| WhatsApp (Sud/Ouest Europe) | 50%+ response rates | Canal massif ignore par les playbooks US |
| Cycles | 30-50% plus longs qu'US | Patience. Plus de relationship building. |
| Cold call culture | Appels non-sollicites = intrusif dans beaucoup de marches | Email/LinkedIn d'abord. Call apres warm-up. |
| GDPR | 63% des marketers EU utilisent legitimate interest | France friendly. Allemagne stricte (quasi double opt-in). UK le plus friendly (PECR). |

**Thibaut Souyris (SalesLabs, Suisse) :** Framework Trigger/Question/Teaser/CTA → 38% reply rate, 11% booked meetings.

> "Tes meilleurs deals ne viendront pas de sequences SDR mais de ton ecosysteme." — Souyris

### Si tes prospects sont aux US

- Saturation inbox extreme (120+ sales emails/semaine par buyer)
- Le signal-based n'est plus optionnel — c'est la seule facon de se differencier du bruit
- Cold calling fonctionne mieux qu'en Europe (culture plus tolerante aux interruptions)
- Speed-to-signal critical : 5 min = 21x. Le marche US est plus reactive mais aussi plus volatile.

---

## LES "UNSEXY TRUTHS"

1. **La consistance bat la creativite.** "Un messaging moyen execute avec consistance bat des idees brillantes executees inconsistamment."

2. **Le follow-up est le plus gros levier non-exploit.** 80% des ventes necessitent 5+ follow-ups. 48% des reps n'en font jamais un seul. Les 8% qui font 5+ generent la majorite du pipeline.

3. **Tu ne peux pas scaler ce que tu n'as pas valide.** La plupart des startups essaient de scaler l'outbound avant d'avoir un process repeatable. Ca ne marche jamais.

4. **344 emails pour 1 meeting (en moyenne).** Les top performers en font 43 (23 meetings/mois). La difference n'est pas le volume — c'est le ciblage + la pertinence + le timing.

5. **Reply rates en chute libre.** 8.5% (2019) → 5% (2025) → 3.43% (2026). L'ecart se creuse. Le top tier (signal-based + hyper-personnalise) tire a 15-25%. Le reste est a 1-3%. Il n'y a plus de milieu.

6. **L'AI decay.** Les reply rates AI decayent de 60% en 18 mois (pattern matching). Les outils AI SDR churnent a 50-70%/an. Les domaines en production AI full-volume perdent 38 points de reputation en 90 jours. Le seul modele durable : AI draft + human edit.

7. **"The person with the highest level of clarity always wins."** (Steli Efti). Ton job c'est creer des outcomes — un "non" est aussi bon qu'un "oui". Un "peut-etre" est pire que tout.

---

## CHEAT SHEET — DECISION RAPIDE

| Situation | Reponse |
|---|---|
| J'ai < 10 clients | Phase -1. 50 conversations. Pas de scaling. |
| J'ai 10+ clients et je suis seul | Chemin B. 10-15 prospects/sem. Signal-triggered. 4T + Triple + Gap. |
| Mon deal moyen est > $50K | Chemin C. 5-8 accounts. Challenger + SPICED. Multi-threade. |
| Le prospect sait qu'il a un probleme | Gap Selling. Ecouter 80%. Quantifier le gap. |
| Le prospect ne sait pas | Challenger. Enseigner le probleme d'abord. |
| Le deal stalle | Diagnostiquer (6 causes). JOLT si indecision. Break-up si ghost. |
| "C'est trop cher" | Retourner au gap. "$X de cout/an vs $Y de solution. L'equation tient." |
| "Faut que j'en parle a mon boss" | Equiper le champion (one-pager, ROI calc, FAQ). Proposer de joindre. |
| "Faut reflechir" | JOLT : Judge indecision, Offer UNE reco, Limit info, Take risk off. |
| Le prospect ghost | Break-up email (76% reply). Attendre trigger event. |
| Quand embaucher | 10-20 clients + > 20% temps sur sales + process repeatable. 2 AEs, pas 1. |
