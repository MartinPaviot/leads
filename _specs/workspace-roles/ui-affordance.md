# UI affordance pass — workspace-roles (follow-up)

Closes the documented residual from the core roles work: the server gates
(middleware viewer-guard + requirePermission) reject viewer/member writes,
but the UI still showed write controls that 403 on click. This adds the
client-side affordance layer so roles read as designed, not broken.

**Not a security boundary** — affordance only. Every mutation stays gated
server-side. A viewer who un-hides a button still 403s at the API.

## Socle
- `components/role-provider.tsx` (client): `RoleProvider` seeded by the
  dashboard layout from the DB role (same source `getAuthContext` overlays),
  + `useRole()`, `useCan(permission)`, `useIsViewer()`, `useIsAdmin()`, and a
  `<Can permission fallback>` wrapper. Reuses `hasPermission` from
  `lib/auth/permissions.ts` (single source of truth, isomorphic/pure).
- `app/(dashboard)/layout.tsx`: selects `users.role`, wraps the tree in
  `<RoleProvider role={userRole}>` (mirrors the existing FlagsProvider).

## Surfaces gated in this pass (highest-friction, money + execution)
- **Members** (`settings/members/page.tsx`): non-admins get a read-only
  roster — invite box hidden (`members:invite`), per-member role shown as a
  Badge instead of a Select, resend/cancel hidden (`members:manage`).
- **Call Mode number picker** (`call-mode/page.tsx`): "Add a number…" (real
  Twilio purchase) hidden unless `billing:manage`. Non-admins still pick from
  the existing pool.
- **Sequence detail** (`sequences/[id]/page.tsx`): Configure/Continue Campaign
  + Pause/Resume hidden unless `sequences:execute` (viewer sees it read-only).

## Out of scope (incremental adoption via `<Can>`)
The full CRM write surface (New/Delete/Import on Accounts/Contacts/
Opportunities, compose-email entry points, bulk actions) is large and
member-allowed (only viewers should lose them). Those are protected
server-side today; adopt `<Can permission="…">` per call-site over time.
A viewer hitting one still gets a clean 403, not a crash.

## Tests
`components/__tests__/role-provider.test.tsx` — role exposure, useCan mirror
of the matrix per role, `<Can>` show/hide + fallback, default-member.
