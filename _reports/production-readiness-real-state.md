# Etat REEL production-readiness — verifie cette session

Date: 2026-05-06
Commande: vraie verif avec tsc, build, file system, db state

---

## Ce que les tests prouvaient (fausse confiance)

1688 tests pass = code unitaire valide AVEC DES MOCKS.
Ne prouvait pas que le code de prod compile, build, ou tourne.

---

## Decouvertes critiques en verifiant pour de vrai

### 1. TypeScript compile : OUI
`tsc --noEmit` exit 0. Pas d'erreurs de type sur 1004 fichiers.

### 2. `next build` : ECHEC initial
Trois problemes :
- **Mon code** : `src/app/api/eval/tool-monitor/route.ts` utilisait `getServerSession` de next-auth v4. La codebase est sur next-auth v5 beta avec `withAuthRLS`. Le route que j'ai cree dans cette session **n'aurait jamais pu deployer**.
- **Fichier supprime non commit** : `src/app/icon.tsx` etait absent du filesystem alors que le layout le reference. `git checkout HEAD -- src/app/icon.tsx` pour restaurer.
- Warnings OpenTelemetry/Sentry : non bloquants.

### 3. Migrations DB : INCOHERENTE
- 41 fichiers `.sql` dans `drizzle/`
- Seulement 15 entrees dans `_journal.json`
- **26 migrations non trackees** par drizzle-kit
- Sur DB vierge : `drizzle-kit migrate` ne deploie que jusqu'a 0014 → schema incomplet → app casse
- Si `drizzle-kit generate` est lance : il va proposer une migration parasite parce que le schema TS a divergeen

Migrations non trackees : 0012 (tool_call_events), 0013 (memory_scope), 0014 (tree_fork), 0015 (comments), 0016-0037.

### 4. RLS PostgreSQL : INCOMPLETE
- 46 tables ont une colonne `tenantId`
- Seules 4 tables ont une policy RLS : contacts, companies, deals, activities (migration 0028)
- 42 tables (notes, tasks, sequences, outboundEmails, chatThreads, agentTraces, knowledgeEntries, etc.) n'ont AUCUNE protection au niveau DB
- Si une route oublie `WHERE tenant_id = X`, fuite cross-tenant possible sur 42 tables

### 5. Inngest workers : ZERO RLS context
- 49 fichiers Inngest workers
- AUCUN n'appelle `setTenantId()`
- Helper `withTenantRLS` existe dans `src/db/rls.ts` mais n'est utilise nulle part dans les workers
- Les workers tournent probablement avec un user DB qui a `BYPASSRLS` (sinon les queries retourneraient 0 lignes)
- Si l'user DB n'a pas BYPASSRLS, les workers ne voient aucune donnee

### 6. Serveur dev `next dev` : INSTABLE
- Au demarrage : 200 OK
- Apres modifications de code par sub-agents : 500 sur tout
- Conflit avec `next build` qui ecrit dans `.next/` en parallele
- ENOENT sur `_buildManifest.js.tmp.*` 

### 7. Imports stales dans le code prod : AUCUN
Bonne nouvelle : grep sur 18 patterns d'anciens chemins → 0 match dans `src/`.
Le refactor 5ddbccd a bien nettoye le code de prod. Seuls les TESTS pointaient vers les anciens chemins (fixe cette session).

---

## Resume des bloquants reels

| Bloquant | Severite | Effort fix |
|---|---|---|
| Build prod casse (mon code + icon.tsx) | CRITIQUE | Fixe (5 min) |
| Migrations DB non synchronisees | CRITIQUE | 1-2h (regenerer journal proprement) |
| RLS sur 42 tables manquante | HAUTE | 2h (script SQL pour ajouter les policies) |
| Workers Inngest sans tenant context | HAUTE | 4h (auditer chaque worker, ajouter `withTenantRLS`) |
| Pas de CI qui bloque les regressions | MOYENNE | 1h (config GitHub Actions) |
| Pas de smoke test e2e reel | MOYENNE | 2h (Playwright signup → chat → email) |

---

## Ce qui reste vrai

- TypeScript types coherents
- 1688 tests unitaires passent
- Code de prod sans imports stales
- 29 skills compilent et s'importent
- Quality gate dans skill runner fonctionnel
- Eval infra complete

## Ce qui n'est pas verifie

- Que le build prod reussit apres mes fixes (en cours)
- Que les 26 migrations non trackees sont effectivement en DB sur l'environnement actuel
- Que les workers ont effectivement BYPASSRLS sur leur user DB
- Qu'un signup utilisateur fonctionne end-to-end
- Que Apollo API repond avec la cle de prod
- Qu'un email peut etre envoye via le pipeline complet
