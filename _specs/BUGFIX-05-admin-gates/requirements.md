# BUGFIX-05 — Admin gates manquantes

## User story
**As** un workspace owner souhaitant restreindre l'accès à des outils sensibles (eval datasets, MCP API keys)
**Je veux** que seuls les utilisateurs avec `role = "admin"` voient ces panneaux et puissent appeler les endpoints associés
**Pour** éviter qu'un membre standard ne consulte des prompts d'évaluation, ne fasse fuiter des clés MCP, ou n'altère des données sensibles.

## Bug actuel
- `apps/web/src/app/(dashboard)/settings/evals/page.tsx` est `"use client"` sans aucune vérification de rôle. Tout user authentifié voit le dashboard d'évals.
- `apps/web/src/app/(dashboard)/settings/mcp/page.tsx` idem : pas de gate UI.
- `apps/web/src/app/api/eval/datasets/route.ts:6-21` — `GET` ne fait que `getAuthContext()`, **pas de `requireAdmin()`**. Idem pour `cases`, `runs`, `seed`, `dashboard`, `run-all` à vérifier.
- `apps/web/src/app/api/mcp/keys/route.ts` : `POST` et `DELETE` ont `requireAdmin()` ✅ mais `GET` ne l'a pas → un membre standard peut lister les clés (prefix masqué, mais leur existence et nom révélés).

## Critères d'acceptation

### AC1 — Page evals : redirect non-admin
- **GIVEN** je suis logged in avec `role = "member"`
- **WHEN** je navigue vers `/settings/evals`
- **THEN** je suis redirigé vers `/settings` (ou la sidebar n'affiche pas le lien)
- **AND** la page n'est jamais rendue dans le DOM

### AC2 — Page MCP : redirect non-admin
- Idem AC1 pour `/settings/mcp`

### AC3 — API eval protégée
- **GIVEN** un membre standard appelle `GET /api/eval/datasets` avec sa session
- **WHEN** la requête arrive
- **THEN** réponse `403 { error: "Admin access required" }`
- Idem pour : `/api/eval/datasets/[id]/cases`, `/api/eval/runs`, `/api/eval/runs/[id]`, `/api/eval/seed`, `/api/eval/dashboard`, `/api/eval/run-all`, `/api/eval`

### AC4 — API MCP keys GET protégée
- **GIVEN** un membre standard appelle `GET /api/mcp/keys`
- **WHEN** la requête arrive
- **THEN** réponse `403 { error: "Admin access required" }`

### AC5 — Sidebar settings cache les liens admin
- **GIVEN** je suis `role = "member"`
- **WHEN** la sidebar settings se rend
- **THEN** les liens "Evaluations" et "MCP Integration" ne sont pas affichés

### AC6 — Admin garde l'accès complet
- **GIVEN** je suis `role = "admin"`
- **WHEN** je navigue vers `/settings/evals` ou `/settings/mcp`
- **THEN** la page se rend normalement, toutes les actions API fonctionnent

## Edge cases
- Session sans `role` (legacy users) → traités comme `member` (défaut existant dans `getAuthContext`)
- Race condition : utilisateur démoté pendant qu'il a la page ouverte → ses prochaines requêtes API renvoient 403, l'UI doit afficher un état d'erreur correct (toast + redirect)
- Membre qui devine l'URL `/api/eval/datasets` directement via curl avec session valide → 403

## Steps d'évaluation
1. Créer 2 users dans la même tenant : un `admin`, un `member`
2. Avec admin : naviguer `/settings/evals` → page rendue, lister datasets via UI ✓
3. Logout, login member : naviguer `/settings/evals` → redirect vers `/settings`
4. Avec member : `curl -H "Cookie: <member-session>" http://localhost:3000/api/eval/datasets` → 403
5. Avec member : `curl ... /api/mcp/keys` → 403
6. Vérifier que la sidebar settings du member n'affiche pas Evaluations / MCP
