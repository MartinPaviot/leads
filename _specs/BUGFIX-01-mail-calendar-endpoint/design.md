# Design — BUGFIX-01

## Fit dans le système
La route `apps/web/src/app/api/settings/mail-calendar/route.ts` est l'API canonique pour ce panneau (consolidation mailboxes + sync prefs). Elle expose `GET` qui lit `tenants.settings`. On ajoute `PUT` qui met à jour les 3 champs `contactCreationMode`, `backsyncRange`, `doNotTrackDomains` dans le même JSONB.

`/api/settings/privacy/*` est legacy (la page `/settings/privacy` redirige vers mail-calendar). On ne touche pas à cette route sauf si elle pollue : à investiguer en tâche T0.

## Data model
Aucun changement de schéma. Les 3 champs vivent déjà dans `tenants.settings` (JSONB) :
- `contactCreationMode: "disabled" | "selective" | "always"`
- `backsyncRange: "1m" | "3m" | "6m" | "12m"`
- `doNotTrackDomains: string[]`

Helper existant : `updateTenantSettings(tenantId, partial)` dans `apps/web/src/lib/tenant-settings.ts`.

## API contract

### `PUT /api/settings/mail-calendar`
**Auth :** session NextAuth requise (`getAuthContext`). 401 sinon.
**Body :**
```ts
{
  contactCreationMode: "disabled" | "selective" | "always",
  backsyncRange: "1m" | "3m" | "6m" | "12m",
  doNotTrackDomains: string[]
}
```
**Validation :**
- `contactCreationMode` ∈ enum → 400 sinon
- `backsyncRange` ∈ enum → 400 sinon
- `doNotTrackDomains` est un array de strings, chaque domaine `.trim().toLowerCase()`, dédup, max 200 entries
**Response 200 :**
```ts
{ success: true, syncPreferences: { contactCreationMode, backsyncRange, doNotTrackDomains } }
```

## Data flow
1. UI → `PUT /api/settings/mail-calendar` avec payload sanitizé
2. Route handler : `getAuthContext()` → 401 si null
3. Validation Zod inline → 400 si fail
4. `updateTenantSettings(tenantId, { contactCreationMode, backsyncRange, doNotTrackDomains })`
5. Return 200 avec valeurs normalisées (utile pour rafraîchir state UI)

## Failure handling
- DB indispo → 500 + log `console.error`
- Validation fail → 400 + message explicite
- UI : `if (!res.ok) setError("Failed to save preferences")` (déjà présent)

## Security
- Aucune montée de privilège : modifie uniquement les settings du tenant courant.
- Pas besoin de `requireAdmin` (préfs de sync sont gérables par tout membre, cohérent avec le panneau actuel).
- Validation stricte évite injection JSON arbitraire dans `tenants.settings`.

## Open questions
- Faut-il déprécier `/api/settings/privacy` ? À investiguer T0. Si elle reçoit encore d'autres payloads (ex: do-not-track legacy), on garde mais on doc.
