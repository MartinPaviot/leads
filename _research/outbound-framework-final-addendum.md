# ADDENDUM AU FRAMEWORK OUTBOUND — GAPS COMBLES

> Ce document complete `outbound-framework-final.md` avec tous les gaps identifies lors de l'audit.

---

## A. MESSAGING — Comment developper ton angle AVANT de contacter

### A.1 Le process (April Dunford + Kyle Coleman)

**Etape 1 : Definir tes alternatives competitives**
"Qu'est-ce que tes clients feraient si ton produit n'existait pas?" Pas juste les concurrents directs : ne rien faire, spreadsheets, embaucher un stagiaire, bricoler 3 outils.

**Etape 2 : Identifier tes capacites differenciees**
Ce que tu as que les alternatives n'ont pas. Features/attributs uniquement — pas encore de benefice.

**Etape 3 : Traduire en valeur differenciee**
"So what?" pour le client. Le benefice que ces features enablent.

**Etape 4 : Identifier le best-fit customer**
Qui se soucie LE PLUS de cette valeur differenciee? C'est ton wedge.

**Etape 5 : Nommer ta categorie**
Le contexte qui rend ta valeur evidente. "CRM pour freelances" vs "logiciel de gestion" change tout.

**Le test 5-secondes :** Montre ta value prop a quelqu'un pendant 5 sec. Il doit pouvoir dire : "Ca fait quoi, pour qui, et pourquoi je m'en soucierais?" Sinon c'est trop complexe.

### A.2 A/B Testing du messaging

**Ordre de test (sequentiel, un a la fois) :**
1. Sujets (ouverts ou pas)
2. Hook/premiere phrase (continuent de lire ou pas)
3. Angle/value prop (ca resonne ou pas)
4. CTA (passent a l'action ou pas)

**Sample size :** 250-500 emails par variant minimum. 5-7 jours business avant de declarer un gagnant.

**Seuil :** 95% confidence. Le gagnant doit montrer +15-30% de lift relatif (ex: baseline 4% → au moins 4.6%). En-dessous = bruit.

**Cadence d'iteration :**
```
Semaine 1 : 2-3 sujets (250+ envois chacun)
Semaine 2 : Lock gagnant. 2-3 hooks.
Semaine 3 : Lock gagnant. 2-3 angles.
Semaine 4 : Lock gagnant. 2-3 CTAs.
Semaine 5 : Optimiser la sequence (timing follow-ups, nombre de steps)
```

**Les donnees qui te disent si ca marche :**

| Reply rate | Diagnostic |
|---|---|
| < 1% | Probleme delivrabilite OU ciblage OU messaging — diagnostiquer layer par layer |
| 1-3% | Un des trois : mauvais ICP, messaging faible, ou inbox issues |
| 3.4-5% | Fonctionnel mais pas optimise |
| 5-10% | Bon ciblage + messaging decent |
| 10%+ | Tight ICP + strong hook + deep personalization |

**Le data point cle :** Timeline-based hooks ("j'ai vu que vous venez de...") outperforment problem-based hooks 2.3x en reply rate et 3.4x en meetings bookes.

### A.3 Hierarchy du messaging

- **1 positioning statement** (interne, strategique — change rarement)
- **1 value proposition** (externe, client-facing)
- **3-5 message pillars** avec preuves chacun
- **Variantes par stade funnel :** TOFU = education categorie, MOFU = agitation pain, BOFU = differenciation + reduction risque

---

## B. PROGRESSION MULTI-MEETING

### B.1 Structure standard

| Meeting | Objectif | Exit criteria |
|---|---|---|
| **M1 : Discovery** | Mapper le current state, quantifier le gap, comprendre le buying process | Interet mutuel confirme. Next step agree. |
| **M2 : Demo/Solution** | Prouver que tu peux resoudre LEUR probleme specifique | "Ca pourrait marcher pour nous" + expansion stakeholder |
| **M3 : Proposal** | Aligner sur les termes commerciaux | Budget confirme. Criteres de decision agrees. |
| **M4 : Nego/Close** | Finaliser le deal | Signature. |

### B.2 Timeline par segment

| Segment | Duree | Meetings | Stakeholders |
|---|---|---|---|
| SMB (< $15K) | 14-30j | 2-3 | 1-2 |
| Mid-market ($15-100K) | 30-90j | 3-5 | 3-5 |
| Enterprise ($100K+) | 90-180+j | 5-8+ | 6-10 |

### B.3 Regles critiques entre meetings

1. **Ne JAMAIS finir un meeting sans scheduler le suivant.** Les reps qui discutent les next steps passent 12.7% plus de temps dessus et closent significativement plus.
2. **No demo sans discovery.** La demo doit prouver une piece specifique de ta value story liee aux pains decouverts.
3. **Multi-thread ou mourir.** Win rates DOUBLENT quand des VP+ participent aux meetings.
4. **Gap max entre meetings :** 7-10j (mid-market), 14j (enterprise).
5. **Recap email dans les 2h** de chaque meeting. Confirme ce qui a ete discute + next steps.
6. **1-2 touchpoints entre meetings** : LinkedIn engagement, insight pertinent, data point.

### B.4 SPICED etale sur les meetings

Tu n'as pas besoin de tout decouvrir au M1. Etale :
- **M1 :** Situation + Pain + debut Impact
- **M2 :** Impact approfondi + Critical Event + debut Decision
- **M3 :** Decision finalise + validation de tout

Au M3, si tu n'as pas les 5 elements mappes, tu voles a l'aveugle.

---

## C. KPIs & DIAGNOSTIC "CA NE MARCHE PAS"

### C.1 Le waterfall complet (benchmarks 2026)

```
1 000 emails envoyes
  → 950 delivres (95% delivrabilite — si moins, fix Layer 1)
    → 380 ouverts (40% open rate — si moins, fix sujets)
      → 34-50 replies (3.5-5% — si moins, fix Layer 2 ou 3)
        → 20-30 replies positifs (60-70% du total)
          → 5-10 meetings bookes (25-50% des positifs)
            → 2-4 opportunites qualifiees (20-35% des meetings)
              → 0.5-1.0 deal close (25% close rate sur qualifies)
```

### C.2 Arbre diagnostique

```
OPEN RATE BAS (< 30%)?
├── Delivrabilite : SPF/DKIM/DMARC, warmup, spam score
├── Sujets : tester 1-4 mots, lowercase, question, trigger
└── Volume : reduire envois par domaine

REPLY RATE BAS (opens OK, replies < 3%)?
├── Ciblage : mauvais ICP, contacts outdated
├── Messaging : hook faible, pas de pertinence, trop long
├── Test : changer l'angle completement (pas juste les mots)
└── Check : es-tu sous 80 mots?

MEETINGS BAS (replies OK, < 25% deviennent meetings)?
├── Vitesse de response : repondre dans les 5 min
├── Friction scheduling : utiliser Calendly/easy booking
├── Qualification mismatch : ceux qui repondent ne sont pas les DMs
└── Handoff : transition SDR→AE qui drop la balle

OPPORTUNITES BASSES (< 20% des meetings → opps)?
├── Qualite discovery : pas de vrai pain uncovered
├── Positioning gap : resonne assez pour booker mais pas pour avancer
├── Mauvais persona en meeting : pas d'autorite budget
└── Pas de next step clair : meeting finit sans commitment

CLOSE RATE BAS (< 20% des opps → deals)?
├── Stalle en procurement/legal
├── Pas d'urgence / Critical Event identifie
├── Single-threade : champion parti, deal meurt
├── Perte competitive : besoin de meilleure differenciation
└── Objection prix : ROI pas quantifie
```

### C.3 Pipeline Velocity

```
Pipeline Velocity = (Opps qualifiees x Deal size moyen x Win rate) / Duree cycle moyen
```

Tracker hebdomadairement. Si ca decline, utiliser l'arbre ci-dessus pour trouver OU.

---

## D. PILOTS QUI CONVERTISSENT

### D.1 La regle d'or

**Charger 10-30% du contrat annuel.** Crediter 100% vers le contrat si conversion.

| Structure | Taux de conversion |
|---|---|
| Free trial sans touch | 8-10% |
| Free trial + CC required | 31% |
| Free pilot sans engagement | < 10% |
| Paid pilot structure | 40-60% |
| Paid pilot + exec buy-in + criteres pre-definis | 60-90% |

### D.2 Structure

- **Duree :** 30-60 jours MAX. 6-8 semaines = plafond.
- **Criteres de succes :** BINAIRES, quantitatifs, agrees AVANT le pilot.
  - Bon : "Reduire le temps-to-X de 30% vs process actuel"
  - Mauvais : "Ameliorer la satisfaction" (subjectif)
- **Pre-requis avant de lancer :**
  - Executive sponsor identifie cote acheteur
  - Criteres de succes signes par les deux parties
  - Date de fin fixee par ecrit
  - "Que se passe-t-il si le pilot reussit?" explicitement repondu
  - Review legal/MSA demarree EN PARALLELE
- **Standup hebdo** pre-schedule. Ne pas laisser le pilot aller silencieux.

### D.3 Les 5 tactiques de conversion

1. Agreer les criteres AVANT de commencer
2. Charger pour le pilot (meme $5K = signal de commitment)
3. Runner l'admin en parallele du technique
4. Pre-scheduler des standups hebdos
5. Planifier le "jour d'apres" AVANT que le pilot ne finisse

---

## E. "OUI VERBAL SANS SIGNATURE" — DEBLOQUER

### E.1 Prevention (pre-close)

- **M1-M2 :** "Si on agree que c'est un fit, quel est le process interne pour signer? Qui doit approuver? Combien de temps prend legal?"
- **Mid-process :** Partager un skeleton contract. Laisser legal commencer a reviewer AVANT le "oui".
- **Creer un MAP :** Document partage avec chaque etape verbal→signature, owners, dates.
- **Ancrer un Critical Event :** "Tu as mentionne que tu as besoin de ca live avant Q3. Pour ca, il faudrait signer avant [date]."

### E.2 Deblocage (post-verbal)

| Timing | Action | Script |
|---|---|---|
| J0 | Confirmation dans les 5 min. Recap termes + next steps + info necessaire. | "J'ai draft l'accord selon ce qu'on a discute. Tu peux review d'ici [date]?" |
| J2-3 | Nudge helpful | "Je veux m'assurer que tu as tout. Quelque chose que je peux aider a debloquer?" |
| J5-7 | Urgence/valeur | "Notre equipe implementation a un slot [date]. Pour le locker, on aurait besoin de la signature d'ici [date]." |
| J10-14 | Blocker removal | "Je sais que ca peut se coincer en interne. Ce qui a aide d'autres : [offre specifique]. Ca aiderait?" |
| J21 | Break-up | "Pas de nouvelles. Je ferme ca de mon cote. Si ca revient, je suis la." |

### E.3 Tactiques procurement

- Proposer de joindre le call procurement directement
- Doc securite/compliance pre-prepare (SOC2, GDPR, data handling)
- Give-to-get : si procurement demande quelque chose (payment terms, discount), toujours demander en retour (engagement plus long, case study rights, signature plus rapide)
- Tracker les ouvertures du contrat — si 3+ ouvertures sans signature, ils sont bloques sur une clause specifique. Appeler et demander directement.

---

## F. CHAMPION QUI PART MID-DEAL

### F.1 Frequence
- 80%+ des sellers ont perdu/stalle des deals a cause d'un depart de contact cle
- 40% des deals B2B stallent specifiquement pour cette raison
- Perte moyenne : $340K en valeur contrat + 11 semaines de cycle perdu

### F.2 Action 48h

1. Contacter le champion AVANT qu'il parte :
   - Obtenir une intro au successeur
   - Confirmer le statut du deal
   - Recuperer son email personnel (il peut devenir champion dans sa prochaine boite)
2. Mettre a jour l'account map — qui possede quoi maintenant?
3. Contacter le successeur avec un one-pager resumant : ou en est le deal, le business case valide, les prochaines etapes
4. Call court (15 min) pour walk-through le contexte
5. NE PAS pause le momentum. Continuer a avancer avec les stakeholders restants.

### F.3 Prevention = multi-threading

- Toujours 2+ contacts qui peuvent step up si le champion disparait
- 4+ contacts = 58% win rate (Gong)
- Documenter les concerns par stakeholder dans le CRM
- Regle : si tu ne peux pas nommer 3 personnes cote acheteur qui supportent le deal, tu es single-threaded et en danger.

---

## G. CHURN PREVENTION

### G.1 Signaux early warning (30-60j avant le churn)

**Comportementaux (les plus forts) :**
- Baisse frequence login (signal le plus early, detectable 60j avant)
- Feature abandonment (plus fort predicteur — feature active pendant 14j+ sans usage)
- Utilisation seats < 50% des licences pendant 2+ semaines
- Pas de nouveau projet/objet cree en 30j
- BAISSE du volume de tickets support (silence ≠ satisfaction, silence = desengagement)

**Financiers :**
- Switch annual → monthly (reduction d'engagement)
- Paiements echoues (26% du churn B2B SaaS — 53.5% recovery si agit vite)
- Downgrade de plan

**Engagement :**
- Stakeholders silencieux 6+ semaines
- NPS en baisse + usage en baisse (combine = signal tres fort)

### G.2 Intervention

- Intervenir dans les 7 jours des premiers signaux
- 40-60% des annulations SaaS arrivent dans les 90 premiers jours
- Process : Detecter → Trier (red/yellow/green) → Intervenir → Diagnostiquer → Sauver

### G.3 Benchmarks

- Churn mensuel B2B SaaS moyen : 3.5% (2.6% volontaire, 0.8% involontaire)
- Best-in-class enterprise : < 1%
- Fixer le churn involontaire seul = +8.6% revenue an 1

---

## H. COMPLIANCE — CHECKLIST PRATIQUE

### H.1 Par pays

| Pays | Regime | Cold email B2B | Cold call B2B |
|---|---|---|---|
| **US** | CAN-SPAM | Libre (pas de consent necessaire). Adresse physique + unsubscribe + subject non-trompeur. | Libre (DNC list check) |
| **UK** | UK GDPR + PECR | Entreprises exemptees de consent. Legitimate interest suffit. | Libre vers lignes business |
| **France** | GDPR + CNIL | Permis si professionnel + opt-out + source documentee. Retention 3 ans max. | Permis mais culturellement intrusif |
| **Allemagne** | GDPR + UWG | Quasi-interdit (consent quasi-obligatoire). Utiliser cold call ou LinkedIn. | Permis avec "presumed consent" documente |

### H.2 Checklist minimum (tous marches)

1. SPF + DKIM + DMARC configures
2. Adresse physique dans chaque email
3. Unsubscribe one-click
4. Process opt-outs dans les 24h
5. Suppression list globale synchronisee
6. Source documentee pour chaque adresse (URL + timestamp)
7. Legitimate Interest Assessment par campagne
8. Verifier les emails avant envoi
9. Supprimer contacts non-repondants dans les 30j
10. Allemagne : eviter cold email, utiliser cold call avec consent presume documente
11. Retention max : 3 ans du dernier contact (benchmark CNIL)

---

## I. FOUNDER ZERO NETWORK — COMMENT DEMARRER

### I.1 Le plan 90 jours

**J1-30 :** Cold prospecting + list building.
- 200-300 contacts ICP via LinkedIn Sales Nav, Clay, Apollo
- 5+ cold connects par jour business
- Chaque message = test d'hypothese, pas pitch
- Goal : 10-15 discovery calls

**J31-60 :** Analyser + refine.
- Closer tout ce qui ressemble a un deal
- Refine le messaging selon les replies
- Commencer LinkedIn (3x/semaine minimum)
- Offrir "founder-special" pricing aux 3-5 premiers — PAYE, pas gratuit

**J61-90 :** Double down.
- 3-5 clients payants
- Commencer a demander referrals et case studies
- Le reseau commence a exister

### I.2 Les chiffres

- Cold-first founders closent 3.2x plus vite au premier client payant
- Inbound via contenu : 2-3 mois pour premiers resultats, 3-6 mois pour premiers leads
- Personal profiles = 8x plus d'engagement que company pages
- 79% des decision-makers ignorent les cold DMs en 2026 — d'ou le contenu en parallele

---

## J. COMPETITIVE BAKE-OFF / RFP

### J.1 Les donnees Gong

- Discussion competitive EARLY = +49% de chances de closer
- Discussion competitive LATE = win rate DECLINE sous greenfield + deal size BAISSE
- 95% du temps, le vendor gagnant est deja sur la shortlist AVANT l'evaluation formelle (6sense)
- 3/4 des decisions d'achat vont au vendor qui a FIRST shape la vision de la solution

### J.2 Comment jouer

1. **Set les criteres d'evaluation** — Le vendor qui definit les regles gagne. Planter des criteres que seul toi peux satisfaire.
2. **Eviter le feature comparison** — Quand les produits sont similaires, les listes de features defaultent au prix. Reframe sur outcomes, methodologie, risque.
3. **Nommer la faiblesse du concurrent comme requirement** — "La plupart des equipes trouvent que [capacite X] est table-stakes." Si seul toi as X, tu viens de disqualifier les autres.
4. **Aborder la competition PROACTIVEMENT** tot dans le cycle — ne pas attendre qu'ils te comparent.

### J.3 Quand NO-BID

- Tu ne peux pas satisfaire un requirement obligatoire
- Timeline irrealiste (response < 1 semaine)
- Requirements correspondent exactement aux capacites d'un seul vendor (wired RFP)
- Budget 30-50% sous le marche
- "No contact" policy — DMs refusent les meetings
- Tu ne peux pas remplir 60-75% des requirements sans aide exterieure

Si no-bid : lettre professionnelle. Follow-up a 3-6 mois — beaucoup de RFPs resultent en implementations echouees.

---

## K. FORTUNE 500 CREDIBILITY GAP

### K.1 Comment surmonter "vous etes trop petits/risques"

1. **SOC 2 / ISO 27001** : Obligatoire pour enterprise US. Sans ca, vendor risk management te bloque.
2. **Advisory board strategique** : Des noms que tes acheteurs respectent. Les connecter aux prospects dans les calls.
3. **Logos land logos** : Gagner UN client enterprise. Utiliser ce logo partout.
4. **Marketplace** : Vendre via AWS/Azure Marketplace — leverage leur credibilite procurement.
5. **Marketing enterprise-ready** : Design qui communique controle et consistance. Messaging sur outcomes + fiabilite + accountability.

### K.2 Le path pilot → enterprise

1. Cibler des mid-to-senior functional leaders (pas le C-suite initialement)
2. Offrir un service exceptionnel pendant le pilot
3. Utiliser les temoignages clients existants pour comprendre les dynamics internes
4. Cycle 2x plus long que typical. Budgeter en consequence.
5. Mapper par responsabilite, pas par job title (Fortune 500 = titres inconsistants)

---

## L. PLG / FREEMIUM + OUTBOUND

### L.1 Signaux PQL (Product Qualified Lead)

| Signal | Signification |
|---|---|
| Usage frequent + features avancees | Power user, pret pour upgrade |
| Team expansion (3+ users meme boite) | Rollout equipe = moment commercial |
| Hit les limites du plan gratuit | Friction naturelle = trigger |
| Visite pricing page | Interest explicite |

Taux de conversion PQL : 15-30% (>> MQL).

### L.2 Quand contacter un free user

**OUI :** Apres valeur prouvee (onboarding complete, core feature utilisee plusieurs fois), team rollout, hit limites naturelles.

**NON :** En mode decouverte (premier session), pas d'evidence de valeur, onboarding pas complete. Contacter trop tot = "pushy" et backfire quasi-toujours.

### L.3 Hybrid model par ACV

| ACV | Motion |
|---|---|
| < $10K | PLG self-serve pur |
| $10-25K | Hybrid (PLG + sales-assist sur PQL signals) |
| > $25K | Sales-led avec PLG comme top-of-funnel |

---

## M. DIRECT MAIL / GIFTING

### M.1 Le Champagne Campaign (Sam Blond/Brex)

- 300 bottles Veuve Clicquot (~$50/bouteille) + notes manuscrites + delivery TaskRabbit
- Target : startups Series A-B Bay Area, funded dans les 6 mois
- CEO follow-up email
- Resultats : **75% demo rate, 75% demo→close. 225 demos, 169 clients. $19K total spend.**

### M.2 ROI

- Direct mail : **161% ROI moyen**, $42 retour par dollar
- Response rate : **4.4%** (vs 0.12% email = 36x gap)
- ABM direct mail : **5-15% response**
- **+30-50% connect rate** sur les calls quand le mail arrive 2-3j avant

### M.3 Integration avec sequences

- Envoyer le mail 2-3 jours AVANT le call de follow-up
- Chaque rep doit savoir comment referencier le gift et avancer la conversation
- Trigger depuis les changements de stage dans le CRM
- Cout par touch : $20-50 (top funnel), $50-100 (deal acceleration), $75-150 (close celebration)

---

## N. EVENTS / COMMUNITY COMME PIPELINE

### N.1 Conference framework : 70% du ROI est dans le PRE-EVENT

**AVANT (40% effort, 6-8 semaines avant) :**
- Liste de 20-50 target accounts qui seront presents
- Booker 15-25 meetings AVANT d'arriver
- Ne PAS compter sur le foot traffic du booth

**PENDANT (20% effort) :**
- Executer les meetings pre-schedules
- 10 min de conversation hallway > 6 mois d'email nurture
- Notes detaillees immediatement apres chaque conversation
- Connect LinkedIn same-day

**APRES (40% effort) :**
- Follow-ups personnalises dans les 48h referencant la conversation SPECIFIQUE
- Apres 48h : le pipeline est "capture ou perdu pour toujours"

### N.2 Community-led

- Communautes actives = +26% retention
- Creer de la valeur pour les MEMBRES d'abord, business outcomes ensuite
- Focus sur les challenges des membres et le peer learning (pas sur le produit)
- Timeline : 3-6 mois pour premiers leads organiques

---

## O. INBOUND — INTEGRATION AVEC L'OUTBOUND

### O.1 Speed-to-lead (donnees critiques)

| Temps de reponse | Impact |
|---|---|
| < 1 minute | +391% conversion |
| < 5 minutes | 21x plus de chances que 30 min. 100x plus de chances de contact que 1h. |
| Moyenne entreprise | 29h (!!) |
| Realite | 63% ne repondent JAMAIS. 74% ratent la fenetre 5 min. |

### O.2 SLA par type de lead

| Type | SLA | Tentatives | Canaux |
|---|---|---|---|
| Demo request (hot) | < 5 min | 6+ en 48h | Phone + email + SMS |
| Visite pricing page (hot) | < 5 min | 6+ en 48h | Phone + email |
| Content download (warm) | < 1h | 4-5 en 72h | Email + phone |
| Newsletter signup (cool) | < 24h | 3 | Email nurture |

### O.3 Demo request = direct au closer, PAS en queue SDR

Form scheduling (laisser le prospect booker directement) **double** la conversion inbound (30% → 66.7%, Chili Piper 2026).

---

## P. LINKEDIN CONTENT — QUOI POSTER

### P.1 Les 5 pilliers de contenu

1. **Analyse de tendances industrie** — Ce qui change dans ton marche, ton take
2. **Behind-the-scenes produit** — Decisions de construction, compromis
3. **Insights clients** — Resultats, patterns, lecons
4. **Parcours founder** — Erreurs, apprentissages, vrais chiffres
5. **Takes contrariennes** — "Opinion impopulaire : la facon dont notre industrie gere [X] est completement cassee"

### P.2 Types de posts qui generent du pipeline

| Type | Format | Meilleur pour |
|---|---|---|
| Frameworks step-by-step | Carousel PDF (6.6% engagement — 278% > video, 596% > texte) | Awareness |
| Data/benchmark | Texte + image | Credibilite |
| "Voici ce qu'on a appris" | Long-form texte | Trust |
| Success stories clients | Texte avec chiffres specifiques | Decision |
| Takes contrariennes | Short punchy texte | Viralite + positioning |
| "J'ai merde" vulnerability | Texte | Authenticite |

### P.3 Mapping contenu → pipeline

- **Awareness :** Tendances, insights industrie
- **Consideration :** Use cases, comparaisons, stories clients
- **Decision :** Preuves — resultats specifiques, case studies, transparence pricing

**Chaque semaine, au moins 1 post qui drive vers une next step :** newsletter, webinar, template, ou demo.

### P.4 Resultats attendus

- 5-10K connexions + posting consistant : 5-15K impressions/post
- A l'echelle : **15-25 leads qualifies/mois a zero ad spend**
- Strategic commenting (10-15 comments qualite/jour) : 200-500 profile views/semaine, 30-50 connexion requests, 3-5 inbound DMs

---

## Q. CRM — SETUP MINIMUM VIABLE

### Q.1 Stages (5-7 max)

| Stage | Critere de sortie |
|---|---|
| **Lead** | Contact capture, fit ICP non confirme |
| **Qualified** | Fit ICP confirme, budget/timeline discutes. Discovery done. |
| **Demo/Trial** | Produit demontre ou trial en cours. DMs identifies. |
| **Proposal** | Termes commerciaux envoyes. Prix, scope, timeline documentes. |
| **Negotiation** | Back-and-forth actif. Legal/procurement engages. |
| **Closed Won** | Contrat signe. |
| **Closed Lost** | Raison capturee. |

### Q.2 Champs essentiels par deal

| Champ | Pourquoi |
|---|---|
| Valeur (ARR/deal size) | Forecasting |
| Close date (attendue) | Pipeline velocity |
| Source (outbound/inbound/referral) | Attribution |
| Concurrent | Win/loss analysis |
| Next step | Execution — quelle est la prochaine action? |
| Primary pain point | Contexte pour toutes les futures conversations |
| Decision makers (noms) | Multi-threading |
| Solution actuelle | Strategie de displacement |

### Q.3 Hygiene minimum

1. Logger tout quotidiennement — calls, emails, demos, follow-ups
2. Ne JAMAIS quitter une interaction sans logger le next step (< 1 min)
3. Review pipeline hebdo (meme seul) : stage accuracy, next action clarity, close date realisme, remove les deals sans path to close
4. Template notes discovery : "Pain principal", "Solution actuelle", "DMs", "Metriques de succes"

---

## R. EDGE CASES — SCRIPTS

### R.1 "Je ne suis pas la bonne personne, parle a [X]"

```
"Merci de m'orienter. Ca te derange si je contacte
[Nom] en mentionnant que tu m'as suggere de connecter?
Je veux que le contexte soit porte."
```

Puis a [X] :
```
"[Personne originale] m'a suggere de te contacter —
elle a mentionne que tu serais la bonne personne pour
evaluer [value prop specifique]. On aide [entreprises
comme la votre] avec [outcome]. Ca vaut 15 min?"
```

> Toujours demander la permission d'utiliser le nom. Referrals convertissent 2-5x plus que le cold.

### R.2 Reply agressive

- **Abusif/profanites :** NE PAS repondre. Exception : s'ils demandent quelque chose specifique ("comment t'as eu mon email?"), repondre poliment, confirmer unsubscribe, stop.
- **Decline ferme mais professionnel :** Repondre UNE fois : "Compris, je te retire. Merci pour la reponse. Si ca change, je suis la." Puis stop.
- **Passif-agressif :** Optionnel : courte reponse avec humour ou humanite. Puis stop.

### R.3 Auto-reply / OOO

1. Parser la date de retour
2. PAUSE la sequence (ne pas laisser le next step fire)
3. Restart 1-2 jours business APRES la date de retour (ils ont besoin de clear leur inbox)
4. Ne PAS restart un lundi (inbox overload)
5. Si pas de date : pause 7-10 jours business, restart avec angle frais

### R.4 Redlines contrat — les 5 issues courantes

| Issue | Ce qu'ils poussent | Ta position |
|---|---|---|
| Liability cap | Illimitee ou multiple eleve | Standard : 12 mois de fees payes. Jamais illimite. |
| Data/privacy | Restreindre tout usage, exiger deletion | Transparent sur le data handling. Offrir DPA. |
| Auto-renewal | Supprimer ou long notice window | Garder auto-renewal + 30-60j notice window. |
| SLA/uptime | 99.99% + penalites agressives | 99.9% + service credits (5-25% mensuel par tier). |
| Termination | Terminate for convenience at any time | 30-90j notice raisonnable. |

> Accepter les demandes raisonnables vite (bonne foi). Escalader les termes injustes a ton legal immediatement. Ne jamais accepter non-competes ou non-solicits agressifs.

### R.5 Conversation de renewal

**Timeline :**
- J-90 : Premier touchpoint proactif
- J-60 : Value review call avec donnees d'usage
- J-30 : Proposal formelle de renewal (+ pricing/tier changes si applicable)
- J-14 : Confirmation finale ou escalation

**Script :**
```
"Je voulais te contacter en avance de ton renouvellement
le [date]. J'ai tire les donnees de ton usage — [metrique
specifique : campagnes lancees, leads traites, heures
sauvees].

Ca vaut 15 min pour revoir ce qui marche, ce qui ne
marche pas, et ce qui arrive dans notre roadmap qui
s'aligne avec ou tu vas?"
```

> Lead avec LEURS donnees d'usage et resultats, pas ton pricing. Companies avec process de renewal strategique : +15-30% retention.

### R.6 Annual vs Monthly

- **Pousser annual apres 2-3 mois** de mensuel (valeur prouvee)
- **Discount standard : 16.7%** (= "2 mois offerts"). Ne pas aller au-dessus de 20%.
- **Framer "X mois offerts"** pas "Y% off" (psychologiquement plus fort)
- **Annual = -60-70% churn** vs mensuel
- **Monthly = stepping stone** pour les SMB et premiers acheteurs
- **"Annual paid monthly"** (engagement annuel, facturation mensuelle) = bon compromis

---

## S. MARCHE < 500 COMPANIES — ABM PUR

### S.1 Pourquoi le volume ne marche pas

Quand ton TAM total est < 500 companies : pas de A/B test a echelle, pas de contact "jetable", pas de campagne optimisee pour le volume.

### S.2 Tiering

| Tier | Accounts | Approche |
|---|---|---|
| Tier 1 | 5-25 | Full custom. 30 min research par account. Outreach completement personnalise. Multi-canal. |
| Tier 2 | 25-100 | Cluster-personnalise. Grouper par attributs communs. Semi-personnalise. |
| Tier 3 | 100-500 | Programmatique. Segment-level. Intent signals trigger human follow-up. |

### S.3 Regles

- **30 min de recherche par Tier 1 account** — tu as le temps dans un marche de 500
- **JAMAIS bruler un contact** — si pas de reponse apres 4 touches, pause 90j minimum
- **Tracker chaque interaction** pour eviter les doublons
- **"No response" ≠ "no"** — le timing est peut-etre juste mauvais
- ABM deals : **58% plus gros**, cycles **40% plus courts**

---

## T. CASE STUDY COLLECTION

### T.1 Quand demander

Sweet spot : **3-6 mois** apres debut d'usage, avec resultats mesurables.

Moments declencheurs :
- Apres un milestone clair ("tu viens de hit 10K contacts traites")
- Apres 30j d'usage consistant et actif
- Apres un NPS positif ou interaction support positive
- Apres expansion/upgrade
- Apres recommandation spontanee a quelqu'un

### T.2 Comment demander

```
Subject: Ca t'interesserait d'etre mis en avant?

Salut [Nom],

On a remarque que [Company] a atteint [resultat specifique].
C'est genuinement impressionnant.

On aimerait mettre votre histoire en avant en case study —
ce serait un interview de 20-30 min, on gere toute la
redaction. Tu as un droit de review complet avant publication.

L'avantage pour toi : on promeut le case study sur notre
site, newsletters, et canaux sociaux — mettant [Company]
devant [X milliers] de lecteurs.

Open?
```

### T.3 Structure

1. **Headline metrique** (le chiffre le plus compelling)
2. **Background** (qui, quoi, taille)
3. **Probleme** (qui avait mal, comment ca se manifestait, combien ca coutait)
4. **Approche** (features utilisees, timeline implementation)
5. **Resultats** (1-3 metriques + 1 quote approuvee + before/after)
6. **Time-to-value** (combien de temps entre debut et resultats)

### T.4 Utilisation en outbound

- JAMAIS attacher un PDF en cold email — inline le resultat en 1 phrase
- Formule SAS : Story + Achievement + Soft CTA
- Matcher les case studies aux prospects par industrie, taille, et pain point
- Un case study pertinent et specifique > 10 temoignages generiques
