# Tasks — BUGFIX-02

## T0. Vérifier qu'il n'existe pas déjà une table invites
- **Action :** `grep -r "pendingInvites\|pending_invites\|invitesTable" apps/web/src/db apps/web/src/lib`
- **Verify :** Si rien trouvé, créer ; sinon, adapter à l'existant.

## T1. Schéma DB — `pendingInvites` table
- **Action :** Ajouter `pendingInvites` dans `apps/web/src/db/schema.ts` (colonnes + index unique conditionnel cf design.md).
- **Verify :** `pnpm drizzle-kit generate` produit une migration sans erreur.
- **Test :** Migration appliquée localement, `\d pending_invites` montre la structure attendue.

## T2. Helper email invite
- **Action :** Créer `apps/web/src/lib/email-invite.ts` avec `sendInviteEmail({to, inviterName, workspaceName, role, acceptUrl, expiresAt})` qui appelle Resend.
- **Verify :** Test Vitest avec mock Resend, vérifier subject + body + headers.
- **Test :** Vitest `email-invite.test.ts`.

## T3. Endpoint POST `/api/settings/members/invite`
- **Action :** Créer `apps/web/src/app/api/settings/members/invite/route.ts` (POST) — voir design.md API contract.
- **Verify :** `curl -X POST -H "Cookie: <admin-session>" /api/settings/members/invite -d '{"email":"bob@acme.com","role":"member"}'` → 201 + email reçu en local (Resend test mode).
- **Test :** Vitest — happy path, 400 invalid email, 400 already member, 400 invalid role, 403 non-admin, dédup pending.

## T4. Endpoint GET `/api/settings/members/invites` (list)
- **Action :** Créer route GET — list pending invites du tenant.
- **Verify :** `curl /api/settings/members/invites` → `{ invites: [...] }`.
- **Test :** Vitest sur réponse + tenant scoping.

## T5. Endpoints resend + cancel
- **Action :** Créer `apps/web/src/app/api/settings/members/invites/[id]/route.ts` avec :
  - `POST` (resend) — sous-routes `/resend` ou query param
  - `DELETE` (cancel)
  - Both `requireAdmin`
- **Verify :** Resend incrémente compteur, cancel passe status à 'cancelled'.
- **Test :** Vitest — resend rate limit (max 3), cancel + token reuse refusé.

## T6. Endpoint GET `/api/auth/invite/[token]` (validate)
- **Action :** Créer route GET — public, no auth, return invite info ou raison invalidité.
- **Verify :** GET avec token valide → 200 ; expiré → 410 ; cancelled → 410 ; not found → 404.
- **Test :** Vitest tous scenarios.

## T7. Endpoint POST `/api/auth/invite/accept`
- **Action :** Créer route POST — auth required, body `{ token }`, met à jour user.tenantId + role + invite.status.
- **Verify :** Bob loggé → POST → tenant change.
- **Test :** Vitest — happy + token invalide + user déjà membre.

## T8. Page `/accept-invite`
- **Action :** Créer `apps/web/src/app/accept-invite/page.tsx` (client component) :
  - Lit token de URL
  - Fetch `/api/auth/invite/[token]`
  - Si non-loggé + valide → router.push(`/sign-up?invite=...`)
  - Si loggé + valide → affiche confirm CTA → POST accept → redirect `/home`
  - Si invalide → message + lien vers help
- **Verify :** Visite manuelle d'un token valide vs invalide.
- **Test :** E2E Playwright `accept-invite.spec.ts`.

## T9. Sign-up flow consume token
- **Action :** Modifier `apps/web/src/app/sign-up/page.tsx` :
  - Lire `?invite=<token>` query
  - Pré-remplir email depuis `/api/auth/invite/[token]`
  - Hidden field token dans form
  - Server action : si token présent, override le default "new tenant" flow → utiliser tenantId + role de l'invite pour le user créé
  - Après sign-up success, call `/api/auth/invite/accept`
- **Verify :** E2E full happy path : admin invite → email → click link → sign-up → arrive home avec bon tenant + role.
- **Test :** E2E Playwright (étend `accept-invite.spec.ts`).

## T10. UI Members — handler + invites list
- **Action :** Modifier `apps/web/src/app/(dashboard)/settings/members/page.tsx` :
  - Ajouter `handleInvite()` async function (POST `/api/settings/members/invite`)
  - Bouton Invite : `onClick={handleInvite}`, supprimer texte "coming soon"
  - Disable bouton si non-admin (utiliser `useSession()` ou nouveau context)
  - Nouvelle section "Pending invitations" : fetch `/api/settings/members/invites`, list avec Resend + Cancel
  - `useToast()` pour feedback
- **Verify :** Manuel : invite → toast → invitation apparaît dans la liste.
- **Test :** E2E Playwright `members-invite.spec.ts`.

## T11. Documentation + cleanup
- **Action :**
  - Mettre à jour `_reports/audit-deep/05-settings-all.md` : cocher BUG Members résolu
  - Doc en `_specs/BUGFIX-02-members-invite/notes.md` : tout corner case rencontré
- **Verify :** Doc à jour.

## Ordre d'exécution
T0 → T1 → T2 (parallèle T3) → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11

## Estimation effort
~6-8h de travail focused (incluant tests).
