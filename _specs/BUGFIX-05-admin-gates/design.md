# Design — BUGFIX-05

## Fit dans le système
`apps/web/src/lib/auth-utils.ts` expose déjà `requireAdmin(authCtx)` qui retourne une `Response 403` ou `null`. On l'applique aux endpoints manquants. Pour les pages client, on convertit en server components ou on ajoute un check côté serveur via le layout/page server-side.

Pattern préféré : ajouter un **layout server-side** `apps/web/src/app/(dashboard)/settings/(admin)/layout.tsx` qui gate les routes admin. Cela évite de patcher chaque page.

## Approche recommandée : route group "(admin)"

Refactor :
```
settings/
  (admin)/                  ← nouveau route group
    layout.tsx             ← server component, gate admin
    evals/page.tsx         ← déplacé
    mcp/page.tsx           ← déplacé
  layout.tsx               ← layout existant (sidebar)
  page.tsx                 ← profile
  ...
```

Le route group `(admin)` n'apparaît pas dans l'URL (URLs restent `/settings/evals` et `/settings/mcp`).

`(admin)/layout.tsx` :
```tsx
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-utils";

export default async function AdminSettingsLayout({ children }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.role !== "admin") redirect("/settings");
  return <>{children}</>;
}
```

## Sidebar settings — masquer liens admin
`apps/web/src/app/(dashboard)/settings/layout.tsx` charge la sidebar. On lit `getAuthContext()` (server component), on conditionne le rendu des liens admin :
```tsx
const ctx = await getAuthContext();
const isAdmin = ctx?.role === "admin";
{isAdmin && (
  <>
    <Link href="/settings/evals">Evaluations</Link>
    <Link href="/settings/mcp">MCP Integration</Link>
  </>
)}
```

## API endpoints à patcher

Ajouter `requireAdmin(authCtx)` après `getAuthContext()` dans :
- `apps/web/src/app/api/eval/route.ts` (toutes méthodes)
- `apps/web/src/app/api/eval/datasets/route.ts` GET + POST
- `apps/web/src/app/api/eval/datasets/[id]/cases/route.ts` (toutes)
- `apps/web/src/app/api/eval/runs/route.ts` (toutes)
- `apps/web/src/app/api/eval/runs/[id]/route.ts` (toutes)
- `apps/web/src/app/api/eval/seed/route.ts`
- `apps/web/src/app/api/eval/dashboard/route.ts`
- `apps/web/src/app/api/eval/run-all/route.ts`
- `apps/web/src/app/api/mcp/keys/route.ts` GET (POST/DELETE déjà gated)

Helper réutilisé partout :
```ts
const authCtx = await getAuthContext();
if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
const adminCheck = requireAdmin(authCtx);
if (adminCheck) return adminCheck;
```

## Data flow
1. Membre standard → `/settings/evals` → server layout `(admin)/layout.tsx` → redirect `/settings` (HTTP 307 server-side, pas de flash UI).
2. Membre standard → `fetch /api/eval/datasets` → `requireAdmin` → 403.
3. Sidebar settings ne contient pas le lien si non-admin.

## Failure handling
- `getAuthContext()` retourne `null` (session expirée) → redirect `/sign-in`
- `role` indéfini ou `member` → redirect `/settings`
- Race : si user démoté, sa session JWT garde `role="admin"` jusqu'à refresh. Acceptable (on documente). Solution durable = refresh JWT à chaque request, hors scope.

## Security
- Server-side gate (layout async) → impossible de bypass via navigation client-side.
- API gates redondantes = défense en profondeur.
- Aucune fuite d'info : redirect vs 404 — choix de redirect (UX) au lieu de 404 (security through obscurity). Le lien manquant dans sidebar suffit comme camouflage.
