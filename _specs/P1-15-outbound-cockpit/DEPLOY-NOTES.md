MIGRATIONS (couplage déploiement) :
- ALTER TABLE sequence_drafts ADD COLUMN quality_score real (nullable) + CREATE INDEX sequence_drafts_quality_idx ON (tenant_id, status, quality_score). Le journal drizzle s'arrête à idx 12 et db:migrate est désactivé (cf. CLAUDE.md + mémoire feedback_always-apply-migrations) : appliquer en dev via `pnpm db:push` sur leadsens-localdev, et via le runner custom `db:migrate:apply` (SQL idempotent : ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) sur la DB dev ; NE PAS auto-migrer la prod depuis une branche non mergée. Vérifier prod (leadsens-dev) sépare du schéma drizzle (cf. mémoire reference_prod-schema-behind-drizzle) : la lecture qualityScore sur une prod sans la colonne 500erait au runtime — re-vérifier live après migration.

DATASETS :
- Aucun nouveau dataset. La file est une vue read-only sur sequence_drafts + outbound_emails + tasks (tables existantes).
- qualityScore : nouveaux drafts scorés à la génération ; drafts pré-migration restent null → traités via sentinelle 0.5 côté endpoint (pas de backfill requis pour MVP).

COUPLAGE / SÉQUENÇAGE :
- Dépend de P0-3 (gradeSequenceQuality / sequence-quality.ts, DONE et mergé) — réutilisé tel quel.
- Dépend de P1-11 (primitives citations ai-ui : CitedClaim/SourceLink, présentes) pour le rendu du pane ; le PEUPLEMENT réel des citations (T2) doit landera AVANT/AVEC T8 sinon le pane n'a rien à citer.
- /sequences/review reste la file canonique : T6 extrait les network bodies partagés pour éviter le drift ; tout changement de contrat des endpoints /api/sequences/drafts/* impacte les DEUX surfaces.
- Ordre de merge recommandé : T1-T3 (data) d'abord (déployables seuls, rétro-compatibles car qualityScore nullable + exposé optionnel), puis le front T4-T11.
- FEATURE FLAG suggéré pour l'entrée nav /outbound-mode tant que l'E2E (T11) n'est pas PASS, afin de ne pas exposer un cockpit partiel en prod.