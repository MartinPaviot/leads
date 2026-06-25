# Spec 37 — daily-autopilot : notes de déploiement

## Flags & réglages

| Flag / réglage | Portée | Défaut | Effet |
|---|---|---|---|
| `DAILY_AUTOPILOT_ENABLED` | env (déploiement) | **OFF** | Master switch du cron `daily-autopilot` (`inngest/daily-autopilot.ts`). OFF → le cron no-op (`{ enabled: false }`), aucune lecture DB, aucun enroll. ON → le cron tourne en semaine 07:00 UTC pour TOUS les tenants. À activer seulement après l'éval B5.2. |
| `dailyAutopilotBudget` | réglage tenant (`tenants.settings`) | **100** | Plafond d'enrôlements/jour pour ce tenant (le cadran « 100 mails/jour/client » à la Monaco). C'est un *plafond*, pas un plancher : `resolveAutopilotBudget` le rabaisse à la capacité warmup-safe du pool managé. Mettre **0** met l'autopilot en pause pour ce tenant sans toucher au flag global. Valeur non-finie/négative → fallback 100 (`coerceConfigBudget`). |
| `RESEARCH_AGENT_ENABLED` | env (déploiement) | OFF | Amont (spec P1-9). Quand le cron appelle `prepareProspect` avec `forceRefresh`, la fraîcheur du brief dépend de ce flag. OFF → `fetchAllSources` déterministe (régression zéro). Indépendant de l'autopilot : l'autopilot tourne sans, sur le dernier brief en cache. |
| `COPY_ENGINE_PRIMARY` | env (déploiement) | (existant) | Sélecteur du moteur de copie consommé par `generateCopyMessage` (via `prepareProspect`). Inchangé par spec 37 — l'autopilot réutilise le moteur tel quel ; aucune nouvelle valeur introduite. |

## Migration DB

**Aucune.** `dailyAutopilotBudget` vit dans le JSONB `tenants.settings` (pas de colonne, pas de migration drizzle). `DEFAULTS` (`lib/config/tenant-settings.ts`) fusionne `100` à chaque lecture, donc les tenants antérieurs au champ reçoivent le défaut sans backfill. Toutes les autres tables (`sequence_enrollments`, `connected_mailboxes`, `companies.priority_score`, `email_optouts`, `agent_actions`) préexistent.

## Couplage de déploiement

1. **Ordre d'activation** : laisser `DAILY_AUTOPILOT_ENABLED=OFF` jusqu'à B5.2 (e2e flag-gated) + B6.1 (borne de coût) verts. Le cron est enregistré dans `api/inngest/route.ts` mais inerte tant que le flag est OFF.
2. **Coût LLM** : chaque prospect préparé déclenche au plus 1 appel copie (+1 refresh de brief si `forceRefresh`, OFF par défaut côté autopilot pour le coût). Borne attendue ≤ `budget.email` appels/tenant/jour. `enforceLlmBudget` (`llmMonthlyCostCapUsd`) reste le garde-fou dur — vérifier avant d'activer à grande échelle. Télémétrie : B6.1.
3. **Gate transport intact** : chaque step enrôlé repasse par `evaluateSend` à l'envoi (opt-out → suppression 22 → email-status 17 → lawful-basis 33 → targeting 35 → sending-identity). L'autopilot n'ouvre aucune dérogation — il remplit la file, le gate décide de l'envoi.
4. **`DAILY_AUTOPILOT_ENABLED` à ajouter dans la config env Vercel** avant activation. `dailyAutopilotBudget` se règle par tenant via `updateTenantSettings` (pas d'UI dédiée pour l'instant — édition settings).
