# Conducteur séquence : V2 (spec 25) vs legacy — comparaison + merge
Date: 2026-06-24.

## Chemins
- **Legacy** `inngest/functions.ts:496-830` `sendSequenceStep` — event `sequence/step-due`,
  Inngest retries=3 + dead-letter, chaque substep en `step.run` (durable/resumable).
- **V2** `lib/sequence/db-conductor.ts` `tickEnrollmentV2` — moteur pur `advance()` sur le
  schéma live, derrière `SEQUENCE_ENGINE_V2` (OFF). `functions.ts:512-513` route vers V2 si flag on.

## V2 supérieur (gating)
| Gate | V2 | Legacy |
|------|----|--------|
| Suppression spec-22 (domaine/account/type) | OUI (db-conductor:154-158) | NON (seulement opt-out, :695) |
| Éligibilité email spec-17 (skip invalid) | OUI (:153) | NON |
| Deliverability guard spec-27 | OUI (:209) | NON |
| Moteur pur testé (delay/idempotence/terminal) | OUI (advance) | inline impératif |

## Legacy supérieur (effets de bord durcis) — AVANT le merge
| Effet | Legacy | V2 (avant) |
|-------|--------|------------|
| Undo window CLE-11 | enqueueOutbound (:720) | insert brut "queued" → BYPASS |
| Observabilité fallback perso | log + tag `[fallback:]` (:734) | silencieux (:185) |
| trackPipeline (analytics) | OUI (:741) | NON |
| Activity `sequence_step_sent` (audit) | OUI (:756) | NON |
| Skip week-end | addBusinessDays (:801) | delayMs brut (samedi possible) |

## Le merge livré (PR feat/sequence-v2-parity)
On NE choisit pas un chemin. Le gating de V2 est strictement supérieur + son moteur est le
meilleur cœur ; la seule régression était les effets de bord de ses ports. Donc on fait passer
les ports de V2 par les MÊMES seams prod que legacy :

1. `sendEmail` → `enqueueOutbound` (restaure l'undo window) au lieu de l'insert brut.
2. `pullVariant` → capture `lastFallbackReason` (missing_context / llm_threw) ; `sendEmail` tague
   l'outbound `[fallback:...]` (visibilité review-queue).
3. `sendEmail` → `trackPipeline(email_queued)` + activity `sequence_step_sent` (best-effort).
4. Planification → `businessAwareDueAt(now, dueAt, skipWeekends)` (helper pur testé) + nextStepAt
   null sur terminal.
5. Gating riche 17/22/27 de V2 conservé.

**Résultat** : un seul chemin = gating V2 + moteur pur + undo/observabilité/audit/week-end de legacy.
Flipper `SEQUENCE_ENGINE_V2` devient un upgrade SANS régression. Le corps legacy `sendSequenceStep`
pourra être supprimé après validation canary. Flag reste OFF (zéro impact prod tant que non flippé).

## Reste à faire avant cutover (recommandé)
- Canary 1 tenant (flip le flag pour un tenant de test) → comparer outbound V2 vs legacy.
- Puis flip global + suppression du corps legacy (≈ -300 lignes).
