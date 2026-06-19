# Tasks — OUT-02 signal integrity

1. [x] Spec (ce dossier).
2. [x] `signal-detectors.ts`: SIGNAL_TTL_DAYS + SIGNAL_CATEGORY + isFreshAt + detectActiveSignals(props, asOf) — verify: tests fraîcheur par type + bornes.
3. [x] `signal-outcomes.ts`: recordDealOutcome attribue via detectActiveSignals(props, deal.createdAt) — verify: test fenêtre création (sémantique asOf testée côté détecteurs).
4. [x] `outbound-methodologies.ts`: angle common_investor + priorité pickBestSignal — verify: test pick (warm path > funding).
5. [x] `signal-opener.ts`: map nettoyée (yc_company out, investor_overlap→common_investor) + filtre computedAt/TTL — verify: tests opener mis à jour (7 cas fraîcheur/mapping).
6. [x] `state-machine.ts`: action recall (approved→pending_approval) — verify: tests transitions (matrice complète).
7. [x] `lib/sequence-drafts/citations.ts` (pur) + re-vérification dans `sequence-draft-to-outbound.ts` — verify: tests citations (collect + gate fail-closed) ; flux bridge inchangé pour drafts sans URL (compat tests d'intégration existants confirmée).
8. [x] `sequence-generator.ts`: règles §19 prompt + patterns bloquants + export evaluateSequenceQuality — verify: tests lint (6 cas dont anti-faux-positif "go beyond").
9. [x] vitest ciblé 9 fichiers / 114 tests verts + tsc exit 0.
10. [ ] Commit + PR (pas de merge auto: main = prod).
