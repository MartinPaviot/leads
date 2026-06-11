# Backlog de specs — TAM & Outbound (issu de l'audit Sam Blond / Monaco)

**Date**: 2026-06-12
**Sources**: `_research/monaco-sam-blond-methodologie-audit-specs-2026-06-11.md` (v2, réfs F1-F12) + `_research/monaco-sam-blond-comparaison-expert-2026-06-12.md` (deltas 1-7).
**Principe d'ordre**: doctrine demand-first appliquée à nous-mêmes + comptabilité du travail §2 (« the outreach was actually the easier part ») — le ciblage avant la plume, l'intégrité avant la nouveauté. Chaque entrée est destinée à devenir un dossier Kiro `_specs/<id>/` (requirements → design → tasks) au moment de son lancement.

---

## Top 5 — à lancer maintenant, dans cet ordre

### 1. OUT-02 — Intégrité des signaux dans les messages (S, 4 patchs indépendants)
Le levier signal existe et fuit. Quatre garde-fous sur des modules en place:
- **Decay par type**: TTL `{hiring: 30j, funding: 180j, tech_stack_change: 90j, leadership_change: 120j}` dans `lib/signals/freshness.ts` (absorber `freshness-check.ts`, dormant), appliqué aux 3 points de lecture: `scoreSignals()`, `buildProspectContext()`, `deriveOpeningReason()`. Un signal périmé ne score plus, n'est plus cité, n'est plus prononcé. Données déjà datées, zéro migration.
- **Re-vérification à l'envoi**: dans `sequenceDraftToOutbound`, si `personalizationSources[].href` → re-check `signalUrlCache` ; invalide → retour `pending_approval` avec raison (state machine versionnée existante). Invariant: 100 % des citations vérifiables à T-0 de l'envoi.
- **Lint §19 bloquant**: catégorie `irrelevant_personal` (sport/ville/alma mater sans lien avec l'offre) + funding-comme-raison-nue → blocage + re-génération (boucle evaluator-optimizer existante), plus pénalité de score.
- **Calibration des signaux custom**: mode sample-first dans `custom-signal-backfill` — le plan tourne sur 20 comptes top-fit, l'utilisateur confirme, puis backfill TAM entier.
*Métrique*: reply rate signal-déclenché vs cold (écart relatif cible ≥ +50 %).

### 2. TAM-06 — Reclassification des signaux (S, avec OUT-02)
La pureté de la seule boucle d'apprentissage qu'on a (`signalOutcomes`):
- `yc_company` sort des signaux (trait statique, pas un moment — il injecte du fit ICP dans les lifts appris) → devient critère d'ICP dans `icp_field_catalog`.
- `investor_overlap` classé « warm path », hors compétition des lifts d'intent.
- `funding` restreint: jamais raison d'outreach nue ; déclencheur de félicitation/gift (fenêtre ≤ 180 j) ou angle « nouveau cycle budgétaire » uniquement.
*Métrique*: les multiplicateurs de lift recalculés ne portent plus que de l'intent.

### 3. OUT-01 — LinkedIn multi-canal via Unipile (L, spec déjà écrite: `_specs/linkedin-multichannel/`)
« The table stakes are LinkedIn and email. It's not one plus one equals two — it's one plus one equals four » (§18). Le plus gros levier de reply rate du backlog:
- Migration additive `sequence_drafts.channel` ; client Unipile single-account MVP ; consumer `linkedin_message`/`linkedin_invite` dans `decideDispatch()` ; statut de délivrance dans `sequence_enrollments.metadata.touches[]`.
- La file d'approbation, l'identité per-owner et le séquenceur existants absorbent le canal sans travail supplémentaire.
*Métrique*: reply rate des enrollments bi-canal vs mono-canal sur cohortes comparables.

### 4. TAM-01 — Actionnabilité du TAM: auto-buyer discovery + statut (M)
Un compte sans buyer joignable est de l'inventaire, pas du pipeline. Aujourd'hui la découverte est manuelle et la couverture invisible:
- À l'insert (`runPerCompanyPipeline`): événement `company/find-buyers` → logique suggested-contacts (seniorités depuis targetRoles) + waterfall sur le top-1 → `companies.properties.actionability = {status: ok | no_buyer | no_reachable_email, checkedAt}`.
- Colonne/filtre sur `/accounts` (« N comptes sans buyer joignable ») — le statut naît avec son consommateur.
- Cap de coût par build (1 reveal/compte), configurable.
*Métrique*: % du TAM actionnable — LE chiffre de couverture amont, invisible aujourd'hui.

### 5. REV-01 — Équation de revenu + diagnostic bottleneck demand-first (M)
La doctrine §20 (« nine out of ten misdiagnose the bottleneck as conversion ») productisée pour notre ICP exact:
- `lib/analytics/rev-equation.ts` pur: opps × conversion × ACV — **deux équations** (projectAmount vs platformArr, bookings ≠ ARR) ; bottleneck + sensibilités marginales (« +1 demo/semaine = X CHF de run-rate »).
- `tenants.settings.revenueGoal` (consommateur immédiat: ce diagnostic) ; capacité demos v1 = max glissant des meetings tenus/semaine ; état demand-constrained si opps en jeu < K × objectif/ACV (K=4).
- Surface: ligne de diagnostic dans le briefing Up Next de /home + onglet Equation dans /reports, chiffres cliquables vers les deals ; < 15 opps → intervalles/trimestre glissant, jamais un % nu.
- **Stage-aware gravity** (delta 3): tenant à 0-2 closed deals → les leviers de DEMANDE prennent l'avant-scène (/home, défauts), le coaching passe derrière ; inversement en demand-rich.
- Prérequis embarqué: `deals.properties.origination = {kind, id, at}` posé à la création (le journal deal de `feat/deal-event-journal` est le point d'écriture naturel) — sert aussi TAM-05.
*Métrique*: le bottleneck déclaré au mois M prédit le levier qui marche à M+2 ; retour hebdo du founder sur le bloc.

---

## Rang 6-10 — la vague suivante

### 6. TAM-02 — Sample-gate de validation du TAM (S/M)
Après un build ≥ N comptes: échantillon aléatoire de 20 à valider, ≥ 85 % « dans la cible » sinon retour éditeur ICP. Enforcement au point unique `checkContactEligibility` (`lib/sequences/enrollment-eligibility.ts`): pas d'enrollment depuis un TAM non validé. Vécu à l'appui: les données Pilae étaient à 88 % off-ICP — un TAM faux brûle la marque avant le premier meeting.

### 7. OUT-05 — Autonomie gagnée: approve-N-then-auto (M)
Impératif de pricing, pas confort (delta 4: à $999/mois on ne peut pas financer de FDAE — chaque heure de gestion d'agent exigée du founder est notre vrai concurrent): ≥ 20 approbations consécutives sans édition sur un stepType → proposer la bascule `auto-high-confidence` pour CE type (le mode existe, seuil 1.1 inatteignable aujourd'hui). Réversible, journalisé.
*Métrique interne n°1 d'autonomie*: minutes founder exigées par le produit par semaine.

### 8. ECHO-01 — Brand echo detector (S, ~1 jour)
Champ `brandEcho {mentioned, kind: heard_of_us|saw_campaign|referral_mention|negative, quote}` dans `lib/voice/extraction-schema.ts` (post-call) + même champ dans l'extraction inbound (`enrichment/signals-extracted`) ; fail-closed ; écrit dans `activities.metadata` ; registre avec verbatims sourcés. « The anecdotes are more valuable than the data points » (§10) — on fait des anecdotes une donnée. Unique sur le marché, infra déjà en place.

### 9. TAM-05 — Boucle closed-won → ICP: profil, propositions, lookalike (M)
- `analyzeClosedDeal` étendu: vecteur de traits au close → `icps.metadata.outcomeProfile` versionné ; cohortes par origine (les referrals n'apprennent RIEN à l'outbound — leur exclusion est non négociable).
- n ≥ 30: propositions de critères dans `/settings/icp` avec évidence, jamais auto-appliquées ; n < 30: mode « indicatif », bornes seulement.
- `profileToStrategy()` (inverse d'`icpToStrategy`, même fichier) → lookalike sourcing via la file `tam_proposals` existante.
*Métrique*: précision PROSPECTIVE (les comptes top-profil convertissent mieux sur la cohorte SUIVANTE).

### 10. OUT-03 + OUT-04 — Qualité des relances multi-canal (S, avec OUT-01)
- **Préconditions cross-canal**: une étape qui référence un autre canal exige la délivrance confirmée dans `touches[]`, sinon re-génération sans la référence — le produit ne fait jamais mentir le founder.
- **Règle valeur-nouvelle bloquante**: step > 1 doit contenir ≥ 1 élément absent des steps précédents (nouveau signal, ressource, angle) — l'anti « just following up » (§18) rendu mécanique dans `evaluateSequenceQuality()`.

---

## Rang 11+ — hygiène et compléments (S chacun, à glisser dans les sprints)

| ID | Spec | Essence |
|---|---|---|
| OUT-06 | Origin story founder | `tenants.settings.founderStory` à l'onboarding → injecté par `buildProspectContext` sur l'angle founder-to-founder uniquement (l'asset Parley §17 — « content only a founder can articulate ») |
| OUT-07 | Garde-fous expéditeur | Gate dur bounce 7j > 2 % → pause mailbox + « Needs you » ; validation domaine à la connexion (MX, anti-lookalike, warning SPF/DMARC) — le silence n°1 du transcript, notre point fort à durcir |
| OUT-08 | B10 collision pre-enroll | Dernier maillon actif de la collision: `lib/collision/contact-touches` + `contact-collision-notice` au POST enroll (spec `_specs/collision-awareness/`) |
| OUT-09 | Signal → personne | `personHint` extrait (auteur du contenu, département du posting) → routage vers cette personne avant le fallback top-seniorité (§19: « you're reaching the right person ») |
| TAM-03 | Sourcing honnête + provenance | `icpToStrategy` retourne `unmappedCriteria[]` → bandeau « ce critère ne filtre pas le sourcing » ; `enrichmentMeta {field: {source, fetchedAt}}` au point d'écriture unique |
| TAM-04 | Trancher tam_proposals en prod | La file accumule sans consommateur depuis #160 (entrée cachée, crons actifs) — réactiver l'entrée avec badge OU couper les crons prod. Décision, pas un chantier |
| TAM-07 | Quota d'exploration 15 % | `generateDailyCallList` + `signal-to-sequence`: 15 % des slots hors top-score, étiquetés, mesurés à 60 j via outcomes — casse la boucle auto-réalisatrice du score |

## Explicitement écarté
- **Routing rep-level** (F7): invisible pour 100 % de nos tenants founder-led — le gate « < 3 closers » le rend sans objet. B10 + hygiène d'attribution (ownerId/userId systématiques) suffisent.
- **Launch playbook complet** (F11): P3 ; ne garder que `event_markers` (1 j) si ECHO-01 se fait, le reste attend.

## Dépendances et séquence
```
OUT-02 + TAM-06  ──┐  (intégrité d'abord: protège le levier signal et la boucle de lift)
OUT-01 LinkedIn  ──┼──> OUT-03/04 (cross-canal + valeur-nouvelle exigent le 2e canal)
TAM-01           ──┤
REV-01 (origination) ──> TAM-05 (cohortes par origine)
OUT-05, ECHO-01, TAM-02: indépendants, à intercaler
```
