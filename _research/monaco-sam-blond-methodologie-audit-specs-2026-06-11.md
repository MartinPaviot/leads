# Audit PM — La méthodologie GTM de Sam Blond, feature par feature, comparée au code Elevay réel

**Date**: 2026-06-11 (v2 — comparaison Elevay intégrée)
**Source primaire**: `_research/raw/transcript-sam-blond-monaco-gtm.md` (podcast Turner Novak × Sam Blond, CEO Monaco, enregistré ~mai 2026)
**Méthode v2**: la v1 (audit Monaco-only, commit `33f92406`) a été enrichie d'une vérification du code Elevay RÉEL par 4 explorations exhaustives (TAM/ICP/scoring, signaux/contacts, séquences/envoi, analytics/deals/capture), réconciliées avec `origin/main` au 2026-06-11 (les PRs collision #182-#194 et title-chip #187/#192 sont sur main, pas dans la branche de travail explorée — corrigé ici).
**Format par feature**: méthodo Sam (verbatim) → lecture CRO → audit PM de SA méthode → **état réel Elevay** (tables, fichiers, flux) → **critères de la spec, statut chez nous** ([OK] / [PARTIEL] / [ABSENT]) → **le comment chez nous** (étapes concrètes ancrées sur nos fichiers).

---

## 0. Synthèse exécutive

**La thèse Monaco en une phrase**: le revenu est une équation (« opportunities × conversion rates × ACV » §7) et la plateforme est la boucle fermée qui optimise les trois variables depuis un seul plan de données (§6, §8).

**Les quatre doctrines**: demand-first (§20 — 9/10 founders misdiagnostiquent conversion au lieu de demande), founder-sender (§17 — « ingrained into the platform itself »), relevance-not-personalization (§19 — le signal doit bénéficier au destinataire), anecdotes > attribution pour le brand (§10).

**Verdict comparatif global** (détail feature par feature ci-dessous):

- **Là où Elevay est au niveau ou devant le discours**: le pipeline TAM→fit est plus honnête que ce que Sam décrit (coverage-aware scoring, hard gates explicables, approval queue + suppression ledger — rien de tout ça n'est revendiqué dans le transcript) ; la vérification d'URL des signaux cités (`signalUrlCache`, construite sur la spec MONACO-PARITY-01) ; l'apprentissage de lift par type de signal sur outcomes réels (`signalOutcomes`, seuil n≥10 sinon 1.0×) — c'est un embryon d'insights agent QUE NOUS AVONS et que le transcript ne détaille même pas ; la file d'approbation de drafts avec state machine versionnée ; le grounding evidence `{claim, quote}` post-call.
- **Les 3 écarts structurants**: (1) **multi-canal LinkedIn** — « table stakes » dixit Sam (§18), chez nous adapter stub non branché, branche Unipile non mergée : c'est LE gap de reply rate ; (2) **insights de cohortes** — nous avons les briques (signalOutcomes, aePerformanceSnapshots, win-loss-engine) mais aucun moteur qui coupe persona × géo × verticale avec tiers de confiance, et nos /reports actuels font générer des « recommendations » par LLM sur agrégats SANS test statistique — nous sommes exposés au même reproche que je fais à Monaco ; (3) **diagnostic demand-vs-conversion** — la doctrine §20 est productisable trivialement chez nous et n'existe pas.
- **Le quick win unique**: le détecteur de brand echo (F12) — nous capturons déjà tous les appels/emails avec extraction LLM post-call ; ajouter un champ au schéma d'extraction existant suffit. Personne ne l'a, pas même le discours de Monaco.

**Faits compétitifs nouveaux**: GA Monaco mi-juillet 2026 (~1 mois) ; Series B levée ~mai 2026, narrative « FDAE = THE advantage » ; insights agent revendiqué live (jamais vu dans nos teardowns UI — à vérifier au GA) ; ACV implicite ~$25K (§9) vs Elevay ~$12K/an ; clients nommés : Greptile, Judgment Labs, Parley, Nowadays ; revenue majoritairement referrals ; public beta = waitlist « strike zone ».

---

## 1. La carte: équation de revenu × état Elevay

| # | Feature (méthodo Sam) | Variable CRO | Statut transcript | État Elevay (réel, main) | Verdict |
|---|---|---|---|---|---|
| F1 | TAM Builder agentique | Opportunités | Live (§2) | Complet: build streaming + proposals queue + refresh cron | **Parité+** (manque: sample-gate, provenance par champ) |
| F2 | Account Scoring | Conversion/effort | Live (§2) | Complet: blended fit + hard gates + mirror score + model bayésien parallèle | **Parité** (manque: exploration, boucle outcome→poids) |
| F3 | Signal Overlay + timing | Opps + Conv | Live (§2, §19) | Riche: 6 types + custom + monitor 4h + URL cache + lift learning | **Parité** (manque: decay, re-verify au send, signal→personne) |
| F4 | Buyer Finder personas | Conversion | Live (§2, §8) | Waterfall geo-routé + callProfile post-call + TitleBadge tiers | **Partiel** (manque: auto-discovery, actionabilité, cohortes persona) |
| F5 | Séquences multi-canal founder-sender | Opportunités | Live, « ingrained » (§17-18) | Email complet (approval, warmup, windows); LinkedIn stub; phone producer sans consumer | **Le gap n°1**: mono-canal en prod |
| F6 | Insights Agent | Conversion | Revendiqué live (§8) | Briques éparses (signalOutcomes, snapshots, win-loss) sans moteur de cohortes | **Absent en tant que système** |
| F7 | Routing rep-level | Conversion | Capacité décrite (§8) | Collision awareness shippée (≠ routing); pas de routing | **Ne pas construire** (ICP founder-led) |
| F8 | Équation + diagnostic bottleneck | Méta | Doctrine (§7, §20) | KPIs réels + 3 reports LLM; ni équation ni diagnostic | **Absent, productisation simple** |
| F9 | Boucle closed-won → ciblage | Conv + Opps | Architecture (§6, §8) | signalOutcomes lift + Naive Bayes ≥10 deals (parallèle, ne touche pas l'ICP) | **Embryon réel, boucle non fermée** |
| F10 | FDAE | Rétention/COGS | Live, narrative B (§21) | Martin = le FDAE (30h/client J0-60); admin app; pas de télémétrie d'interventions | **Modèle différent assumé** |
| F11 | Launch playbook | Opportunités | Servi à la main (§13-14) | Rien | **Absent** (P3, petit, différenciant) |
| F12 | Brand echo / campagnes | Opportunités | Méthodo (§10-11, §15) | Capture totale + extraction post-call déjà en place; pas de détecteur echo | **Quick win ~1 j** |

---

## 2. Audit + comparaison + comment, par feature

---

### F1. TAM Builder agentique (§2)

**Méthodo Sam (verbatim)**: « building your TAM based off your ICP » ; « a meaningful percentage » du temps SDR historique ; « All of this can now be done in near-zero time. » Rien sur la précision, la fraîcheur, la dedup, la révision d'ICP.

**Lecture CRO**: l'actif amont — un TAM imprécis = séquences pertinentes envoyées aux mauvaises boîtes = reply rate mort ET marque brûlée.

**Audit PM (Monaco)**: l'ICP d'une seed est une hypothèse, pas une donnée — aucun mécanisme de révision dans le discours ; « near-zero time » dit le coût, jamais la qualité ; risque de filtrage silencieux sur critères mal couverts.

**Chez Elevay aujourd'hui — le réel**

- **Modèle de données** (`db/schema/icp.ts`): `icps` (status draft/active/archived, priority, metadata `{uiState, sourcingFilters}`, soft-delete) ; `icp_criteria` (fieldKey, operator eq/in/gt/…/between, value jsonb, weight, isRequired) ; `icp_field_catalog` (source: apollo_search | apollo_enrich | custom_property | signal ; apolloParam pour le sourcing) ; `company_icp_fit` matrice (fitScore [0,1], matchedCriteria `{matched, unmatched, excludedBy, identityFit, signalFit, coverage}`, computedAt).
- **Entrées de comptes**: (1) `/api/tam/build` — par ICP: `icpToStrategy()` déterministe critères→params Apollo ; par tenant: LLM génère 2-4 stratégies. Pipeline streaming max 6 concurrents (`lib/tam-stream/per-company.ts`): dedup domaine (Set mémoire + contrainte DB) → `enrichOrganization(domain)` → `waterfallEnrich` (gap-fill Crunchbase/Hunter) → `scoreCompanyWithModel` → INSERT → 5 signaux en parallèle (investor_overlap, funding_recent, funding_crunchbase, hiring_intent, yc_company) → HEAD-verify des sources. (2) CSV. (3) Inbound visiteur. (4) Cron `icp/source-tenant`: multi-sources (Apollo, Pappers, SIRENE/Zefix) → file de propositions au lieu d'insertion directe.
- **File d'approbation TAM** (`lib/tam/proposals.ts`, `db/schema/tam.ts`): `tam_proposals` (kind add/refresh/exclude, dedupKey, payload, score, reviewedBy) ; `applyProposal()` ; `account_suppressions` = registre durable des exclusions (survit au hard-delete, réversible). Cron `tam-refresh-cron` 04:30 UTC, budget 25 propositions refresh/tenant/jour (stale = `lastEnrichedAt` > TTL). UI `/tam/review` prod-hidden depuis PR #160 (`lib/tam/entry-visibility.ts`) — les propositions S'ACCUMULENT en prod sans review.
- **Fraîcheur**: `companies.lastEnrichedAt` + `sourceSystem` (apollo/csv/manual/inbound/inngest) — au niveau compte, PAS par champ.
- **Estimation pré-build**: `/api/tam/estimate` (count Apollo) — informatif, non bloquant.

**Critères de la spec — statut chez nous**
1. ICP NL → critères structurés validés avant sourcing — **[OK]** (`/api/icps/infer` + éditeur CriterionList + importance Nice/Important/Must → weight/isRequired ; recompute diff « N regraded, X up, Y down »).
2. Provenance + fraîcheur PAR CHAMP — **[ABSENT]** (compte-level seulement).
3. Critère non couvert → jamais de filtre silencieux — **[PARTIEL]**: côté SCORING c'est mieux que la spec (coverage-aware: champ absent ne pénalise pas, plancher 0.6) ; côté SOURCING, `icpToStrategy` ignore silencieusement un critère sans `apolloParam` mappable.
4. Porte d'échantillonnage 20 comptes avant activation des séquences — **[ABSENT]** (estimate informatif ; l'approval queue couvre le flux cron mais pas le build UI, et elle est prod-hidden).
5. Journal des ajouts/refresh — **[OK]** (proposals + events).
6. Divergence inter-sources conservée — **[PARTIEL]** (waterfall mergé, raw conservé dans l'event, pas en DB par champ).

**Métrique de succès (CRO)**: précision TAM échantillonnée ≥ 85 % ; % du TAM touché par une séquence à 90 j (un TAM construit mais pas travaillé = vanity metric).

**Le comment chez nous**
1. **Provenance par champ** (S): au point d'écriture unique de l'enrichissement (writer de `enrichOrganization` + `waterfallEnrich` dans `per-company.ts`), écrire `companies.properties.enrichmentMeta = {field: {source, fetchedAt}}` — JSONB, zéro migration. Surfaçage: tooltip sur la fiche compte (le pattern provenance existe déjà sur les cartes call-intel).
2. **Critères non sourçables explicites** (S): `icpToStrategy()` retourne déjà la stratégie — lui faire retourner aussi `unmappedCriteria[]` ; UI `/settings/icp`: bandeau « 2 critères ne filtrent pas le sourcing, ils ne jouent qu'au scoring » + même info dans le stream `/api/tam/build`.
3. **Sample-gate** (M): après un build ≥ N comptes, état `tenants.settings.tamValidation = {pending, sample: [20 ids aléatoires]}` ; bannière sur `/accounts` « valide 20 comptes avant d'activer les séquences » ; en dessous de 85% de « dans la cible », CTA retour éditeur ICP. Enforcement: `checkContactEligibility` (`lib/sequences/enrollment-eligibility.ts`) refuse l'enrollment d'un compte d'un TAM non validé — un seul point de code, déjà le chokepoint des gardes anti-ICP.
4. **Décision produit à prendre**: la review TAM est prod-hidden (#160) pendant que le cron continue de proposer — soit on réactive l'entrée avec un compteur, soit on coupe le cron en prod ; l'état actuel (file qui grossit sans consommateur) viole notre propre règle « pas de données sans consommateur ».

---

### F2. Account Scoring (§2)

**Méthodo Sam**: « not every company is created equal » — priors déclaratifs (SF, effectif, business model). Le transcript conflate priors déclarés et poids appris (§8).

**Lecture CRO**: réalloue l'effort à capacité constante — le score décide quelles demos on prend.

**Audit PM (Monaco)**: deux couches à séparer (déclaratif/appris) ; boucle auto-réalisatrice sans quota d'exploration ; score opaque = confiance détruite.

**Chez Elevay aujourd'hui — le réel**

- **Moteur** (`lib/icp/criteria-engine.ts`): `computeBlendedFit()` — critères required = hard gate (fitScore 0 + `excludedBy` stocké) ; soft pondérés Σ(matched)/Σ(évaluables) ; split identity/signal ; **coverage-aware**: dénominateur = champs AVEC données, score = fitEvaluable × (0.6 + 0.4 × coverage) — un fit parfait sur données partielles plafonne à 0.6. Normalisation diacritiques/« & »→« and » (vécu Apollo « Île-de-France »).
- **Recompute** (`inngest/icp-fit-recompute.ts` + `lib/icp/fit-recompute-core.ts`): batchs de 100, multi-ICP, primaire = premier ICP (par priority) avec fit ≥ 0.5 ; miroir `companies.score` = round(100 × fit primaire) ; grades A+→F (`lib/scoring/scoring.ts`).
- **Explicabilité**: `matchedCriteria` (matched/unmatched/excludedBy/coverage) stocké par cellule — exposé dans le détail matrice, PAS sur les listes.
- **Couche apprise**: `lib/scoring/company-model-trainer.ts` — Naive Bayes entraîné sur les deals fermés, **activé seulement à ≥ 10 closed deals** (sinon règles), via `scoreCompanyWithModel()`. PARALLÈLE: ne repondère jamais l'ICP.
- **Score opérationnel**: `companies.priorityScore` (cron `signal-score-daily`) = lift signaux × fit ICP × accessibilité contact — c'est LE score de la call queue.

**Critères de la spec — statut chez nous**
1. 3 facteurs dominants visibles sur le score — **[PARTIEL]** (stocké, visible en détail matrice, pas en liste/tooltip).
2. Mode déclaratif étiqueté sous n<30 closed-won — **[PARTIEL]**: le seuil existe (≥10 pour le modèle) mais RIEN n'étiquette quel mode parle ; on a même TROIS scores (fit ICP, score modèle, priorityScore) sans légende unifiée — risque de confusion réel.
3. Versionnage des pondérations + notification — **[ABSENT]** (metadata snapshot, pas de versions).
4. Quota d'exploration E% — **[ABSENT]** (la daily call list trie `contacts.score DESC` strict ; `signal-to-sequence` enrôle au seuil — double renforcement du biais).
5. Proposition de repondération par l'insight, gate humain — **[ABSENT]** (le trainer est parallèle, muet sur l'ICP).
6. Override journalisé confronté à l'outcome — **[ABSENT]**.

**Métrique de succès (CRO)**: lift de conversion top-quartile vs bottom-quartile du score (l'écart EST la preuve que le score marche) ; % d'overrides utilisateurs (trop = score faux ou mal expliqué) ; part d'exploration réellement envoyée.

**Le comment chez nous**
1. **Facteurs en surface** (S): tooltip du grade sur `/accounts` et fiche — lire `company_icp_fit.matchedCriteria` du primaire (déjà en DB, pure UI).
2. **Légende des scores** (S): un composant unique « score provenance » qui dit lequel des trois parle et son mode (déclaratif/appris) ; règle: < 10 closed-won ⇒ étiquette « sur tes critères déclarés ».
3. **Quota d'exploration** (M): dans `generateDailyCallList()` (`lib/voice/campaign.ts`) — réserver ceil(15%) des slots quotidiens à des contacts hors top-score (tirage pondéré sur le tier B/C), `callCampaignTargets.metadata.exploration = true` ; idem dans `signal-to-sequence` (1 enrollment sur 7 marqué exploration). La mesure tombe gratuitement: `signalOutcomes` et les enrollments portent déjà l'outcome — un simple GROUP BY exploration à 60 jours dit si le prior tient.
4. **Boucle outcome → proposition de poids** (M, dépend F9): voir F9.3 — le diff profil-gagnant vs poids actifs atterrit comme proposition dans `/settings/icp`, jamais auto-appliqué.

---

### F3. Signal Overlay + intent timing (§2, §19)

**Méthodo Sam**: « overlay signals: visiting the website, hiring for a certain role » ; « crawl every website in your entire database in basically real time » ; doctrine: « they work because they're actually relevant » avec citation vérifiable (« [hyperlink to the job posting] ») ; anti-pattern: « go Chiefs ».

**Lecture CRO**: bouge reply rate ET conversion — le meilleur ratio levier/coût du discours.

**Audit PM (Monaco)**: « basically real time » sur tout le TAM est économiquement intenable sans tiers de fraîcheur ; aucune mention de péremption ; la doctrine §19 est un critère de qualité testable — l'encoder en lint.

**Chez Elevay aujourd'hui — le réel**

- **Types détectés** (`lib/scoring/signal-detectors.ts`): funding, funding_crunchbase, hiring (jobPostingIntent), tech_stack_change, leadership_change, investor_overlap — stockés dans `companies.properties` (tamSignals, jobPostingIntent, fundingLastCheckedAt…).
- **Signaux custom** (`customSignals`): définition NL → LLM génère `plan {judgePrompt, keywords[], urlPatterns[]}` → backfill TAM-wide (cron `custom-signal-backfill`) → résultat `{value, reason, sources, confidence, computedAt}` par compte. Scopable par ICP. **Pas d'étape d'échantillonnage avant le backfill.**
- **Surveillance**: `signal-monitor` toutes les 4h sur le top 50 (détecte les NOUVEAUX signaux, invalide les briefs périmés) ; `signal-score-daily` recalcule `priorityScore`.
- **Apprentissage**: `signalOutcomes` (signalType × outcome won/lost) → multiplicateurs de lift par tenant, fallback 1.0× sous 10 outcomes — utilisés dans `scoreSignals()` (5 pts × multiplicateur, cap 20) et le seuil d'auto-enrollment.
- **Citation vérifiable**: `signalUrlCache` (statuts sentinelles -1 timeout/-2 DNS/-3 malformé/-4 IP privée, outcome verified/unverified, TTL + cron d'éviction) — construit sur notre spec MONACO-PARITY-01. Vérifié à la GÉNÉRATION du draft (`personalizationSources` = citations `{kind, label, href, quote}`), **pas re-vérifié à l'envoi**.
- **Vocal**: `isVoiceableSignal()` (`lib/call-mode/live-script.ts`) — 12 types prononçables / 8 internes interdits à l'oral ; `deriveOpeningReason()` choisit LA meilleure raison d'appel.
- **Action**: `signal-to-sequence` auto-enrôle (top 3 contacts par seniorité) quand le multiplicateur appris passe le seuil tenant.

**Critères de la spec — statut chez nous**
1. Référence vérifiable + re-vérification à l'envoi, fail-closed — **[PARTIEL]**: vérifié à la génération via cache ; le délai génération→approbation→envoi peut rendre l'URL morte au moment où le founder a déjà approuvé.
2. Decay par type (hiring 30j, funding 180j…) — **[ABSENT]**: un jobPostingIntent détecté reste « vrai » indéfiniment dans properties ; `lib/coaching/freshness-check.ts` existe et N'EST PAS CÂBLÉ (dormant).
3. Signal custom calibré sur 20 comptes avant TAM entier — **[ABSENT]** (backfill direct).
4. Lint anti-personnalisation-cosmétique — **[PARTIEL]**: `evaluateSequenceQuality()` pénalise les clichés génériques (« I hope this finds you well », -0.15), pas la catégorie « personnel non pertinent » (sport/ville/alma mater), et rien n'est BLOQUANT (score-only, seuil 0.7 en preview).
5. Signal → personne concernée (auteur du post, hiring manager) — **[ABSENT]** (signaux company-level ; enrollment = top 3 seniorité).
6. Fraîcheur tierée par score — **[OK]** (monitor 4h top-50 + daily le reste — exactement le tiering que la spec demande).

**Métrique de succès (CRO)**: reply rate des messages signal-déclenchés vs cold — si l'écart relatif < +50 %, les signaux sont mal définis ; 100 % des citations vérifiables au moment de l'envoi (invariant).

**Le comment chez nous**
1. **Decay par type** (S): constantes `SIGNAL_TTL = {hiring: 30, funding: 180, tech_stack_change: 90, leadership_change: 120}` dans un helper `lib/signals/freshness.ts` (absorber le `freshness-check.ts` dormant) ; appliqué à TROIS points de lecture: `scoreSignals()` (un signal périmé ne score plus), `buildProspectContext()` (plus injecté dans les drafts), `deriveOpeningReason()` (plus prononcé en call). Données déjà datées (detectedAt/computedAt/fundingLastCheckedAt) — zéro migration.
2. **Re-vérification à l'envoi** (S): dans `sequenceDraftToOutbound` (`inngest/sequence-draft-to-outbound.ts`), avant l'insert `outbound_emails`: si `personalizationSources[].href` existe → `signalUrlCache` re-check (le module et le cache existent) ; si invalid → draft repasse `pending_approval` avec `reviewReason = "source du signal expirée"` (le state machine versionné gère déjà ce retour sans course).
3. **Calibration des signaux custom** (S): dans `custom-signal-backfill`, mode sample-first: exécuter le plan sur les 20 comptes top-fit, présenter les hits (UI settings signaux, elle existe), bouton « lancer sur tout le TAM » → backfill actuel inchangé. `backfilledAt` reste le marqueur d'état.
4. **Lint bloquant** (S): nouvelle règle dans `evaluateSequenceQuality()` — catégorie `irrelevant_personal` (regex + LLM judge léger sur le draft), et passage de « pénalité » à « blocage » pour cette catégorie + re-génération automatique (la boucle evaluator-optimizer 2 itérations existe).
5. **Signal → personne** (M): étendre le schéma de signal custom avec `personHint` (extrait quand `sources` contient un auteur/un titre de poste) ; `signal-to-sequence` matche `personHint` contre les contacts du compte avant le fallback top-seniorité. Pour hiring: le job posting contient le département — prioriser le contact du département.

---

### F4. Buyer Finder — personas et contacts (§2, §8)

**Méthodo Sam**: « finding the buyers — who is it, what's their email? » ; l'insight Brex « finance ~4x controllers », possible uniquement parce que le persona a fini par être tracké — « a rep would show up on a call and not note whether they were talking to a CFO… ».

**Lecture CRO**: le bon interlocuteur = multiplicateur documenté (4x) ; la délivrabilité = l'oxygène, jamais mentionnée dans le transcript.

**Audit PM (Monaco)**: la dépendance cachée de l'insights agent est la capture AUTOMATIQUE du persona sur chaque interaction ; taxonomie hiérarchique obligatoire sinon cellules statistiques vides.

**Chez Elevay aujourd'hui — le réel**

- **Waterfall contacts** (`lib/providers/contact-enrichment/waterfall.ts`): geo-routé (Kaspr/Lusha boostés FR/CH, Apollo p10 US) ; merge: email au rang de confiance le plus haut (verified > likely > unverified), téléphones en union E.164 taggés par provider, **saturation** (stop dès mobile + email utilisable) ; coût par provider tracké. FullEnrich = bulk async 100 par webhook. Dropcontact absent.
- **Découverte de buyers**: `/api/accounts/[id]/suggested-contacts` — seniorités dérivées par REGEX du targetRoles NL du tenant (CEO/CTO→c_suite, VP, director…), Apollo searchPeople, top 10 « likely involved in purchasing decisions ». **Manuel** — rien ne tourne à l'entrée d'un compte.
- **Persona stocké**: `contacts.title` (string Apollo) + seniorité Apollo (c_suite/founder/vp/director/manager/senior) ; UI: `lib/ui/title-style.ts` + TitleBadge par palier (PRs #187/#192, sur main) — JAMAIS de parsing du titre (règle maison).
- **Persona capturé en interaction**: **OUI pour les calls** — `contacts.properties.callProfile {role, isDecisionMaker, disposition champion/supporter/neutral/detractor}` extrait post-call (+ `pendingCallProfile` en mode review). **NON pour les emails/meetings** (participants non classés).
- **Intent comportemental**: `scoreBuyerIntent()` (`lib/scoring/buyer-intent.ts`) — 8 signaux depuis activities 90j (response_time, meeting_acceptance, question_density…), trend heating/stable/cooling, à la demande, non persisté.
- **Protection délivrabilité**: `emailOptouts` (unsubscribe/bounce_hard/manual), `doNotCallList`, `connectedMailboxes` (bounceCount7d, replyCount7d, healthScore, dailyLimit 50, warmup 5/j) ; `/api/deliverability` seuils (bounce > 5% warn, spam > 0.1%, open < 15%). **Pas de gate dur pré-envoi à 2%** — des warnings.
- **Compte non actionnable**: `companies.excludedReason` pour l'anti-ICP — pas pour « aucun buyer joignable ».

**Critères de la spec — statut chez nous**
1. ≥1 buyer vérifié à l'entrée du TAM, sinon étiquette « non actionnable » — **[ABSENT]** (découverte manuelle ; pas de statut d'actionnabilité).
2. Refus d'envoi si bounce domaine > 2% — **[PARTIEL]** (health + warnings, pas de gate).
3. Persona classé sur CHAQUE interaction sans saisie — **[PARTIEL]** (calls oui via callProfile ; emails/meetings non).
4. Taxonomie hiérarchique famille→titre — **[OK de facto]** (seniorité Apollo stockée = la famille ; title = la feuille ; title-style la matérialise).
5. Bascule des first touches si le persona qui convertit diverge — **[ABSENT]** (aucune analytics par persona — voir F6).
6. La personne du signal prime sur le persona par défaut — **[ABSENT]** (cf. F3.5).

**Métrique de succès (CRO)**: % du TAM actionnable (≥ 1 buyer + email vérifié) — LE chiffre de couverture amont, invisible aujourd'hui ; bounce 7 j < 2 % par boîte (invariant) ; % d'interactions avec persona classé ≥ 95 % (sinon F6 reste aveugle).

**Le comment chez nous**
1. **Auto-discovery à l'entrée** (M): dans `runPerCompanyPipeline` (`lib/tam-stream/per-company.ts`), après l'INSERT: émettre `company/find-buyers` ; nouveau job Inngest qui réutilise la logique de suggested-contacts (mêmes seniorités depuis targetRoles) + waterfall sur le top-1 ; écrire `companies.properties.actionability = {status: "ok" | "no_buyer" | "no_reachable_email", checkedAt}`. Budget: 1 reveal Apollo par compte au build — chiffrer avant d'activer par défaut (cap configurable, le pattern de caps bulk existe).
2. **Gate bounce dur** (S): dans `emailSendWorker`: si `bounceCount7d / max(sent7d,1) > 0.02` → pause mailbox (status `paused` existe) + notification « Needs you » sur /home (la lane existe). Trois lignes au chokepoint déjà gardé par le test-mode guardrail.
3. **Persona sur emails** (S): au sync inbound (`inngest/sync-functions.ts`), quand l'expéditeur matche un contact: snapshot `{title, seniority}` dans `activities.metadata.participantPersona` — c'est la donnée d'entrée des cohortes F6 (le call l'a déjà via callProfile).
4. **Actionnabilité visible** (S): colonne/filtre sur `/accounts` (« 41 comptes sans buyer joignable ») — consomme le statut du point 1 ; sinon le statut ne sert à rien (règle: pas de champ sans consommateur).

---

### F5. Séquences multi-canal + founder-sender (§17, §18)

**Méthodo Sam**: « Who sends the outbound is very important… the origination to come from the founder » — « ingrained into the platform itself » ; « The table stakes are LinkedIn and email. It's not one plus one equals two — it's one plus one equals four » ; téléphone 3e canal, gifting 4e ; anti « just following up » (« Everyone knows it's automated ») ; anti faux domaines ; l'asset founder-only: l'origin story (exemple Parley) ; « Nothing earth-shattering, but it's already set up for you. »

**Lecture CRO**: tout converge sur le reply rate ; le founder-sender n'a de sens que si le coût en temps founder par message tend vers zéro (sinon il cannibalise le customer-facing §9).

**Audit PM (Monaco)**: « following up from my message on LinkedIn » exige la confirmation de délivrance du touch référencé — état machine par canal, pas un séquenceur naïf ; doctrine à versionner par stage (founder-led → équipe).

**Chez Elevay aujourd'hui — le réel**

- **Pipeline email complet** (`db/schema/outbound.ts` + `inngest/`): `sequences` (createdBy = owner, icpId) → `sequence_steps` (stepType enum: email / linkedin_message / linkedin_invite / phone_task / sms / gift ; delayDays ; channelConfig) → `sequence_enrollments` (state machine, `nextStepAt NULL` = parqué) → cron 2 min `cronTriggerSequenceSteps` → **mode par défaut review-each**: `routeSequenceStepToDraft` crée `sequence_drafts` (pending_approval, version lock optimiste, personalizationSources, triggerReason) → approbation → `sequenceDraftToOutbound` → `outbound_emails` → `dispatchOutboundSmtp` (cron 2 min) / `emailSendWorker`.
- **Identité**: `getOwnerMailbox(tenantId, createdBy)` (`lib/integrations/owner-mailbox.ts`) — l'expéditeur EST le créateur, boîtes personnelles (OAuth Gmail/Outlook via EmailEngine, ou IMAP/SMTP chiffré AES-256-GCM). Founder-sender DE FACTO (nos workspaces sont founder-led) — mais aucune doctrine par stage explicite.
- **Hygiène d'envoi**: warmup (warmupDailyTarget 5/j, warmupEmails), dailyLimit 50/boîte, sentToday, fenêtres 08:00-18:00 + jours M-F, skip weekends, healthScore. **Test-mode guardrail** à 3 chokepoints — défaut code « on », **désarmé en prod par env depuis le 2026-06-10** (envois réels).
- **Réponse → stop**: sync IMAP → `email/reply-received` → `processReply` → `pauseEnrollment("replied")` (terminal) ; classification des réponses (interested/meeting_request/objection_price/timing/competitor/authority/ooo/unsubscribe) + créneaux de meeting injectés step 3+.
- **Génération**: `sequence-generator.ts` — contexte riche (`buildProspectContext`: news, signaux, tech stack, pain points, methodology, do-not list), budget 25-85 mots, anti-patterns pénalisés, variété inter-steps, evaluator-optimizer 2 itérations, **seuil 0.7 non bloquant**.
- **Apprentissage du refus**: raison obligatoire 3-200 chars → `classifyRejection()` → `aggregateRejections()`/`dominantInsight()` → learner Inngest. Modes `approval-mode.ts`: review-each (défaut), batch-daily, auto-high-confidence — **le seuil 1.1 rend l'auto inatteignable aujourd'hui** (jamais auto, par design).
- **Multi-canal**: LinkedIn = adapter STUB (`lib/sequence-dispatch/linkedin-adapter.ts`, « not implemented » sans `LINKEDIN_OUTREACH_PROVIDER` ; providers prévus expandi/phantombuster/unipile) ; `sequence_drafts` n'a PAS de colonne channel sur main (dérivé du stepType) ; spec complète dans `_specs/linkedin-multichannel/` (Unipile, HQ Paris, single-account MVP), branche non mergée. Phone: producteur câblé (`phone/task-queued`, expire le draft si pas de téléphone) — consommateur (branche voice-cold-call) non mergé. Gift: enum sans implémentation. **Aucune précondition cross-canal.**
- **Collision**: shippé sur main — warning composer pre-send (#191) + timelines + pre-call (#184) + B8 brief (#194). **B10 pre-enroll MANQUE** (rien ne préviens à l'enrollment qu'un collègue travaille déjà le contact).

**Critères de la spec — statut chez nous**
1. Founder expéditeur par défaut + approbation des N premiers — **[OK et plus strict]** (review-each par défaut, TOUT passe par le founder — trop strict à terme, cf. comment 4).
2. Référence cross-canal conditionnée à la délivrance effective — **[ABSENT]** (sans objet tant que LinkedIn absent — les deux se livrent ensemble).
3. Refus domaines jetables + caps volume + warmup — **[PARTIEL]** (caps + warmup + santé OK ; aucune validation du domaine à la connexion de la boîte).
4. Structure par défaut proposée, jamais un canvas vide — **[OK]** (générateur + méthodologies + angles).
5. Lint « just following up » avec exigence de valeur nouvelle — **[PARTIEL]** (anti-clichés pénalisés ; pas de règle « apport nouveau obligatoire », rien de bloquant).
6. Origin story capturée et utilisée comme bloc — **[ABSENT]** (methodologies/angles existent, pas l'histoire du founder).
7. Transition de doctrine au passage en équipe — **[ABSENT]** (sans objet immédiat, à poser le jour où un 2e closer arrive).

**Métrique de succès (CRO)**: reply rate des enrollments bi-canal vs mono-canal sur cohortes comparables (le « 1+1=4 » du §18 doit se voir dans NOS données) ; temps founder par message approuvé < 30 s en régime de croisière ; % de drafts édités avant approbation (proxy de qualité de génération).

**Le comment chez nous**
1. **LinkedIn via Unipile — LE chantier** (L, spec déjà écrite): exécuter `_specs/linkedin-multichannel/` telle quelle: (a) migration additive `sequence_drafts.channel` (le rapport d'explo note le manque), (b) client Unipile + compte unique MVP, (c) consumer `linkedin_message`/`linkedin_invite` dans `decideDispatch()` (`lib/sequence-drafts/dispatch-decision.ts` route déjà `channel_routed_elsewhere`), (d) statut de délivrance dans `sequence_enrollments.metadata.touches[{channel, deliveredAt}]`, (e) la file d'approbation EXISTANTE absorbe les drafts LinkedIn sans travail (même state machine). Le « 1+1=4 » de Sam est mesurable chez nous dès la v1: reply rate des enrollments bi-canal vs mono-canal, requête sur outboundEmails × linkedinMessages.
2. **Préconditions cross-canal** (S, avec 1): dans `routeSequenceStepToDraft`, si le template du step référence un autre canal → vérifier `touches[]` ; absent → variante du template sans la référence (le générateur reçoit un flag `crossRefAllowed: false`).
3. **Règle valeur-nouvelle bloquante** (S): dans `evaluateSequenceQuality()`, pour step > 1: le draft doit contenir ≥1 élément absent des steps précédents (nouveau signal cité, nouvelle ressource, nouvel angle — comparaison des personalizationSources + entités du texte) ; sinon blocage + re-génération. C'est l'anti « just following up » de §18 rendu mécanique.
4. **Approve-N-then-auto** (M): le mode `auto-high-confidence` existe, inatteignable (seuil 1.1). Le câbler: quand `aggregateRejections()` montre ≥20 approbations consécutives SANS édition sur un stepType donné, proposer au founder (bannière dans /sequences/review) de basculer CE stepType en auto — le seuil devient un fait appris, pas une constante. Réversible, journalisé.
5. **Origin story** (S): champ `tenants.settings.founderStory` saisi dans le modal d'onboarding léger (consommateur immédiat: le générateur — règle onboarding respectée) ; `buildProspectContext()` l'injecte quand l'angle « founder-to-founder » est choisi par la méthodologie, jamais ailleurs (doctrine §17: contenu qu'un salesperson ne peut pas dire).
6. **Validation domaine à la connexion** (S): à l'ajout d'une boîte (`connectedMailboxes`), vérifier MX du domaine + refuser les domaines lookalike du domaine principal du tenant (la doctrine §17 anti « domains that aren't your real domain ») ; warning si SPF/DMARC absents (simple lookup DNS).
7. **B10 collision pre-enroll** (S, spec existante `_specs/collision-awareness/`): au POST `/api/sequences/[id]/enroll`, appeler `lib/collision/contact-touches` (existe sur main) et afficher le composant `contact-collision-notice` (existe, partagé en/fr) — c'est le dernier maillon actif manquant de la collision.

---

### F6. Insights Agent (§8) — la pièce maîtresse du discours, notre plus gros chantier structurant

**Méthodo Sam**: « We have an insights agent, trained to cut data every possible way — buyer, location, vertical and sub-vertical, segment and sub-segment — and see when you reach statistically significant information worth surfacing. » Exemples fondateurs: Zenefits (géo), Brex (« finance ~4x controllers »). Et l'étoile polaire: « the characteristics of companies that are closing… not the characteristics of companies we can get a meeting with. »

**Lecture CRO**: l'insight ne vaut que par la réallocation qu'il déclenche (« we oriented all first touches toward finance personas ») et la mesure de son effet.

**Audit PM (Monaco) — le piège statistique**: les exemples fondateurs viennent d'échelles 100x supérieures au client Monaco type (20-50 opps/trimestre). « Cut every possible way » sur 40 deals = p-hacking industrialisé: des écarts « significatifs » purement aléatoires, présentés avec l'autorité de la machine, déclenchant des réallocations destructrices. La version honnête à petit n: proposer des EXPÉRIENCES, pas des conclusions.

**Chez Elevay aujourd'hui — le réel (les briques sans le moteur)**

- **Ce qui apprend déjà des outcomes**: `signalOutcomes` (chaque close enregistre les signaux actifs dans la fenêtre → lift par type, fallback 1.0× sous n=10) — c'est un mini-insights-agent à UNE dimension (signal), avec seuil de n. Le Naive Bayes (`company-model-trainer.ts`, ≥10 deals) en est un autre, à boîte noire.
- **Ce qui agrège**: `aePerformanceSnapshots` (par user × période: emails, meetings, deals, scores coaching par catégorie, trends improving/declining avec %) ; `coachingInsights` (par interaction) ; `contentVariants` (replyRate/positiveRate par variant de playbook × segment — de l'A/B MANUEL, tracké mais non automatisé).
- **Ce qui « recommande »**: `/api/reports/generate` — pipeline/weekly/winloss: agrégats SQL → prompt LLM → `{title, sections, metrics, recommendations}`. **Aucun test statistique entre l'agrégat et la recommandation** — structurellement, c'est le « générateur de plausible » que je reproche au claim de Monaco, en moins ambitieux.
- **Ce qui trace les choix**: `enrollmentStrategy` (playbookId, variantId, selectionScore, selectionReason, alternativesConsidered) — l'infrastructure d'EXPÉRIENCE est à moitié là: on sait déjà pourquoi chaque enrollment a pris quel chemin.
- **Les dimensions disponibles en DB**: persona (callProfile.role + seniorité contact), géo + industry (companies), signal d'origine (signalOutcomes), canal (activities.channel), variant (contentVariants), origine du compte (sourceSystem). **Personne ne les croise.**

**Critères de la spec — statut chez nous**
1. Trois tiers observation/hypothèse/insight, « insight » réservé à n≥seuil + correction multi-comparaisons — **[ABSENT]** (signalOutcomes a UN seuil n≥10 sur UNE dimension — le germe du pattern, pas le système).
2. Tiers « hypothèse » → plan d'expérience au lieu de conclusion — **[ABSENT]** (enrollmentStrategy pourrait porter l'allocation, rien ne la génère).
3. Évidence complète (cut, n, taux, confondeurs) — **[PARTIEL]** (evidence {claim, quote} existe pour les FAITS extraits des calls — pas pour les patterns statistiques).
4. Application → baseline snapshot → mesure J+30/J+60 → révocation — **[ABSENT]**.
5. Insights sur les deals QUI CLOSENT, étiquetage séparé des patterns de meeting — **[ABSENT]**.
6. Sous le seuil partout: le dire + proposer les 2 hypothèses les plus prometteuses — **[ABSENT]** (nos reports ne disent jamais « pas assez de données »).

**Métrique de succès (CRO)**: taux de confirmation à J+60 des insights appliqués > 70 % (sinon seuils trop laxistes) ; chez les tenants < 30 deals, la sortie majoritaire DOIT être « pas assez de données » (l'honnêteté se mesure) ; lift de conversion réalisé post-application — la seule métrique qui justifie la feature.

**Le comment chez nous** (l'ordre est la moitié de la valeur)
1. **Fondation cohortes** (M): cron quotidien (pattern `signal-score-daily`) qui matérialise une vue `deal_cohort_cells`: dims = {seniorityFamily (callProfile.role sinon seniorité contact), région (companies), industry, signalType d'origine (signalOutcomes), canal, sourceSystem} × mesures = {n, won, lost, valueWon (split projectAmount/platformArr — bookings ≠ ARR, règle maison)}. Hiérarchie de dims (famille avant titre, région avant ville) pour maximiser le n par cellule.
2. **Moteur de tiers PUR** (M): `lib/insights/cohort-engine.ts` sans I/O (notre style: pur + tests): input cellules, output classement {observation | hypothèse | insight} — seuils v1: n≥15 par cellule ET correction Benjamini-Hochberg q<0.1 ; check de colinéarité (géo×taille×industry) avant de promouvoir. Suite d'évals 15 cas synthétiques (effet réel / nul / confondu) dans `lib/evals/suites/` (l'infra d'éval existe) — **le moteur doit sortir ZÉRO insight sur les jeux sans effet, c'est le test d'acceptation n°1**.
3. **Plans d'expérience** (M): tiers hypothèse → générer une allocation contrôlée: « les 20 prochains first touches 50/50 persona A/B » — implémentée via `enrollmentStrategy` (le champ selectionReason porte « experiment:xyz ») et le picker de `signal-to-sequence`/suggested-contacts qui respecte l'allocation. La mesure retombe dans les cellules du point 1.
4. **Cycle de vie + mesure** (M): table `insights` (cut, tiers, evidence jsonb, status proposed/testing/applied/confirmed/revoked, baselineSnapshot, appliedAt, measuredAt) + job J+30/J+60 qui compare et révoque visiblement. Application = propositions concrètes: repondération ICP (F2.4/F9.3), bascule persona des first touches (modifier le défaut de suggested-contacts), priorisation géo (poids dans priorityScore) — TOUJOURS via validation humaine.
5. **Re-router les reports** (S): `/api/reports/generate` consomme le moteur: les « recommendations » LLM ne peuvent CITER que des cellules tiers insight/hypothèse, avec n et taux affichés ; sous le seuil partout: « pas encore assez de deals — voici les 2 hypothèses à tester ». Le LLM rédige, les stats décident — notre doctrine « intelligence, not a prompt » appliquée à nous-mêmes.
6. **UI** (S): section « Ce qui distingue tes deals gagnés » sur /home ou /reports, chaque carte = cut + n + taux + intervalle + bouton « tester / appliquer ». Pas de nouveau pilier de nav (règle nav-IA).

---

### F7. Routing rep-level (§8) — à NE PAS construire, et quoi faire à la place

**Méthodo Sam**: « AI can then route the meeting to whoever has the highest probability of closing it… It's totally objective — it's all AI. »

**Audit PM (Monaco)**: « totally objective » masque le choix de la fonction objectif (close rate ? revenu ? équité ?) — décision de management, pas propriété de la machine ; cellules rep × segment encore plus vides que F6 ; boucle de verrouillage (le rep routé sur les founders ne reçoit plus que ça) ; décrit comme CAPACITÉ (« can then ») — pari upmarket, pas feature pour son ICP founder-led actuel.

**Chez Elevay aujourd'hui — le réel**: workspaces multi-users (admin/member/viewer, PR #110/#112), `aePerformanceSnapshots` par user (la matière première rep-level existe), `meeting-capacity-check` Inngest (existant, pas d'allocation), et la **collision awareness shippée sur main** (`lib/collision/` contact-touches/recent-touch + `/api/collision/*` + warnings pre-call #184, composer #191, timelines #186/#189, brief B8 #194) — qui est la réponse founder-led au même problème: deux humains sur le même prospect.

**Verdict**: notre ICP = équipes 1-3, founder-led. Le gate de la spec (« IF < 3 closers THEN suggestion seulement ») rend la feature invisible pour 100% de nos tenants actuels. **Construire le routing aujourd'hui serait du travail pour un client qu'on n'a pas** — exactement le pari upmarket de Monaco, sans leur Series B.

**Métrique de succès (CRO)**: 100 % des deals avec ownerId et 100 % des activities avec userId (l'hygiène d'attribution est la seule chose à mesurer tant qu'on ne construit pas).

**Le comment chez nous (minimal, préparatoire)**
1. **Finir B10 pre-enroll** (S — cf. F5.7): la vraie coordination d'équipe à notre stade, spec déjà écrite.
2. **Hygiène d'attribution** (S): vérifier que `deals.ownerId` et `activities.userId` sont systématiquement posés par les writers (le journal deal de la branche courante le fait pour les events deal) — c'est la seule dette qui rendrait le routing impossible plus tard.
3. **Rien d'autre.** Le jour où un tenant ≥3 closers existe, F6 fournira les cellules rep × segment avec les mêmes tiers de confiance.

---

### F8. Équation de revenu + diagnostic demand-vs-conversion (§7, §20)

**Méthodo Sam**: « Revenue has three variables: opportunities × conversion rates × ACV » ; « nine out of ten… misdiagnose the bottleneck as conversion rates » quand c'est la demande ; le deal « pushed » sur-analysé — « it's that you didn't have five customers in play » ; +50% de conversion est dur, doubler les demos est faisable ; « double and triple down » sur un canal qui marche jusqu'au « demand-rich environment ».

**Lecture CRO**: la méta-feature — le dashboard ne montre pas des métriques, il rend un DIAGNOSTIC avec le calcul visible. Le « 9/10 » est un prior par défaut intelligent: sur-investir la demande est l'erreur la moins coûteuse.

**Chez Elevay aujourd'hui — le réel**

- `/api/dashboard/summary`: activities hebdo + delta, enrollments, deals won, tasks dues, meetings — vrais COUNT SQL (règle « real counts » respectée).
- `/reports` (prod-hidden de la nav, accessibles par URL): pipeline (open deals, stalled top-5 par updatedAt, valeur totale, win rate, vélocité), weekly, winloss — agrégats → LLM → recommendations (cf. F6.5 pour le problème).
- Reply rate (`outboundEmails.repliedAt`), meeting rate (activities), win rate, vélocité — calculés, épars.
- Deal split B2: `projectAmount` (one-time) + `platformArr` (récurrent annualisé) — l'ACV chez nous est BIMODAL par construction (`lib/deals/amount.ts#getDealAmountDisplay`).
- **Rien** qui instancie l'équation, identifie le bottleneck, calcule une couverture vs objectif, ou modélise la capacité de demos. Pas d'objectif de revenu tenant. `meeting-capacity-check` existe sans consommateur d'allocation.

**Critères de la spec — statut chez nous**
1. Équation instanciée + bottleneck + sensibilités marginales — **[ABSENT]** (tous les inputs SQL existent).
2. Couverture < K × objectif/ACV → état « demand-constrained » + recommandations orientées génération — **[ABSENT]** (pas d'objectif tenant stocké).
3. Recadrage « deal pushed » par la couverture — **[ABSENT]**.
4. n<15 → intervalles/agrégats glissants, jamais un % nu — **[ABSENT]** (win rate affiché brut quel que soit n).
5. « Double down » sur canal à coût/opp stable — **[ABSENT]** (les données par canal existent: outboundEmails, calls, linkedinMessages à venir).
6. Capacité de demos calculée — **[ABSENT]** (activities meeting_completed par semaine = la matière).
7. Cohortes d'origination (meeting de mars → close de juin attribué à mars) — **[ABSENT]** (reports calendaires).

**Métrique de succès (CRO)**: précision rétrospective du diagnostic (le bottleneck déclaré au mois M prédit-il le levier qui a marché à M+2 ?) ; le founder revient-il sur le bloc chaque semaine (adoption = le diagnostic est utile, pas décoratif).

**Le comment chez nous**
1. **Lib pure** (S): `lib/analytics/rev-equation.ts` — inputs {opps période, conversions, ACV split projet/ARR, objectif} → outputs {runRate, bottleneck, sensitivities, coverage, state demand/conversion/capacity-constrained}. **Deux équations, pas une**: projectAmount et platformArr séparés (bookings ≠ ARR — notre règle de revue), agrégeables en cash-in si le founder le demande.
2. **Objectif tenant** (S): `tenants.settings.revenueGoal {monthly, currency}` — saisi dans le modal d'onboarding ou en réglage ; consommateur immédiat = ce diagnostic (règle onboarding: le champ naît avec son consommateur).
3. **Capacité** (S): v1 = max glissant des meetings tenus/semaine (activities meeting_completed) ; le « demand-rich » devient: opps actives ≥ K × (objectif/ACV) ET demos planifiées < capacité. K défaut 4.
4. **Surface** (M): une ligne de diagnostic dans le briefing Up Next de /home (le composant existe) — « Bottleneck: génération. 2 deals en jeu pour un objectif qui en demande 8. +1 demo/semaine vaut ~X CHF de run-rate » — + un onglet Equation dans /reports avec le détail cliquable vers les deals (citations, pas de boîte noire).
5. **Anti petit n** (S): < 15 opps sur la période → basculer trimestre glissant + intervalle (même garde-fou que F6).
6. **Cohortes d'origination** (M): à la création du deal, poser `deals.properties.origination = {kind: sequence|call_campaign|inbound|manual, id, at}` — la chaîne existe déjà en données (enrollmentId sur calls, threadId sur emails) ; le journal deal (branche courante) est l'endroit naturel pour l'écrire. Les rapports « par cohorte de meetings » suivent chaque cohorte jusqu'au close.

---

### F9. Boucle fermée closed-won → ciblage (§6, §8)

**Méthodo Sam**: l'argument anti-point-solution — « you have no insight into ACVs, what's converting… how to feed that data point back to the top of the funnel » ; « characteristics of companies that are closing, to apply back to targeting ».

**Audit PM (Monaco)**: overfitting au petit n ; le profil gagnant des 10 premiers clients encode le RÉSEAU du founder (« most of our revenue today comes from referrals » §13), pas le marché — cohortes par origine obligatoires ; mise à jour d'ICP = décision stratégique, jamais auto.

**Chez Elevay aujourd'hui — le réel**

- **La boucle existe pour UNE dimension**: `signalOutcomes` → multiplicateurs de lift par type de signal, consommés par `priorityScore` et le seuil d'auto-enrollment. C'est une vraie boucle outcome→ciblage, étroite et honnête (n≥10).
- **La boucle parallèle muette**: Naive Bayes ≥10 deals (`scoreCompanyWithModel`) — apprend des outcomes, ne propose RIEN à l'ICP, n'explique rien.
- **Les events existent**: `analyzeClosedDeal` (Inngest, sur won/lost) + `lib/analysis/win-loss-engine` + le journal deal (branche courante: deal_won/deal_lost avec triggeredBy) — les hooks de la boucle sont posés.
- **Manquent**: extraction du vecteur de traits au close, profils win/loss versionnés, séparation referral/outbound, propositions de mise à jour ICP, lookalike sourcing.

**Critères de la spec — statut chez nous**
1. Extraction du vecteur de traits au close — **[PARTIEL]** (analyzeClosedDeal tourne, n'agrège pas de profil).
2. Proposition de repondération avec évidence, gate humain — **[ABSENT]**.
3. Cohortes par origine (referral exclu de l'apprentissage outbound) — **[ABSENT]** (origination F8.6 = le prérequis).
4. n<30 → propositions « indicatives », ajustements de marge seulement — **[ABSENT]** (mais le pattern de seuil existe 2 fois: signalOutcomes 10, trainer 10).
5. Versionnage + mesure post-application — **[ABSENT]**.
6. Lookalike sourcing depuis les won — **[ABSENT]**.

**Métrique de succès (CRO)**: précision PROSPECTIVE du profil (les comptes top-profil convertissent-ils mieux sur la cohorte SUIVANTE, pas sur celle qui l'a engendré) ; % de propositions ICP acceptées par le founder ; délai close → proposition.

**Le comment chez nous**
1. **Profil de traits au close** (S): étendre `analyzeClosedDeal`: écrire le vecteur {sizeRange, région, industry, seniorityFamily du champion (callProfile), signalType d'origine, canal, origination, acvSplit, cycleDays} dans `icps.metadata.outcomeProfile` (agrégat versionné: {asOf, n, traits}) — JSONB, zéro migration.
2. **Cohortes d'origine** (S): dépend de F8.6 — le profil n'agrège que origination ∈ {sequence, call_campaign} pour l'apprentissage outbound ; les referrals/manuels sont affichés séparément (« tes 4 référés ne disent rien de ton outbound »).
3. **Propositions ICP** (M): job qui diffe outcomeProfile vs `icp_criteria` (poids/valeurs) quand n≥30 ; sortie = carte de proposition dans `/settings/icp` (« tes 12 wins sont à 83% en 50-200 FTE ; ton critère effectif est 100-1000 — resserrer ? ») avec l'évidence ; bouton applique la modification de critère VIA l'éditeur normal (recompute event existant fait le reste). Sous 30: la carte existe en mode « indicatif », ne propose que des élargissements/resserrements de bornes.
4. **Lookalike** (M): `profileToStrategy()` — l'inverse d'`icpToStrategy()` (même fichier `lib/icp/icp-to-tam.ts`): traits du outcomeProfile → params Apollo → passe par la file `tam_proposals` EXISTANTE (kind add, source « lookalike_won ») — l'approbation humaine est déjà construite. Bouton « source 20 comptes comme tes wins » sur la carte du point 3.
5. **Mesure** (S): chaque proposition appliquée = une ligne `insights` (F6.4) — un seul cycle de vie pour toutes les boucles, pas trois systèmes.

---

### F10. FDAE (§21) — leur moat assumé, notre anti-modèle assumé

**Méthodo Sam**: « you have to manage that agent — set it up, program it, check the messaging. We just do that for you » ; « definitionally not possible for a founder to understand how Monaco works the way a full-time Monaco employee does » ; Series A: objection marges → Series B: « THE big competitive advantage ».

**Audit PM (Monaco)**: l'aveu produit central du transcript — l'agent autonome ne l'est pas ; viable seulement si chaque release productise du travail FDAE (ratio workspaces/FDAE croissant), sinon l'objection de la Series A revient à l'échelle ; « definitionally not possible » est une fierté inversée — un produit illisible par son propre client.

**Chez Elevay aujourd'hui — le réel**: le FDAE, c'est Martin (mémoire projet: ~30h/client J0-60, ~2h/mois ensuite, capacité 5-7 clients). Côté produit: `captureApprovals` (mode review), `autonomyConfig` (level copilot…, permissions par action, guardrails maxEmailsPerDay/neverContact/sendWindow/maxDailySpend), l'admin app séparée (`apps/admin`: evals, flywheel, scoring, sla, costs, pipeline…) — des instruments d'OPÉRATEUR sans télémétrie d'interventions ni vue cross-tenant de santé de setup.

**Notre position doctrinale** (mémoires « AE stays human », « no human replacement narrative »): chez Monaco le FDAE est un moat à marges négatives assumé ; chez nous l'humain dans la boucle est le CLIENT (founder), pas un employé Elevay — l'opérateur (Martin) est un bootstrap à éliminer par le produit, pas un service à vendre. La conséquence pratique est la même que la spec interne Monaco: instrumenter le travail manuel de l'opérateur pour le productiser mécaniquement.

**Métrique de succès (CRO)**: heures opérateur par tenant par mois, pente descendante release après release (l'équivalent solo du ratio workspaces/FDAE) ; top 5 des interventions répétées = top 5 du backlog produit.

**Le comment chez nous (léger, immédiat)**
1. **Vue setup-health cross-tenant** (S, dans apps/admin): une page qui liste par tenant: ICP actif ?, mailbox connectée ?, séquence active ?, signaux custom ?, dernière activité — où l'opérateur doit intervenir, en un écran. Toutes les requêtes existent éparses.
2. **Journal d'interventions opérateur** (S): chaque action manuelle de Martin chez un tenant = `activities` avec `activityType: "operator_action"` + catégorie — la liste des candidates à productisation devient `SELECT category, COUNT(*), SUM(durée)` — le ratchet de productisation de la spec Monaco, version solo-founder.
3. **Strike zone**: notre équivalent existe par construction (onboarding contrôlé pré-GA) — formaliser des critères d'admission seulement quand l'inbound dépassera la capacité.

---

### F11. Launch playbook (§13, §14)

**Méthodo Sam**: « you can launch a bunch of times » (3 en 5 mois) ; table stakes: vidéo + spreadsheet 4 onglets (employees, investors, friends of the firm, customers) + outreach J-1/J0 ; « 45 days before launch, assemble a launch committee » + idées du weekend + whiteboard + 3-4 retenues avec budget caps ; la preuve par §10: reply rates « same company, same product, same message — exponentially higher » post-launch.

**Audit PM (Monaco)**: les 4 onglets sont des données que la plateforme POSSÈDE (customers, investisseurs, réseau) — le playbook dans un spreadsheet externe est une incohérence ; « we don't measure » (§10) puis il cite LA mesure qui compte (uplift à message constant) — productiser CETTE mesure, refuser l'attribution par contact.

**Chez Elevay aujourd'hui — le réel**: rien. Confirmé par l'exploration (« Launch tooling: confirmed DOES NOT exist »). Données disponibles pour les listes: users du workspace (employees), deals won (customers) ; investisseurs du TENANT non structurés (les `intelligenceBriefs.investor_names` concernent les PROSPECTS) ; friends = inexistant. Les séries temporelles outbound existent (`/api/deliverability` par période, outboundEmails datés) — l'overlay d'événements manque.

**Métrique de succès (CRO)**: uplift de reply rate J+30 post-launch vs J-30 à séquence constante (la mesure que Sam cite lui-même au §10) ; launches par client par an (récurrence = le playbook retient).

**Le comment chez nous** (P3 — petit et différenciant pour notre ICP founders early)
1. **Marqueurs d'événements** (S): table `event_markers` (tenantId, date, type launch/campaign/press, label) + overlay sur les charts deliverability/reply existants + calcul d'uplift avant/après à séquence constante (même sequenceId, fenêtres ±30j) — c'est la moitié de la valeur pour 1 jour de travail, et ça sert F12 aussi.
2. **Objet launch guidé** (M): table `launches` (date, type, listes jsonb, campagnes [{nom, budgetCap, owner}], rétro-planning J-45/J-30/J-7/J0 en tasks — la table `tasks` existe) ; listes pré-remplies: users (employees), deals won (customers), import manuel investors/friends v1 ; messages d'activation J-1/J0 = drafts dans la file d'approbation existante.
3. **Pas de génération d'idées créatives**: le produit orchestre (échéances, budgets, listes, mesure), il ne remplace pas le comité du §14 — ne pas prétendre l'inverse.

---

### F12. Brand echo / campagnes créatives / gifting (§10, §11, §15)

**Méthodo Sam**: rituel mensuel d'idée créative ; 30-50% des dollars marketing « directly benefits the target customer » ; la barre du gift (« it's NOT the thought that counts », anti-chachki) ; gifts sociaux et visibles (poker sets, cadre Lego, Veuve Clicquot sur levée ≤6 mois avec carte du CEO) ; « The anecdotes are more valuable than the data points ».

**Audit PM (Monaco) — l'idée la plus exploitable du transcript**: « anecdotes > data » cache une spec — FAIRE des anecdotes une donnée. Monaco capture chaque interaction ; détecter les mentions de marque dans les interactions capturées = le registre d'anecdotes de Sam, automatisé. Personne ne fait ce lien dans le transcript.

**Chez Elevay aujourd'hui — le réel**: nous capturons TOUT — `calls.transcript` (diarisé), `transcriptChunks` (pgvector), emails (activities + rawContent), meetings (upload + notetaker). Le pipeline d'extraction post-call (`lib/voice/extraction-schema.ts` → calls-post-process) extrait DÉJÀ MEDDPICC + evidence {claim, quote} + **competitor mention**. `intelligenceBriefs.competitorDetected` côté prospect. Le pattern de citation (`citation-parser`, offsets) existe. **Manquent**: le champ brandEcho dans l'extraction, les objets campagne avec budget, le ratio bénéficiaire, le gifting déclenché (stepType `gift` dans l'enum, AUCUNE implémentation), les marqueurs d'événements (F11.1).

**Critères de la spec — statut chez nous**
1. Mention de marque/campagne dans une interaction → tag « brand echo » + rattachement campagne — **[ABSENT, à 1 jour près]**: le point d'extraction LLM existe, il manque UN champ au schéma.
2. Campagne avec budget cap + split « bénéficie au client vs à un tiers » + ratio trimestriel — **[ABSENT]** (aucun objet campagne marketing ; `autonomyConfig.maxDailySpend` est un garde-fou, pas un ledger).
3. Rituel mensuel — **[ABSENT]** (la table tasks peut le porter).
4. Gift déclenché par levée ≤180j — **[PARTIEL]**: le signal funding existe avec date ; le stepType gift existe ; aucun consumer.
5. Échos négatifs tagués aussi — **[ABSENT]**.
6. Vue portfolio dépense × echoes × uplift — **[ABSENT]** (dépend F11.1).

**Métrique de succès (CRO)**: echoes par campagne par dollar dépensé ; ratio « bénéficie au client » vs cible 30-50 % (§11) ; % de campagnes arrêtées après leur fenêtre d'évaluation — un portfolio sain en tue (0 % d'arrêt = personne ne regarde).

**Le comment chez nous**
1. **Le détecteur** (S — le quick win du document): ajouter `brandEcho {mentioned: bool, kind: heard_of_us | saw_campaign | referral_mention | negative, quote}` à `lib/voice/extraction-schema.ts` — le post-call worker l'écrit dans `activities.metadata.brandEcho` (fail-closed: doute = pas de tag, notre règle LLM) ; même champ dans l'extraction inbound email existante (`enrichment/signals-extracted`). Vérité terrain immédiate: les transcripts Call Mode réels.
2. **Registre d'anecdotes** (S): une section (dans /reports ou la fiche compte) listant les echoes avec verbatim sourcé (le pattern evidence/citation existe) — agrégés par mois et par kind. Les négatifs en premier.
3. **Campagnes** (M): table `marketing_campaigns` (name, budgetCap, spendToClient, spendToThirdParty, startedAt, endedAt) + lien vers `event_markers` (F11.1) → la vue 3 colonnes {dépense, echoes, uplift} sans modèle d'attribution — la doctrine §10 encodée.
4. **Gift sur levée** (S): consumer du signal funding ≤180j → tâche proposée dans la file (« Propose: félicitations + gift à X — levée Série A il y a 3 semaines ») avec draft de carte founder-signée (origin story F5.5 réutilisable) ; v1 = tâche manuelle, pas d'intégration Sendoso (le « comment » physique reste humain — cohérent avec la barre qualité du §15).

---

## 3. Doctrines non productisées (audit méthodologique, inchangé v1)

**§3/§9 Customer-facing primacy**: « no higher-ROI use of founder time… than being customer-facing » ; le garde-fou anti-sur-délégation (« There's a risk you leverage AI too much »). Principe de revue de spec transversal: toute feature doit augmenter le temps client NET du founder. Le critère déplacement/ACV (« not getting on a plane… for a $25K ACV deal ») révèle au passage l'ACV Monaco.

**§12 Design partners**: gratuits CONTRE engagement platform-of-record (« Charging would have been friction against the thing we really wanted: feedback ») — la contrepartie est du signal non dilué, pas de l'argent.

**§13 Zero-to-100 conditionnel**: « probably the wrong approach for most companies » — exige un canal d'acquisition indépendant de la notoriété. Honnêteté notable.

**§16 Naming**: « not a social activity », le .com, les associations. Aucune implication produit.

**§20 Premier client**: « There is no one better in the world at acquiring the first handful of customers than the founder » — embaucher un vendeur pour le client n°1 = mauvais diagnostic (PMF). Notre onboarding founder-led le présuppose déjà.

---

## 4. Contradictions internes et risques systémiques (vue PM senior)

1. **La mesure bifurquée** — significativité statistique exigée (§8) ET refus de mesurer (§10), réconciliables seulement en encodant la frontière: stats là où l'attribution est fiable (funnel interne), proxy global pour le brand (uplift à message constant, echoes), jamais d'attribution par contact pour le brand.
2. **Le piège du petit n — risque produit n°1** — toute la couche intelligence promet de la stat à des clients qui n'ont pas le volume. Sans tiers de confiance + corrections + bascule en mode expérience, l'insights agent est un générateur d'artefacts confiants. **Nous y sommes exposés aussi**: nos /reports génèrent des recommendations LLM sans test — F6.5 nous soigne avant de viser plus haut que Monaco.
3. **Boucles auto-réalisatrices** — scoring/routing/closed-loop concentrent l'effort sur ce qui a marché et cessent d'apprendre. Remède uniforme: quotas d'exploration, cohortes par origine. Notre tri `score DESC` strict de la daily call list a exactement ce biais aujourd'hui (F2.3).
4. **Founder-sender vs upmarket** — la doctrine d'envoi (§17) casse au stade « steak dinners » (§5). À versionner par stage. Chez nous: de facto founder-sender, doctrine à expliciter le jour du 2e closer.
5. **FDAE: l'avantage-aveu** — viable si le ratio workspaces/FDAE monte à chaque release. Sam rapporte lui-même que la Series A a posé LA question. Notre modèle inverse (l'humain = le client) nous dispense du COGS mais pas de l'instrumentation (F10.2).
6. **Breadth-first et dette de cohérence** — « part of our moat is the breadth » (§6) sans jamais traiter la profondeur. Les FDAE sont le mortier humain entre les briques. Nos propres audits (archipelago seams, 13/20 dead-ends) documentent ce mode de défaillance — nous savons exactement ce que ça coûte.
7. **« It's all AI, totally objective » (§8)** — la fonction objectif du routing est un choix de management déguisé en propriété de la machine. Exposer, configurer, auditer.

---

## 5. Priorités Elevay issues de la comparaison

Classement par (levier CRO × écart réel × effort), doctrine demand-first appliquée à nous-mêmes — les 4 premiers bougent la GÉNÉRATION, conformément au §20:

| Rang | Chantier | Features | Effort | Pourquoi maintenant |
|---|---|---|---|---|
| 1 | **LinkedIn multi-canal (Unipile)** | F5.1-2 | L (spec écrite) | « Table stakes » + « 1+1=4 » (§18) — le plus gros levier de reply rate ; tout le reste du pipeline (drafts, approbation, identité) l'absorbe sans travail |
| 2 | **Intégrité des signaux**: decay + re-verify au send + lint cosmétique + calibration custom | F3.1-4 | S | Protège le levier signal existant ; 4 petits patchs sur des modules en place (freshness-check dormant, signalUrlCache, evaluateSequenceQuality, backfill) |
| 3 | **Équation + diagnostic bottleneck** | F8.1-5 | M | La doctrine §20 productisée pour NOTRE ICP exact ; tous les inputs SQL existent ; consommateur du revenueGoal d'onboarding |
| 4 | **Brand echo detector** | F12.1-2 | S (~1 j) | Unique sur le marché, infra d'extraction déjà en place, nourrit le récit « capture qui sert à quelque chose » |
| 5 | **Auto-buyer discovery + actionabilité** | F4.1, F4.4 | M | % du TAM actionnable = la couverture amont ; aujourd'hui invisible |
| 6 | **Origination cohorts + profil win/loss + propositions ICP + lookalike** | F8.6 + F9 | M | Ferme la boucle que Monaco revendique en architecture ; réutilise tam_proposals + analyzeClosedDeal |
| 7 | **Moteur d'insights à tiers de confiance** | F6 | L | Le différenciateur long terme — la version HONNÊTE du claim de Sam ; commencer par F6.5 (re-router nos reports) qui nous soigne du même mal |
| 8 | **Exploration quota + approve-N-then-auto + B10 + gates divers** | F2.3, F5.4, F5.7, F4.2 | S chacun | Hygiène: anti-verrouillage, montée en autonomie gagnée, dernière collision active |
| 9 | **Launch playbook léger** | F11 | M | P3 différenciant pour founders early ; commencer par event_markers (1 j, sert aussi F12) |
| — | **Routing rep-level** | F7 | — | **Ne pas construire** — gate ICP ; B10 + hygiène d'attribution suffisent |

**Deux corrections internes que la comparaison impose** (indépendantes de Monaco):
- La file `tam_proposals` accumule en prod sans consommateur depuis #160 (entrée cachée, crons actifs) — réactiver l'entrée ou couper les crons (F1.4).
- Nos /reports font ce qu'on reproche au claim Monaco: des recommandations LLM sans fondement statistique (F6.5).

---

*v2 du 2026-06-11. Sources: transcript (`_research/raw/transcript-sam-blond-monaco-gtm.md`, §N = sections), 4 explorations code exhaustives réconciliées avec origin/main (collision #182-#194 et title-style #187/#192 présents sur main ; guardrail outbound: défaut code « on », désarmé par l'env prod depuis 2026-06-10). v1 (audit Monaco seul) dans l'historique git: `33f92406`.*
