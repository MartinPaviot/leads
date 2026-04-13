# Tasks — BUGFIX-06

## T1. Vérifier ToastProvider + helper toast
- **Action :** Lire `apps/web/src/components/ui/toast.tsx` (ou équivalent). Confirmer API : `toast.error(msg, { description })`. Si pas existant, créer wrapper.
- **Verify :** `toast.error("test")` affiche un toast rouge dans le dashboard.
- **Test :** Storybook ou snapshot.

## T2. Créer `safeFetch`
- **Action :** Créer `apps/web/src/lib/safe-fetch.ts` (cf design.md).
- **Verify :** TypeScript build OK, types stricts.
- **Test :** Vitest `safe-fetch.test.ts` :
  - Happy path : 200 → data
  - 404 → error + toast
  - Network error (mock fetch reject) → error + toast
  - silent: true → pas de toast
  - errorMessage custom → utilisé dans toast

## T3. ESLint rule custom (préventif)
- **Action :** Ajouter rule `no-empty-catch-promise` dans `.eslintrc` ou plugin custom :
  - Flag `.catch(() => {})` et `.catch(() => null)`
  - Permet bypass via comment `// eslint-disable-next-line silent-fetch`
- **Verify :** `pnpm lint` flag les call sites existants.
- **Test :** Lint snapshot.

## T4. Refactor `home/page.tsx` (pilote)
- **Action :** Remplacer tous les fetch + `.catch(() => {})` par `safeFetch`. Garder l'UX : si data null, ne pas crash.
- **Verify :** Manuel : couper le réseau → toast affiché ; reconnecter → reload OK.
- **Test :** E2E Playwright.

## T5. Refactor `accounts/page.tsx`
- **Action :** Idem T4 sur accounts.
- **Verify :** Click "Enrich all" sans réseau → toast.

## T6. Refactor remaining UI files (batch)
- **Action :** Pour chaque fichier de la liste design.md (sequences, contacts, meetings, opportunities, notes, tasks, pricing, settings/* listés, components/*) :
  - Remplacer fetch + silent catch par `safeFetch`
  - Si la page utilisait des `setError()`/state error : conserver, en plus du toast
- **Verify :** Grep `.catch(() => {})` retourne 0 résultats dans dashboard/components.
- **Test :** Spot E2E sur 3 features critiques (chat, sequences, opportunities).

## T7. Refactor backend API silent catches
- **Action :** Pour chaque route API qui catch silently (cf design.md) :
  - Remplacer par `logger.error(msg, meta)` + retour 500 avec `errorId`
  - Documenter inline si silent volontaire (ex: dead-letter best-effort)
- **Verify :** Grep `.catch(() => {})` dans `app/api/**` : 0 sauf justifié.

## T8. Doc CONTRIBUTING
- **Action :** Créer/mettre à jour `CONTRIBUTING.md` section "Network calls" :
  - Toujours utiliser `safeFetch`
  - Comment justifier un silent catch
  - Pattern toast.error + state error

## T9. Test E2E offline behavior
- **Action :** `apps/web/tests/e2e/offline-resilience.spec.ts` :
  - Naviguer dashboard
  - Simulate offline (Playwright `context.setOffline(true)`)
  - Click actions critiques → toast affiché, pas de crash
  - Reconnect → recovery
- **Verify :** `pnpm playwright test offline-resilience` passe.

## T10. Doc + audit cleanup
- **Action :** Mettre à jour `_reports/audit-deep/01-landing-admin-errors.md` section "silent failures" : marquer résolu.

## Ordre d'exécution
T1 → T2 → T3 (parallèle) → T4 (pilote) → T5 → T6 (batch) → T7 → T8 → T9 → T10

## Estimation effort
~6-8h (T6 batch est le plus long).
