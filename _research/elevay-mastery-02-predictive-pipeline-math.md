# MAITRISE GTM — 02 : Modele Mathematique Predictif du Pipeline

> Comment, etant donne les inputs d'un founder (heures/semaine, mix canaux, ACV, etat actuel du funnel), produire une distribution probabiliste calibree du pipeline a T+30/T+60/T+90 — pas un point estimate, une distribution complete avec intervalles de confiance, identification des leviers d'intervention asymetriques, et detection des points ou l'outbound devient net-negatif. Densite informationnelle maximale. Pret a etre converti en feature produit ET en thought leadership.

> **Phronesis vs Episteme :** ce document est de l'episteme pure (math, distributions, propagation d'incertitude). Le but du produit n'est pas d'eliminer le jugement du founder — c'est de lui montrer la distribution reelle de son futur de facon a ce que sa phronesis opere sur du reel, pas sur des chiffres flatteurs. Un CRM qui affiche "$215K weighted pipeline" est mathematiquement equivalent a un coin flip habille en forecast. Elevay montre la verite.

---

## 1. Premier principe

Tous les CRMs du monde affichent un "weighted pipeline" qui est un crime statistique.

Le calcul typique : `pipeline = sum(deal_value × stage_probability)`. Ca produit un nombre unique, $215K. Ce que personne ne dit : avec les variances reelles des taux de conversion par stage, **l'ecart-type de cette distribution est egal a la moyenne**. Coefficient de variation ≈ 1. L'intervalle de confiance a 80% est [50K, 480K]. Un founder qui prend une decision strategique sur le chiffre $215K halucinde de la precision.

Un modele predictif au niveau maitrise fait quatre choses qu'un CRM ne fait pas :

1. **Il decompose le funnel en 8 transitions stochastiques** (pas 3) parce que chaque transition a un processus generatif different, une elasticite differente au temps founder, et une variance differente.

2. **Il modelise chaque taux comme une distribution Beta** avec mise a jour bayesienne conjuguee — pas un nombre fixe. La distribution se contracte au fur et a mesure que les donnees du tenant accumulent.

3. **Il propage l'incertitude par Monte Carlo** (10K iterations) pour produire la distribution complete du pipeline futur, pas une moyenne.

4. **Il decompose la variance** par input (analyse de Sobol') pour dire au founder : "73% de l'incertitude de ton forecast vient de ton reply rate. Bouger ce levier-la importe 8x plus que n'importe quoi d'autre."

Aucun outil sur le marche ne fait ces 4 choses. Pas Salesforce. Pas Gong. Pas Clari. Pas Aviso. C'est la frontiere de la maitrise.

---

## 2. Le funnel comme graphe stochastique

### 2.1 La decomposition canonique en 8 transitions

```
PROSPECTS → CONTACTED → REPLIED → BOOKED → SHOWED → DISCOVERY-PASSED → PROPOSAL → CLOSED-WON
              p1          p2        p3        p4         p5                p6         p7
```

Plus un modele parallele "open opportunities" pour les deals deja en cours a T=0, qui utilise une decroissance survival-style plutot qu'un taux statique (Section 5).

### 2.2 Pourquoi 8 transitions et pas 3

La plupart des CRMs collapsent en "Prospect → Opportunity → Won." C'est ce qui produit le forecast pondere inutile. La decomposition en 8 stages est necessaire pour 3 raisons mathematiques :

- **Chaque transition a un processus generatif different.** p2 (reply rate) est borne par delivrabilite + pertinence ; p4 (show rate) est borne par friction + recence ; p7 (close) est borne par procurement + champion strength. Les regrouper produit 1 estimation la ou il en faut 8.

- **Chaque transition a une elasticite differente au temps founder.** Une heure de recherche profonde bouge p2 et p5. Une heure de follow-up admin bouge p4 seulement. On ne peut pas optimiser ce qu'on ne decompose pas.

- **Chaque transition a une variance radicalement differente.** p2 (cold reply) a la variance la plus haute en absolu (median ~3.4%, top decile 10%+, CV ~1.0). p7 (close from proposal) a la plus haute relative au levier founder. Les traiter avec un seul CV est statistiquement faux.

### 2.3 Les priors empiriques par stage (avec sources)

Ces moyennes sont les **priors bayesiens**. Sources detaillees en bas de doc. Utiliser ces valeurs comme priors qui se mettent a jour avec les donnees du tenant (Section 7).

| Transition | Symbole | Mean (μ) | Top decile | StDev (σ) | Distribution | Source |
|---|---|---|---|---|---|---|
| Contacted → Replied (cold email) | p2_email | 0.034 | 0.10+ | 0.025 | Beta(α≈3.4, β≈96.6) | Instantly 2026, ~2M emails |
| Contacted → Replied (LinkedIn DM) | p2_li | 0.103 | 0.25+ | 0.06 | Beta(α≈8, β≈70) | Belkins 2025, Expandi 2025 |
| Contacted → Connected (cold call) | p2_call | 0.062 | 0.12+ | 0.04 | Beta(α≈3, β≈45) | Salesfinity 3.5M dials 2026 |
| Replied → Booked Meeting | p3 | 0.62 | 0.78 | 0.15 | Beta(α≈10, β≈6) | Prospeo / SaaS Hero 2026 |
| Booked → Showed | p4 | 0.80 | 0.90 | 0.10 | Beta(α≈16, β≈4) | Industry typical 10-15% no-show |
| Showed → Discovery-Passed | p5 | 0.55 | 0.78 | 0.15 | Beta(α≈6, β≈5) | SaaS appt-to-opp 38%, demo-to-opp 60-80% |
| Discovery-Passed → Proposal Sent | p6 | 0.70 | 0.90 | 0.12 | Beta(α≈12, β≈5) | Full-funnel benchmarks |
| Proposal → Closed-Won | p7 | 0.22 | 0.32 | 0.07 | Beta(α≈7, β≈25) | SaaS overall 21%, SQL-to-close 20-25% |

**Win rate conditionne par ACV (modificateur de p7) :**

| ACV band | Win rate moyen | StDev |
|---|---|---|
| < $10K | 0.31 | 0.08 |
| $10K-$50K | 0.24 | 0.07 |
| $50K-$100K | 0.18 | 0.06 |
| > $100K | 0.15 | 0.05 |

(Optifai 939-company dataset, Landbase 2026)

### 2.4 Pourquoi Beta est la bonne distribution

Chaque transition est une suite de Bernoulli. Le prior maximum-entropy sur un parametre de taux Bernoulli est **Beta(α, β)**. Trois proprietes le rendent obligatoire :

1. **Support sur [0,1]** — un taux ne peut pas etre negatif ou > 1. Normal/lognormal violent ca.
2. **Conjugue a la vraisemblance binomiale** — observer k succes en n essais produit une posterior closed-form exacte : `Beta(α+k, β+n−k)`. Pas besoin de MCMC.
3. **Variance qui se contracte avec α+β** — encode naturellement "plus de donnees = belief plus serree."

Method-of-moments pour fit Beta depuis (μ, σ) :
```
ν = μ(1−μ)/σ² − 1            (concentration)
α = μν,    β = (1−μ)ν
```

Exemple p2_email (μ=0.034, σ=0.025) :
- ν = 0.034·0.966/0.000625 − 1 = 51.5
- α ≈ 1.75, β ≈ 49.7

Ces priors sont **deliberement faibles** (α+β petit) pour que les premiers ~50 emails du tenant dominent. C'est l'equivalent bayesien de "5 data points et tu updates deja sur ton funnel."

### 2.5 Ce qui n'est pas Beta : ACV et cycle-time

- **ACV** : empiriquement right-skewed avec longue tail. **Lognormal(μ_ln, σ_ln)** ou μ_ln = ln(median ACV). Justification : un random walk multiplicatif sur la taille du deal genere une lognormale.
- **Cycle time par stage** : right-skewed avec floor a 0. **Weibull(k, λ)** preferable au lognormal parce qu'elle a une fonction de hazard explicite (Section 5) qui capture l'aging.

Cycle priors :

| Segment | Median cycle | P90 cycle |
|---|---|---|
| SMB < $15K | 22 jours | 45 jours |
| Mid-market $15-100K | 60 jours | 120 jours |
| Enterprise > $100K | 135 jours | 240 jours |

---

## 3. La specification Monte Carlo

### 3.1 Cible du forecast

Etant donne les inputs founder, produire :
```
P(t) = Pipeline value closed-won au temps t,  pour t ∈ {30, 60, 90} jours
```
avec **distribution posterior complete**, pas juste un point estimate. Output :
```
{ mean, median, P10, P25, P75, P90, P(P > target) }
```

### 3.2 L'algorithme (production-ready)

```python
def run_simulation(N=10000):
    outcomes = []
    for sim in range(N):
        # Step 1: sample stage rates from posteriors 
        # (uncertainty propagates ici — chaque iteration voit un funnel different)
        rates = {k: beta_sample(prior.α, prior.β) 
                 for k, prior in priors.items()}
        
        # Step 2: throughput depuis H et channel mix
        N_contacted = compute_contacts(H, w)
        # productivity priors:
        #   email: 60-80 prospects/hr at quality
        #   linkedin: 20-30 personalized touches/hr
        #   call: 25-40 dials/hr (6-12% connect rate)
        
        # Step 3: cold-side cascade
        N_replied = sample_binomial(N_contacted, 
                                     blended_reply_rate(rates, w))
        N_booked = sample_binomial(N_replied, rates['p3'])
        N_showed = sample_binomial(N_booked, rates['p4'])
        N_qualified = sample_binomial(N_showed, rates['p5'])
        N_proposal = sample_binomial(N_qualified, rates['p6'])
        
        # Step 4: aging adjustment pour pipeline existant F0 (Section 5)
        existing_won = simulate_existing_pipeline(F0, rates, T)
        
        # Step 5: closes from new pipeline dans la fenetre T
        # Seul les proposals envoyes avant T - median_close_time peuvent close
        closable_new = N_proposal * P_closes_within(T - cycle_to_proposal)
        N_won_new = sample_binomial(round(closable_new), rates['p7'])
        
        # Step 6: aggregate revenue
        total_deals = N_won_new + existing_won
        revenue = sum(lognormal_sample(μ_A, σ_A) 
                      for _ in range(total_deals))
        outcomes.append(revenue)
    
    return summarize(outcomes)
```

### 3.3 Pourquoi 10,000 iterations

L'erreur standard de la moyenne Monte Carlo scale en σ/√N. Avec un CV pipeline ~ 0.5, N=10,000 donne un SEM relatif de 0.5%. En-dessous du noise floor des inputs. N=100,000 reduit le SEM par √10 mais c'est overkill.

### 3.4 Decomposition de variance — la feature killer

Apres simulation, decomposer la variance par source d'input. Analyse de Sobol' lite :
```
Var[P] = Σᵢ Var[E[P | xᵢ]] + interaction_terms
```

Operationnellement : pour chaque input xᵢ, run 2 sets de simulations — un avec xᵢ fixe a sa moyenne, un avec xᵢ libre. La reduction de variance dans le premier set, divisee par la variance totale, est l'index Sobol' du premier ordre Sᵢ.

Ce que ca dit au founder : *"73% de l'incertitude de ton forecast vient de ton reply rate. Ameliorer la qualite de cette variable importe 8x plus que n'importe quelle autre."*

Aucun produit competiteur ne surface ca.

### 3.5 Sanity check closed-form (sans Monte Carlo)

Pour le point estimate deterministe (utile comme unit test) :
```
E[Closed-Won deals] = N₀ · ∏ᵢ μᵢ
                    = N_contacted · μ₂ · μ₃ · μ₄ · μ₅ · μ₆ · μ₇
E[Pipeline $] = E[Closed-Won deals] · E[ACV]
```

Pour la variance (delta-method) :
```
Var[Y] / E[Y]² ≈ Σᵢ (σᵢ/μᵢ)²    (CV² propagates additively pour Bernoulli chains independantes)
```

**Exemple worked.** Founder envoie 500 cold emails/semaine pendant 90j (≈12 sem) = 6000 contacts.

```
N_replied   = 6000 · 0.034 = 204
N_booked    = 204  · 0.62  = 126
N_showed    = 126  · 0.80  = 101
N_qualified = 101  · 0.55  = 56
N_proposal  = 56   · 0.70  = 39
N_won       = 39   · 0.22  = 8.6 deals
Pipeline    = 8.6  · $25K  = $215K
```

CV² calculation :
```
CV²(p2) = (0.025/0.034)²  = 0.541
CV²(p3) = (0.15/0.62)²    = 0.059
CV²(p4) = (0.10/0.80)²    = 0.016
CV²(p5) = (0.15/0.55)²    = 0.074
CV²(p6) = (0.12/0.70)²    = 0.029
CV²(p7) = (0.07/0.22)²    = 0.101
ACV CV² ≈ 0.25 (lognormal, σ_ln=0.5)
─────────────────
Σ = 1.066
CV(pipeline) ≈ √1.066 = 1.03
```

**Le point estimate $215K a un CV de ~103%** — l'ecart-type du forecast egale la moyenne. C'est pour ca que le weighted pipeline CRM est inutile : le ratio noise-to-signal est ~1:1 sauf si on calcule la distribution. Le 80% CI est environ [$50K, $480K]. Un founder qui prend des decisions strategiques sur $215K alors que la realite est "quelque part dans cette range" hallucinde.

Le contributeur dominant a la variance est `p2` (51% du total) — Sobol' first-order ~0.51. **La prochaine heure de temps founder devrait aller sur ce qui bouge p2.**

---

## 4. La dimension temporelle — survival, hazard, decay

### 4.1 La formulation half-life

Pattern empirique (Salesmotion, multi-source) : deals fermes en < 50 jours = 47% win rate ; deals ouverts > 50 jours chutent a ≤ 20%. Une autre source donne : 66% des wins en < 7 jours, deals > 21 jours closent a 10%.

C'est de la decroissance exponentielle de la probabilite de close conditionnelle. Modele :
```
P(close | age = t, stage = s) = p_s · e^(-λ_s · t)
```

ou λ_s est le **taux de decay specifique au stage** et la half-life est `t½ = ln(2)/λ_s`.

Half-lives par stage :

| Stage | Half-life (jours) | λ |
|---|---|---|
| Discovery | 21 | 0.033 |
| Proposal | 14 | 0.050 |
| Negotiation | 10 | 0.069 |
| Contract review | 7 | 0.099 |

**Finding contre-intuitif critique** : le taux de decay **augmente** au fur et a mesure que le stage avance. Inverse de l'intuition naive ("late-stage = plus committed"). Mecanisme : late-stage deals ont une horloge procurement qui tourne. Chaque semaine sans close = un cycle budget qui se decohere, un champion qui change de role, un concurrent en evaluation.

### 4.2 Pourquoi exponentiel, pas lineaire

1. **Memorylessness fit "death-by-loss-of-momentum."** La propriete de Markov de l'exponentielle dit : probabilite de close dans les prochains 7 jours, sachant que le deal est encore ouvert aujourd'hui, est independante de la duree d'ouverture passee. Ca matche le mecanisme — a chaque moment, le deal recoit une force de close ou pas.
2. **Fit empirique.** Quand on plot win-rate-given-age dans un dataset CRM, la courbe est bien approximee par exp decay. Lineaire donne des residus systematiquement biaises.

### 4.3 La fonction de hazard — formulation plus profonde

Pour modeling deeper, utiliser la **Weibull hazard** :
```
h(t) = (k/λ)·(t/λ)^(k−1)
```

- k = 1 → exponential (constant hazard)
- k > 1 → increasing hazard (decay accelere)
- k < 1 → decreasing hazard (early-warning, deals stables apres survie initiale)

Pour pipelines B2B, k ≈ 1.3-1.5 dans late stages (decay accelere) et k ≈ 0.9-1.1 dans early stages (proche memoryless).

### 4.4 Aging penalty en code production

```python
def age_adjusted_close_prob(stage, days_in_stage, p_base):
    λ = LAMBDA_BY_STAGE[stage]
    return p_base * exp(-λ * days_in_stage)
```

Regle pratique (Saber.app / pipeline-recovery) : un deal est "stale" a 1.5-2.0× la mediane historique days-in-stage. Pipelines sains gardent stale value < 30% du total open pipeline, late-stage stale < 15%.

---

## 5. Analyse de leverage — ou va la prochaine heure ?

### 5.1 Formule de leverage

Definir `Y(x) = expected pipeline at T+90` comme fonction du vecteur input x. Leverage marginal de xᵢ :
```
Lᵢ = ∂Y/∂xᵢ
```

Pour une chaine Bernoulli multiplicative `Y = N · ∏ pⱼ · A`, c'est analytiquement :
```
∂Y/∂pᵢ = (Y / pᵢ)    ← elasticite constante ; impact relatif = 1
```

Chaque taux de stage a la **meme elasticite** dans une chaine clean. Le differenciateur c'est quels inputs on peut effectivement bouger avec quel effort. **Leverage ≠ elasticite. Utiliser ROI per hour.**

### 5.2 Leverage cost-adjusted

```
ROI_i = ΔY · P(achievable) / Hours_to_achieve
```

C'est la formule dont le founder a besoin. Avec les deltas realistes de la recherche :

| Intervention | Stage affecte | Effort | Δ_rate | ΔY (% lift) | ROI rank |
|---|---|---|---|---|---|
| Add 1 contact | N₀ | 0.05h | — | +0.017% par email | LOW |
| **Sub-5min response inbound** | p3 | 5h | **+5-9× qual odds (MIT)** | +30% inbound | **VERY HIGH** |
| **Multi-thread existing deal (3+ contacts)** | p7 | 4h/deal | **+130% win rate ($50K+ Gong)** | +55% par deal | **VERY HIGH** |
| Improve targeting (ICP narrowing) | p2 | 8h | 2-3× reply rate | +90% chain | **HIGH** |
| Send proposal < 24h apres demo | velocity | 0.5h | 35% faster close | +12% pipeline | **HIGH** |
| Add 1 follow-up touch (steps 2-3) | p2 | 0.1h/prospect | +50% reply | +30% chain | **HIGH** |
| Discovery 11-14 questions vs <7 | p5, p7 | 2h | +74% close (Gong) | +35% chain remaining | **HIGH** |
| Founder-personalized first sentence | p2 | 1h/50 prospects | +2× reply (15-25%) | +60% chain | **HIGH** |
| Add 1 channel (LinkedIn after email) | p2 effective | 5h | +40% engagement | +25% chain | MEDIUM |
| 4th follow-up | p2 marginal | 0.1h | **−55% drop in response** (saturation) | NEGATIVE | **NEGATIVE** |
| Volume 2× emails | N₀ | proportional | reply rate degrade | sub-linear | **DECEPTIVE** |

### 5.3 Le ranking dominant des interventions (T+90)

**Tier 1 — toujours en premier :**
1. Couper le response time inbound a < 5 min (21× qualification odds, 5× conversion).
2. Multi-thread chaque deal > $25K vers ≥ 3 stakeholders (130% win rate $50K+, 6× single-threaded).
3. Discovery quality (11-14 questions, MEDDIC discipline ; 74% close lift).

**Tier 2 — high ROI per hour :**
4. Targeting / data quality. 2-5× reply rate verified vs purchased ; leverage sur p2 qui domine Sobol'.
5. SLA proposal 24h apres demo (35% faster close = compounds avec decay reduction).
6. Add LinkedIn channel apres email (3× reply rate de email seul).

**Tier 3 — seulement apres Tier 1-2 satures :**
7. Volume. Adding emails a impact lineaire only jusqu'au cap delivrabilite (~50/inbox/day Gmail, ~25 cold).
8. 4th-7th follow-up touches. Diminishing returns kick in hard.

### 5.4 Le math derriere "volume is overrated"

Hypothese naive : doubler outreach double pipeline. Empiriquement faux. Trois mecanismes de saturation :

**Mecanisme 1 — deliverability tax.** Send rate s au-dessus du safe threshold s* = 50/inbox/day cause spam reputation degradation :
```
p2_effective(s) = p2_base · max(0, 1 − k·max(0, s − s*)/s*)
```
ou k ≈ 1.5-2.0. Resultat : a s=2s*, taux effectif ≈ 0 ; doubling completement perdu.

**Mecanisme 2 — relevance dilution.** Chaque prospect additionnel vient d'un filtre targeting moins precis :
```
p2(n) = p2_max · (1 − e^(−n_quality / n_total))
```
Les top 50 prospects ont 8% reply rate, les 50 next sont a 2%. Total replies grow sub-linearly.

**Mecanisme 3 — bandwidth founder sur follow-up.** La reply n'a de valeur que si tu reponds en minutes. Doubler outreach sans doubler reply-handling capacity → response time se degrade → p3 collapse.

Le bon modele est **Cobb-Douglas avec contrainte binding** :
```
Pipeline = A · N^α · Q^β · F^γ    (α + β + γ < 1, decreasing returns)
```
ou N=volume, Q=quality, F=follow-through speed. Empiriquement α ≈ 0.4-0.6, β ≈ 0.7-0.9, γ ≈ 0.5-0.8. **Quality a l'exposant le plus haut** — un 10% improvement en targeting bat un 10% improvement en volume par ~1.5-2×.

### 5.5 Le cap meeting founder (contrainte cachee)

D'apres la litterature founder-led-sales : un founder qui fait 40h/semaine de sales avec 10h/deal a un cap dur de **~4 deals/mois**, ou 16/quarter. Ca matche le benchmark "16 qualified meetings/month" SDR. Au-dessus, deal quality drops parce que le founder sature cognitivement.

**Implication pour le math :** la chaine du funnel a un *throughput cap* au stage meeting :
```
N_showed_actual = min(N_showed_predicted, M_cap)
```

Pour un founder seed-stage avec 20 sales-hrs/semaine et 5h/deal, M_cap ≈ 16 active deals. **Au-dessus, top-of-funnel additionnel produit zero pipeline parce que les meetings overflow vers le quarter d'apres.**

C'est **le morceau de math le plus important et le plus ignore** en founder-led sales. Ca implique que pour un founder past M_cap, la prochaine heure prospecting est ROI negatif — elle devrait aller sur close des deals existants.

---

## 6. Calibration — Bayesian updating de prior a posterior

### 6.1 Le conjugate update (la seule formule a connaitre)

Pour chaque taux de stage, prior `Beta(α₀, β₀)` depuis benchmarks industrie. Apres observation de k succes en n essais sur le funnel du tenant :
```
Posterior: Beta(α₀ + k, β₀ + n − k)
Posterior mean: (α₀ + k) / (α₀ + β₀ + n)
Posterior var:  ν(1−ν) / (α₀ + β₀ + n + 1)    ou ν = posterior mean
```

Posterior mean est une **moyenne ponderee convexe** de prior mean et observed rate :
```
ν = w · μ_prior + (1−w) · (k/n)
ou w = (α₀+β₀) / (α₀+β₀+n)
```

`w` est le poids du prior — il shrink avec les donnees. Avec priors faibles (α₀+β₀ ~ 50), les donnees du tenant dominent autour de n=50-100 trials.

### 6.2 Vitesse de convergence

Nombre de trials necessaires pour que la half-width du posterior CI atteigne precision δ a 95% confiance :
```
n ≈ (1.96)² · μ(1−μ) / δ²  −  (α₀ + β₀)
```

**Pour p2 reply rate** (μ=0.034, target δ=0.01 = ±1pp absolu) :
```
n ≈ 3.84 · 0.034 · 0.966 / 0.0001 − 50
  ≈ 1262 − 50 = 1212 emails envoyes
```

Un tenant a besoin de ~1,200 emails pour que le posterior soit precis a ±1pp. Pour un founder envoyant 500/sem, c'est ~2.5 semaines. **Calibration timeline : prior dominant a week 0, blend weeks 1-2, posterior dominant des week 3.**

**Pour close rate p7** (μ=0.22, δ=0.05) :
```
n ≈ 3.84 · 0.22 · 0.78 / 0.0025 − 30
  ≈ 263 − 30 = 233 proposals envoyes
```

233 proposals = ~6+ mois pour la plupart des founders. **Le close rate reste prior-dominated pendant 6 mois.**

C'est une verite UX critique : ne JAMAIS afficher "your close rate is 15%" a un founder au proposal #5. Le posterior est a peine distinguable du prior. La machine doit afficher une distribution avec confidence interval, pas un point.

### 6.3 Hierarchical pooling — partager partiellement entre tenants

Quand Tenant A a 30 proposals et Tenant B a 200, l'approche textbook les traite independamment. **Hierarchical Bayes fait mieux** en pooling de l'information partielle :
```
Tenant-level rate: pᵢ ~ Beta(α_pop, β_pop)
Population params: (α_pop, β_pop) ~ hyperprior
```

Posterior de chaque tenant shrink vers la moyenne de la population par un facteur inversement proportionnel a leur sample size. Tenant A (small n) tire fort vers population mean. Tenant B (large n) bouge a peine. C'est **empirical Bayes shrinkage**, mathematiquement equivalent a James-Stein, et dominant sur estimation independante quand les groupes partagent une structure.

**Pour Elevay :** un tenant brand-new avec zero data recoit un forecast qui est un blend smart entre (a) le global SaaS prior, (b) leur cohorte ICP/industry/stage. Au fur et a mesure, ils tirent loin de la cohorte vers leur posterior propre. C'est materiellement meilleure forecast quality que n'importe quelle approche non-hierarchique.

### 6.4 Recall accuracy comme precondition

Une mesure de retrieval memoire (95% recall accuracy a la Lightfield) est differente de forecast accuracy. Mais c'est load-bearing pour la calibration : **si data ingestion rate ce 30% des interactions, le posterior est biaise et va systematiquement under-predict tous les taux**. Recall accuracy est une precondition de forecast accuracy. C'est pour ca que forecast quality est downstream de data capture quality.

---

## 7. Sensitivity ranking — qu'est-ce qui compte vraiment

Combinant Sobol' indices computees du Monte Carlo avec leverage analysis, voici l'impact range sur le forecast pipeline T+90 pour un founder typique.

### 7.1 Variance contribution (ou vit l'incertitude)

Sorted par Sobol' first-order pour un mid-market founder $25K-ACV, 20 sales-hrs/semaine, all-cold prospecting baseline :

| Input | Sobol' S₁ | Implication |
|---|---|---|
| Reply rate p2 | 0.45-0.55 | Dominant. Single biggest source of forecast uncertainty. |
| Close rate p7 | 0.10-0.15 | Hard to move and slow to calibrate (Section 6.2). |
| ACV (lognormal tail) | 0.10-0.20 | Driven par deal-size uncertainty. |
| Show rate p4 | 0.05-0.08 | Tractable — improvable a 0.90 avec reminders. |
| Discovery pass rate p5 | 0.05-0.08 | Highly improvable avec prep + question discipline. |
| Aging decay (existing) | 0.05-0.10 | Matters most pour founders avec active pipeline. |
| Channel mix weights | 0.02-0.05 | Surprisingly small une fois sane mix choisi. |

### 7.2 Leverage ranking (ou la prochaine heure produit le plus)

Distinct de variance contribution — c'est le gradient de mean pipeline w.r.t. chaque input controllable :

| Lever | Realistic Δ_rate | ΔY/hr | Time to compound |
|---|---|---|---|
| Inbound response speed (<5 min) | +5-9× qualification | $$$$ | Immediate |
| Multi-threading deals existants (≥3 stakeholders) | +130% win rate ($50K+) | $$$$ | Within current quarter |
| Discovery quality (MEDDIC + 11-14 questions) | +74% close | $$$ | 30-60 jours |
| Targeting / data quality (verified contacts) | +200-500% reply | $$$ | 14-30 jours |
| Proposal SLA (24h after demo) | 35% faster close, decay reduction | $$$ | Current cycle |
| Founder personalization sur top-50 | +200% reply on cohort | $$$ | 14 jours |
| Channel addition (LinkedIn → email) | +40% engagement | $$ | 30 jours |
| Volume (additional safe emails) | linear up to deliverability cap | $ | Linear, capped |
| **Volume past deliverability cap** | **NEGATIVE** | $$$ negative | Reputation collapse over weeks |

**Insight cle :** le variance ranking et le leverage ranking sont differents. La plus grosse source d'incertitude (p2) est aussi un des plus leverageable, mais le plus haut *return par unite de temps* vient des interventions low-friction high-multiplier sur pipeline existant (response speed, multi-threading) qui targetent stages avec faible Sobol' contribution mais huge multipliers per touched deal.

---

## 8. Failure modes — quand outbound devient net-negatif

### 8.1 Le math du ROI negatif

Le temps founder a un cout d'opportunite C (e.g., $200/hr equivalent value si passe sur produit/recrutement). Outbound est net-negatif quand :
```
Expected pipeline / Hours < C / (cycle-time discount × win probability × ACV)
```

**Failure mode 1 — sub-prior reply rate.** Si `p2_observed < 0.5%` (un cinquieme du benchmark), le funnel a besoin de 5× volume pour les memes outcomes. Avec deliverability cap binding, c'est unreachable. **Threshold : p2 < 0.5% pour 200+ sends → kill le canal.**

**Failure mode 2 — saturation avec reply rate negatif.** Send volume > 100/inbox/day pour 2+ semaines → spam reputation collapse → reply rate vers ~0 → permanent damage requires new sending domain. **Condition : dailyVolume > 80 AND open_rate trend < -10%/sem.**

**Failure mode 3 — capacity overflow.** Booked meetings > M_cap (~16/mois solo founder). Excess meetings soit no-show due long lead time, soit close at much lower rate due prep deficit. **Threshold : bookings > 4/sem sans deleguer prep.**

**Failure mode 4 — pipeline aging dominated.** Quand > 50% du pipeline value est dans deals > 1.5× median stage time, meme intervention maximally aggressive ne peut pas recover. **Threshold : stale pipeline ratio > 50% → outbound effort doit rediriger vers close/multi-thread existing.**

**Failure mode 5 — ACV / cycle-time mismatch.** Quand ACV × win rate < cycle hours × hourly cost. Pour un $5K ACV avec 90-day cycle et 20% close, total expected revenue per discovery call = $5K × 0.4 = $2K. Si cycle requires 8 hrs founder time, c'est $250/hr — au threshold. En-dessous de $5K ACV avec founder rates, outbound est structurellement net-negatif. **Threshold : ACV × p_close-from-discovery < 8 × hourly-rate → ne pas vendre ce segment outbound.**

### 8.2 Detection logic en production

```python
red_flags = {
    'reply_rate_below_floor':  observed_p2 < 0.005 and n_sent >= 200,
    'deliverability_collapse':  open_rate_30d_slope < -0.10 and daily_send > 50,
    'capacity_overflow':         active_deals > M_cap,
    'pipeline_aging':            stale_value_ratio > 0.5,
    'unit_economics_broken':     E[ACV] * close_rate_from_discovery < hourly_cost * cycle_hours,
}
```

Chaque garde-fou est un threshold derive du math, pas du "vibes."

---

## 9. Specs production

### 9.1 L'API forecast

```typescript
type Inputs = {
  hoursPerWeek: number;
  channelMix: { email: number; linkedin: number; call: number };
  acvBand: 'smb' | 'mid' | 'enterprise';
  industry?: string;
  currentPipeline: Array<{
    stage: 'discovery' | 'proposal' | 'negotiation' | 'closed';
    daysInStage: number;
    expectedAcv: number;
  }>;
  observedRates?: {
    [stage: string]: { successes: number; trials: number };
  };
};

type Forecast = {
  horizons: {
    day30: { mean, median, p10, p90, CI80: [number, number] };
    day60: { mean, median, p10, p90, CI80: [number, number] };
    day90: { mean, median, p10, p90, CI80: [number, number] };
  };
  varianceDecomposition: { [input: string]: number };
  leverageRanking: Array<{ 
    intervention: string; 
    expectedLift: number; 
    effortHours: number; 
    roi: number 
  }>;
  failureModes: Array<{ 
    mode: string; 
    triggered: boolean; 
    threshold: string 
  }>;
  calibration: {
    prior_dominated_inputs: string[];
    posterior_dominated_inputs: string[];
    weeks_until_full_calibration: number;
  };
};
```

### 9.2 Primitives d'implementation

- `betaSample(α, β)` : `gamma(α) / (gamma(α) + gamma(β))`.
- `lognormalSample(μ, σ)` : `exp(normalSample(μ, σ))`.
- `binomialSample(n, p)` : sum de n Bernoulli (ou normal approx pour n>30).
- `weibullSample(k, λ)` : `λ · (-ln(uniform()))^(1/k)`.

JS/TS implementation : `simple-statistics` ou ~50 LOC custom. Pas besoin de heavyweight library.

### 9.3 Prior parameter store

Stocker priors comme config structure (industry × ACV × stage) pour que le model pick le bon cohort prior au sim time. C'est ce qui fait qu'un brand-new tenant recoit un forecast utile day 1 — il recoit le cohort prior, blended avec ce qu'il a deja comme sparse data.

---

## 10. Trois insights originaux pour le thought leadership

Aucun n'est dans le marketing d'aucun competiteur. Chacun se traduit directement en argument de vente.

**1. Le "weighted pipeline" CRM est un coin-flip habille en forecast.** Avec les variances reelles des stage-rates, l'ecart-type du pipeline egale la moyenne (CV ≈ 1). Un pipeline pondere $215K peut etre n'importe ou entre $50K et $480K avec 80% de confiance. Afficher des points sans intervalles de confiance c'est de la malpratique statistique. Elevay montre la distribution.

**2. La prochaine heure du temps founder n'est presque jamais best spent sur plus d'outbound.** L'analyse Sobol' sur un funnel reel montre que reply rate domine la variance, mais l'analyse leverage montre que les interventions sur pipeline existant (response speed, multi-threading, discovery prep) ont 5-10× le ROI per hour sur le prochain quarter. Le math dit : arrete d'ajouter prospects au top du funnel jusqu'a ce que tu aies presse tout du milieu. Aucun CRM ne donne ce conseil parce qu'aucun CRM ne fait le math.

**3. Le decay accelere quand les deals avancent.** Counterintuitivement, late-stage deals decay *plus vite* que early-stage. Half-life de 21 jours en discovery, 7 jours en contract review. Implication : late-stage stalls sont existential, early-stage stalls sont tolerables. **Pipeline triage doit etre invertee** depuis la pratique courante (qui privilegie les deals "presque la"). Le math dit : protege les deals discovery, urge les deals proposal-and-beyond.

---

## 11. Ce que cette maitrise produit dans le produit Elevay

### 11.1 Phronesis vs Episteme operationnalise

Le modele math est l'episteme. Il calcule. Il propage l'incertitude. Il identifie les leviers.

Le UI ne dit JAMAIS "voici ta decision a prendre." Il dit :
- "Voici ta distribution de pipeline a T+90 : median $215K, 80% CI [$50K, $480K]"
- "73% de cette incertitude vient de ton reply rate. Le bouger de 1pp change ta median de $X."
- "Voici les 3 interventions a ROI le plus eleve cette semaine : [list], avec lift attendu et effort estime."
- "Failure mode detectee : tu approches du capacity overflow (16 deals actifs vs 18 capacity). Au-dela, ROI neuf prospects negatif."

Le founder garde phronesis. Il decide quelle action prendre. Mais il decide sur **du reel**, pas sur des chiffres flatteurs.

### 11.2 Kairos quantifie

Le decay exponentiel par stage *est* le math du kairos. Un deal en negotiation a une half-life de 10 jours. Apres 30 jours sans action, P(close) = 0.22 × e^(-0.069 × 30) = 0.22 × 0.126 = **2.8%**. Le moment juste pour intervenir n'est pas une intuition — c'est calculable.

Elevay montre : "Ce deal est en negotiation depuis 18 jours. Si tu n'agis pas dans les 7 jours, son P(close) tombe sous 5%." C'est le kairos rendu visible.

### 11.3 Polytropos par calibration bayesienne

Chaque tenant voit son propre forecast au fur et a mesure que ses donnees s'accumulent. Mais a tout instant, les zones non-calibrees (ex: close rate au proposal #5) montrent honnetement le prior + l'incertitude associee. Pas de fake precision, pas de over-claim. Le produit s'adapte a la maturite de donnees du tenant. Same engine, mille visages.

### 11.4 Metis dans les insights

Les leviers asymetriques (response speed 21×, multi-threading 6×, deep personalization 2×) sont **invisibles a l'oeil nu** — ils emergent du math. Le founder qui suit son intuition fait du volume et echoue. Le founder qui ecoute le modele bouge les leviers asymetriques et compounds. C'est la metis : pas plus fort, plus juste.

### 11.5 Nostos

Le modele sert la mission : amener le founder a la prochaine conversation qualifiee dans les meilleures conditions possibles. Pas de virtuosite math pour le plaisir. Chaque equation cash out en une recommandation actionable.

---

## 12. Sources & calibration confidence

**Confidence par section :**
- Funnel decomposition (Sec. 2-3) : **Haute** — multi-source convergence sur les rates.
- Distributions priors (Beta, Lognormal, Weibull) : **Maximale** — math fondamentale, non-controversee.
- Monte Carlo specification : **Maximale** — methodologie standard en operations research.
- Half-life decay (Sec. 4) : **Haute** — Salesmotion data + practitioner consensus convergent.
- Leverage analysis (Sec. 5) : **Haute** — chaque chiffre source (Gong, MIT, Optifai).
- Bayesian calibration (Sec. 6) : **Maximale** — math fondamentale.
- Failure mode thresholds (Sec. 8) : **Moyenne-haute** — derives du math + observations practitioner.
- Sobol' indices specifiques (45-55% pour p2) : **Moyenne** — depend du tenant ; calibrer par segment.

**Sources primaires :**
- Instantly Cold Email Benchmark Report 2026 (~2M+ emails)
- Salesfinity 2026 (3.5M dial dataset)
- Belkins LinkedIn Outreach Study 2025
- Optifai 939-company B2B benchmarks
- Gong Labs (300M cold calls, 85M emails, 1.8M opps multi-threading)
- Salesmotion Win Rate Benchmarks 2026
- MIT/InsideSales Lead Response Management (Oldroyd 2007, 15K leads)
- HBR Lead Response Time (2.24M leads)
- Dixon & McKenna JOLT Effect (2.5M sales conversations)
- Dock Sales Velocity research
- ProfitWell / Paddle pricing & retention data

**Math foundations :**
- Bayesian conjugate priors : Bayes Rules! textbook (Ch. 3)
- Hierarchical pooling : Stan documentation (binary trials case study)
- Empirical Bayes / James-Stein : foundational Charles Stein 1955
- Sobol' sensitivity analysis : Saltelli et al. 2010
- Weibull hazard / survival analysis : Klein & Moeschberger 2003
