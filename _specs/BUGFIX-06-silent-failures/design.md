# Design — BUGFIX-06

## Fit dans le système
ToastProvider est déjà monté dans dashboard layout (`apps/web/src/app/(dashboard)/layout.tsx`). Helper `useToast()` existe (à confirmer). On crée un wrapper centralisé `safeFetch` qui s'appuie dessus, puis on remplace systématiquement les patterns silent.

## Helper `safeFetch`
Fichier : `apps/web/src/lib/safe-fetch.ts`

```ts
import { toast } from "@/components/ui/toast";  // ou hook
import { logger } from "./logger";

export type SafeFetchResult<T> = { data: T | null; error: string | null };

export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit & { silent?: boolean; errorMessage?: string },
): Promise<SafeFetchResult<T>> {
  const { silent = false, errorMessage, ...init } = options ?? {};
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = `HTTP ${res.status}` + (text ? `: ${text.slice(0, 200)}` : "");
      logger.warn("safeFetch HTTP error", { url, status: res.status });
      if (!silent) toast.error(errorMessage ?? "Request failed", { description: err });
      return { data: null, error: err };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    logger.error("safeFetch network error", { url, error: msg });
    if (!silent) toast.error(errorMessage ?? "Network error", { description: msg });
    return { data: null, error: msg };
  }
}
```

**Usage typique :**
```tsx
const { data, error } = await safeFetch<{ contacts: Contact[] }>("/api/contacts", {
  errorMessage: "Failed to load contacts",
});
if (data) setContacts(data.contacts);
```

## Pattern alternatives
- **Mutation avec optimistic update** : `safeMutation()` qui prend un rollback callback (futur — pas dans ce spec)
- **Polling silencieux** : passer `silent: true` pour éviter spam de toasts

## Liste des call sites à patcher
Identifiés par grep (18 fichiers) :
1. `app/(dashboard)/accounts/page.tsx`
2. `app/(dashboard)/sequences/page.tsx`
3. `app/(dashboard)/sequences/[id]/page.tsx`
4. `app/(dashboard)/contacts/page.tsx`
5. `app/(dashboard)/meetings/page.tsx`
6. `app/(dashboard)/meetings/[id]/page.tsx`
7. `app/(dashboard)/opportunities/page.tsx`
8. `app/(dashboard)/notes/page.tsx`
9. `app/(dashboard)/tasks/page.tsx`
10. `app/(dashboard)/pricing/page.tsx`
11. `app/(dashboard)/settings/recording/page.tsx`
12. `app/(dashboard)/settings/mail-calendar/page.tsx`
13. `app/(dashboard)/settings/notifications/page.tsx`
14. `app/(dashboard)/home/page.tsx` (ajouté manuellement)
15. `app/(dashboard)/chat/page.tsx` (à vérifier)
16. `components/campaign-wizard.tsx`
17. `components/live-extraction.tsx`
18. `components/email-composer.tsx`

Plus côté API (silent backend exceptions) :
- `app/api/settings/mailboxes/route.ts`
- `inngest/campaign-functions.ts:52` (`catch { /* best effort */ }` — légitime, à doc)

## Backend logging
`apps/web/src/lib/logger.ts` existe. On veut s'assurer que :
- Toute route catch propre log `logger.error(message, {url, method, error})`
- Optionnel : ajouter un middleware Next.js qui wrappe et log toute exception non gérée

## Failure handling
- Si toast lui-même fail (toast unmounted) → console.error fallback
- Si logger backend down → no-op, ne pas faire échouer la requête

## Security
- Pas de leak de stack trace côté client (logger.warn message générique seulement)
- `errorId` retourné côté API peut être un UUID corrélé aux logs serveur (sans contenu sensible)

## Migration strategy
- Étape 1 : créer `safeFetch` + écrire les tests
- Étape 2 : remplacer dans 1-2 fichiers pilotes (home, accounts), valider UX
- Étape 3 : remplacer en batch dans les 16 autres fichiers
- Étape 4 : ajouter ESLint rule (custom ou `no-empty` configuré strict) qui flag tout `.catch(() => {})` non commenté
