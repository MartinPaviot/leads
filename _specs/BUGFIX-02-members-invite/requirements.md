# BUGFIX-02 — Members : invite flow non implémenté

## User story
**As** un workspace admin
**Je veux** inviter un nouveau membre par email avec un rôle (member ou admin)
**Pour** l'ajouter à mon workspace sans devoir lui partager mes identifiants ou utiliser un canal manuel.

## Bug actuel
`apps/web/src/app/(dashboard)/settings/members/page.tsx:82-88` :
```tsx
<Button variant="gradient" disabled={!inviteEmail.trim()}>
  Invite
</Button>
<p>Invite functionality coming soon.</p>
```
Le bouton n'a **aucun `onClick`**. Aucun endpoint `/api/settings/members/invite` n'existe. Aucune table `pendingInvites` n'existe (à confirmer en T0).

## Critères d'acceptation

### AC1 — Inviter un membre
- **GIVEN** je suis admin sur le workspace, je saisis `bob@acme.com` + role `member` et clique "Invite"
- **WHEN** le clic est traité
- **THEN** un POST `/api/settings/members/invite` est envoyé avec `{ email, role }`
- **AND** une ligne dans `pending_invites` est créée avec un token unique, expirant à +7 jours
- **AND** un email est envoyé à `bob@acme.com` avec un lien `/accept-invite?token=<token>`
- **AND** la liste "Pending invites" affiche cette nouvelle invitation
- **AND** le toast "Invitation sent to bob@acme.com" apparaît

### AC2 — Liste des invites en attente
- **GIVEN** des invites existent
- **WHEN** je charge `/settings/members`
- **THEN** une section "Pending invites" affiche : email, role, sentAt, expiresAt, statut
- **AND** chaque ligne a un bouton "Resend" et "Cancel"

### AC3 — Acceptation d'invite
- **GIVEN** Bob clique le lien `/accept-invite?token=<token>` reçu par email
- **WHEN** Bob est non-authentifié
- **THEN** il est redirigé vers `/sign-up?invite=<token>` (sign-up form pré-rempli avec email)
- **AND** après sign-up : son `users.tenantId` = workspace de l'invitation, `users.role` = role demandé
- **AND** l'invite passe `status = "accepted"`, `acceptedAt` set
- **AND** Bob arrive sur `/home`

### AC4 — Acceptation par utilisateur déjà loggé
- **GIVEN** Bob est déjà loggé dans un autre tenant
- **WHEN** il clique le lien
- **THEN** une page `/accept-invite?token=...` lui demande "Switch to <workspace> as <role>?"
- **AND** confirmation → son `users.tenantId` change vers le nouveau, role appliqué, redirect `/home`

### AC5 — Token expiré ou consommé
- **GIVEN** un token > 7 jours OU déjà accepté
- **WHEN** Bob clique le lien
- **THEN** page d'erreur "Invitation expired or already used. Ask the workspace admin to send a new one."

### AC6 — Resend invite
- **GIVEN** une invite pending dans la liste
- **WHEN** admin clique "Resend"
- **THEN** nouvel email envoyé (même token), `lastSentAt` mis à jour
- **AND** rate limit : max 3 resends par invite

### AC7 — Cancel invite
- **GIVEN** une invite pending
- **WHEN** admin clique "Cancel"
- **THEN** ligne supprimée de la liste, `status = "cancelled"` (soft delete)
- **AND** si Bob clique le lien après cancel → erreur "Invitation cancelled"

### AC8 — Permission
- **GIVEN** un user `role = "member"` (pas admin)
- **WHEN** il appelle `POST /api/settings/members/invite`
- **THEN** 403 ; le bouton "Invite" est désactivé côté UI

### AC9 — Email déjà membre
- **GIVEN** `bob@acme.com` est déjà membre du workspace
- **WHEN** admin tente de l'inviter
- **THEN** 400 `{ error: "User already a member" }` ; toast UI affiché

### AC10 — Invite en double pending
- **GIVEN** une invite pending existe pour `bob@acme.com`
- **WHEN** admin tente de l'inviter à nouveau
- **THEN** la requête met à jour le role + renvoie l'email (équivalent resend), pas de doublon

## Edge cases
- Email invalide (regex) → 400
- Email avec espaces → trim + lowercase
- Domaine email du workspace ≠ domaine de l'invité (ex: invite externe) → autorisé (cohérent avec multi-domaines workspace)
- Suppression du dernier admin → impossible (cohérent avec `members/route.ts:59`)

## Steps d'évaluation
1. Login admin, saisir email + role → click Invite
2. Inbox : email reçu avec lien
3. Click lien dans navigateur privé → sign-up form
4. Compléter sign-up → arriver sur `/home` du bon workspace avec le bon role
5. Vérifier table `pending_invites` : status = `accepted`
6. Tester resend, cancel, expiration (modifier expiresAt en DB)
7. Login member → bouton Invite désactivé ; appel direct API → 403
