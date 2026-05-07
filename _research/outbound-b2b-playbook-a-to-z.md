# OUTBOUND B2B SALES PLAYBOOK — A TO Z
# Version 2.0 — Post-Challenge (Mai 2026)

> Contexte : ce playbook est concu pour un **founder solo** faisant du **founder-led sales** en early-stage SaaS ($5K-$50K ACV). Il integre les meilleurs frameworks occidentaux, corrige les elements obsoletes post-2024, et resout les contradictions entre methodologies par le contexte. Principe directeur : **AI prepare tout, l'humain fait les meetings, les relations, et le jugement.**

## Vue d'ensemble du funnel

```
PHASE -1: LEARNING MODE (50 conversations, valider l'hypothese ICP)
    |
PHASE 0: FONDATION (ICP, TAM, signaux, AI stack, delivrabilite email)
    |
PHASE 1: CIBLAGE & LISTES (scoring, tiering, priorisation par signaux)
    |
PHASE 2: PREMIER CONTACT (cadence multi-canal 14-21 jours)
    |               Chaque outreach est DECLENCHE PAR UN SIGNAL, pas a froid
    |
    +---> Pas de reponse -----> Nurture trimestriel
    +---> Non ferme ----------> Retirer
    +---> "Pas maintenant" ---> Re-engagement 30/60/90j
    +---> Interet/reponse ----> PHASE 3
    |
PHASE 3: QUALIFICATION & DISCOVERY
    |       Router par deal size: <$25K = BANT+Gap / $25-100K = CHAMP+Gap / >$100K = MEDDPICC
    |
    +---> Score < seuil ------> Disqualifier ou nurture
    +---> Score moyen --------> Continuer qualification
    +---> Score fort ----------> PHASE 4
    |
PHASE 4: CONVERSATION & DEMO (Challenger si probleme inconnu / Gap si probleme connu)
    |
    +---> Objections resolues ---------> PHASE 4.5
    +---> "Faut que j'en parle a..." --> Champion enablement (PHASE 4.5)
    +---> "Faut que j'y reflechisse" --> JOLT Effect (PHASE 4.5)
    +---> Signaux de deal mort --------> Disqualifier ou PHASE 6
    |
PHASE 4.5: CHAMPION ENABLEMENT & PREVENTION "NO DECISION"
    |        Armer le champion / JOLT Effect / Business case quantifie
    |
    +---> Champion equipe, business case pret --> PHASE 5
    +---> Indecision non resolue --------------> PHASE 6
    |
PHASE 5: NEGOTIATION & CLOSE
    |       Procurement/Legal/Security navigation
    |
    +---> Closed Won ---------> PHASE 7
    +---> Objection prix -----> Handle Gap/Voss
    +---> Stalled ------------> PHASE 6
    |
PHASE 6: DEALS STALLED & RE-ENGAGEMENT
    |       Diagnostiquer root cause / JOLT / Trigger events
    |
    +---> Re-engage ----------> Retour phase appropriee
    +---> 60j sans activite --> Closed Lost
    +---> Trigger event ------> Re-ouverture
    |
PHASE 7: POST-CLOSE & EXPANSION
    |       Tu ES le CS. Ton onboarding est ta retention.
    |
    +---> Upsell (apres valeur prouvee)
    +---> Referrals (Seeds) --> Retour PHASE 1
```

**Legende automation :**
- **(A)** = AI handles end-to-end
- **(H)** = Humain uniquement
- **(A+H)** = AI prepare, humain execute

---

## PHASE -1 : LEARNING MODE

> Bessemer, YC (Tom Blomfield), 100 Founders convergent : founders qui font 50+ discovery calls avant de coder en production ont 40% plus de chances d'atteindre $1M ARR en 2 ans.

**Objectif :** Valider ton hypothese ICP, pas closer des deals.

**Process :**
1. Formuler une hypothese ICP etroite : un "wedge" (use case ou persona specifique). Ex: "VPs Sales de SaaS B2B Series A-B, 20-50 employes, qui recrutent leur premier SDR."
2. Contacter 50 personnes matchant ce wedge. **(H)**
3. Mener des conversations de discovery (PAS de demo, PAS de pitch). Poser : "Quel est ton plus gros probleme avec X?" **(H)**
4. Apres 50 conversations, evaluer : est-ce que le probleme est reel, frequent, et urgent ?
5. Si oui → passer a Phase 0 avec un ICP valide
6. Si non → pivoter le wedge (persona different, pain different, segment different). Recommencer.

**Wedge Strategy (Tom Blomfield/YC) :**
- Vendre agressivement pendant 2 semaines. Si ca ne marche pas, pivoter.
- Ne PAS construire d'infrastructure de scoring avant d'avoir 10 clients
- Ne JAMAIS donner le produit gratuitement. Charger quelque chose — meme $500/mois — pour valider le willingness to pay.
- Eviter les "design partnerships" vagues qui ne convergent jamais

**Quand sortir de Phase -1 :**
- 10+ clients payants
- Process repeatable identifie (tu sais expliquer comment tu closer)
- ICP valide par les donnees (pas juste par l'intuition)

---

## PHASE 0 : FONDATION

### 0.1 AI Stack du founder solo (A)

Avant de prospecter, installer l'infrastructure. Budget : $300-500/mois.

| Fonction | Outil | Cout | Pourquoi |
|---|---|---|---|
| Enrichissement leads | Clay | $185/mois | Waterfall enrichment 75+ providers. 80-95% email find rates vs 50-60% single-source. |
| Email coaching | Lavender | Free-$29 | Scoring temps reel. AI-assisted emails = 5.1% reply rate (vs 3.8% full-human, 2.4% full-AI). |
| Sequences email | Smartlead ou Instantly | $39-99 | Multi-domain sending, warming, automation. |
| CRM | Folk ou Attio | Free-$25 | Leger, founder-friendly. Pas Salesforce. |
| Calendrier | Reclaim.ai | Free-$10 | AI blocking, focus time. |
| Contenu LinkedIn | Taplio ou natif | Free-$49 | Scheduler, track engagement, personal brand. |

> Principe : AI draft + human edit = meilleur resultat. Pour chaque email, AI redige le premier jet, tu edites et approuves avant envoi.

### 0.2 Infrastructure delivrabilite email (A)

**Prerequis techniques (non-negociables en 2026) :**
- **SPF** : DNS TXT record listant les expediteurs autorises
- **DKIM** : Signature digitale sur chaque message
- **DMARC** : Politique pour gerer les echecs SPF/DKIM
- **One-click unsubscribe** : Obligatoire via RFC 8058

**Infrastructure multi-domaine :**
- 3-5 domaines d'envoi minimum pour scaler
- Warm-up obligatoire : 2-4 semaines (5-10 emails/jour → 30-50 → 80-120)
- Limite safe : 30-50 emails/inbox/jour, 200/domaine/jour max
- Seuil spam : < 0.3% (Google recommande < 0.1%)
- Bounce rate : < 2% (idealement < 0.5%)
- Verifier chaque adresse email avant de l'ajouter a une sequence

> Sans cette infrastructure, chaque framework d'outreach du playbook echoue. Teams qui ont ignore ces regles : -30 a -50% delivrabilite en 2024.

### 0.3 Definir l'ICP (Ideal Customer Profile)

**Si tu as < 10 clients** (post Phase -1) : ton ICP est une hypothese basee sur tes 50 conversations. Ne pas sur-ingenierer le scoring. Utiliser une definition simple en 3 criteres : industrie + taille + pain.

**Si tu as 10+ clients :**

**Etape 1 : Analyser les meilleurs clients existants**
- Top 20% par revenu, retention, ou taux d'expansion
- Attributs firmographiques communs (industrie, taille, revenue, geo)
- L'approche qui a permis de closer et maintenir ces clients

**Etape 2 : Analyser les pires clients (anti-persona)**
- Clients churnes, faible satisfaction, deals difficiles a closer
- L'anti-pattern est souvent plus revelateur que le pattern

**Etape 3 : Criteres specifiques et mesurables**
- "Mid-market" est vague. "B2B SaaS, 50-200 employes, $5M-$50M ARR" est actionable
- Si tu ne peux pas scorer un critere, tu ne peux pas l'utiliser

### 0.4 Scoring ICP (A)

**Formule :**
```
ICP Score = (Firmo x 0.35) + (Techno x 0.25) + (Signaux x 0.25) + (Engagement x 0.15)
```

| Score | Classification | Action |
|---|---|---|
| 90-100 | Fit ideal | Outreach hyper-personnalise, max effort |
| 70-89 | Fit fort | Process standard, haute priorite |
| 50-69 | Fit modere | Qualification requise |
| < 50 | Fit faible | Investissement minimal ou ignorer |

### 0.5 Tiering des comptes (A)

- **Tier 1** : Haute valeur + fit ICP fort + signal actif. Outreach hyper-personnalise.
- **Tier 2** : Bon fit mais manque 1-2 criteres. Outreach personnalise.
- **Tier 3** : Potentiel plus faible. Sequences automatisees ou nurture.

### 0.6 TAM / SAM / SOM bottom-up (A)

1. **TAM** : Toutes les entreprises matchant l'ICP large x ACV moyen
2. **SAM** : Filtrer par contraintes reelles (10-30% du TAM)
3. **SOM** : Parmi le SAM, ceux avec signaux d'achat actifs x taux de close realiste. C'est ta target list.

### 0.7 Infrastructure signaux (A)

**C'est la couche fondamentale — pas un add-on optionnel.** Signal-triggered outreach = 15-25% reply rate vs 1-5% cold generique.

**7 categories, classees par puissance predictive :**

1. **Signaux sociaux** (demande de recommandations, plainte publique contre un concurrent) — intent explicite
2. **Signaux comportementaux website** (visites repetees pricing/demo page) — intent implicite fort
3. **Intent tiers** (surges de recherche sur Bombora, G2) — intent modere
4. **Changements de leadership** (nouveau VP/CXO) — timing multiplier, 10x plus susceptibles de ramener de nouveaux vendors dans les 90 premiers jours
5. **Evenements financiers** (funding, M&A, IPO) — timing multiplier
6. **Patterns de recrutement** (hiring dans ton domaine) — indicateur de priorite strategique
7. **Signaux technologiques** (installation/retrait d'outils) — timing + fit

**Signal-to-Action SLA :**

| Signal | Play | Delai max |
|---|---|---|
| Visite pricing page | Follow-up offrant trial/demo | < 4h |
| Job change (champion bouge) | Outreach "nouveau role" | < 24h |
| Annonce de funding | Lead avec angle scale/efficiency | < 24h |
| Retrait techno concurrent | Offre competitive displacement | < 24h |
| Surge d'intent tiers | Contenu educatif + offre demo soft | < 48h |

> Les taux de reponse chutent de 80% apres 5 jours.

---

## PHASE 1 : CIBLAGE & CONSTRUCTION DE LISTES

### 1.1 Les trois types de leads (Predictable Revenue)

- **Seeds** : Referrals de clients heureux. Meilleur taux de conversion, lent mais compound. **Pour un founder solo, c'est la source la plus haute-levier.** Chaque client heureux devrait generer 1-3 intros.
- **Nets** : Inbound (SEO, contenu, events). Volume haut, qualification basse.
- **Spears** : Outbound cible. One-to-one, petit volume, haute qualite.

> Le modele Predictable Revenue (2011) separait SDR/AE/CS. Ce modele est partiellement obsolete : les full-cycle approaches outperforment pour la majorite du B2B SaaS. Un founder fait tout — et c'est un avantage, pas un handicap.

### 1.2 Construire la liste (A)

1. Partir du SOM
2. Scorer chaque account avec la formule ICP
3. Tier
4. **Overlay avec les signaux actifs** — c'est ce qui separe le cold du warm outbound
5. Prioriser : Tier 1 + signal actif = premiere vague

### 1.3 Founder Authority Plays (H)

L'avantage #1 du founder : **tu ES l'executif.** Pas besoin d'escalader, pas besoin de champion pour entrer dans la room. Tu es peer-to-peer des la premiere conversation.

**Exploiter cet avantage :**
- Publier du contenu LinkedIn 3-5x/semaine. AI draft + human edit. 8X pipeline impact. Inbound-led outbound convertit a 14.6% vs 1.7% cold. **(A+H)**
- Emailer depuis ton domaine personnel (founder@company.com), pas un outil de sequence **(H)**
- Assister aux events industrie comme un pair, pas un vendor **(H)**
- Dans chaque conversation, lead avec ton experience de construction : "J'ai construit ce produit parce que..." **(H)**

### 1.4 Le Core Four (Hormozi) — pour scaler la generation

1. **Warm Outreach** : ACA Framework — Acknowledge, Compliment, Ask ("Qui connais-tu qui beneficierait de X?") **(H)**
2. **Contenu gratuit** : Hook/Retain/Reward. Donner jusqu'a ce qu'ils demandent. **(A+H)**
3. **Cold Outreach** : Signal-triggered outbound. La liste est roi. Micro-segmentation > listes generiques. **(A+H)**
4. **Paid Ads** : Quand les 3 premiers marchent. Minimum 3:1 LTGP-to-CAC ratio. **(A)**

**Rule of 15-25 (adaptation founder de la Rule of 100 de Hormozi) :**
15-25 touches personnalisees par jour. Pas 100 — un founder a 2-3h max pour l'outbound. La qualite bat le volume quand tu es seul.

---

## PHASE 2 : PREMIER CONTACT — CADENCE MULTI-CANAL

### 2.1 La cadence founder : 5-8 touchpoints / 14-21 jours

> Adaptation de la cadence "enterprise" 13-touchpoints/21-jours. Pour un founder avec 10-15 nouveaux prospects/semaine.

| Jour | Canal | Action | Automation |
|------|-------|--------|------------|
| 1 | Email | Email initial personnalise (3C ou PAS) | A+H |
| 1 | LinkedIn | Voir profil + like/comment contenu | A |
| 3 | Phone | Appel + Voicemail si pas de reponse | H |
| 3 | Email | Court follow-up referencant le voicemail | A+H |
| 5 | LinkedIn | Demande connexion avec note personnalisee | H |
| 10 | Email | Value-add — Case study, insight, ressource | A+H |
| 14 | Email | Question directe binaire ou video 45-60s | A+H / H |
| 21 | Email | Break-up email | A+H |

**"Founder Power Hour" — allocation quotidienne :**
- 1h outreach (emails + calls)
- 30 min follow-ups et admin CRM
- 30 min contenu LinkedIn / personal brand

### 2.2 Le COMBO Prospecting (Tony Hughes) — version founder

**Le Triple (3 touches en < 2 minutes) :** **(H)**
1. **Appel** direct. Si pas de reponse →
2. **Voicemail** 15-20 sec. Contexte seulement, PAS de pitch.
3. **Email** dans les secondes. Contient le pitch. < 100 mots.

> 3X taux de reponse vs mono-canal. Le telephone buzze 6+ fois en < 2 min = pattern interrupt.

**Timing optimal :** 7h45-8h45 (avant l'assistant) et 17h-18h (apres l'assistant).

Pour un founder : 5-10 Triples par jour (pas 60). Cibler les prospects Tier 1 + signal actif.

### 2.3 Cold Email — Sequence de 5 emails (A+H)

**Framework 3C (Alex Berman) :**
- **C**ompliment : 1 phrase prouvant la recherche
- **C**ase Study : 1-2 phrases. "On a aide [similaire] a atteindre [metrique] en [duree]."
- **C**TA : Demande unique, low-friction.

> Si tu n'as pas encore de case study : utiliser les insights de tes 50 conversations Phase -1. "J'ai parle a 50+ [leur role]. Le pattern #1 que je vois est..."

**Email 1 (Jour 1) — Initial :**
```
Subject: [Prenom] — [hook 2-4 mots]

Hey [Prenom],

[1 phrase: observation personnalisee sur leur business.
Referencier le SIGNAL qui a declenche l'outreach.]

[1-2 phrases: Probleme que tu resous + proof point]

Ca vaut 15 min pour voir si c'est pertinent?
```

**Email 2 (Jour 3) — Nouvel angle :**
```
Subject: Re: [sujet original]

Hey [Prenom],

Petit follow-up -- [nouveau proof point, stat, ou angle
different de l'Email 1].

Ca resonne?
```

**Email 3 (Jour 10) — Value-add (pas de demande directe) :**
```
Subject: Re: [sujet original]

Hey [Prenom],

[Lien vers case study, rapport, ou outil pertinent]

[1 phrase connectant ca a leur challenge specifique]
```

**Email 4 (Jour 14) — Question binaire :**
```
Subject: Re: [sujet original]

Hey [Prenom],

Est-ce que [probleme] est toujours une priorite ce
trimestre, ou est-ce que quelque chose d'autre a pris
le dessus?
```

**Email 5 (Jour 21) — Break-up :**
```
Subject: Re: [sujet original]

Hey [Prenom],

Pas de reponse, je suppose que le timing n'est pas bon.

Je ferme ca de mon cote — si [probleme] revient, voici
mon calendrier: [lien]
```

**Regles 2026 :**
- 50-125 mots (2.4X plus de replies que > 200 mots)
- Zero liens dans le premier email (delivrabilite)
- Plain text only. Pas d'images, pas de HTML.
- 1 seul CTA par email. < 6 mots.
- Chaque email base sur un SIGNAL, pas generique

### 2.4 Cold Call — Framework (H)

**Opener founder (>> pattern-interrupt SDR) :**
```
"Hey [Prenom], c'est [Ton Nom], je suis le founder de
[Entreprise]. J'ai construit ce produit parce que je
voyais [probleme specifique] partout. J'ai l'impression
que vous pourriez etre concerne — ca te dit 30 secondes?"
```

> Un founder qui appelle EST l'executif. C'est 10x plus compelling que n'importe quel opener SDR.

**Openers alternatifs (donnees Gong sur 300M+ appels) :**

Opener "Heard the Name" (11.24% succes) :
```
"Hey [Prenom], c'est [Ton Nom] — je travaille avec
quelques [leur role] chez [entreprise peer]. T'as deja
entendu mon nom?"
```

Permission Opener (11.18% succes) :
```
"Hey [Prenom], c'est [Ton Nom] de [Entreprise]. Je sais
que j'appelle a froid — 30 secondes pour t'expliquer
pourquoi, et tu me dis si ca vaut le coup?"
```

**Problem Proposition (10-30 sec) :**
80% du pitch sur le probleme. Le prospect doit SENTIR le probleme.
```
"La plupart des [leur role] a qui je parle passent
[probleme decrit visceralement]. [Une phrase sur comment
tu resous ca differemment]."
```

**Objection handling — Mr. Miyagi Method :**
3 etapes : **Agree** → **Incentivize** → **Sell the Test Drive**

| Objection | Agree | Incentivize |
|---|---|---|
| "C'est un cold call?" | "Oui, coupable." | "30 sec, et si c'est pas pertinent on ne rappelle plus?" |
| "Pas interesse" | "My bad. Tu aurais contacte toi-meme si tu avais besoin." | "Pour que personne ne rappelle — c'est que t'as deja une solution, tu geres en interne, ou tu detestes les cold calls?" |
| "Pas le temps" | "Total, je sais que j'appelle a froid." | "30 sec, et si c'est pas pertinent, c'est fini?" |
| "Envoie-moi un email" | "Avec plaisir." | "Pour envoyer le bon truc, une question rapide?" |
| "On a deja une solution" | "Top." | "Par curiosite, tu utilises quoi? Et qu'est-ce que tu souhaiterais mieux?" |
| "Pas de budget" | "Je comprends. Tout est serre." | "C'est le timing ou c'est juste pas une priorite?" |
| "On utilise [Concurrent]" | "Solide." | "Qu'est-ce que tu aimes le plus? Et qu'est-ce que tu souhaiterais mieux?" |

### 2.5 LinkedIn Outreach (H pour DMs, A pour warm-up)

> LinkedIn automation = risque elevé en 2026. LinkedIn detecte les biometrics comportementaux non-humains. Meme les outils "safe" se font attraper. Limite : 80-100 connexion requests/semaine.

**Sequence warm-up (A) :**
1. Voir leur profil (Jour 0)
2. Like ou commenter leur post (Jour 0-1)
3. Attendre 2-3 jours

**Connexion request (H) — < 150 caracteres :**
```
[Prenom], j'ai vu ton post sur [sujet]. Je construis
[Entreprise] pour resoudre exactement ca. Worth connecting.
```

**Apres acceptation (H) — PAS de pitch :**
```
Merci pour la connexion. J'ai remarque [quelque chose
de specifique]. On aide [entreprise similaire] avec
[resultat] — ca resonne avec tes challenges?
```

### 2.6 Voicemail (H) — 15-20 sec

```
"Salut [Prenom], c'est [Ton Nom], founder de [Entreprise].
J'ai remarque [trigger]. Je t'envoie un email avec plus
de detail. [Numero], je repete [Numero]. A bientot."
```

> Valeur reelle : +30-40% connexion au 2e appel. Pas le callback.

### 2.7 Video Prospecting (H) — 10/30/10 (Morgan Ingram)

- **10 sec** : Raison de l'outreach (referencier le signal)
- **30 sec** : Value prop liee a leur probleme specifique
- **10 sec** : CTA clair

> Videos < 60 sec. 3X reply rate vs texte. Pattern interrupt mid-sequence quand l'email fatigue s'installe.

### 2.8 Arbre de decision post-sequence

```
Pas de reponse?
    +---> Attendre 1 sem apres break-up → Nurture trimestriel (A)
    +---> Touch base 1x/trim avec quelque chose de nouveau

Soft no ("pas maintenant")?
    +---> "Compris, je note de revenir en [date]." (H)
    +---> J30: touchpoint value-add (A+H)
    +---> J60: check-in base sur trigger event (A+H)
    +---> J90: re-engagement direct (H)

Hard no?
    +---> Retirer de toutes les sequences (A)
    +---> Revisiter SEULEMENT si trigger event majeur

Bounce?
    +---> Hard: retirer, chercher email alternatif (A)
    +---> Soft: garder (retry auto)
    +---> Bounce rate > 2%: pause, nettoyer liste (A)

Interet?
    +---> RETIRER de toutes les sequences (A)
    +---> Envoyer confirmation + calendar + agenda (A+H)
    +---> → PHASE 3
```

---

## PHASE 3 : QUALIFICATION & DISCOVERY

### 3.0 Router par deal size

| ACV | Framework | Pourquoi |
|---|---|---|
| < $10K | BANT seul | Speed-to-close. 1-2 decision makers. |
| $10-25K | BANT + Gap Selling | Gap quantification justifie le budget. |
| $25-50K | CHAMP + Gap Selling | Lead avec le probleme, pas le budget. |
| $50-100K | CHAMP + Gap Selling + light MEDDIC | Tracker champion, economic buyer, decision process. |
| > $100K | Full MEDDPICC | Multi-stakeholders, procurement formel, 3+ mois. |

> Pour un founder solo a $5-50K ACV : **BANT pour le filtre initial + Gap Selling pour creuser.** C'est tout. MEDDPICC est en appendice pour quand tes deals grossiront.

### 3.1 Filtre initial — BANT (H)

Scoring 0-3 par element. Max 12.

| Critere | Fort (3) | Modere (2) | Faible (1) | Nul (0) |
|---|---|---|---|---|
| **Budget** | Fonds alloues, montant confirme | Existe mais non confirme | "On explore" | Pas d'info |
| **Authority** | Decision-maker identifie et engage | Champion identifie, DM connu | Contact unique, structure floue | Pas d'info |
| **Need** | Lie a initiative strategique | Probleme reconnu, impact quantifie | Interet general | Pas d'info |
| **Timeline** | Deadline ferme | Trimestre cible | "Dans l'annee" | Pas d'info |

- **10-12** : Qualifier → avancer
- **7-9** : Avancer en comblant les gaps
- **4-6** : Nurture
- **< 4** : Disqualifier

> BANT a ete cree quand le budget etait pre-alloue. En 2026, les acheteurs n'allouent pas de budget avant d'identifier le probleme. Utiliser BANT pour le filtre, pas pour la discovery.

### 3.2 Discovery — Gap Selling (H)

**La formule :** Future State - Current State = Le Gap

Plus le gap est large → plus d'urgence → moins de sensibilite au prix.

**Quand utiliser Gap Selling vs Challenger :**
- Le prospect **sait** qu'il a un probleme → **Gap Selling**. Il a le vocabulaire. Deep discovery surface l'impact et l'urgence non quantifies.
- Le prospect **ne sait pas** qu'il a un probleme → **Challenger** (Phase 4). Discovery yield des reponses shallow. Il faut enseigner le probleme d'abord.

**Analyse du Current State — 5 elements :**

| Element | Focus | Questions |
|---|---|---|
| **Environnement** | Outils, equipe, process | "Explique-moi comment ton equipe gere ca aujourd'hui." |
| **Probleme** | Ce qui est casse | "Qu'est-ce qui ne marche pas comme tu voudrais?" |
| **Impact** | Consequences business ($$) | "Ca vous coute combien par trimestre?" |
| **Root Cause** | Pourquoi ca persiste | "Pourquoi ca continue d'arriver?" |
| **Emotion** | Comment le buyer ressent ca | "Comment ca affecte ton equipe au quotidien?" |

**4 types de questions (dans l'ordre) :**

1. **Probing** (mapper le current state) :
   - "Explique-moi comment ton equipe track le pipeline aujourd'hui."
   - "Que se passe-t-il quand un deal stalle?"
   - "Combien de temps tes reps passent sur la saisie CRM chaque semaine?"

2. **Process** (exposer les inefficacites) :
   - "Apres un call discovery, quel est le process pour mettre a jour le CRM?"
   - "Comment votre forecast remonte du rep au manager au CRO?"

3. **Provoking** (elargir le gap) :
   - "Si la precision du forecast est a 70%, qu'est-ce que ca signifie pour la confiance de ton board si c'etait 90%?"
   - "Si les reps passent 4h/sem sur le CRM, que ferait ton equipe avec ce temps?"

4. **Validating** (construire l'accord) :
   - "Donc le probleme principal c'est [X] qui cause [Y] — c'est correct?"
   - "Si on pouvait [outcome], ca resoudrait le probleme?"

**Ratio :** Tu parles 20%, ecoutes 80%.

**Quantification du gap :**
```
"Notre solution coute $40K/an. D'apres ce que tu m'as
dit, ce probleme te coute $185K. C'est la conversation."
```

### 3.3 Sandler Pain Funnel — pour creuser l'emotion (H)

12 questions dans l'ordre :

1. "Dis-m'en plus..."
2. "Peux-tu etre plus specifique? Donne un exemple."
3. "Depuis combien de temps c'est un probleme?"
4. "Qu'est-ce que vous avez tente?"
5. "Ca a marche?"
6. "Combien tu penses que ca a coute?"
7. "Comment tu te sens par rapport a ce cout?"
8. "Quel genre de problemes ca cause?"
9. "Vous avez abandonne l'idee de regler ca?"
10. "Pourquoi c'est un probleme pour toi?"
11. "A quel point c'est serieux la, aujourd'hui?"
12. "C'est quoi le vrai, vrai, vrai probleme?"

> L'ordre compte. La progression du large vers l'impact emotionnel est critique.

### 3.4 SPIN Selling — structure de discovery alternative (H)

| Type | But | Exemple |
|---|---|---|
| **Situation** (2-3 max) | Baseline. Trop = pas de recherche pre-call. | "Quels systemes utilisez-vous?" |
| **Problem** | Decouvrir les challenges | "Quels sont les plus gros bottlenecks?" |
| **Implication** (CLE — 4X plus chez les top performers) | Creer l'urgence par les effets domino | "Quel est le cout de cette inefficacite sur 6-12 mois?" |
| **Need-Payoff** | Faire articuler la valeur PAR L'ACHETEUR | "Si vous pouviez automatiser ca, qu'est-ce que ca changerait?" |

### 3.5 Arbre de decision qualification

```
Pas de probleme identifie?
    → Disqualifier. "Pas de probleme = pas de vente."

BANT < 4?
    → 2+ red flags? Disqualifier.
    → Sinon: nurture.

BANT 4-9?
    → Continuer en comblant les gaps.

BANT 10+?
    → Avancer vers PHASE 4.
```

**Red flags de deal mort :**
- Communication unidirectionnelle (tu parles 90%)
- Contact sans autorite ni influence
- Pain points vagues, pas de cout mesurable
- Reponses > 48h pour des demandes simples
- "C'est exactement ce qu'il nous faut" mais pas de timeline
- Skip ou no-show aux meetings

> 2+ red flags = signal fort de disqualification. 67% des ventes perdues resultent d'une qualification insuffisante.

---

## PHASE 4 : CONVERSATION DE VENTE & DEMO

### 4.0 Choisir le bon framework

| Situation | Framework |
|---|---|
| Prospect sait qu'il a un probleme, cherche des solutions | **Gap Selling** (discovery-led) |
| Prospect ne sait PAS qu'il a un probleme (status quo bias) | **Challenger** (insight-led) |
| Marche commoditise, prospect a deja vu 3 concurrents | **Challenger** (differenciation par l'insight) |
| Vendeur junior / peu d'expertise domaine | **Sandler / Gap** (questioning-based, plus tolerant) |
| Vendeur senior / deep expertise verticale | **Challenger** (credibilite fait atterrir le teaching) |

### 4.1 Challenger Sale — La choregraphie en 6 etapes (H)

**Etape 1 : The Warmer (60-90 sec)**
```
Founder version: "J'ai passe 6 mois a etudier [probleme]
en parlant a 50+ [leur role]. Voici ce que j'ai trouve."
```
- Ne jamais ouvrir avec ton produit
- Ne jamais ouvrir avec "parle-moi de ton business" — tu devrais deja savoir

**Etape 2 : The Reframe**
Insight surprenant qui challenge une croyance core.
```
"La plupart pensent que le volume de leads est le probleme.
En fait, c'est la qualification — vous chassez les mauvais
prospects et votre equipe ne le sait pas."
```
- Doit etre genuinement nouveau pour l'acheteur
- Doit etre account-specific en 2026 (pas industry-generic)
- Si l'acheteur est deja d'accord, le reframe n'est pas assez tranchant

**Etape 3 : Rational Drowning**
Donnees qui rendent le probleme indeniable.
```
"Les entreprises gaspillent 67% du temps commercial sur des
leads non-qualifies. Pour une equipe de 20, c'est $2.3M/an."
```

**Etape 4 : Emotional Impact**
Rendre le probleme personnel.
```
"En tant que VP Sales, tu es mesure sur le quota. Si ton
equipe gaspille 67% de son temps, c'est ton bonus, ta
promotion, ta trajectoire."
```

**Etape 5 : A New Way**
Methodologie, PAS ton produit.
```
"Les entreprises leaders utilisent le scoring comportemental
pour qualifier 10x plus vite."
```

**Etape 6 : Your Solution**
MAINTENANT seulement.
```
"Notre plateforme automatise ce scoring via 30+ sources
d'intent signals."
```

### 4.2 Demo Framework — Before/After (H)

**Regle zero :** "No discovery, no demo." (Keenan)

1. **Pain (Before)** — 10 sec. Framer le probleme en referencant la discovery.
2. **Transformation** — Montrer le changement. "Voila ou tu es → voila ou tu pourrais etre."
3. **Solution (After)** — SEULEMENT 2-3 features qui resolvent directement le probleme. Max 6 features.

**Pour chaque feature (Orient-Demo-Value) :**
1. Orient : "Ici, ce dashboard montre X."
2. Workflow : "Quand tu fais X, Y se passe."
3. Value : "Ca t'aide a [outcome lie a leur probleme]."
4. Conversation : "Comment ca se compare a ce que tu fais aujourd'hui?"

**A ne pas faire :** Feature dump, monologue, commencer par le produit, envoyer l'enregistrement complet, demander "Ca a du sens?"

### 4.3 Objection handling — Framework universel (H)

1. **Cushion** : "J'apprecie que tu souleves ca."
2. **Clarify** : Trouver la vraie objection sous la surface.
3. **Isolate** : "Si on adressait ca, autre chose t'empeche d'avancer?"
4. **Respond** : Preuve + connexion a leur situation.

**Gap Selling approach :** Face a une objection, NE PAS adresser l'objection directement. Retourner au gap. "Tu m'as dit que [probleme] te coute $X/trimestre. Face a ce chiffre, est-ce que [objection] change vraiment l'equation?"

**Voss techniques :**
- **Mirroring** : Repeter les 1-3 derniers mots. Puis SILENCE 4+ sec.
- **Labeling** : "On dirait que..." / "Il semble que..." Puis silence.
- **Calibrated Questions** : "Comment suis-je cense faire ca?" / "Qu'est-ce qui ferait que c'est un no-brainer?"
- **Questions orientees "Non"** : "Tu as abandonne l'idee de resoudre [probleme]?" (reponse "Non" = ils veulent toujours)

### 4.4 Multi-threading (H)

> Un founder a un acces naturel au C-suite comme pair. Utiliser cet avantage.

**5 roles a mapper :**

| Role | Ta strategie comme founder |
|---|---|
| **Economic Buyer** | Tu ouvres CEO-a-CEO ou founder-a-VP. Pas besoin d'escalader. |
| **Technical Buyer** | Fournir docs architecture, security reviews, POC. |
| **Champion** | Equiper avec one-pagers, ROI calc, talking points. |
| **Influencer** | Valider leurs concerns, les inclure. |
| **Blocker** | Engager early, comprendre concerns, convertir en allies. |

**Test du vrai champion :** Demande-lui de faire quelque chose (organiser un meeting avec l'EB, partager les criteres internes). S'il n'agit pas → c'est un coach, pas un champion.

---

## PHASE 4.5 : CHAMPION ENABLEMENT & PREVENTION "NO DECISION"

> 83% du process d'achat se passe SANS toi (Gartner). 40-60% du pipeline qualifie meurt en "no decision" (Forrester). Cette phase est le chainnon manquant entre "le prospect est interesse" et "le deal close".

### 4.5.1 Champion Enablement (A+H)

Armer ton champion pour vendre en interne sans toi :

| Materiel | Contenu | Automation |
|---|---|---|
| One-pager par role | Probleme + solution + ROI adapte au stakeholder (CFO, CTO, VP, etc.) | A+H |
| ROI Calculator | Spreadsheet pre-rempli avec leurs chiffres de la discovery | A+H |
| Business Case in a Box | Probleme, solution, ROI attendu, case study, timeline | A+H |
| FAQ Objections | Reponses aux 5 objections les plus probables de chaque stakeholder | A+H |
| Reponses securite/compliance | Pre-rempli pour les questionnaires standards | A |

**Script pour activer le champion :**
```
"Quand tu presentes ca a [decision-maker], quelles
objections tu anticipes? Preparons ca ensemble.
Je t'ai fait un one-pager avec les 3 points qui
resonnent le plus pour un [leur role]."
```

### 4.5.2 JOLT Effect — Vaincre l'indecision (H)

> 61% des deals sont perdus face a l'indecision, pas face a un concurrent. Une fois l'intent d'achat etabli, approfondir le pitch de valeur echoue 84% du temps. La peur de se tromper (FOMU) bat la peur de rater (FOMO).

**4 etapes :**

**J — Judge le niveau d'indecision**
Est-ce que le prospect est indecis parce qu'il ne sait pas quoi choisir, ou parce qu'il a peur de se tromper? La reponse change tout.

**O — Offer une recommandation**
NE PAS donner plus d'options. Donner UNE recommandation claire.
```
"Basee sur ce qu'on a discute, voici ce que je
recommande : [option specifique]. Voici pourquoi."
```

**L — Limit l'exploration**
Arreter d'envoyer plus de data, plus de case studies, plus de demos. A ce stade, plus d'information = plus de paralysie.
```
"On a couvert beaucoup de terrain. Plutot que d'ajouter
de l'info, est-ce qu'il y a un point specifique qui
te bloque?"
```

**T — Take risk off the table**
Reduire le risque percu. Pilot, garantie, implementation phased, clause de sortie.
```
"Et si on demarrait avec un pilot de 90 jours sur
[perimetre reduit]? Ca te permet de valider la valeur
avant de t'engager a plus grande echelle."
```

### 4.5.3 Value Selling — Business Case Quantifie (A+H)

> Sans justification financiere chiffree, le deal meurt en 2026. Le CFO est de facto l'economic buyer.

**Structure du business case :**
1. **Cout du probleme** (chiffres de la discovery) : $X/an en temps perdu, deals rates, inefficacite
2. **Valeur de la solution** : $Y/an en gains (productivite, revenue, reduction risque)
3. **Cout de la solution** : $Z/an
4. **ROI** : (Y - Z) / Z = pourcentage
5. **Payback period** : Z / (Y/12) = nombre de mois
6. **Cout de l'inaction** : X continue de s'accumuler chaque mois sans action

---

## PHASE 5 : NEGOTIATION & CLOSE

### 5.1 Techniques Voss (H)

**Tactical Empathy :** Reconnaitre la perspective de l'autre pour baisser ses defenses.

**Les 3 voix :**
- **Late-Night FM DJ** (10-20%) — Profonde, lente. Pour les declarations non-negociables.
- **Positive/Playful** (80%) — Default.
- **Direct/Assertive** — Rarement. Cree du pushback.

**Mirroring :** Repeter les 1-3 derniers mots comme question. Puis SILENCE 4+ sec.
```
"On ne cherche pas a changer."
→ "Pas a changer?" [silence]
→ "Enfin, le contrat expire en Q3, et on n'a pas ete ravis..."
```

**Labeling :** "On dirait que..." puis silence.
- "On dirait que vous avez ete echauded par des vendors avant."
- "Il semble que le budget n'est pas le vrai sujet — c'est le buy-in de l'equipe."

**Accusation Audit :** Lister tout le negatif que le prospect pourrait penser. Le dire EN PREMIER.
```
"Tu vas probablement penser que c'est plus cher que prevu.
Tu pourrais sentir qu'on essaie de te lock-in. La derniere
chose que je veux c'est que tu te sentes pressure."
```

**"That's right"** = percee (il se sent compris). **"You're right"** = conge (il veut que tu arretes).

### 5.2 Cialdini applique (A+H)

- **Reciprocite** : Donner de la valeur avant de demander. Micro-audit, benchmark, analyse custom. **(A+H)**
- **Engagement** : Micro-yeses en escalier — chaque petit "oui" facilite le suivant. **(H)**
- **Social Proof** : Logos (+43%) → Temoignages (+84%) → Case studies (73% des buyers les utilisent) → Metriques. **(A)**
- **Autorite** : Se positionner en expert du domaine. Contenu LinkedIn. **(A+H)**
- **Rarete legitime** : "On a 2 creneaux d'onboarding ce mois." JAMAIS de fake urgence. **(H)**

### 5.3 Techniques de close (H)

**Assumptive Close :**
```
"On lance l'onboarding premiere ou deuxieme semaine
du mois prochain?"
```

**Summary Close :**
```
"Si je resume : ton challenge c'est [X], ca coute [Y]/trim.
On a convenu que [A] adresse [pain], [B] gere [requirement].
Ca capture tout? Super. J'envoie l'accord?"
```

**Mutual Action Plan (MAP) :**
Document collaboratif co-cree. Chaque etape, milestone, stakeholder, deadline.
```
"Il y a plusieurs etapes entre maintenant et le go-live.
Ca aiderait de les mapper ensemble?"
```

### 5.4 Pricing (H)

**Anchoring :** Presenter l'option la plus chere en premier. +15-20% valeur contrat moyenne.

**Good-Better-Best :**
- **Good** : Entree. Deliberement limite.
- **Better** : Cible. "Most Popular." +40% selections grace au Best.
- **Best** : Premium. Ancre qui rend Better raisonnable.

**Chiffres precis** ($9,700 pas $10,000). ROI a cote du prix.

**"Trop cher" — Gap Selling approach :**
```
"Tu m'as dit que [probleme] coute $X/trimestre. Le cout
de ne rien faire sur 12 mois c'est $Y. Face a ca, est-ce
que $Z c'est vraiment trop?"
```

**Guidance founder :** Ne JAMAIS donner le produit gratuitement. Charger des le premier client. Les pilots gratuits qui ne convergent pas sont un piege mortel pour les startups (Tom Blomfield/YC).

### 5.5 Navigation Procurement/Legal/Security (A+H)

> C'est ici que les cycles 90 jours deviennent 180 jours. 38% des deals ont l'IT/Security comme plus gros objecteur. 28% des deals echouent quand l'acheteur ne peut pas securiser l'approbation interne.

**Preparer en avance :**
- Questionnaire securite pre-rempli (SOC 2, GDPR, etc.) **(A)**
- Template contrat legal-friendly **(A)**
- Mapper les contacts procurement **(A+H)**
- Buffer timeline de 30-60 jours pour le paper process **(H)**

### 5.6 Quand walk away (H)

**Red flags :**
- Delais excessifs sans explication
- Termes qui changent constamment
- Refus d'impliquer les decision-makers
- Concessions unilaterales
- Pas de timeline ni business case articulables

**Test BATNA :** Si le deal est pire que ta meilleure alternative → walk away.

---

## PHASE 6 : DEALS STALLED & RE-ENGAGEMENT

### 6.1 Diagnostiquer la root cause (H)

| Categorie | Test |
|---|---|
| **Champion failure** | "Qui doit approuver, et quel est leur concern?" |
| **Gap budget/valeur** | "Si le budget etait illimite, ca serait ta priorite?" |
| **Misalignment interne** | "Tous les stakeholders sont alignes?" |
| **Blockers caches** | "Y a-t-il quelqu'un a qui on n'a pas parle?" |
| **Manque d'urgence** | "Que se passe-t-il si ca reste pareil 6 mois?" |
| **Indecision (FOMU)** | "Qu'est-ce qui te ferait hesiter meme si la solution est bonne?" |

> 86% des achats B2B stallent. 61% sont perdus face a l'indecision.

### 6.2 Break-up emails (A+H)

**Template "Permission de fermer" (76% reply rate) :**
```
Subject: Fermeture de ton dossier

Salut [Prenom],

Je nettoie mon pipeline et voulais checker avant de
fermer ton dossier.

Pas de nouvelles, je suppose que tu es occupe ou les
priorites ont change — les deux sont OK.

Si tu n'es pas interesse, j'ai ta permission de fermer?
```

**Template "Magic Email" :**
```
Subject: Closing the loop

Je n'ai pas reussi a te joindre — en general ca veut
dire :

1. Tu as deja resolu ca autrement.
2. T'es toujours interesse mais pas le temps.
3. T'es tombe et tu peux pas te relever.

Si c'est #1, no hard feelings. Si #2, ton calendrier
la semaine prochaine?
```

### 6.3 Trigger events qui reouvrent (A pour detection, H pour action)

| Trigger | Delai d'action |
|---|---|
| Nouveau leadership | < 48h |
| Funding round | < 48h |
| Failure/incident concurrent | < 24h |
| M&A | < 48h |
| Changement reglementaire | < 48h |

> 4x conversion, 30% shorter cycles, 5x win rates quand tu es premier a repondre.

### 6.4 Quand Closed-Lost (A)

- Choix explicite d'un concurrent
- "Non" explicite
- Champion parti, pas de releve
- Budget tue
- 60+ jours sans activite ni next step

---

## PHASE 7 : POST-CLOSE & EXPANSION

> Il n'y a pas de handoff. Tu ES le sales, le CS, et l'onboarding. Ton onboarding est ta retention.

### 7.1 Onboarding (H)

- Premier meeting d'onboarding schedule des que le deal close **(H)**
- Documenter : objectifs client, metriques de succes, use cases, risk flags, promesses faites **(A+H)**
- Time-to-value est la metrique critique — combien de temps avant la premiere utilisation significative

### 7.2 Upsell — Quand et quand pas (H)

**Signaux de timing :**
1. Valeur prouvee (resultats mesurables). JAMAIS avant.
2. Plafond usage/licence atteint.
3. Growth equipe.
4. Workarounds construits (besoin de features que tu as deja).
5. NPS 9-10.

**Quand NE PAS :** Pendant l'onboarding, apres un incident support, quand le health score decline.

### 7.3 Referrals — Seeds (H)

**Quand demander :**
1. Juste apres close (experience fraiche)
2. Apres premiere valeur (30-90 jours)
3. Apres evenement positif (NPS 9-10, milestone)

**Comment :**
- JAMAIS par email. Toujours en call. **(H)**
- Preparer 3-5 noms de leurs connexions LinkedIn filtrées par ICP **(A)**
- "On a adore travailler avec toi. Comment on trouve plus de leaders comme toi?"
- Proposer de drafter l'email d'intro **(A+H)**

> Les Seeds sont la source la plus haute-qualite. Le stage champion (Phase 4.5) feed back dans les Seeds — tes meilleurs clients deviennent ta meilleure source de leads.

### 7.4 Milestones de transition

| Milestone | Action |
|---|---|
| 10-20 clients closes | Considerer premier hire commercial |
| > 20% du temps sur le sales | Il est temps de deleguer |
| Process repeatable identifie | Documenter pour le premier hire |
| Premier hire | 2 AEs full-cycle (pas 1, pour A/B testing). Pas de SDR. |
| $3-5M ARR | VP Sales (Jason Lemkin). Pas avant. |

---

## APPENDICE A : MEDDPICC (Enterprise, ACV > $100K)

8 elements, score 0-3. Maximum 24.

| Element | Questions cles | Green (3) | Red (0) |
|---|---|---|---|
| **Metrics** | "Quel chiffre change sur ton dashboard dans 12 mois?" | Montants specifiques confirmes | Pas d'impact quantifie |
| **Economic Buyer** | "Qui signe le budget?" | EB rencontre, autorite confirmee | EB pas identifie |
| **Decision Criteria** | "Quels sont les must-haves?" | Liste complete + matrice scoring | Pas demande |
| **Decision Process** | "Etapes entre maintenant et contrat signe?" | Process complet mappe | Pas discute |
| **Paper Process** | "Legal/procurement pour ce deal size?" | Timeline communiquee | Pas demande |
| **Implicate Pain** | "Quel probleme a declenche l'evaluation?" | Cout quantifie ($X) | Pas d'impact business |
| **Champion** | "Vont-ils vendre pour toi en interne?" | Action prouvee | Pas de champion |
| **Competition** | "Qui d'autre evaluez-vous?" | 3 types mappes | Pas discute |

**Seuils :** 17-24 = commit forecast. 14-16 = partiellement qualifie. < 14 = sous-qualifie.

---

## APPENDICE B : BENCHMARKS 2025-2026

### Cold Email

| Metrique | Moyen | Bon | Top |
|---|---|---|---|
| Reply Rate | 1-5% | 5-8% | 10%+ |
| Reply Rate (signal-based) | 15-25% | 25%+ | 30%+ |
| Bounce Rate (sain) | < 2% | < 1% | < 0.5% |

### Cold Call

| Metrique | Moyen | Top |
|---|---|---|
| Dial-to-Connect (mobile verifie) | 18-22% | 25%+ |
| Connect-to-Meeting | 4.6% | 16.7% (1-in-3) |
| Meetings/heure | 2 | 18 |

### Multi-canal vs Mono-canal

| Approche | Performance relative |
|---|---|
| Email seul | Baseline |
| Email + Phone | +37% |
| Email + LinkedIn | +93% |
| Email + Phone + LinkedIn | +287% |

### Sequence

| Metrique | Benchmark |
|---|---|
| Touches pour booker (avg) | 8 |
| % replies dans les 3 premiers emails | 80%+ |
| Reps qui abandonnent apres 1 touch | 44% |
| Ventes necessitant 5+ follow-ups | 80% |
