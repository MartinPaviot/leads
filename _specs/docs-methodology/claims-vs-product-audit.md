# Audit: les claims de The Method vs le produit réel (2026-06-12)

## RÉSOLUTION (mise à jour 2026-06-13)

- **#4 TTL signaux — FAIT** (commit 9e547675). `lib/signals/freshness.ts`
  (SSOT, TTL table = step 7), câblé aux 4 vrais points de lecture: daily
  `bestMultiplierForCompany` (le point que l'audit avait raté), `scoreSignals`,
  `buildProspectContext` (drafts), `deriveOpeningReason` (calls). Attribution
  intacte. 26 tests + régressions. Step 7 "shelf life enforced" = VRAI.
- **#10 review TAM en prod — FAIT** (commit dcb6347d). Entrée déjà count-gated
  → gate passé à `true`, zéro bruit file vide, /tam/review (approve/reject réel)
  intact. Steps 5/18 "approval queue / les décisions viennent à toi" = VRAI.
- **Honnêteté doc — FAIT** (commit f14e87d6). Les 6 lignes "In Elevay" qui
  affirmaient des capacités absentes (forecast/ranges/capacity step 5+8, recap
  step 14, MAP step 15, decay-clock+loop step 16, cohort engine step 17)
  réécrites "on the build path"; corps méthodo = cible inchangée.

- **#1 équation/forecast — MOTEUR + API FAITS** (commit 475ae57e).
  `lib/analytics/rev-equation.ts` (pur: chaîne déterministe + range CV
  delta-method, jamais un point nu ; bottleneck capacity>demand/conversion ;
  priors benchmark sous 20 essais, sinon taux observés ; confidence
  prior/data-dominated) + `GET /api/analytics/forecast` (tenant-scoped,
  comptes réels 90j, split project/platform, goal depuis settings). 11 tests.
  Vérifié live (tenant vide → prior-dominated honnête, CV 103%). RESTE: la
  surface UI (/home + /reports) et le stockage du revenueGoal (réglage).

- **#2 moteur de cohortes — MOTEUR + API FAITS** (commit 0d7939bf).
  `lib/insights/cohort-engine.ts` (pur, 14 tests): Fisher exact (hypergéo,
  log-gamma) PAS le z-test (qui sur-déclare à petit n), Benjamini-Hochberg
  (insight = q<0.10), 3 tiers observation/hypothèse/insight, plancher dur
  <20 deals. TEST PHARE vert: zéro insight sur du bruit ; cohorte 4/4 jamais
  promue ; vrai effet x3 bien dimensionné → insight. `GET /api/analytics/
  cohorts` (cuts industry + persona, baseline leave-one-out par dimension).
  Vérifié live (0 deals → plancher honnête). RESTE: surface /reports + retirer
  l'anti-pattern LLM-recs qui y vit encore.

**Restant (non construit, M-features à prioriser par Martin):** surfaces UI
(forecast /home, cohortes + retrait anti-pattern /reports) + revenueGoal storage (+ /reports qui fait l'anti-pattern), #5 recap
draft, #6 MAP/decay clocks, #7 capacité daily list, #8 origination, #9
actionnabilité buyer + sample-gate, #11 LinkedIn/Unipile, #13 réactivité
événementielle, #14 re-verify à l'envoi, #15 gate bounce dur.

---


Méthode: chaque claim "In Elevay" des 19 étapes + les promesses implicites du
corps des étapes, vérifiés contre le code (greps du jour sur src/) et l'audit
Sam-Blond-vs-code du 2026-06-11 (4 explorations, réconcilié origin/main),
corrigé des PRs #197-#212. Classement: VRAI / PARTIEL / ASPIRATIONNEL (la doc
le présente comme existant, le code ne l'a pas).

## Tier 1 — ASPIRATIONNEL: la doc le présente au présent, le code n'a rien

| # | Claim (étape) | Réalité code | Preuve |
|---|---|---|---|
| 1 | "The math runs continuously on your real funnel... where your data is too thin the product says so" (steps 2, 4) | Aucun objectif de revenu stocké, aucune lib d'équation, aucune range/distribution, aucune traduction objectif→couverture | grep revenueGoal/rev-equation = 0 hit |
| 2 | "Cohort patterns surfaced with their sample sizes: insights when the numbers carry them, experiments when they do not" (step 17) | Pas de lib/insights, pas de moteur de cohortes, pas d'allocation d'expériences. PIRE: /api/reports/generate fait exactement l'anti-pattern condamné par la doc (recommandations LLM sur agrégats sans test statistique) | ls lib/insights = absent; audit F6 |
| 3 | "Statistical honesty... shows ranges and proposes experiments, never fake precision" (step 1) | Win rate affiché brut quel que soit n; aucun intervalle nulle part | audit F8.4 |
| 4 | "Signals... each with its shelf life enforced" + table TTL (step 7) | AUCUN TTL appliqué: un signal hiring détecté reste vrai indéfiniment; freshness-check.ts dormant non câblé | grep SIGNAL_TTL = 0 hit; audit F3.2 |
| 5 | "The recap draft is prepared from the transcript for your approval" (step 14) | N'existe pas. La qualification post-call existe (cartes MEDDPICC/callIntel), mais aucun draft d'email récap auto après meeting | grep recap = seulement nos propres fichiers docs |
| 6 | "The plan's dates become tracked deal steps... silence becomes visible" + decay clocks par stage (steps 15, 16) | Pas de MAP tracké, pas d'horloge de decay par stage; "stalled" = tri par updatedAt dans un report prod-hidden | audit F8.7 |
| 7 | "The day's work sized to your real meeting capacity" (steps 2, 8, 10) | generateDailyCallList n'a aucun modèle de capacité | grep capacity dans lib/voice/campaign.ts = 0 |
| 8 | "Referral wins stay out of outbound learning" opérationnalisé (steps 2, 18) | Pas de champ origination sur les deals → impossible de séparer referral/outbound dans tout apprentissage | audit F8.6/F9.3 |
| 9 | "No reachable buyer = a visible coverage gap" + sample de 20 comptes avant activation (step 5) | Pas de statut d'actionnabilité, pas d'auto-discovery des buyers à l'entrée TAM, pas de sample-gate | audit F1.4, F4.1 |

## Tier 2 — PARTIEL: implémenté mais cassé, caché ou inopérant en prod

| # | Claim | Réalité |
|---|---|---|
| 10 | "Additions arrive through an approval queue... the decisions come to you" (steps 5, 18) | La file existe, les crons proposent, MAIS /tam/review est prod-hidden depuis #160: les propositions s'accumulent en prod SANS consommateur. La boucle décrite est sectionnée en prod |
| 11 | "Cadences run multi-channel" / "one rhythm instead of three tools" (steps 8, 11) | Email complet. LinkedIn = adapter stub (isAvailable=false sans LINKEDIN_OUTREACH_PROVIDER, rien en prod). Phone tasks = producteur sans consommateur. Les calls vivent dans un système séparé (call campaigns), pas dans les séquences. Mono-canal de fait |
| 12 | Step 10 entier (brief, script groundé, dial, transcript, qualification auto) | CONSTRUIT et vrai en dev. Inopérant pour le tenant live: CH dialing OFF, 2/212 contacts avec téléphone, transcription sans host WS |
| 13 | Fenêtres de réaction "<4h, minutes matter" (step 7) | Monitor cron 4h sur top-50 + daily pour le reste. Aucune voie événementielle. Le pixel visiteur existe mais pas de fast-lane visite→outreach |
| 14 | Citations vérifiables (step 9) | Vérifiées à la GÉNÉRATION (signalUrlCache) mais pas re-vérifiées à l'envoi |
| 15 | "Bounce >2% or spam >0.1%: pause and fix" (step 9) | Warnings de santé, aucun gate dur / auto-pause |
| 16 | Insights de l'étape 13 "extracted into the deal automatically" | Vrai pour les CALLS (post-call qualification + provenance). Pour les meetings: capture + extraction existent (recall-functions, meeting-functions) si le notetaker est configuré; critical event pas un champ de première classe |

## Tier 3 — VRAI: le socle que la doc décrit existe réellement

- TAM: build streaming + scoring explicable coverage-aware + hard gates + suppressions durables + provenance compte-level (pas par champ).
- Signaux: 6 types + custom en langage naturel + citations URL-vérifiées. (Détection vraie; décroissance fausse, cf. #4.)
- Cold email: boîte du founder, warmup, caps 50/j, fenêtres, review-each par défaut, classification des réponses, stop-on-reply, apprentissage des refus. L'étape 9 est la plus conforme de toute la doc.
- Capture: emails (seam unique réparé #205), meetings via notetaker, calls (qualification post-call avec provenance), zéro saisie manuelle.
- Fraîcheur des rôles (#210), collision awareness, ownership, workspace par membre: l'étape 19 est quasi intégralement vraie.
- Knowledge → script/chat: le playbook fondateur est réellement consommé par generateCallScript et le chat.

## Verdict "AI-native complet"

La doc décrit le produit CIBLE. Le produit actuel est un AI-native **du haut
de funnel**: la couche agentique sourcing→scoring→drafting→capture est réelle
et différenciante. Il manque précisément les trois attributs qui font le
"complet" au sens de la doc:

1. **La boucle fermée outcome→targeting** (embryon: signalOutcomes n>=10;
   manquent profil gagnant, propositions ICP, origination).
2. **La couche d'intelligence honnête** (équation, ranges, insights à n
   suffisant, expériences): le différenciateur le plus revendiqué par la doc
   (statistical honesty) est la partie la plus absente du produit, et
   /reports fait aujourd'hui l'inverse de la doctrine.
3. **L'orchestration multi-canal + la réactivité événementielle** (1+1=4,
   kairos en minutes): mono-canal email + calls séparés, crons pas events.

Estimation honnête: la doc reflète ~60-65% du produit réel; le tiers
manquant est concentré exactement sur ce qui distinguerait "AI-native
complet" d'un "stack assemblé intelligent".

## Delta priorisé (si on veut rendre la doc vraie)

P0 (la doc l'affirme noir sur blanc, levier immédiat):
1. TTL des signaux (S: données déjà datées, 3 points de lecture: scoreSignals, buildProspectContext, deriveOpeningReason).
2. Décision TAM review en prod: réactiver l'entrée OU couper le cron (l'état actuel viole "pas de données sans consommateur").
3. Recap draft post-meeting (S-M: transcript + pipeline de drafts existent) OU retirer le claim de l'étape 14.
4. revenueGoal + lib pure rev-equation + ligne de diagnostic demand/conversion sur /home (M: audit F8 "productisation simple").
5. Cap de capacité dans la daily list (S).
P1: moteur de cohortes v1 (seuils n + correction multi-comparaisons, evals zéro-insight-sur-bruit), champ origination (S, prérequis #8), actionnabilité buyer à l'entrée TAM (M), gate dur bounce (S).
P2: LinkedIn via Unipile (L, spec écrite), fast-lane événementielle signaux (M), re-verify à l'envoi (S), MAP/decay clocks deals (M).

Alternative par claim: là où on ne construira pas vite, réécrire la phrase
"In Elevay" à l'honnête (ex: étape 14). Une doc qui sur-vend est un churn
générateur (cf. étape 2: time-to-value tueur n°2).
