# Tasks — BUGFIX-05

## T1. Créer le route group `(admin)` et déplacer evals + mcp
- **Action :**
  - `mkdir apps/web/src/app/(dashboard)/settings/(admin)`
  - Créer `apps/web/src/app/(dashboard)/settings/(admin)/layout.tsx` (server component avec redirect non-admin)
  - Déplacer `settings/evals/page.tsx` → `settings/(admin)/evals/page.tsx`
  - Déplacer `settings/mcp/page.tsx` → `settings/(admin)/mcp/page.tsx`
- **Verify :** `/settings/evals` et `/settings/mcp` toujours accessibles côté admin (URL inchangées). Member redirigé vers `/settings`.
- **Test :** Test e2e Playwright `admin-gates-pages.spec.ts` : login admin → /settings/evals OK ; login member → /settings/evals → /settings.

## T2. Patcher la sidebar settings
- **Action :** `apps/web/src/app/(dashboard)/settings/layout.tsx` — convertir en server component (si pas déjà), lire `getAuthContext()`, conditionner rendu des liens "Evaluations" et "MCP Integration" sur `role === "admin"`.
- **Verify :** Visuellement : login member → sidebar n'affiche plus ces 2 liens. Login admin → toujours affichés.
- **Test :** Snapshot test ou e2e check.

## T3. Ajouter `requireAdmin` aux endpoints `/api/eval/*`
- **Action :** Pour chacun de ces fichiers, ajouter le bloc gate après `getAuthContext()` :
  - `apps/web/src/app/api/eval/route.ts`
  - `apps/web/src/app/api/eval/datasets/route.ts` (GET + POST)
  - `apps/web/src/app/api/eval/datasets/[id]/cases/route.ts`
  - `apps/web/src/app/api/eval/runs/route.ts`
  - `apps/web/src/app/api/eval/runs/[id]/route.ts`
  - `apps/web/src/app/api/eval/seed/route.ts`
  - `apps/web/src/app/api/eval/dashboard/route.ts`
  - `apps/web/src/app/api/eval/run-all/route.ts`
  ```ts
  import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
  // ...
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  ```
- **Verify :** `curl -H "Cookie: <member-session>" /api/eval/datasets` → 403 ; admin → 200.
- **Test :** Vitest sur 1-2 routes (datasets + runs) couvrant 401, 403, 200.

## T4. Patcher `GET /api/mcp/keys`
- **Action :** Ajouter `requireAdmin` dans `apps/web/src/app/api/mcp/keys/route.ts:21-42` (handler GET).
- **Verify :** Member → 403, admin → 200 avec `{ keys: [...] }`.
- **Test :** Vitest sur cette route — 401, 403, 200.

## T5. Ajouter test e2e global "admin-only"
- **Action :** `apps/web/tests/e2e/admin-only-routes.spec.ts` — parcours member qui essaie d'accéder à evals/mcp/eval-datasets/mcp-keys, vérifie tous les redirects/403.
- **Verify :** `pnpm playwright test admin-only-routes` passe.
- **Test :** Le test e2e lui-même.

## T6. Documentation
- **Action :** Ajouter section "Admin gates" dans `_reports/audit-deep/01-landing-admin-errors.md` indiquant que les bugs identifiés sont fixés.
- **Verify :** README `_reports` à jour.

## Ordre d'exécution
T1 → T2 (visuel) → T3 + T4 (parallélisable) → T5 → T6
