# Template — KIRO tasks.md

> Sauvegarder en `.kiro/specs/FINDING-XXX/tasks.md`.
> Tâches **atomiques, ordonnées, ≤2h chacune, eval-first**. Une task = un commit.

```markdown
# Tasks — FINDING-XXX <titre>

> Lié à : `.kiro/specs/FINDING-XXX/{requirements.md,design.md}`
> Ordre d'exécution : strictement séquentiel sauf indication explicite.
> Convention : chaque task a une vérification objective (test à passer ou commande à exécuter).

## Phase 1 — Eval-first (les tests qui doivent échouer AVANT la fix)

- [ ] **T1. Créer la suite golden `evals/golden/FINDING-XXX/`**
  - Action : créer les 4 fichiers YAML listés dans design.md §6.
  - Vérification : `pnpm eval:run golden/FINDING-XXX/` → **FAIL attendu** (la fix n'est pas encore là).
  - Référence requirement : AC-1, AC-3
  - Estimation : 1h30

- [ ] **T2. Créer la suite adversarial `evals/adversarial/FINDING-XXX/`**
  - Action : créer les fichiers de test STRIDE-A listés dans design.md §7.
  - Vérification : `pnpm eval:run adversarial/FINDING-XXX/` → **FAIL attendu** (sauf si le système était déjà robuste pour ce vecteur).
  - Référence requirement : NFR adversarial robustness
  - Estimation : 1h

- [ ] **T3. Reproduire le finding manuellement avec une commande exécutable**
  - Action : créer `scripts/reproduce-FINDING-XXX.sh` qui démontre le bug en <30s.
  - Vérification : `bash scripts/reproduce-FINDING-XXX.sh` → output qui démontre le problème.
  - Pourquoi : sert de smoke test rapide pendant le dev, et de proof à inclure dans la PR.
  - Estimation : 30min

## Phase 2 — Implémentation cœur

- [ ] **T4. Migration Prisma — ajouter table `ToolCallTrace` et colonnes sur `AgentRun`**
  - Action : éditer `prisma/schema.prisma` selon design.md §3.
  - Vérification : `pnpm prisma migrate dev --name finding-xxx` succès, schema synchronized.
  - Référence requirement : AC-2 (observability persistante)
  - Estimation : 30min

- [ ] **T5. Créer `lib/tools/wrapper.ts` — primitive de retry/circuit breaker**
  - Action : implémenter selon design.md §3 (interfaces) et §4 (décisions).
  - Vérification : tests unitaires dans `lib/tools/wrapper.test.ts` couvrent : success path, transient retry, exhaustion, circuit open/close. Tous passent.
  - Référence requirement : AC-1, AC-3
  - Estimation : 2h

- [ ] **T6. Refactorer `lib/tools/apollo.ts` pour utiliser le wrapper**
  - Action : wrapper l'appel HTTP existant dans `withToolWrapper(...)`.
  - Vérification : `pnpm typecheck`, `pnpm test lib/tools/apollo.test.ts`, et `bash scripts/reproduce-FINDING-XXX.sh` → comportement amélioré.
  - Estimation : 1h

- [ ] **T7. Instrumenter les spans selon design.md §5**
  - Action : ajouter les appels `tracer.startSpan('tool.apollo.call', ...)` aux endroits identifiés.
  - Vérification : run un flow → vérifier dans Langfuse (ou outil utilisé) que les spans apparaissent avec les attributs attendus.
  - Référence requirement : NFR observability
  - Estimation : 1h30

- [ ] **T8. Implémenter le feature flag `tool_wrapper_v2`**
  - Action : utiliser le système de flags existant (probablement Vercel Edge Config ou similar).
  - Vérification : flag OFF → ancien comportement ; flag ON → nouveau wrapper utilisé.
  - Référence requirement : design.md §9 Phase 1
  - Estimation : 30min

## Phase 3 — Validation des evals

- [ ] **T9. Re-run `evals/golden/FINDING-XXX/` avec flag ON**
  - Vérification : `pnpm eval:run golden/FINDING-XXX/ --flag tool_wrapper_v2=on` → **PASS attendu sur tous**.
  - Si FAIL : retour à T5/T6/T7.
  - Estimation : 15min

- [ ] **T10. Re-run `evals/adversarial/FINDING-XXX/` avec flag ON**
  - Vérification : tous PASS.
  - Estimation : 15min

- [ ] **T11. Vérifier non-régression sur les goldens existants**
  - Action : `pnpm eval:run golden/ --flag tool_wrapper_v2=on`
  - Vérification : aucun golden existant ne dégrade. Si un eval existant casse, investiguer si c'est un faux positif (intentionnel) ou une vraie régression (bloquant).
  - Estimation : 30min (le run lui-même peut prendre plus, mais l'analyse 30min)

## Phase 4 — Chaos drill automation (CI nightly)

- [ ] **T12. Convertir DRILL-1 en test CI**
  - Action : créer `.github/workflows/nightly-chaos.yml` selon design.md §8.
  - Vérification : workflow exécuté localement avec `act` ou en push sur branche dédiée → succès.
  - Estimation : 1h

- [ ] **T13. Définir SLO et alerting sur le drill**
  - Action : ajouter dans le runbook que `time-to-recovery > 30s` ou `runs perdus > 0` déclenche alerte.
  - Vérification : alerte testée manuellement.
  - Estimation : 30min

## Phase 5 — Rollout

- [ ] **T14. Activer flag à 5% (canary Free tier)**
  - Action : modifier le flag dans Edge Config.
  - Vérification : dashboard Langfuse montre que ~5% des runs utilisent le nouveau code path. Aucun pic d'erreurs sur 24h.
  - Estimation : 15min + 24h d'observation

- [ ] **T15. Rollout 25% → 50% → 100% sur 1 semaine**
  - Action : incrémenter flag par paliers.
  - Vérification à chaque palier : métriques `tool_call_total{status="error"}` ne dépassent pas baseline +20%.
  - Estimation : 7 jours d'observation

- [ ] **T16. Retrait du feature flag (code legacy supprimé)**
  - Action : remplacer toutes les conditions `if (flag.tool_wrapper_v2)` par le nouveau code en dur. Supprimer l'ancien.
  - Vérification : `pnpm typecheck`, `pnpm test`, deploy → succès.
  - Pré-requis : 2 semaines à 100% sans incident.
  - Estimation : 1h

## Phase 6 — Documentation et postmortem

- [ ] **T17. Mettre à jour `RUNBOOK.md` avec la nouvelle stratégie de retry**
  - Vérification : section "Tool failure handling" présente et claire.
  - Estimation : 30min

- [ ] **T18. Ajouter entrée dans `CHANGELOG.md`**
  - Format : `### [Fixed] FINDING-XXX — Tool retry resilience (DD a16z prep)`
  - Estimation : 5min

- [ ] **T19. (Si applicable) Postmortem rétroactif**
  - Si le finding a déjà causé un incident en prod : rédiger postmortem dans `postmortems/YYYY-MM-DD-FINDING-XXX.md`.
  - Estimation : 1h si applicable

## Acceptance gate global

Le finding est marqué `RESOLVED` dans AUDIT-FINDINGS.md ssi :
- [ ] T1 → T19 toutes cochées
- [ ] Tous les acceptance criteria de requirements.md vérifiés
- [ ] Tous les NFR mesurés et conformes
- [ ] Au moins 1 PR review par une personne autre que l'auteur (et idéalement Ombeline ou Martin pour les P0)
- [ ] 14 jours en prod à 100% sans incident lié

## Gestion des dépendances

Si une task dépend d'un autre FINDING-YYY (ex: ce wrapper réutilise le système de tracing introduit par FINDING-YYY) :
- noter explicitement `Dépend de : FINDING-YYY (T7)`.
- ne pas commencer cette task tant que FINDING-YYY-T7 n'est pas mergée.
```

## Bonnes pratiques

- **Eval-first ≠ TDD strict**. On commence par le test agentique, pas le test unitaire — bien que les unit tests viennent aussi.
- **Une task = un commit**. Si une task a deux PR, c'est qu'il fallait la splitter.
- **Vérification objective obligatoire**. "Ça devrait marcher" n'est pas une vérification.
- **Estimation dans la task**. Permet de réviser la planning après 2-3 tasks.
- **Rollout progressif systématique**. Pas de big bang sur un fix DD-critical.
- **Le retrait du flag est une task**. Sinon le flag pourrit dans le code 6 mois.
