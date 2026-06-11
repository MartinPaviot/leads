# OUT-02 + TAM-06 — Intégrité des signaux (decay, taxonomie, re-vérification, §19)

**Source**: `_specs/BACKLOG-2026-06-12-tam-outbound.md` rangs 1-2 ; audit `_research/monaco-sam-blond-*.md` (F3, deltas expert 1-2).
**Problème**: le levier signal existe et fuit — signaux fossiles scorés et cités, `yc_company` (trait) servi comme actualité, `investor_overlap` mappé sur l'angle funding (fabrication : « With your recent raise… » pour une boîte qui n'a pas levé), citations d'URL vérifiées à la génération mais pas à l'envoi, personnalisation cosmétique non bloquée.

## User story
En tant que founder, les messages et les scores ne s'appuient que sur des signaux frais, réels et pertinents pour le destinataire ; une citation morte ne part jamais ; un trait statique n'est jamais déguisé en actualité.

## Critères d'acceptation (EARS)
1. WHEN un signal dépasse son âge maximal (hiring 30 j, tech_stack_change 90 j, leadership_change 120 j, funding/funding_crunchbase 180 j ; investor_overlap sans expiration — fait durable, pas un moment), THE SYSTEM SHALL l'exclure du bonus de scoring live ET des angles d'ouverture.
2. WHEN un deal est clos (won/lost), THE SYSTEM SHALL n'attribuer que les signaux encore frais À LA CRÉATION DU DEAL (fenêtre `firedAt ≥ deal.createdAt − TTL`) — un cycle long ne perd pas son crédit, un fossile n'en gagne pas.
3. WHEN un draft approuvé arrive au pont d'envoi avec des sources de personnalisation à URL, THE SYSTEM SHALL re-vérifier chaque URL (cache 7 j) ; IF au moins une source est invérifiable, THEN le draft SHALL revenir en `pending_approval` (action `recall` du state machine) avec la raison, et rien ne part.
4. THE SYSTEM SHALL ne plus jamais mapper `yc_company` vers un angle d'outreach (trait ≠ moment) ; `investor_overlap` SHALL avoir son propre angle « common investor » (warm path), jamais l'angle funding.
5. WHEN un payload tamSignals porte `computedAt` périmé pour son type, THE SYSTEM SHALL l'ignorer dans les angles ; payload legacy sans `computedAt` = toléré (pas de purge rétroactive).
6. WHEN le générateur évalue un draft contenant une personnalisation cosmétique (sport, ville d'origine, alma mater), THE SYSTEM SHALL la classer bloquante (échec d'évaluation, re-génération) ; le prompt SHALL interdire trivia personnelle, funding-comme-raison-nue et traits statiques déguisés en actualité.

## Hors périmètre (PRs suivants, notés au backlog)
- Calibration sample-first des signaux custom (touche API + UI settings).
- `yc_company` comme champ de catalogue ICP (plomberie catalogue source "signal").
- Datation des `properties.signals` (writer-side) pour filtrer la fraîcheur dans prospect-context.

## Correction de doc
La v2 de l'audit pointait `lib/coaching/freshness-check.ts` comme module dormant à câbler : faux — il concerne la fraîcheur des transcripts Recall.ai. La fraîcheur des signaux vit dans `lib/scoring/signal-detectors.ts` (nouveau).
