# Design — OUT-02 signal integrity

## Point unique de vérité
`lib/scoring/signal-detectors.ts` est déjà le SSOT lu par le scoring live (`scoreSignals`) ET l'attribution (`recordDealOutcome`). On y ajoute la taxonomie (`SIGNAL_CATEGORY` intent/warm_path), les TTL (`SIGNAL_TTL_DAYS`, null = sans expiration) et `isFreshAt(type, firedAt, asOf)` ; `detectActiveSignals(props, asOf = now)` filtre. Les deux consommateurs héritent du decay sans duplication.

## Sémantique asOf (la décision de design clé)
- Scoring live : `asOf = now` — le moment passe, le score retombe.
- Attribution au close : `asOf = deal.createdAt` — la question est « le signal était-il frais quand le deal a commencé », pas « au close ». Un TTL évalué au close tuerait l'apprentissage sur les cycles longs (hiring 30 j < cycle 90 j) ; évalué à la création, un signal qui a déclenché le deal garde son crédit, un fossile d'avant-deal n'en gagne pas. `firedAt ≥ createdAt − TTL` couvre aussi les signaux apparus EN COURS de cycle (firedAt > createdAt).

## Angles (signal-opener + outbound-methodologies)
- `TAM_SIGNAL_TO_ANGLE` : `yc_company` retiré ; `investor_overlap → "common_investor"` (nouvel angle SIGNAL_ANGLES, framing warm path factuel, template sans variable risquée — pas de « (this) » mid-sentence).
- `tamSignalsToAngleSignals(bundle, asOf)` filtre par `computedAt` + TTL locaux aux clés TAM (funding_recent/funding_crunchbase 180, hiring_intent 30, investor_overlap null). `computedAt` absent (legacy) = conservé — la purge rétroactive pénaliserait tous les TAM existants d'un coup ; les nouveaux builds datent systématiquement.

## Recall des drafts (state machine + pont d'envoi)
- `state-machine.ts` : action `recall`, transition `approved → pending_approval`, réservée au système (source morte détectée entre approbation et envoi). Tout autre état refuse — idempotent comme `expire`.
- `sequence-draft-to-outbound.ts` : après `decideDispatch`, avant tout envoi (email ET phone_task — les scripts citent aussi) : URLs des `personalizationSources` → `verifySignalUrlsBatch` (cache 7 j, ~0 trafic en régime de croisière). Au moindre `unverified` → recall + `reviewReason` listant les URLs mortes, retour `skipped: "stale_citation"`. Fail-closed assumé : un timeout transitoire renvoie en review plutôt que d'envoyer une citation potentiellement morte ; la ré-approbation re-vérifie (cache probablement chaud). `blocked_cdn` compte vérifié (LinkedIn bloque les HEAD).
- Extraction d'URLs = helper pur `lib/sequence-drafts/citations.ts` (testable sans Inngest).

## Lint §19 (sequence-generator)
- Prompt (toutes générations, bulk inclus) : trois règles ajoutées aux CRITICAL RULES — pas de trivia personnelle, funding jamais une raison nue (seulement implication de stage/budget ou félicitation accompagnée de valeur), jamais un trait statique déguisé en actualité.
- Évaluateur (boucle preview) : patterns `irrelevant_personal` à −0.4 (force l'échec < 0.7 → re-génération). Liste courte structurelle, même registre que les anti-patterns existants ; l'enforcement principal reste génératif (angles nettoyés + prompt), le lexical est le filet.
- `evaluateSequenceQuality` passe exporté pour être testable.

## Échecs
- Date invalide dans un payload → comparaison NaN = faux → signal écarté (fail-closed) pour les types à TTL ; types sans TTL inchangés.
- DB cache injoignable au verify → fallback HEAD live (déjà le comportement du module) ; HEAD en échec → unverified → recall.
