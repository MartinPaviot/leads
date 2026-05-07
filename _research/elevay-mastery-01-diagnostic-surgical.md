# MAITRISE GTM — 01 : Diagnostic Surgical du Funnel Outbound

> Ceci est le premier des morceaux de la maitrise A→Z d'Elevay. Il decrit comment, etant donne un funnel outbound qui sous-performe, on identifie la pathologie exacte (pas une famille de causes), avec quelle probabilite, comment la verifier en moins d'une heure, comment la reparer, et quel uplift attendre. Densite informationnelle maximale. Pret a etre converti en feature produit.

> **CAVEAT CRITIQUE (Apple MPP, 2026) :** Open rate est partiellement casse depuis iOS 15. Apple Mail represente ~49% des opens et pre-charge le tracking pixel. Open rate rapporte ≈ open rate reel × 1.4-1.7. **Reply rate, click rate, et connect rate sont les seules metriques d'engagement fiables.** Tous les diagnostics ci-dessous traitent open rate comme directionnel, pas causal. (Source: Instantly 2026, beehiiv MPP analysis)

---

## 1. Premier principe

Tous les diagnostics outbound publies aujourd'hui ressemblent a ca :
> "Si ton reply rate est bas, verifie ton ciblage, ton messaging, ou ta delivrabilite."

C'est inutile. C'est l'equivalent medical de dire au patient avec une douleur abdominale : "ca peut etre l'estomac, le foie, le pancreas ou les intestins." Pas de praticien serieux opere comme ca.

Un diagnostic surgical fait quatre choses qu'un blog post ne fait pas :

1. **Il identifie la pathologie EXACTE** — pas la famille. "Reputation IP du pool managed, secondaire a une campagne anterieure ayant brule la liste" est une pathologie. "Probleme de delivrabilite" n'en est pas une.

2. **Il assigne une probabilite conditionnelle** — pas une speculation. "Etant donne que open rate < 30% ET bounce rate < 1% ET le domaine a > 90 jours d'usage, P(pathologie A) = 0.72, P(pathologie B) = 0.18, P(autre) = 0.10."

3. **Il propose un test discriminant rapide** — pour separer les hypotheses concurrentes en moins d'une heure, pas en deux semaines de A/B test.

4. **Il prescrit une reparation specifique avec impact attendu** — "envoyer 50 emails depuis un domaine de controle, l'open rate doit grimper a > 40% en 48h. Si non, ce n'est pas la pathologie A."

Ce document est cette grille operatoire complete pour le funnel outbound B2B en 2026.

---

## 2. Les vital signs du funnel outbound

11 metriques observables a chaque stade. Chacune avec son benchmark 2026 (median / top quartile / threshold de probleme).

### Couche acquisition (calibrated 2026 data)

| Metrique | Code | Median | Top quartile | Elite (P95) | Seuil probleme | Source |
|---|---|---|---|---|---|---|
| Bounce rate (total) | `BR` | 0.5% | < 0.2% | < 0.1% | > 2% (throttling) / > 5% (crisis) | Mailshake, Verified.email |
| Hard bounce | `BR_hard` | < 1% | < 0.5% | < 0.2% | > 2% (spam-trap concern) | Bouncer, Validity |
| Spam complaint rate | `SR` | 0.05% | < 0.02% | < 0.01% | > 0.1% / > 0.3% (Gmail filter trigger) | Google Postmaster, M365 SNDS |
| **Open rate (rapporte, pixel-tracked)** | `OR_reported` | 27-35% | 44-50% | 60%+ | < 20% + clean bounce = spam folder | Instantly 2M emails |
| **Open rate (vrai, deflate ~30% MPP)** | `OR_true` | 19-25% | 31-35% | 42%+ | < 15% reel | beehiiv MPP analysis |
| Click rate | `CR_link` | 1-3% | > 4% | — | < 1% avec OR > 35% = bot inflation | Suped |
| Reply rate (cold generique) | `RR_cold` | 1-2% | 3-4% | 5%+ | < 1% (targeting) / < 0.5% (messaging) | Instantly, Hunter.io |
| Reply rate (signal-based) | `RR_signal` | 4-7% | 10-15% | 20%+ | < 3% sur signal-based = pathologie D.2 | Hunter, Lemlist |
| Reply rate (hyper-personalized 1:1) | `RR_hyper` | 8-12% | 18-25% | 30%+ | < 5% sur hyper-perso = ICP/wedge wrong | Mailshake |
| **Positive reply rate (% des replies qualifies)** | `PRR` | **14%** | **30%** | **50%+** | < 14% = wedge/positioning wrong | Instantly 2M+ replies |
| Auto/OOO (% des replies) | `AOR` | 45% | < 30% | < 20% | > 60% = list outdated/scrape | Instantly |
| Negative replies (% des replies) | `NRR` | 30% | < 20% | < 10% | > 40% = ICP wrong / hook offensive | Instantly |

### Couche qualification (calibrated 2026 data)

| Metrique | Code | Median | Top quartile | Elite | Seuil probleme | Source |
|---|---|---|---|---|---|---|
| **Time-to-respond a positive reply** | `TTR` | 42h (industrie!) | < 1h | **< 5min** | > 1h = 21x lower qualification odds | MIT/InsideSales 15K leads, HBR 2.24M leads |
| Meeting booking rate (sur positive replies) | `MBR` | 30-50% | > 65% | > 75% | < 25% | Instantly, Calendly |
| Cold call connect rate (data verifiee) | `CCR` | 18-22% | > 25% | > 30% | < 10% sur verified data | Cognism, ZoomInfo |
| Cold call connect-to-meeting | `CCM` | 4.6% | 16.7% | 20%+ | < 2% = scripts/data wrong | Optifai 939 companies |
| **Meeting show-up rate** | `MSR` | 70-80% | 80-90% | > 90% | < 60% (calendrier casse) / 60-70% (reminder gap) | RevenueHero, Kondo |
| Meeting-to-opportunity rate | `MOR` | 60-75% (sweet spot) | > 75% (strict) | — | < 50% = SDR over-booking / > 80% = SDR over-strict | Optifai, ProspeoIO |
| MOR par segment | `MOR_seg` | SMB 39% / MM 36% / Ent 31% | — | — | — | TheDigitalBloom 2025 |

### Couche close (calibrated 2026 data — par ACV band)

| ACV Band | Win rate median | Top quartile | Cycle median (jours) | Source |
|---|---|---|---|---|
| < $10K | 28-35% | 40-45% | 30-45 | Optifai 939 companies |
| $10K-$50K | 20-28% | 30-38% | 45-90 | Optifai, Salesmotion |
| $50K-$100K | 15-22% | 25-32% | 90-120 | Optifai |
| $100K-$250K | 12-18% | 22-30% | 120-180 | Salesmotion |
| > $250K | 10-15% | 18-25% | 180-365+ | Development Corporate |

| Metrique | Code | Insight | Source |
|---|---|---|---|
| Win rate par source | `WR_src` | Referral/known: **37%** / Outbound cold: **19%** / Inbound demo: 25-35% (~2x referral premium) | ORM-tech |
| Win rate par cycle | `WR_cyc` | < 50j: **47%** / > 50j: ~20% (compresser 90j→45j = +38% revenue/jour) | Outreach 2025 |
| Stall rate (% deals > 21j stagnant) | `STR` | Median 25-40% / Elite < 20% / Probleme > 50% | Heuristic multi-source |
| Multi-threading score | `MTS` | < 1.5: **5% close** / 3+: **30% close** / 6x lift / 10+ stakeholders pour $50-250K wins | Gong 1.8M opps |
| % deals "no decision" parmi perdus | `NDR` | **40-60%** des deals perdus = no decision (PAS competitor) | JOLT/Dixon 2.5M calls |

---

## 3. Catalogue des pathologies (28 pathologies operationnelles)

Chaque pathologie a une **signature** (combinaison d'observables anormales) et un **mecanisme causal** (pourquoi cette signature). La probabilite a priori est la frequence dans la population des outbound qui underperforment.

### A. Pathologies infrastructure (couche delivrabilite)

#### A.1 — Domain reputation degradee (frais)
**Signature** : `OR < 30%` ET `BR < 1%` ET `domain age < 30j` ET pas de warmup complete
**Mecanisme** : Un domaine sans historique organique part avec une reputation neutre-a-negative aupres de Gmail/Outlook. Sans warmup behavioral, les premiers cold sends sont systematiquement classes en spam folder ou Promotions tab — d'ou OR bas SANS bounces (les emails arrivent, ils ne sont juste pas vus).
**Probabilite a priori** : 25% des cas avec ces signatures (extremement frequent chez les startups qui lancent l'outbound).

#### A.2 — Domain reputation brulee (warm/aged mais penalisee)
**Signature** : `OR < 30%` ET `BR < 1%` ET `domain age > 90j` ET historique de campagne haute-volume recente
**Mecanisme** : Un domaine warm peut etre brulee par une campagne mal calibree (volume trop haut, list quality basse, contenu salesy). La reputation chute a Gmail/Outlook et ne se restaure pas seule. Les emails arrivent, ne bounce pas, mais sont classes spam ou Promotions.
**Probabilite a priori** : 15% des cas avec ces signatures.
**Distinction A.1 vs A.2** : age du domaine + historique de volume.

#### A.3 — SPF/DKIM/DMARC misconfig
**Signature** : `OR < 30%` ET `BR > 0.5%` ET les headers de l'email envoye montrent `dmarc=fail` ou `spf=softfail` quand on inspecte la livraison
**Mecanisme** : Authentication failure post-Yahoo+Google 2024 enforcement → emails systematiquement bloques ou classes spam. Differe de A.1/A.2 par le faible bounce ET la signature technique (dmarc/spf header).
**Probabilite a priori** : 8%, mais c'est le low-hanging fruit le plus frequent en BYOD.

#### A.4 — IP pool degradee (managed sending)
**Signature** : `OR < 30%` chez plusieurs tenants utilisant le meme pool d'envoi managed (Instantly/Mailforge/Smartlead/Elevay-managed) simultanement
**Mecanisme** : Un autre tenant du pool a brule la reputation IP partagee. Effet collateral : tous les tenants du pool souffrent.
**Probabilite a priori** : 5%.
**Distinction A.4 vs A.1/A.2** : symptome cross-tenant (necessite vue agregee).

#### A.5 — List quality bad (high bounce + spam-traps)
**Signature** : `BR > 2%` OU `SR > 0.1%` (parfois les deux)
**Mecanisme** : List achetee, scrapee ou non-verifiee. Contient des spam-traps (adresses-pieges qui detruisent la reputation a la moindre touche). Les ESP (Gmail/Outlook) detectent en quelques heures.
**Probabilite a priori** : 30% des cas avec hauts bounce/spam — c'est la cause #1 de delivrabilite morte.

#### A.6 — Provider hostile (Outlook-specific deterioration)
**Signature** : `OR > 35%` sur les recipients @gmail.com mais `OR < 15%` sur les recipients @outlook.com / @hotmail.com / corporate Microsoft 365
**Mecanisme** : Microsoft a un filtrage plus agressif et des criteres differents (links, formatting, tone). Penalise specifiquement les emails template-y et les volumes hauts d'un meme expediteur.
**Probabilite a priori** : 12% — frequent pour les outbound qui ciblent l'enterprise (largement sur M365).

### B. Pathologies messaging

#### B.1 — AI-detection (template-y, LLM-typical)
**Signature** : `OR > 40%` ET `RR < 1.5%` ET volume > 100/jour ET les emails contiennent des marqueurs LLM-typical ("I hope this finds you well", "I wanted to reach out", "in today's fast-paced business landscape", em-dashes excessifs, structure tripartite predictable)
**Mecanisme** : Les recipients ouvrent (sujet OK) puis detectent en 2 secondes que c'est de l'AI generique. Pas de reponse, parfois unsubscribe. ESP commencent aussi a detecter ces patterns et dropper le sender score progressivement.
**Probabilite a priori** : 35% des cas avec cette signature — c'est devenu la pathologie dominante en 2026.

#### B.2 — Subject line generique
**Signature** : `OR < 30%` ET `BR < 0.5%` ET delivrabilite OK (test domain verifie clean) ET les sujets contiennent des patterns generiques ("Quick question", "Following up", "Touching base", > 4 mots)
**Mecanisme** : Le sujet est lu en pre-view. Si generique, scroll-skip immediat. Les sujets 1-4 mots, lowercase, contextuels, avec un trigger reference performent 2-3x mieux (Gong 85M emails).
**Probabilite a priori** : 20% des cas avec OR bas et delivrabilite verifiee clean.

#### B.3 — Body too long
**Signature** : `OR > 40%` ET `RR < 2%` ET length > 200 mots
**Mecanisme** : Emails > 200 mots perdent 60% de leur reply rate (Lavender 2B emails). L'utilisateur ouvre, voit le mur de texte, ferme. Mobile preview tue tout ce qui depasse 80 mots.
**Probabilite a priori** : 10%.

#### B.4 — Hook irrelevant au contexte
**Signature** : `OR > 40%` ET `RR < 2%` ET length OK ET les replies negatives mentionnent "not relevant" / "different stage" / "wrong fit"
**Mecanisme** : Le sujet attire (ou la curiosite paye), mais le contenu ne correspond pas a la realite du recipient. Disconnect entre signal capture et message envoye.
**Probabilite a priori** : 18%.

#### B.5 — CTA mismatch (hard CTA sur cold)
**Signature** : `RR > 2%` ET `MBR < 25%` ET les CTAs sont "book a 30-min meeting" / "schedule a demo" / "set up a call this week"
**Mecanisme** : Hard CTA (demande de meeting concret) sur cold = friction haute. Soft CTA ("worth exploring?", "is this on your radar?") = 3x plus de replies (4.2% vs 1.4% Gong data) parce que pas de cout d'engagement immediat.
**Probabilite a priori** : 22%.

#### B.6 — Trigger absent ou fake
**Signature** : `OR > 35%` ET `RR < 2%` ET les emails ne reference pas un trigger event verifiable specifique au recipient
**Mecanisme** : Les recipients post-2024 sont entraines a detecter le "fake personalization" (ex : "I see you're in SaaS" ou "I noticed your company is growing"). Sans un trigger reel et specifique, l'email lit comme template malgre l'apparence personnalisee.
**Probabilite a priori** : 28% — extremement frequent.

#### B.7 — Pitching too early
**Signature** : `RR > 2%` ET `PRR < 30%` ET les emails decrivent le produit / les benefices dans le premier touch
**Mecanisme** : Pitching reduit reply rate de 57% (Gong 85M emails). L'attention initiale se transforme en "pas pour moi" ou "deja eu cette pitch" avant meme de considerer la valeur. Xenia violee : tu demandes (l'attention pour un pitch) avant de donner.
**Probabilite a priori** : 25%.

#### B.8 — Personalization surface-only
**Signature** : `OR > 40%` ET `RR ~ 2-3%` ET `PRR < 40%` (volume genere du noise, peu de qualifies)
**Mecanisme** : Personnalisation visible mais legere ("I see you work at [Company]", "Congrats on your role as [Title]") n'est plus credible en 2026. Tout le monde fait pareil. Le recipient lit comme "Apollo + AI." Genuine personalization (mention de contenu publie, observation specifique sur le business) atteint 4.7% reply vs 2.3% surface (Lavender).
**Probabilite a priori** : 30%.

### C. Pathologies targeting

#### C.1 — ICP wrong (attire les mauvaises personas)
**Signature** : `RR > 3%` ET `PRR < 30%` ET les replies positives ne convertissent pas en meetings qualifies (`MOR < 20%`)
**Mecanisme** : Le hook genere du replies mais les repondants ne sont pas le buyer profile. Souvent : titres similaires mais mauvais segment (ex : "Head of Sales" en B2C plutot que B2B), ou wrong company stage.
**Probabilite a priori** : 22%.

#### C.2 — Wedge too broad
**Signature** : `RR ~ 2-3%` ET `PRR < 50%` ET `MBR < 30%` ET la liste contient > 200 prospects/semaine sur > 3 segments
**Mecanisme** : Plus le wedge est large, moins le messaging peut etre specifique. Resultat : message generique qui resonne avec personne en particulier. Le wedge < 100 comptes par segment performe 2-3x mieux.
**Probabilite a priori** : 15%.

#### C.3 — Volume saturation (trop pour le wedge)
**Signature** : `RR` baisse de > 30% sur les 30 derniers jours ET volume > capacite raisonnable du wedge (ex : 500 emails/semaine sur 1000 comptes target = 50% saturation/sem)
**Mecanisme** : Meme prospect recoit plusieurs touches d'un meme expediteur (par overlap de listes), ou la communaute serree partage et signale. Effet network negatif.
**Probabilite a priori** : 8%.

#### C.4 — Geo mismatch (US patterns sur FR/DE/JP)
**Signature** : `RR < 2%` sur les recipients geo-specifiques (FR/DE/JP/Nordics) avec patterns US (direct tone, hard CTA, length < 80 mots)
**Mecanisme** : Cold email US-style en France lit comme intrusion. Le ton transactionnel rebute. Length < 80 mots manque de contexte juge necessaire. Reply rate FR sur cold US-style : 1-2% vs FR sur cold FR-style : 3-5%.
**Probabilite a priori** : 15% (specifique aux outbound multi-geo).

#### C.5 — Stage mismatch
**Signature** : `RR ~ 3%` ET `PRR > 50%` ET `MOR < 20%` ET les meetings revelent que le prospect est trop early (< $5K MRR) ou trop late (> $1M ARR pour un ICP $100K MRR)
**Mecanisme** : Les recipients dans le mauvais stade peuvent etre interesses (PRR OK) mais ne convertissent pas (MOR bas) parce que la solution ne fit pas leur stade. Faux positifs structurels.
**Probabilite a priori** : 12%.

### D. Pathologies timing

#### D.1 — Send time wrong
**Signature** : `OR < 35%` MAIS uniformement (tous segments), ET delivrabilite verifiee clean, ET messaging tested OK, ET sends concentres hors fenetre 7-11h local
**Mecanisme** : Les emails envoyes a 14h+ ont 30-40% moins d'opens. Ceux envoyes apres 17h ou avant 6h finissent enterres dans la file morning du lendemain.
**Probabilite a priori** : 5% (rarement la pathologie principale, souvent contributive).

#### D.2 — Signal-to-action delay too long
**Signature** : Reply rate sur signal-triggered campaigns < cold generic + 50% (au lieu du 5-10x attendu)
**Mecanisme** : Les signaux ont des fenetres kairos courtes. Funding event > 30j post-annonce a perdu 80% de sa puissance. Job posting > 14j de meme. Le "signal-based" devient cold quand on agit hors fenetre.
**Probabilite a priori** : 18% chez les outbound se croyant signal-driven.

#### D.3 — Day-of-week wrong
**Signature** : `OR` baisse > 25% sur lundi vs mardi-jeudi. `OR` faible vendredi PM.
**Mecanisme** : Lundi inbox saturation extreme (weekend backlog). Vendredi PM = parking-lot mode mental.
**Probabilite a priori** : 4%.

### E. Pathologies follow-up

#### E.1 — No follow-up
**Signature** : 80%+ des emails sont des "premier touch" sans follow-up (sequence step count = 1)
**Mecanisme** : 70% des replies viennent APRES le premier email (Gong/30MPC). Sans follow-up, on laisse 70% de l'opportunite sur la table. Mais 48% des reps n'envoient jamais de follow-up.
**Probabilite a priori** : 40% des cas dans les startups solo-founder qui font de l'outbound sans systeme.

#### E.2 — Follow-up identical
**Signature** : Sequences avec follow-ups dont le contenu est tres similaire au premier email (no new angle, no new value)
**Mecanisme** : "Just checking in" / "wanted to bump this" = signal de pas de pensee. Les recipients filtrent. Reply rate sur follow-ups generiques : < 1%. Reply rate sur follow-ups avec NEW VALUE (case study, insight, question reframe) : 3-5%.
**Probabilite a priori** : 35%.

#### E.3 — Sequence too long
**Signature** : Sequences avec > 7 steps ET la reply rate cumulative DECROIT apres step 5
**Mecanisme** : Apres 5-6 touches sans reponse, continuer signale du desespoir, pas de la persistance. Inverse les chances. Optimal : 4-7 steps.
**Probabilite a priori** : 8%.

### F. Pathologies response handling

#### F.1 — Slow response to positive replies
**Signature** : `TTR > 1h` ET `MBR < 30%`
**Mecanisme** : Speed-to-lead 5min vs 1h = 21x conversion (Lenny's data). Les replies positives ont une fenetre d'attention courte. Plus c'est long, plus le prospect perd l'interet ou est repris par autre chose.
**Probabilite a priori** : 25% (extremement frequent — meme les bons reps echouent ici).

#### F.2 — No Calendly link in reply
**Signature** : `MBR < 30%` ET les premiers replies aux positive interests ne contiennent pas de lien de booking direct
**Mecanisme** : Friction de scheduling. "When works for you?" provoque 2-3 echanges. Calendly direct = booking instant. Conversion 2-3x.
**Probabilite a priori** : 20%.

#### F.3 — Wrong meeting framing in reply
**Signature** : `MBR > 40%` ET `MSR < 70%` (ils bookent mais ne viennent pas)
**Mecanisme** : Le prospect a accepte par politesse ou impulsion, mais l'agenda est flou ou la valeur du meeting pas claire. No-shows.
**Probabilite a priori** : 15%.

### G. Pathologies qualification

#### G.1 — Wrong persona attending meeting
**Signature** : `MOR < 25%` ET les notes de meeting montrent des participants sans budget/decision authority
**Mecanisme** : L'email a attire un junior interesse mais sans pouvoir. Pas de qualification au pre-meeting stage.
**Probabilite a priori** : 18%.

#### G.2 — Tire-kickers attending
**Signature** : `MOR < 25%` ET les meetings se finissent par "interesting, send more info" ou "not the right time"
**Mecanisme** : L'email attire la curiosite intellectuelle sans intent reel d'achat. Pas de disqualifier dans le messaging.
**Probabilite a priori** : 15%.

#### G.3 — Discovery surface-only
**Signature** : `MOR > 30%` MAIS `WR < 15%` ET les notes de meeting sont legeres (< 5 questions specifiques posees)
**Mecanisme** : Les meetings produisent des opps mais sans current/future state mappe profondement, le deal stalle au close. Discovery superficielle = pas de gap quantifie = pas d'urgence.
**Probabilite a priori** : 22%.

### H. Pathologies close

#### H.1 — No critical event
**Signature** : `WR < 15%` ET `CYC > 90j` ET les deals stallent en stage proposal/negotiation
**Mecanisme** : Sans deadline reelle ou compelling event (renewal contrat, audit, deadline reglementaire), le deal n'a pas de force pour se conclure. "Probably next quarter" devient "probably never."
**Probabilite a priori** : 30% des deals stalles.

#### H.2 — Weak champion
**Signature** : `STR > 50%` ET les deals stalles ont un seul contact engage qui ne bouge pas
**Mecanisme** : Le contact aime mais ne peut/veut pas vendre en interne. Il manque l'autorite, la motivation personnelle, ou les outils. 83% du buying process se passe sans toi (Gartner) — sans champion qui sait vendre, le deal meurt en interne.
**Probabilite a priori** : 25%.

#### H.3 — Single-threaded
**Signature** : `MTS < 1.5` ET `WR < 15%`
**Mecanisme** : Multi-threading boost win rate de 130% sur deals > $50K (Gong). Single-threading expose au risque "champion part / change role" (40% des deals stalles selon Gartner).
**Probabilite a priori** : 25%.

#### H.4 — FOMU non adressee (JOLT)
**Signature** : `WR < 20%` ET les deals "no decision" representent > 40% des perdus
**Mecanisme** : Une fois purchase intent etabli, ce qui tue le deal n'est plus la concurrence — c'est la peur de se tromper. 84% du temps, repitcher la valeur a ce stade aggrave les choses (Dixon & McKenna). Solution : Judge / Offer one reco / Limit info / Take risk off.
**Probabilite a priori** : 30% — c'est la pathologie #1 de close en 2026.

---

## 4. Decision tree complet — symptomes vers pathologies

Algorithme de routing : etant donne les vital signs observees, quelle est la pathologie la plus probable ? Voici l'arbre par couche.

### Layer 1 — Si delivrabilite suspectee (entree principale)

```
SI BR > 2% OU SR > 0.1%:
    → A.5 (List quality bad) avec P = 0.85
    → Test discriminant: prendre 100 emails de la liste, run via NeverBounce/ZeroBounce
        Si > 5% retournent invalid → confirme A.5 (P → 0.95)
        Si < 2% invalid → A.1/A.2 ou A.4 plus probable
    → Action: pause, clean liste, switch a list verifiee
    → Impact attendu: BR vers < 0.5% en 7j, OR +12-18 pts en 14j

SINON SI OR < 30% ET BR < 1%:
    SOUS-CONDITIONS:
    SI domain age < 30j ET pas de warmup:
        → A.1 (fresh domain reputation) avec P = 0.70
        → Test: send 50 emails via un domaine de controle warm
            Si OR > 40% → confirme A.1 (P → 0.90)
        → Action: warmup 14j, ou switch a domaine warm (mailbox personnelle a faible volume)
        → Impact: OR > 40% post-warmup
    SI domain age > 90j ET historique campagne haute-volume:
        → A.2 (burned reputation) avec P = 0.55
        → P(A.3 SPF/DKIM) = 0.20
        → P(A.6 Microsoft-specific) = 0.15
        → Tests:
            (a) Inspecter headers: si dmarc=fail/spf=softfail → A.3 (P → 0.95)
            (b) Si OK technique: split par recipient provider (Gmail vs Outlook)
                Si OR Gmail > 35% MAIS OR Outlook < 15% → A.6
                Si OR Gmail = OR Outlook (les deux bas) → A.2
        → Action selon resultat
    SI cross-tenant pattern (pool managed):
        → A.4 (IP pool degraded) avec P = 0.60
        → Test: rotate sur un autre pool, observer 24h
        → Action: switch pool ou reduire volume

SINON SI OR > 40% ET RR < 1.5%:
    SOUS-CONDITIONS:
    SI volume > 100/jour ET emails ressemblent a templates:
        → B.1 (AI detection) avec P = 0.50
        → P(B.6 trigger absent) = 0.25
        → P(B.7 pitching too early) = 0.15
        → P(C.1 ICP wrong) = 0.10
        → Test discriminant:
            (a) Reduire a 30/jour avec personalization manuelle profonde sur 50 emails
                Si RR jumps > 4% → c'etait B.1 (P → 0.85)
            (b) Si RR reste bas: revue des 100 derniers prospects ouverts sans repondre
                Pattern de titres similaires/segment → C.1
                Pattern de contenu pitch-heavy → B.7
        → Action selon resultat
    SI volume < 100/jour ET personalisation visible (mais surface):
        → B.8 (personalization surface) avec P = 0.45
        → P(B.4 hook irrelevant) = 0.25
        → P(C.1 ICP wrong) = 0.20
        → P(B.5 CTA mismatch) = 0.10
        → Test: refaire 30 emails avec deep personalization (5 min recherche par prospect, mention de contenu publie ou trigger verifiable specifique)
            Si RR jumps > 5% → confirme B.8 (P → 0.85)
            Sinon: examiner les 30 emails pour trigger relevance (B.4)

SINON SI OR > 35% ET RR > 3% MAIS PRR < 40%:
    → C.1 (ICP wrong) avec P = 0.50
    → P(B.4 hook attire wrong audience) = 0.30
    → P(C.5 stage mismatch) = 0.20
    → Test discriminant: revue manuelle des 50 derniers replies
        Si > 60% des replies sont du wrong segment → C.1
        Si > 50% sont du right segment mais "not now" / "wrong stage" → C.5
        Si replies sont du right segment mais le hook resonne pour autre chose → B.4
    → Action selon resultat
```

### Layer 2 — Couche qualification

```
SI PRR > 50% ET MBR < 30%:
    → F.1 (slow response) avec P = 0.45
    → P(F.2 no Calendly) = 0.30
    → P(F.3 wrong framing) = 0.15
    → Tests rapides:
        (a) Mesurer TTR sur les 20 derniers replies positifs
            Si median > 1h → F.1 (P → 0.90)
        (b) Inspecter les 20 derniers premier-replies pour Calendly link
            Si < 50% l'ont → F.2
        (c) Si TTR < 30min ET Calendly present mais pas de book → F.3
    → Action selon resultat
    → Impact F.1 fix: MBR +20-30 pts en 7j

SI MBR > 40% ET MSR < 70%:
    → F.3 (wrong meeting framing) avec P = 0.50
    → P(meeting confirme mais low intent) = 0.30
    → P(timezone confusion) = 0.20
    → Test: inspecter les 20 derniers no-shows pour leur reply original — etait-ce de l'enthousiasme ou de la politesse?
    → Action: ajouter pre-meeting confirmation email 24h avant avec agenda explicite + value proposition + "if this isn't useful, please reschedule"
    → Impact: MSR +10-15 pts

SI MSR > 80% ET MOR < 25%:
    → G.1 (wrong persona) avec P = 0.40
    → P(G.2 tire-kickers) = 0.35
    → P(C.5 stage mismatch upstream) = 0.25
    → Tests:
        (a) Inspecter les 10 derniers meetings: titres + roles des participants
            Si > 50% sans budget authority → G.1
        (b) Inspecter les outcomes: > 50% finissant sur "send more info" → G.2
    → Action: pre-qualification email 24h avant le call ("for our discussion to be useful, can you confirm: budget, decision authority, current solution")
```

### Layer 3 — Couche close

```
SI MOR > 30% ET WR < 15% ET CYC > 90j:
    → H.1 (no critical event) avec P = 0.45
    → P(H.4 FOMU) = 0.30
    → P(H.2 weak champion) = 0.15
    → P(H.3 single-threaded) = 0.10
    → Tests:
        (a) Pour chaque deal stalled, peut-on nommer une deadline/event qui force la decision? Si non sur > 70% des deals → H.1
        (b) % de deals "no decision" vs "lost to competitor" — si > 60% no decision → H.4
        (c) Avg contacts/deal — si < 1.5 → H.3
        (d) Le champion peut-il introduire au DM sur demande? Si non sur > 50% → H.2
    → Action selon resultat (chaque pathologie a son repair distinct, voir section 5)

SI MOR > 30% ET WR < 15% ET CYC < 60j:
    → H.4 (FOMU mais cycle court) avec P = 0.40
    → P(weak close skill) = 0.30
    → P(price objection unresolved) = 0.20
    → P(stakeholder misalignment) = 0.10
```

---

## 5. Repair playbook — par pathologie, avec impact attendu et sources

| Pathologie | Action specifique | Impact attendu (sourced) | Delai | Source |
|---|---|---|---|---|
| A.1 Fresh domain | Warmup 14j + behavioral simulation OU switch a mailbox warm | OR_reported 22% → 37% (+15pp). 80%+ inbox placement S2, 90%+ S3. | 14-21j | Mailpool, Mailwarm |
| A.2 Burned reputation | Switch domaine vers un nouveau subdomain. Old en "cooling off" 90j. | New domain a 90% inbox en 2-3 sem. Recovery old domain 6-12 sem (souvent plus rapide d'abandonner). | Switch instantane / recovery 6-12 sem | InboxAlly, SortedIQ |
| A.3 SPF/DKIM/DMARC | Fix records. Verify via mxtoolbox/dmarcian/GlockApps. | OR +12-20 pts en 24-48h. **Spamhaus delisting: 24-72h apres fix.** | 48h | Spamhaus, Mailflow |
| A.4 IP pool | Switch pool (Instantly → Smartlead). Verifier si pool sain. | Recovery dependant du nouveau pool. Minimum 2-4 sem IP rep. | 24-72h switch / 2-4 sem rep | InboxAlly |
| A.5 List quality | Verify avec NeverBounce/ZeroBounce. Drop > 5% catch-all/risky. | BR < 0.5% en 7j. SR vers 0%. **2x reply rate** typique avec liste verifiee. | 7j post-clean | Hunter.io 11M emails |
| A.6 Microsoft hostile | Reduire links a 0, supprimer formatting fancy, reduce volume M365 50%, sequence dediee. | OR Outlook +15-20 pts. Tester via aka.ms/safeblockdiag. | 7-14j | Suped, Microsoft SNDS |
| B.1 AI-detection | Re-write complet. Variation > 40% entre emails. Length < 60 mots. Eliminer LLM-typical. | RR 1-2% → 4-7%. **Personnalisation deep = +142% reply rate** vs blast. | 7-14j | Mailshake 2025 |
| B.2 Subject generique | 5 nouveaux sujets : 1-4 mots, lowercase, contextuels avec trigger. | **+26% open rate** avec personnalisation. **+113% avec numero**. **+95% AI-optimized vs generique**. | 3-7j (200 sends/variant) | HubSpot, DigitalApplied |
| B.3 Body too long | Re-edit a 50-80 mots. Eliminer 60%+ du contenu. | RR +30-50%. Mobile preview = 80 mots max. | 3-7j | Lavender |
| B.4 Hook irrelevant | Redefinir le hook par segment apres revue de 50 prospects. | RR +50-100%. | 7-14j | Heuristic |
| B.5 Hard CTA → Soft CTA | "Worth exploring?" / "Is this on your radar?" au lieu de "book a 30-min meeting". | RR 1.4% → 4.2% (3x). **Single binary CTA** vs multi-CTA. | 7j | Gong, Mailivery |
| B.6 Trigger absent | Force trigger reel et verifiable specifique au recipient. Reject drafts sans. | **3-5x reply rate** vs template (signal-based). RR signal-based atteint 8-15% median. | 14j | BuzzLead, MarketBetter |
| B.7 Pitching too early | Zero mention du produit dans premier touch. Observation/question. | RR +50-80%. PRR +30-50%. **3x moins d'objections prix** quand discovery faite. | 7-14j | SalesGrowthCo, HubSpot |
| B.8 Personalization surface | 5 min recherche par prospect. Mention contenu publie ou observation specifique. | RR 2.3% → 4.7% (2x lift). | 14j | Lavender 20K+ users |
| C.1 ICP wrong | Revue des 100 derniers prospects. Pattern d'attributs communs chez non-respondants. | PRR 14% → 25-40%. | 14-30j | Practitioner heuristic |
| C.2 Wedge too broad | Reduire a 50-100 comptes par segment. Personalization depth. | **2.76x lift** (hyper-relevant vs broad blast). RR 12-20% sur niche tight. | 14-21j | Hunter.io 11M emails |
| C.3 Volume saturation | Reduire 50%. Espacer touches. Diversifier segments. | RR recovery 50-80% baseline en 30j. **8+ steps triple unsubscribe/spam**. | 30j | HubSpot |
| C.4 Geo mismatch | Localize : tone, length, CTA strength, send time, formality. | RR +50-100% sur segment geo. | 14j | Heuristic multi-source |
| C.5 Stage mismatch | Tighten ICP filter (revenue, employees, funding stage). | MOR +30-50%. | 30j | Heuristic |
| D.1 Send time wrong | Schedule 7-11h local du recipient. **Mar-jeu peak.** | OR +10-15 pts. **+30-50%** en bonne fenetre vs hors fenetre. | 7j | SkipCall, SalesSo |
| D.2 Signal delay | SLA action sur signal: < 4h pricing page, < 24h funding/hire. | **5x reply rate** sur signaux frais < 24h. **Signal age > 7j = no signal**. | 14j | BuzzLead |
| E.1 No follow-up | 4-7 step sequence avec NEW VALUE par step. | **+42% replies** des follow-ups (Instantly). 80% des ventes = 5+ follow-ups. **8% des reps font 5+** et generent la majorite. | 21-30j | Instantly, Salesfully |
| E.2 Generic follow-up | Re-write : each step adds new angle/insight/value. | RR follow-ups 1% → 3-5%. | 14-21j | Heuristic |
| E.3 Too long sequence | Cap a 6-7 steps. Break-up email au step 5-6. | **Break-up email = +89% reply rate** sur ce step. Au-dela de 8 steps = net negative reputation. | 7j | HubSpot |
| F.1 Slow response (CRITIQUE) | SLA 5 min sur positive replies. AI alert + auto-draft. | **21x qualification odds** (5min vs 30min). **+391% conversion** (1min vs baseline). **+21% win rate** inbound. | 7j | MIT/InsideSales 15K leads |
| F.2 No Calendly | Auto-inject booking link dans first-reply. | MBR +10-20 pts. Calendly direct vs email tag = 2-3x conversion. | Instantane | Calendly community |
| F.3 Wrong framing | Pre-meeting confirmation 24h avant + agenda explicite. | **+38% reduction no-shows** (text reminders). **+40% less likely no-show** (immediate confirm). MSR 70% → 85-90%. | 14j | Klara, Engageware |
| G.1 Wrong persona | Pre-call qualification email + auto-disqualification logic. | MOR +20-30 pts. | 14-21j | MEDDIC research |
| G.2 Tire-kickers | Hard disqualifier dans messaging ("only relevant if X+Y+Z"). | RR baisse 20-30%, MOR up 30-50%. | 14-21j | Heuristic |
| G.3 Surface discovery | Train sur Gap Selling / Sandler pain funnel. Force quantification. | WR +30-50%. **Skip discovery = 3x more price objections.** | 30-60j | pclub.io, HubSpot |
| H.1 No critical event | "What happens if you don't solve this in 6 months?" + ancrer deadline reelle. | CYC -30-40%. | 60-90j | Practitioner heuristic |
| H.2 Weak champion | Champion enablement: one-pager, ROI calc, FAQ par stakeholder. | STR -20-30 pts. | 30-60j | Heuristic |
| H.3 Single-threaded → Multi-thread | 3+ stakeholders engaged before proposal. | **5% → 30% close (6x lift)**. **+130% win rate $50K+ deals**. **2x buyer contacts** sur won vs lost. | 60-90j | Gong 1.8M opps |
| H.4 FOMU (JOLT) | Stop pitching value. Offer ONE reco. Limit info. Take risk off (pilot, guarantee). | WR sur stalled : 5% → 25-40% recovery. **84% du temps repitcher = aggrave** le no-decision. | 30-60j | Dixon JOLT 2.5M calls |

---

## 6. Coexistence et ordre de reparation

Quand plusieurs pathologies coexistent (cas frequent), l'ordre compte parce que les interactions sont non-lineaires.

**Regle 1** : Toujours fix delivrabilite d'abord (Layer A). Tout le reste est masque par des emails qui n'arrivent pas.

**Regle 2** : Dans Layer A, ordre A.5 (list) → A.3 (auth) → A.1/A.2 (reputation) → A.4 (pool) → A.6 (provider-specific). La list quality detruit tout en heures, l'auth en jours, la reputation en semaines.

**Regle 3** : Une fois Layer A clean, attaquer messaging (Layer B) avant targeting (Layer C). Pourquoi : un mauvais messaging masque un bon targeting (les bons prospects ne repondent pas), mais un bon messaging revele rapidement si le targeting est wrong (les replies arrivent mais sont du wrong type).

**Regle 4** : Layer C avant Layer D-E. Ciblage et messaging avant timing et follow-up. Pourquoi : timing optimal sur mauvais ciblage = waste. Follow-up parfait sur mauvais messaging = irritation.

**Regle 5** : Layer F-G (response/qualification) avant Layer H (close). Optimiser le close avant que le pipeline en amont soit clean = optimiser un trou dans le sceau.

**Sequence canonique** :
```
A.5 → A.3 → A.1/A.2/A.4/A.6 → B.* → C.* → D.* → E.* → F.* → G.* → H.*
```

**Exceptions** :
- H.4 (FOMU/JOLT) peut etre traite en parallele de tout le reste. C'est la pathologie de close la plus impactante et orthogonale aux pathologies amont.
- F.1 (slow response) merite d'etre fixe AVANT d'optimiser amont, parce que c'est trivial et bloque tout downstream.

---

## 7. Edge cases et faux positifs

**Edge case 1 — Saisonnalite**
Decembre, aout (FR), thanksgiving week (US), CNY (APAC) : tous les metriques chutent. Ne pas diagnostiquer pendant ces fenetres. Comparer YoY plutot que MoM.

**Edge case 2 — Volume insuffisant**
Avec < 200 emails sur la fenetre d'observation, les ratios sont du noise statistique. Minimum recommande : 500 emails sur 14j pour un diagnostic fiable. Sinon : conclusions a valider.

**Edge case 3 — Coexistence high-OR + high-RR + low-PRR**
Ressemble a "messaging brilliant, targeting wrong" mais peut etre "messaging trop sale-y attirant tire-kickers" — checker contenu specifique des replies pour differentier B vs C.

**Edge case 4 — High win rate mais low pipeline volume**
Le funnel est sur-qualifie. Pas une pathologie au sens classique mais une opportunite : pipeline insuffisant. Loosen filter, accepter PRR plus bas, viser plus de volume.

**Edge case 5 — Faux negatif sur signal-based**
Signal-based campaigns avec peu de prospects (< 30/sem) ne montreront pas de patterns statistiquement clairs. Diagnostic difficile a ces volumes — necessite analyse qualitative par cas.

---

## 8. Conversion en feature produit

### Data model
Dans `pipelineEvents` et les agregations existantes, on a deja les inputs. Add :
- `funnelDiagnostic` table : snapshot quotidien des 11 metriques par tenant
- `pathologyDetections` table : pathologies identifiees avec probability + recommended actions
- `repairActions` table : actions executees + impact mesure post-fix

### UI
Nouvelle page `/insights/diagnostic` avec :
- Heat map du funnel (vert/jaune/rouge par metrique vs benchmark)
- Liste des 1-3 pathologies les plus probables aujourd'hui (avec P)
- Pour chaque : test discriminant rapide + repair action + impact attendu
- Click "Run discriminant test" → execute (ou guide l'utilisateur)
- Click "Apply fix" → execute si possible automatiquement (ex: pour B.5 hard CTA, swap les CTAs et lance A/B), sinon guide

### Runtime
Inngest cron quotidien `funnel-diagnostic-runner` :
1. Snapshot des 11 metriques par tenant
2. Run le decision tree → output : top 3 pathologies probables
3. Persist a `pathologyDetections`
4. Si severite haute (e.g. delivrabilite cassee) → notification immediate

### Integration avec coaching layer existant
Le `founder-coach` cron (8am) peut inclure : "Voici ta pathologie #1 detectee aujourd'hui : [X] avec [P]. Voici le test discriminant en 30 min : [test]. Voici la reparation : [action]. Impact attendu : [delta] en [delai]."

---

## 9. Ce qui rend ce diagnostic original

Aucun outil de sales engagement existant ne fait ca a ce niveau :
- **Apollo / Outreach / Salesloft** : montrent les metriques mais ne diagnostiquent pas. "Open rate is low" — and?
- **Gong / Chorus** : analysent les calls, pas le funnel d'acquisition.
- **Lavender / Smartlead** : optimisent l'email individuel, pas le systeme.
- **Mutiny / 6sense** : signal detection, pas diagnostic systemique.
- **Les frameworks publies** (Lenny, SaaStr, etc.) : restent au niveau "checker ces 4 layers."

Aucun ne fait : observable signature → conditional probability of root cause → fast discriminant test → specific repair → expected impact in a given time window. C'est ce niveau qu'il faut tenir et qui rend ce travail differenciateur.

---

## 10. Prochaines etapes

Ce document est la base. Pour reellement etre du niveau maitrise mondiale, il faut :

1. **Calibrer les probabilites a priori avec les donnees Elevay** (10-100 cas de tenants observes) — au depart, les P sont des estimations expertes basees sur les benchmarks de l'industrie + observations qualitatives. Apres 100 tenants observes, on a des P empiriques par segment.

2. **Ajouter les pathologies vertical-specifiques** — devtools vs fintech vs e-commerce ont des funnels qui devient differemment. Un v2 segmenterait par vertical.

3. **Construire le test discriminant runner dans le produit** — chaque test discriminant decrit ici devrait etre un workflow Elevay one-click.

4. **Mesurer les impacts de fix empiriquement** — les "impact attendu" sont des estimations basees sur la litterature. Apres N fixes observes, on a des distributions reelles d'uplift qui rendent les recommandations plus precises.

C'est le travail des prochains morceaux de la maitrise.

---

## 11. Sources & calibration confidence

**Confidence par section :**
- Benchmark distributions (Section 2) : **Haute** — multi-source convergence
- Pathologies + signatures (Section 3) : **Haute** — mecanismes causaux documentes
- Probabilites conditionnelles (Section 4) : **Moyenne** — hierarchies pratitioner-validated, valeurs absolues a calibrer sur donnees Elevay sur 90j
- Tests discriminants (verses dans Section 4) : **Haute** — methodologies validees
- Repair impacts (Section 5) : **Moyenne-haute** — vendor case studies + benchmarks
- Speed-to-lead (F.1) : **Maximale** — finding le plus replique en B2B sales (MIT, HBR, Velocify, InsideSales tous convergent)

**Sources primaires :**
- Instantly Cold Email Benchmark Report 2026 (~2M+ emails, 2M+ replies analyzed)
- Hunter.io State of Cold Email 2026 (11M emails)
- Gong Labs (300M cold calls, 85M emails, 1.8M opps for multi-threading)
- Cognism Cold Calling Report 2026 (200K+ calls)
- Optifai 939-company B2B benchmarks
- TheDigitalBloom 2025 SaaS Funnel Benchmarks
- Dixon & McKenna JOLT Effect (2.5M sales conversations)
- MIT/InsideSales Lead Response Management Study (Oldroyd 2007, 15K leads)
- HBR Lead Response Time (2.24M leads)
- Mailshake, Lavender, Klenty, Bouncer, Validity, Mailflow, Spamhaus
- TheDigitalBloom B2B Email Deliverability 2025
- beehiiv MPP analysis, Suped knowledge base

**Apple MPP impact (critique pour 2026+) :**
- Apple Mail = ~49% des opens, pre-loads tracking pixel
- OR_reported ≈ OR_true × 1.4-1.7
- Reply rate, click rate, connect rate sont les seules metriques d'engagement non-corrumpues
- Diagnostic outbound 2026 ne peut pas s'appuyer sur OR comme metrique causale
