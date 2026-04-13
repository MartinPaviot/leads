# Tasks — BUGFIX-01

## T0. Investiguer `/api/settings/privacy`
- **Action :** Lire `apps/web/src/app/api/settings/privacy/route.ts` si elle existe. Vérifier ce qu'elle accepte aujourd'hui.
- **Verify :** Si la route existe et est appelée par d'autres call sites, documenter dans le commit. Sinon, prévoir une suppression dans T4.
- **Test :** N/A (investigation)

## T1. Ajouter handler `PUT` dans `mail-calendar/route.ts`
- **Action :** Ajouter `export async function PUT(req)` dans `apps/web/src/app/api/settings/mail-calendar/route.ts` :
  - `getAuthContext()` → 401 si null
  - Parse + valide body (3 enums + array)
  - Sanitize `doNotTrackDomains` : trim/lowercase/dédup/max 200
  - `updateTenantSettings(tenantId, {...})`
  - Return 200 avec valeurs normalisées
- **Verify :** `curl -X PUT http://localhost:3000/api/settings/mail-calendar -H "Cookie: <session>" -d '{"contactCreationMode":"always","backsyncRange":"3m","doNotTrackDomains":["foo.com"]}'` → 200
- **Test :** Vitest sur la route — happy path + 401 + 400 sur 3 enums + dédup domaines

## T2. Corriger l'URL côté UI
- **Action :** `apps/web/src/app/(dashboard)/settings/mail-calendar/page.tsx:151` — remplacer `"/api/settings/privacy"` par `"/api/settings/mail-calendar"`.
- **Verify :** Click "Save preferences" → DevTools Network montre `PUT /api/settings/mail-calendar` 200.
- **Test :** Manuel, devtools.

## T3. Test E2E (Playwright)
- **Action :** Créer `apps/web/tests/e2e/mail-calendar-prefs.spec.ts` :
  - Login, naviguer vers `/settings/mail-calendar`
  - Modifier `contactCreationMode` → `always`
  - Click Save, attendre badge "Saved"
  - Recharger, vérifier `always` pré-sélectionné
- **Verify :** `pnpm playwright test mail-calendar-prefs` passe.
- **Test :** Le test E2E lui-même.

## T4. Cleanup `/api/settings/privacy` (si T0 montre qu'elle est unused)
- **Action :** Supprimer `apps/web/src/app/api/settings/privacy/route.ts` si non référencée ailleurs.
- **Verify :** `grep -r "/api/settings/privacy" apps/web/src` ne retourne plus rien (sauf doc/tests historiques).
- **Test :** `pnpm typecheck` + `pnpm build` pas de breakage.

## Ordre d'exécution
T0 → T1 → T2 → T3 → T4 (T4 conditionnelle au résultat de T0)
