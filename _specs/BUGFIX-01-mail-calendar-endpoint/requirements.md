# BUGFIX-01 — Mail & Calendar : endpoint mismatch

## User story
**As** a workspace member modifiant mes préférences de sync email/calendrier (record creation mode, backsync range, do-not-track domains)
**Je veux** que mon clic sur "Save" persiste effectivement les valeurs en base
**Pour** que mes choix s'appliquent réellement aux prochaines syncs.

## Bug actuel
`apps/web/src/app/(dashboard)/settings/mail-calendar/page.tsx:151` envoie un `PUT` vers `/api/settings/privacy` au lieu de `/api/settings/mail-calendar`. La route `/api/settings/mail-calendar/route.ts` n'expose que `GET` (155 lignes) — il n'y a actuellement **aucun handler PUT** pour ces préférences. Soit l'utilisateur croit avoir sauvegardé alors que rien ne se passe, soit la route `/api/settings/privacy` existe et reçoit un payload qu'elle n'attend pas.

## Critères d'acceptation (GIVEN/WHEN/THEN)

### AC1 — Sauvegarde réussie
- **GIVEN** je suis sur `/settings/mail-calendar` avec `contactCreationMode = "selective"`, `backsyncRange = "3m"`, `doNotTrackDomains = ["gmail.com"]`
- **WHEN** je modifie `contactCreationMode` à `"always"` et clique "Save preferences"
- **THEN** la requête HTTP est `PUT /api/settings/mail-calendar` avec body `{ contactCreationMode: "always", backsyncRange: "3m", doNotTrackDomains: ["gmail.com"] }`
- **AND** `tenants.settings.contactCreationMode` est `"always"` après la requête
- **AND** le badge "Saved" apparaît pendant 3 s
- **AND** un rechargement de la page affiche `"always"` pré-sélectionné

### AC2 — Validation côté serveur
- **GIVEN** l'utilisateur envoie un `contactCreationMode` invalide (ex: `"foo"`)
- **WHEN** la requête arrive sur `PUT /api/settings/mail-calendar`
- **THEN** le serveur retourne `400 { error: "Invalid contactCreationMode" }`
- **AND** `tenants.settings` reste inchangé

### AC3 — Auth
- **GIVEN** un utilisateur non authentifié
- **WHEN** il appelle `PUT /api/settings/mail-calendar`
- **THEN** le serveur retourne `401`

### AC4 — Erreur réseau
- **GIVEN** la requête `PUT` échoue (réseau / 500)
- **WHEN** la réponse n'est pas ok
- **THEN** le message `"Failed to save preferences"` s'affiche
- **AND** le badge "Saved" n'apparaît pas

## Edge cases
- `doNotTrackDomains` vide → accepté, persiste `[]`
- `doNotTrackDomains` avec espaces / casing → trim + lowercase avant persist
- `backsyncRange` non dans `["1m","3m","6m","12m"]` → 400
- `contactCreationMode` non dans `["disabled","selective","always"]` → 400
- Doublons dans `doNotTrackDomains` → dédupliqués

## Steps d'évaluation
1. Charger `/settings/mail-calendar`
2. Modifier les 3 champs
3. Click "Save"
4. Vérifier dans DevTools Network : `PUT /api/settings/mail-calendar` (status 200)
5. Recharger la page → vérifier que les valeurs sont persistées
6. Tester un payload invalide via curl/Postman → 400
