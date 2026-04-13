# BUGFIX-06 — Silent failures côté UI : `.catch(() => {})` partout

## User story
**As** un user du dashboard
**Je veux** être informé clairement quand une action échoue (toast, badge, message)
**Pour** ne pas croire qu'une opération a réussi alors qu'elle a silencieusement planté.

## Bug actuel
18 fichiers UI minimum utilisent le pattern `.catch(() => {})` ou `try { ... } catch { /* */ }` :
- `accounts/page.tsx`, `sequences/page.tsx`, `sequences/[id]/page.tsx`, `contacts/page.tsx`, `meetings/page.tsx`, `meetings/[id]/page.tsx`, `opportunities/page.tsx`
- `components/campaign-wizard.tsx`, `live-extraction.tsx`, `email-composer.tsx`
- `settings/recording/page.tsx`, `settings/mail-calendar/page.tsx`, `settings/notifications/page.tsx`
- `pricing/page.tsx`, `notes/page.tsx`, `tasks/page.tsx`
- `inngest/campaign-functions.ts`, `api/settings/mailboxes/route.ts`

L'utilisateur ne sait jamais quand un fetch échoue. Cas critique : import contacts qui plante silencieusement → user voit liste vide et croit que rien n'a été importé.

## Critères d'acceptation

### AC1 — Helper `safeFetch` centralisé
- **GIVEN** un dev veut faire un fetch
- **WHEN** il importe `safeFetch` depuis `@/lib/safe-fetch`
- **THEN** il a une API typée `safeFetch<T>(url, options?, errorMsg?): Promise<{ data: T | null, error: string | null }>`
- **AND** en cas d'erreur réseau ou status >= 400, `error` est rempli + `toast.error(errorMsg ?? "Something went wrong")` est appelé automatiquement

### AC2 — Toast affiché sur échec
- **GIVEN** une page UI utilisant `safeFetch`
- **WHEN** le fetch échoue (500, network)
- **THEN** un toast rouge apparaît avec message clair
- **AND** la fonction retourne `{ data: null, error: "<message>" }`
- **AND** l'UI ne crash pas

### AC3 — Tous les `.catch(() => {})` UI remplacés
- **GIVEN** la codebase post-fix
- **WHEN** je grep `.catch(() => {})` ou `catch \{ \/\* \*\/ \}` dans `apps/web/src/app/(dashboard)` et `apps/web/src/components`
- **THEN** 0 résultat (sauf justification commentée explicite)

### AC4 — Logger backend pour les routes API silent
- **GIVEN** une route API qui catch silently (`apps/web/src/app/api/**`)
- **WHEN** une exception arrive
- **THEN** elle est loggée via `logger.error(message, {...meta})` avant retour 500
- **AND** le retour 500 contient un `errorId` que le user peut donner au support

### AC5 — Pattern documenté
- **GIVEN** un nouveau dev arrive dans la codebase
- **WHEN** il lit `apps/web/src/lib/safe-fetch.ts` ou `CONTRIBUTING.md`
- **THEN** il sait quoi utiliser (et quand un silent catch est légitime — ex : analytics fire-and-forget)

## Edge cases
- Fetch volontairement fire-and-forget (ex: PostHog tracking) → garder `.catch(noop)` MAIS commenté `// fire-and-forget telemetry, intentional`
- Fetch dans un useEffect cleanup → cleanup-safe (no setState après unmount)
- Erreurs déjà gérées par UI dédiée (ex: form errors `setError(...)`) → ne pas double toast
- Long polling (sequences/status, chat streaming) → suppression de toast sur retry transitoire (debounce)

## Steps d'évaluation
1. Lancer le dev server, débrancher le réseau
2. Cliquer sur "Enrich all" dans accounts → toast "Failed to enrich"
3. Reconnecter, retry → succès, toast "Enriched X accounts"
4. Vérifier en grep : 0 `.catch(() => {})` non commenté dans dashboard/components
5. Console DevTools : aucun unhandled promise rejection
