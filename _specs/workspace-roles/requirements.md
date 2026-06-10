# Requirements — workspace-roles

## User stories

1. **As a founder (admin)**, I can invite an advisor/investor as a **Viewer** so they can follow the pipeline, read fiches/transcripts and ask the chat questions, without being able to change anything, send anything, or spend anything.
2. **As a member (seller)**, I can run my own outbound (launch my sequences, soft-delete my records) without asking an admin, while billing/members/integrations/agent-autonomy stay admin-only.
3. **As an admin**, money actions (buying Twilio numbers) and workspace configuration are reserved to me.

## Acceptance criteria

### R1 — Viewer is invitable
- GIVEN the members settings page, WHEN an admin opens the invite role select, THEN "Viewer" is offered alongside Member/Admin.
- GIVEN `POST /api/settings/members/invite` with `role: "viewer"`, THEN the pending invite stores `viewer` and the invite email renders it.
- GIVEN an invite with role `viewer` is accepted, THEN `users.role = "viewer"` (existing accept flow carries the role; no migration needed — `users.role` and `pending_invites.role` are text).
- GIVEN the member-list role select, WHEN an admin changes a member's role, THEN "viewer" is a valid value (`PUT /api/settings/members` accepts it) and the change is audit-logged (existing logAudit).

### R2 — Viewer cannot write (fail-closed, one choke point)
- GIVEN an authenticated session with role `viewer`, WHEN any non-GET/HEAD/OPTIONS request hits `/api/*`, THEN the middleware returns `403 {"error":{"code":"FORBIDDEN","reason":"viewer-read-only"}}` — without per-route code.
- EXCEPT the read-only POST allowlist: `/api/chat` (prefix), `/api/search` (prefix), `/api/filters/parse-nl`. These must keep working for viewers.
- GIVEN a viewer, WHEN they GET any page or API, THEN nothing changes (reads stay full — shared memory is the product).
- Public paths (webhooks, twiml, inngest, auth) are untouched (they short-circuit before the gate).

### R3 — Chat is role-aware
- GIVEN role `viewer`, WHEN the chat resolves capabilities, THEN only tools in groups `query`, `briefing`, `coaching`, `schema` are exposed, MINUS `composeEmail` and `deleteSharedPrompt` (write/outbound tools that live in the query group).
- GIVEN role `viewer`, tools with **no group mapping are dropped** (fail-closed for viewers; members keep today's fail-open behavior for unknown tools).
- GIVEN role `viewer`, THEN the system prompt receives an addendum stating the user is read-only, so the model explains instead of attempting writes.
- Both chat paths are covered because `resolveCapabilities` runs before the orchestrator AND `routeTools` (verified in `app/api/chat/route.ts:606-632`).

### R4 — Money actions are admin-gated
- GIVEN `POST /api/calls/numbers` (real Twilio purchase) or `DELETE /api/calls/numbers`, WHEN the caller's role lacks `billing:manage` (i.e. not admin), THEN 403 with the standard `requirePermission` body.

### R5 — `sequences:execute` becomes real, members can run their own outbound
- `ROLE_PERMISSIONS.member` gains `sequences:execute`.
- GIVEN `PUT /api/sequences/[id]` with a `status` field (Start/Pause = lifecycle control), THEN `sequences:execute` is required. Name/description-only edits keep requiring nothing beyond auth (unchanged).
- GIVEN `POST /api/sequences/[id]/autopilot` (bulk-enrolls contacts → causes sending), THEN `sequences:execute` is required.

### R6 — Delete coherence
- `ROLE_PERMISSIONS.member` gains `contacts:delete` and `deals:delete` (soft-delete is recoverable since PR #76; `companies:delete` was already granted). Admin keeps exclusivity only on settings/billing/members/mcp.

### R7 — Role freshness at the API layer
- GIVEN an admin changes a user's role, WHEN the changed user makes API calls, THEN `authCtx.role` reflects the DB value within ≤60s (no re-login), via a module-cached DB read in `getAuthContext`.
- GIVEN the DB read fails, THEN the JWT role is used (fail-open to the existing trust base — a DB hiccup must not 401 the product).
- The members PUT route busts the cache for the changed user on the same instance (cross-instance converges ≤60s).

## Edge cases
- Demoted-to-viewer user with a still-member JWT: blocked on permission-checked routes and chat within 60s (R7); the middleware layer (JWT-only) catches up at next sign-in (≤8h maxAge). Accepted residual, documented in design.md.
- Promoted viewer→member: middleware would still block writes on the stale JWT → middleware must treat the JWT role as authoritative only for *blocking* viewers, so promotion requires re-login. Acceptable (promotion is rare; communicated in UI copy? out of scope v1).
- Invalid role value on invite (`role: "owner"`): coerced to `member` (matches existing tolerant parsing), never to admin.
- Last admin: already safe — self-demotion is blocked (`Cannot change your own role`) and only admins can change roles, so the actor always remains admin; cross-tenant leave is guarded (M10).
- Viewer hits a write button the UI still shows: server returns 403; UI affordance pass is explicitly out of scope v1.
- `/api/chat` POST allowlisted for viewers: safe because R3 strips all mutation tools inside; thread create/rename under `/api/chat/threads` is viewer-personal state, allowed deliberately.

## Evaluation steps
1. Unit: permissions matrix (admin/member/viewer × all 16 permissions), viewer-guard (method × path × allowlist), fresh-role cache (hit/expiry/invalidate/db-error), capability-resolver viewer filtering (groups, denylist, unknown-tool drop, member unchanged), invite role parsing.
2. `npx tsc --noEmit` + `npx vitest run` from `app/apps/web` — zero failures.
3. Playwright (admin session): members page shows Viewer in both selects; invite POST with viewer returns 201 and the pending invite chip renders.
4. Grep-proof: `POST /api/calls/numbers` and sequences status/autopilot routes contain `requirePermission`.
