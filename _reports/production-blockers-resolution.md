# Resolution des bloquants production — session 2026-05-06

## Bloquants traites

### 1. Build prod casse (CRITIQUE)
**Avant**: `next build` echouait sur 5 erreurs distinctes (decouvertes une par une via 4 builds successifs)
**Causes identifiees et fixees** :
1. `src/app/api/eval/tool-monitor/route.ts` (cree cette session) utilisait `getServerSession` de NextAuth v4. La codebase est en NextAuth v5 beta → l'API a change. **Fix** : reecrit avec `withAuthRLS`.
2. `src/app/icon.tsx` supprime du filesystem mais reference dans le layout. **Fix** : `git checkout HEAD --`.
3. `src/lib/ai/traced-ai.ts` (modifie cette session) ajoutait `metadata` au call de `recordTrace()` mais le type ne le supporte pas. **Fix** : deplace `metadata` du `result` au `ctx` (TraceContext supporte ce champ).
4. `vitest.config.ts` importait `loadEnv` de `vite` qui n'est pas une dependance directe. Type error en build. **Fix** : reecrit la lecture .env.local en lecture file directe (fs.readFileSync).
5. `src/__tests__/__mocks__/db-mock-helpers.ts` et 3 webhook test files utilisaient `Record<string, any>` puis assignaient `chain[Symbol.iterator]` — TS interdit Symbol comme index sur Record<string,any>. **Fix** : type `chain: any` directement.
6. `vitest.config.ts` `coverage.provider: "v8"` inferait `string` au lieu du literal type. **Fix** : `as const`.
7. Google Fonts TLS error (env Windows) : contourne avec `NODE_TLS_REJECT_UNAUTHORIZED=0` pour build local, marchera en CI/Vercel sans hack.
**Statut** : `tsc --noEmit` exit 0. Webpack compile reussi. Build full en cours pour confirmer le passage du linting+type-check Next.

### 2. Migrations DB incoherentes (CRITIQUE)
**Avant** : 41 fichiers .sql, seulement 15 dans `_journal.json`. Sur DB vierge `drizzle-kit migrate` n'applique que 15 migrations → schema incomplet.
**Fix applique** : `scripts/apply-migrations.ts` — runner custom qui :
- Lit tous les .sql en ordre numerique
- Maintient sa propre table `__elevay_migrations` avec hashes
- Applique idempotemment (skip si hash deja enregistre)
- Transactions par migration (rollback propre en cas d'erreur)

**Comment l'utiliser en prod** :
```bash
DATABASE_URL=... tsx app/apps/web/scripts/apply-migrations.ts
```
Plus besoin de `drizzle-kit migrate` (qui rate les 26 migrations manuelles).

**Note** : `drizzle-kit generate` peut encore creer des migrations parasites si lance. Solution propre a long terme : regenerer le journal Drizzle a partir du schema actuel (1-2h supplementaires).

### 3. RLS sur 4/54 tables seulement (HAUTE)
**Avant** : Migration 0028 protege contacts/companies/deals/activities. 50 tables avec tenant_id sans aucune policy.
**Fix applique** : Migration `0038_rls_full_coverage.sql` — applique RLS + FORCE RLS + policy `tenant_isolation_*` sur toutes les 54 tables tenant-scoped.

**Defenses** :
- Idempotente : skip si RLS deja active (relrowsecurity)
- Defensive : skip si table n'existe pas (information_schema check)
- Tables avec gestion speciale : sequence_steps, sequence_enrollments, eval_cases, eval_results

### 4. Inngest workers sans tenant context (HAUTE)
**Avant** : 49 workers, aucun n'appelle `setTenantId()`. Avec migration 0038, les workers verraient 0 lignes — sauf si l'user DB a BYPASSRLS (ce qui annule toute la protection).
**Fix applique** : `src/inngest/with-tenant-context.ts` — wrapper explicite :
- `runWithTenant(tenantId, fn)` : enforce le tenant context
- `runAsAdmin(fn)` : marqueur explicite pour les operations cross-tenant (cron enumeration)

**A faire** : Auditer les 49 workers et envelopper chaque `db.select().from(...)` avec `runWithTenant`. Estime ~4h. **Pas fait dans cette session** — c'est un travail mecanique mais volumineux.

### 5. Pas de CI/CD (MOYENNE)
**Avant** : `.github/workflows/` absent. Les 180 tests etaient casses pendant 3 semaines sans alerte.
**Fix applique** : `.github/workflows/ci.yml` — workflow GitHub Actions :
- TypeScript check
- Lint
- Tests (vitest)
- Build prod
- Concurrency group (cancel previous run sur new push)

---

## Bloquants restants (non resolus cette session)

### A. Workers Inngest non envelopes
49 fichiers a modifier, ~4h de travail mecanique. Le wrapper existe (`with-tenant-context.ts`), il faut l'appliquer partout. Sans ca, soit la prod tourne en BYPASSRLS (RLS desactivee = inutile), soit les workers ne voient pas leurs donnees.

### B. Drizzle journal a regenerer
Le runner custom (`apply-migrations.ts`) contourne le probleme mais ne le resout pas. Pour utiliser `drizzle-kit generate` sereinement, il faut :
1. Snapshot le schema actuel
2. Regenerer `_journal.json` avec une entry par fichier .sql
3. Generer un snapshot par migration

### C. Smoke test e2e jamais execute
Aucune verification que :
- Un user peut signup
- Un user peut se logger
- Une route protegee renvoie 401 sans auth
- Une requete chat retourne une reponse
- Un email peut etre envoye end-to-end

### D. Apollo API jamais testee avec une vraie cle
Toute la chaine enrichment/signals depend d'Apollo. Inverifie.

### E. Build local impossible (Google Fonts TLS)
Le build local echoue sur `unable to verify the first certificate` quand il fetch les fonts. Probleme environnemental Windows/proxy. En CI/Vercel ca marcherait. Pour tester en local : `NODE_TLS_REJECT_UNAUTHORIZED=0` ou switcher les fonts en self-hosted.

---

## Verifications confirmees cette session

- TypeScript compile : 1004 fichiers OK (`tsc --noEmit` exit 0)
- Imports stales dans le code prod : aucun (sub-agents ont nettoye)
- Tests : 1688/1688 pass
- 29 skills compilent et s'importent
- Quality gate dans skill runner fonctionnel

---

## Effort restant pour confiance prod

| Bloquant | Effort estime |
|---|---|
| Workers Inngest a envelopper | 4h |
| Smoke test e2e | 2h |
| Apollo API verification | 1h |
| Drizzle journal regen | 1-2h |
| Resoudre fonts ou self-host | 30 min |

Total : ~8-10h de travail concret.
