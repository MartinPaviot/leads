# Prompt — prochaine session Claude Code

Copier-coller tel quel en premier message d'une nouvelle session.

---

Je reprends où la session précédente s'est arrêtée. Lis d'abord `git log --oneline | head -20` pour voir l'état, puis ces 3 docs d'orientation (dans cet ordre) :

1. `_reports/user-journey-audit.md` — sommaire de l'audit des 13 étapes du parcours utilisateur
2. `_specs/PROD_SETUP.md` — checklist de déploiement post-Kiro (envs, migration 0008, webhooks, smoke tests)
3. `_specs/BUGFIX-XX/tasks.md` (7 dossiers) — specs Kiro pour chaque bug, avec tasks E2E non encore implémentées

## Contexte rapide

- 7 BUGFIX traités via méthode Kiro (specs + build) entre commits `b721e22` et `da15642` (14 commits au total)
- Typecheck propre : `npx tsc --noEmit -p .` → 0 erreurs
- Tests : `npx vitest run` → 264/264
- Zero silent `.catch(() => {})` dans `app/(dashboard)/**`, `components/**`, `app/api/**`, `inngest/**`, `lib/**`
- Migration Drizzle `0008_silky_rhodey.sql` ajoute `pending_invites`

## Travail restant — par priorité

### A. Tests E2E Playwright (priorité haute)
Pas de Playwright installé. Specs prêts dans :
- `_specs/BUGFIX-01-mail-calendar-endpoint/tasks.md` T3
- `_specs/BUGFIX-02-members-invite/tasks.md` T8, T9
- `_specs/BUGFIX-03-workflows-multi-action/tasks.md` T6
- `_specs/BUGFIX-04-sequences-scheduler/tasks.md` T11
- `_specs/BUGFIX-05-admin-gates/tasks.md` T1, T5
- `_specs/BUGFIX-06-silent-failures/tasks.md` T9
- `_specs/BUGFIX-07-engagement-webhooks/tasks.md` T8

Étapes : `pnpm add -D @playwright/test`, `npx playwright install chromium`, créer `apps/web/playwright.config.ts` (server start + baseURL), implémenter chaque spec. Il faut une stratégie de seed DB (fixtures + cleanup hooks).

### B. Hardening `/api/settings/mailboxes` DELETE
Le cleanup dépendant + EmailEngine remote delete sont best-effort. Si on observe des mailboxes orphelins en prod, ajouter retry + alerting Sentry. Voir commit `f875be7` pour le contexte.

### C. Audit des 13 étapes du parcours — où Martin s'était arrêté
L'audit utilisateur initial (`_reports/audit-deep/`) listait 13 phases. Martin avait demandé à poser ses **exigences étape par étape** pour chacune avant de comparer aux concurrents (Monaco, Lightfield). Les bugs critiques sont fixés ; reste à reprendre l'exercice exigences-par-étape :

| # | Étape | Couverture audit | Statut |
|---|---|---|---|
| 1 | Landing / marketing | 100 % | exigences à poser |
| 2 | Sign-up | 100 % | exigences à poser |
| 3 | Sign-in | 100 % | exigences à poser (pas de password reset !) |
| 4 | Onboarding (7 étapes) | 100 % | exigences à poser |
| 5 | Dashboard home | 80 % | exigences à poser |
| 6 | Chat | 90 % | exigences à poser |
| 7 | Accounts (TAM) | 70 % | exigences à poser |
| 8 | Contacts + SmartImport | 100 % | exigences à poser |
| 9 | Sequences (outbound) | 100 % | exigences à poser |
| 10 | Meetings | 100 % | exigences à poser |
| 11 | Opportunities | 100 % | exigences à poser |
| 12 | Settings (18 sous-pages) | 100 % | exigences à poser |
| 13 | Erreurs & edge cases | 100 % | partiellement adressé via BUGFIX-06 |

Voir `_reports/audit-deep/03c-accounts.md` pour le format de fiche par étape (état actuel / manquant / blocages / points forts).

### D. Captures Monaco / Lightfield
`_research/teardown-monaco/screenshots/` et `_research/teardown-lightfield/screenshots/` (à vérifier). Si présents : utilisables pour comparaison étape par étape. Si absents : Lightfield trial expirait 2026-04-13 (cf CLAUDE.md), donc relancer maintenant si encore valide, sinon Web search + community.

## Préférences Martin (mémoires persistantes)

- **Full autonomy on execution** : exécute jusqu'au bout sans checkpoints
- **Detail over vision** : pas de stratégie haut niveau, fournis les détails pixel-level UX
- **Verify current state** : ne cite jamais des gaps depuis specs anciennes — relis le code
- Onboarding design : ne jamais collecter de data sans consommateur downstream
- Admin features : Context Graph + Graph Evals = admin only (déjà implémenté via BUGFIX-05)
- Si Rippletide MCP est connecté, utiliser `recall()` / `get_context()` avant chaque décision

## Méthode

Pour chaque nouvelle feature ou correction : Kiro spec d'abord (`_specs/FEATURE_ID/{requirements,design,tasks}.md`), puis build, puis commit avec trailer `Co-Authored-By: Rippletide <admin@rippletide.com>`.

Pour les commits, suivre la convention vue dans le log : `type: titre court — détails sur 1 ligne max dans le titre, body multi-paragraphe expliquant les surprises trouvées et les décisions prises`.

## Démarrage suggéré

Demande à Martin **par où il veut commencer** :
- "fais tout dans l'ordre" → reprendre l'exercice exigences-par-étape (#1 Landing → #13)
- "fais les tests E2E" → installer Playwright + implémenter les 7 specs
- une étape ou bug spécifique → focus dessus

Si Martin dit juste "continue" sans contexte : enchaîne sur l'étape #1 (Landing — exigences à poser face à l'audit existant).
