# Design — workspace-roles

## System fit

Auth stack: NextAuth v5, JWT strategy (maxAge 8h, updateAge 1h). Role is resolved once at sign-in (`resolveUserTenant` in `src/auth.ts`), carried in the token, surfaced as `authCtx.role` by `getAuthContext` (`lib/auth/auth-utils.ts`). 248/316 API route files call `getAuthContext`; 37 use `withAuthRLS` (which wraps it). The middleware (`src/middleware.ts`) wraps `auth()` and already sees `req.auth` (the session callback output, including `role` and `appUserId`).

**Critical constraint**: the middleware today only *imports* the auth/db chain; it never executes a DB query (the jwt callback's DB work is sign-in-only). We do NOT introduce DB queries into the middleware path — its runtime/Node-safety for queries is unproven and a failure there takes down every request. The middleware gate therefore uses the JWT role only.

## Components

### 1. `lib/auth/viewer-guard.ts` (new, pure, zero imports)
```ts
isViewerWriteBlocked(role, method, pathname): boolean
```
True when `role === "viewer"` AND method is not GET/HEAD/OPTIONS AND pathname starts with `/api/` AND pathname is not in `VIEWER_WRITE_ALLOWLIST` (prefixes: `/api/chat`, `/api/search`, `/api/filters/parse-nl`). Pure so it is unit-testable and safe to import from the middleware regardless of runtime.

### 2. `src/middleware.ts` (edit)
After the `isPublic` short-circuit and the session check: if `isViewerWriteBlocked((req.auth as any)?.role, req.method, pathname)` → `403 {"error":{"code":"FORBIDDEN","reason":"viewer-read-only"}}`. JSON (not redirect) because the surface is `/api/*`.

### 3. `lib/auth/fresh-role.ts` (new, Node-only usage)
```ts
getFreshRole(appUserId): Promise<string | null>   // 60s module-level cache
invalidateRoleCache(appUserId): void
```
Single indexed SELECT on `users.role`. Errors → `null` (caller falls back to JWT role). Module-level `Map` cache is per-instance; Fluid reuses instances so the cap is ~1 query/user/60s/instance. Never imported by the middleware.

### 4. `getAuthContext` (edit)
`role: (await getFreshRole(appUserId)) ?? jwtRole`. This makes every `requirePermission`/`requireAdmin` call and the chat see role changes ≤60s without re-login. `PUT /api/settings/members` calls `invalidateRoleCache(memberId)` after a role change.

### 5. `lib/agents/capability-resolver.ts` (edit)
Add viewer branch ahead of the existing admin/destructive/plan checks:
- `VIEWER_ALLOWED_GROUPS = {query, briefing, coaching, schema}` resolved via `getToolGroup` (imported from `lib/chat/tool-router.ts` — single source of truth for the taxonomy).
- `VIEWER_DENIED_TOOLS = {composeEmail, deleteSharedPrompt}` (write/outbound tools that live in the query group).
- Unknown tools (no group) are dropped for viewers (fail-closed) with reason `viewer:read-only`; non-viewers keep the existing fail-open behavior via `routeTools`.
- When role is viewer, append a read-only note to `surfacePromptAddendum` so the model explains rather than attempts writes.
Both chat paths inherit this because `resolveCapabilities` runs before `orchestrate()` and `routeTools` (`app/api/chat/route.ts:606-632`).

### 6. Route gates (edits)
- `api/calls/numbers/route.ts` POST + DELETE → `requirePermission(authCtx.role, "billing:manage")`.
- `api/sequences/[id]/route.ts` PUT → when `body.status` present, `requirePermission(authCtx.role, "sequences:execute")`.
- `api/sequences/[id]/autopilot/route.ts` POST → `requirePermission(authCtx.role, "sequences:execute")`.

### 7. `lib/auth/permissions.ts` (edit)
`member` += `contacts:delete`, `deals:delete`, `sequences:execute`. Roles stay exactly three; no custom roles.

### 8. Invite/member plumbing (edits)
- `api/settings/members/invite/route.ts`: role parse becomes allowlist `["admin","member","viewer"]`, default `member` (never coerces to admin).
- `api/settings/members/route.ts` PUT: validation list += `viewer`; bust role cache on success.
- `settings/members/page.tsx`: add Viewer to the invite select and the per-member role select; badge variant for viewer.
- `db/schema/intelligence.ts` comment on `pendingInvites.role` updated. No migration: both role columns are `text`.
- `lib/emails/email-invite.ts`: verify role string renders for viewer (copy tweak if it assumes two roles).

## Data model
No schema change. Roles are the existing `users.role` / `pending_invites.role` text columns with values `admin | member | viewer`.

## API contract
403 body shape follows the existing `requirePermission` shape: `{ error: { code: "FORBIDDEN", message, requiredPermission?, currentRole? } }`. The middleware variant uses `reason: "viewer-read-only"` (no permission name — it is a blanket gate).

## Failure handling
- `getFreshRole` DB error → `null` → JWT role used. Rationale: the JWT is the existing trust base; a DB hiccup must not turn into product-wide 401/403.
- Middleware gate never throws: missing `role` claim (legacy token) is treated as non-viewer (today every token carries a role from `resolveUserTenant`).

## Security notes & accepted residuals
- Role changes are already audit-logged (H7) and self-demotion is blocked, which transitively guarantees ≥1 admin per tenant; cross-tenant abandonment is guarded (M10 in invite-accept).
- Residual: a demoted member→viewer keeps middleware-layer write access on ungated routes for ≤8h (JWT maxAge) but loses permission-gated routes and chat writes ≤60s (fresh role). Full fix = server-side token revocation — SOC 2 offboarding follow-up, out of scope.
- Promotion viewer→member requires re-login to clear the middleware block (rare; acceptable v1).

## Out of scope (flagged, not built)
- Per-member enrichment/spend caps (own feature: ledger + settings UI).
- UI affordance pass (hide/disable write buttons for viewers across ~24 pages).
- Custom roles, record-level visibility, approval chains, SDR/Manager roles.
- Free viewer seats in billing (no billing integration yet).
