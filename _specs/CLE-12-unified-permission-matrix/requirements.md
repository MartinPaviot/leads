# CLE-12 — Unified permission matrix (middleware + capability-resolver + PAR) — Requirements

> Constitution: `_specs/chat-live-executor/README.md`. CLE-12 is the M2 feature that makes
> `lib/auth/permissions.ts` the **single source of truth** for `role × capability`, consumed by all
> three enforcement points so there are no longer three parallel role systems (audit
> `_research/chat-task-executor-audit-2026-06-16.md` §6 / §1.3 "Rôles"; README §4.5 "Une matrice de
> permissions partagée par middleware + capability-resolver + PAR").
> Depends on **CLE-04** (`_specs/CLE-04-page-action-tools/design.md` — `invokePageAction`,
> `VIEWER_GATEWAY_TOOLS`) and **CLE-10** (`_specs/CLE-10-unified-approval-plane/design.md` —
> `decideAction` takes `role` and refuses for viewer + mutating; CLE-10 §10 explicitly defers "the full
> role × action matrix is CLE-12").

---

## 1. Problem statement

Today the same question — "is this role allowed to do this?" — is answered by **three disconnected
systems**, and a fourth permission vocabulary lives in the chat layer (audit §6, §1.3):

1. **Middleware** (`src/middleware.ts:147-163`) enforces the **viewer** floor systemically via one pure
   predicate (`isViewerWriteBlocked`, `viewer-guard.ts:37-46`) — but makes **no admin/member
   distinction**. Every member-vs-admin decision is left to per-route boilerplate.
2. **Per-route checks** (`requireAdmin`, `auth-utils.ts:109-114`; `requirePermission`,
   `permissions.ts:94-110`) cover only **59 of 346** API `route.ts` files (46 call `requireAdmin`, 15
   call `requirePermission`; verified count). Everyday CRM writes are **member-open** and rely on
   nothing but the viewer floor.
3. **Chat capability-resolver** (`capability-resolver.ts`) gates the LLM's tools with **four
   hand-maintained name-sets** — `ADMIN_ONLY_TOOLS` (`:18-38`), `DESTRUCTIVE_TOOLS` (`:45-58`),
   `VIEWER_ALLOWED_GROUPS` (`:127-132`), `VIEWER_DENIED_TOOLS` (`:138-141`), plus `VIEWER_GATEWAY_TOOLS`
   added by CLE-04 — that drift independently of `ROLE_PERMISSIONS`.

The role→permission mapping itself already exists and is good (`ROLE_PERMISSIONS`,
`permissions.ts:46-74`), but it is consumed by **only one** of the three points (`requirePermission`),
and only on the 59 routes that bother to call it. CLE-04's `invokePageAction` and CLE-10's
`decideAction` each re-encode "viewer may not mutate" in their own code. There is no shared notion of
"this capability requires admin" that all three honour; there is no default posture that makes a **new**
write route automatically role-checked beyond the viewer floor.

CLE-12 makes `permissions.ts` the one matrix, derives all three enforcement points from it, and ships a
shared request-guard helper plus a realistic rollout (define + apply to the highest-risk write routes +
a default posture + a checklist for the long tail) — **without** claiming to hand-edit all 346 routes in
one feature.

---

## 2. User story

**As** the founder/admin of an Elevay workspace (and as a member, and as a read-only viewer),
**I want** one authoritative table that says which role may do which kind of thing — enforced
identically whether the action arrives via a raw API call, via the chat's tool registry, or via a live
page action —
**so that** a member can never reach an admin-only capability (settings, members, billing, MCP, paid
sends) through any path, a viewer can never mutate through any path, the three enforcement points can
never silently disagree, and a newly added write route is covered by a safe default the day it ships
instead of waiting for someone to remember a per-route check.

---

## 3. Capability vocabulary (the SSOT axis CLE-12 defines)

The matrix is keyed by a **capability enum** (a coarse, role-meaningful verb-on-resource), not by route
path and not by tool name. Path→capability and tool→capability are *derivations* onto this enum
(design.md §3, §4). The enum **extends** the existing `Permission` union (`permissions.ts:9-25`) — it is
a superset, so every current `requirePermission(role, "...")` call keeps compiling and meaning the same
thing. New members added by CLE-12 (illustrative; final list in design.md §2):

- existing: `contacts:read|write|delete`, `companies:delete`, `deals:read|write|delete`,
  `sequences:read|write|execute`, `settings:read|write`, `billing:manage`, `members:invite|manage`,
  `mcp:manage`.
- added: `accounts:write` (account create/update — today implicitly member via `contacts:write`/no
  check), `outbound:send` (email/sequence send under the user's identity — member), `outbound:paid`
  (anything that spends money: paid send, buy Twilio number — **admin**), `enrichment:run` (spends
  credits — member), `members:read`, `workflows:manage` (admin), `knowledge:write` (admin, mirrors the
  chat `ADMIN_ONLY_TOOLS` knowledge entries).

Each capability resolves, per role, to **granted / denied** via `ROLE_PERMISSIONS`. CLE-12 does **not**
introduce a per-capability "needs confirmation" notion — that axis is `decideAction`'s (`confirm` /
`mutating` / `outbound` / `cost`, CLE-10). Permission (may this role at all?) and approval (does this
action need a card right now?) stay **orthogonal** (design.md §6, contract tension #2).

---

## 4. EARS acceptance criteria

Format: GIVEN / WHEN / THEN. "the matrix" = `ROLE_PERMISSIONS` keyed by the capability enum in
`permissions.ts`.

### The matrix is the SSOT

- **AC-1** — GIVEN the capability enum and `ROLE_PERMISSIONS`, WHEN any enforcement point needs to decide
  `role × capability`, THEN it reads the answer from `permissions.ts` (via `hasPermission` /
  `requireCapability` / a derivation helper), and **no enforcement point hard-codes a role→capability
  rule of its own**.
- **AC-2** — GIVEN a capability `c` and a role `r`, WHEN `hasPermission(r, c)` is called, THEN it returns
  true iff `c ∈ ROLE_PERMISSIONS[r]`, and an unknown role returns false (preserves
  `permissions.ts:79-83` behaviour).

### Middleware enforces viewer + admin/member from the matrix (no per-route boilerplate)

- **AC-3** — GIVEN a viewer session, WHEN they issue a write request outside the viewer allowlist, THEN
  the middleware rejects it 403 exactly as today (`isViewerWriteBlocked` behaviour is preserved
  byte-for-byte — no regression to the systemic viewer floor).
- **AC-4** — GIVEN a request whose `path × method` maps (in the capability map, design.md §4) to a
  capability that the caller's **JWT role** lacks, WHEN the middleware runs, THEN it rejects 403 with a
  structured body naming the missing capability — **without** that route having added any per-route
  check.
- **AC-5** — GIVEN a member session and a request mapping to an **admin-only** capability (e.g.
  `members:manage`, `settings:write`, `outbound:paid`, `mcp:manage`), WHEN the middleware runs, THEN it
  rejects 403 (the member-vs-admin distinction the middleware lacks today, audit §6).
- **AC-6** — GIVEN a request mapping to a capability the role **has** (e.g. member → `contacts:write`),
  WHEN the middleware runs, THEN it passes through unchanged (no new latency-bearing DB read on the edge
  path — the middleware uses the **JWT role only**, design.md §5.2; the API layer overlays the fresh DB
  role separately, AC-12).

### Capability-resolver gating is derived from the matrix (not hand-listed Sets)

- **AC-7** — GIVEN the chat tool registry, WHEN `resolveCapabilities` filters tools for a role, THEN the
  admin-only / destructive / viewer decisions are **derived from a single tool→capability map checked
  against `ROLE_PERMISSIONS`**, not from independently maintained `ADMIN_ONLY_TOOLS` /
  `VIEWER_ALLOWED_GROUPS` / `VIEWER_DENIED_TOOLS` literals.
- **AC-8** — GIVEN the tool→capability derivation and the **legacy** name-sets, WHEN a parity test runs,
  THEN for every tool the matrix-derived admin-only/viewer-allowed verdict **equals** the verdict the
  old Sets produced (design.md §3.3, §7 — the migration is provably behaviour-preserving; any
  intentional difference is enumerated and justified, not silent).
- **AC-9** — GIVEN CLE-04's `VIEWER_GATEWAY_TOOLS` exception (`invokePageAction` is reachable by viewers
  because per-action gating is `decideAction`'s job), WHEN the resolver is migrated to the matrix, THEN
  that exception is **expressed in the matrix derivation** (the gateway tool maps to a read-level / "no
  static capability" verdict so it stays reachable) and is **not** lost — `isViewerAllowedTool(
  "invokePageAction")` remains true (CLE-04 design §2.7).
- **AC-10** — GIVEN the destructive-gating posture (`DESTRUCTIVE_TOOLS` hidden until `allowDestructive`,
  `capability-resolver.ts:187-190`), WHEN the resolver is migrated, THEN destructive tools map to a
  `*:delete` capability **and** retain the `allowDestructive` flag gate (the two are AND-ed: a tool must
  be both delete-capable for the role AND have destructive ops enabled). CLE-12 does not flip
  `allowDestructive`.

### `invokePageAction` refuses below-capability (PAR consumes the matrix)

- **AC-11** — GIVEN a page action whose metadata (`mutating`/`outbound`/`cost`, CLE-04 manifest) maps to
  a **required capability**, WHEN `invokePageAction` is invoked by a role lacking that capability, THEN
  it refuses (returns `{ error }`, **no directive**) with a reason naming the capability — the static
  permission check runs **before** `decideAction`'s dynamic approval check (design.md §3.4; layered:
  permission first, then approval). A member invoking an `outbound:paid` page action is refused by the
  matrix even though `decideAction` alone would only have said `confirm`.

### A new write route is covered by the default posture

- **AC-12** — GIVEN a write route **not present** in the capability map, WHEN it is called, THEN the
  configured **default posture** applies (design.md §5.1): the viewer floor always blocks viewers
  (unchanged), and members/admins are handled per the chosen default (`default-member` for the bulk of
  CRM writes; high-risk path prefixes are `default-deny` / require explicit admin). The route is **never
  silently admin-bypassable**: the API-layer guard (`requireCapabilityForRequest`, the shared helper)
  applies the same default when a route opts in, and the middleware default posture is the backstop.
- **AC-13** — GIVEN the shared guard helper `requireCapabilityForRequest(authCtx, req)`, WHEN a route
  handler calls it, THEN it resolves the capability for `path × method` from the **same** map the
  middleware uses, checks it against the caller's **fresh DB role** (`authCtx.role`, overlaid in
  `auth-utils.ts:60-72`), and returns a 403 `Response` (or `null` to proceed) — one call replaces
  bespoke `requireAdmin`/`requirePermission` lines and cannot drift from the middleware verdict.

### Fail-closed

- **AC-14** — GIVEN any ambiguity (unknown role, missing capability mapping under a `default-deny`
  prefix, malformed JWT role), WHEN any enforcement point evaluates it, THEN it resolves toward **deny /
  more restriction**, never toward allow (consistent with `viewer-guard.ts` fail-closed posture and
  CLE-00/CLE-10 "zero silent actions").

---

## 5. Edge cases

- **EC-1 — Stale JWT role at the edge.** The middleware sees only the **JWT** `role` claim
  (`middleware.ts:151`), which can lag a promotion/demotion by up to 8h until `getFreshUserState`
  overlays the DB role at the API layer (`auth-utils.ts:50-72`). Consequence: a **just-demoted**
  admin-→-member could still pass the *middleware* admin gate for up to the cache window. Mitigation
  (design.md §5.2): the middleware gate is a **first, cheap** line; every admin-only **route** also calls
  `requireCapabilityForRequest` (which reads the **fresh** DB role), so the authoritative check is
  fail-closed-fresh. The middleware never *grants* a capability the route then trusts blindly —
  defence in depth, not a single edge gate. A just-**promoted** member sees the new admin capability
  within the 60s fresh-role cache at the API layer even if the JWT still says member (the route guard
  wins). This is the same posture the codebase already documents for tenant switches
  (`auth-utils.ts:50-66`).
- **EC-2 — Legacy / unknown roles.** Rows in `users.role` outside `{admin, member, viewer}` (legacy
  seeds, future roles). `ROLE_PERMISSIONS[unknownRole]` is `undefined` → `hasPermission` returns false
  (`permissions.ts:80-82`) → every capability denied except where the viewer floor / safe-method path
  already allows reads. Design.md §5.3 confirms reads still work (GET is a `SAFE_METHOD`,
  `viewer-guard.ts:15`) so an unknown-role user is effectively read-only, not locked out — fail-closed
  but not hostile.
- **EC-3 — Route not in the capability map.** Covered by AC-12 + the default posture. The map is
  **prefix-and-method** keyed; unmatched paths fall to the default. Design.md §4 specifies the matching
  order (longest-prefix-wins) and the default resolution so a forgotten route is never *more* permissive
  than its neighbours.
- **EC-4 — Founder-never-admin nuance.** Per memory (`project_workspace-roles.md`): the workspace
  *creator* must be role `admin` (a backfill fixed creators who were left non-admin). CLE-12 must **not**
  re-derive role from "is creator" — it consumes `authCtx.role` as the SSOT for the *caller's* role and
  leaves role *assignment* to the existing membership system. The matrix governs `role × capability`,
  never `user → role`. Design.md §6 states this boundary explicitly so CLE-12 cannot accidentally
  re-open the founder-never-admin bug.
- **EC-5 — Public / self-authenticating routes.** Webhooks, Twilio voice callbacks, `/api/auth`,
  `/api/inngest`, the pixel, E2E seed (`middleware.ts:45-109`) run **without a session**. The capability
  gate must run **only after** `isPublic` short-circuits and after the `!req.auth?.user` redirect
  (`middleware.ts:132,143`), i.e. in the same place the viewer gate runs today — never on a public path
  (would break Twilio / Inngest signing). Design.md §5.2 pins the insertion point.
- **EC-6 — Method-sensitive capability.** The same path is a read on GET and a write on
  POST/PATCH/DELETE (e.g. `/api/settings/icp`). The map is keyed by `path × method`; GET maps to a
  `*:read` (or is simply a SAFE_METHOD the gate ignores), POST/PATCH/PUT/DELETE map to the write/admin
  capability. Design.md §4 shows the shape.
- **EC-7 — `invokePageAction` vs `decideAction` ordering.** A page action that is both below the
  caller's capability **and** would need confirmation: the permission check (matrix) must run **first**
  and refuse, so the user is told "your role can't do this" rather than being shown a confirm card for
  an action they can never complete. Design.md §3.4 fixes the order.
- **EC-8 — Capability map and tool→capability map divergence.** Two derivations (path→capability for
  routes; tool→capability for the resolver) reference the **same** capability enum but are **separate
  maps** (a route path is not a tool name). Risk: the chat creates a contact via the `createContact`
  *tool* (gated by the tool map) but the same write via `POST /api/contacts` is gated by the route map;
  they must agree on the capability (`contacts:write`). Design.md §7 adds a cross-map consistency test
  for the overlapping verbs.

---

## 6. Out of scope (note explicitly)

- **RLS / tenant isolation.** This is a **separate concern** and is explicitly *not* what CLE-12
  touches. The matrix answers "may this **role** do this **kind** of thing?"; tenant isolation answers
  "may this **tenant** see this **row**?" and is enforced by app-layer `WHERE tenant_id` + the 0074
  fallback-allow RLS policies (`auth-utils.ts:80-92`, audit `project_tenant-isolation-audit.md`). CLE-12
  adds no `WHERE` clause, no `withTenantTx` change, and no RLS policy. A correctly-permissioned member of
  tenant A still cannot read tenant B's rows — that guarantee is untouched and out of band.
- **Role assignment / membership.** Who *is* admin/member/viewer (invites, role changes,
  founder-never-admin) stays in the existing membership system (`project_workspace-roles.md`). CLE-12
  reads `authCtx.role`; it does not write roles.
- **The approval/confirmation axis.** Whether an action needs a card *right now* is `decideAction`'s
  (CLE-10). CLE-12 is the orthogonal *permission* axis. The two compose (permission gate then approval
  gate) but neither subsumes the other (design.md §6).
- **Flipping `allowDestructive` or `planTier`.** CLE-12 keeps the destructive-ops flag and pro-tier gate
  exactly as CLE-04/CHAT-02 set them (`capability-resolver.ts:187-194`); it only *derives the role half*
  from the matrix. Unlocking destructive ops is CHAT-04/CLE-11 territory.
- **Hand-editing all 346 routes.** Out of scope **by design** (README "boil lakes" but flag oceans). The
  feature ships the matrix + the helper + the default posture + the highest-risk routes + a checklist;
  the long tail is covered by the default posture, not by 346 manual edits (design.md §5).

---

## 7. Evaluation steps (Phase 6, hostile QA)

All on `feat/CLE-12-unified-permission-matrix`. Pure logic via **vitest**; route-level checks via the
helper + middleware predicate unit tests (no Playwright needed — the matrix and the path→capability map
are pure functions; a thin integration test mints roles).

1. **Matrix SSOT.** `hasPermission` truth table for the full capability enum × `{admin, member,
   viewer, unknown}`. Assert admin = all, viewer = read-only set, member = the CRM set, unknown = none
   (AC-1/AC-2/AC-14).
2. **Capability-resolver parity (the keystone test).** For **every** tool name in
   `buildAllChatTools(ctx)`, assert the matrix-derived verdict (admin-only? viewer-allowed?
   destructive-gated?) **equals** the verdict the legacy Sets produce. Zero unexplained differences;
   any intentional delta is in an allow-list with a cited reason (AC-7/AC-8). This test is the proof the
   migration changed *plumbing, not policy*.
3. **High-risk route rejects member when matrix says admin.** Drive `requireCapabilityForRequest` (and
   the middleware predicate) with a **member** `authCtx`/JWT against a `members:manage`, `settings:write`,
   `outbound:paid`, and `mcp:manage` route → 403 each; against an **admin** → pass; against a member for
   a `contacts:write` route → pass (AC-4/AC-5/AC-6).
4. **Viewer floor unchanged.** Re-run the existing `viewer-guard` truth-table tests; assert
   `isViewerWriteBlocked` behaviour is byte-identical (AC-3) and the new capability gate runs *after* it
   without changing any viewer verdict.
5. **`invokePageAction` matrix refusal.** Member + an `outbound:paid` page action → `{ error }` naming
   the capability, **no `_uiDirective`**, and `decideAction` is **not consulted** (permission-first,
   AC-11/EC-7). Member + a `contacts:write` page action → proceeds to `decideAction` as in CLE-04.
   Viewer + read-only page action → still reachable (AC-9, `VIEWER_GATEWAY_TOOLS` preserved).
6. **Default posture.** A synthetic write path **absent** from the map: under `default-member` → member
   passes, viewer blocked; under a `default-deny` prefix → member blocked, admin passes; GET on the same
   path → always passes the capability gate (SAFE_METHOD) (AC-12/EC-3/EC-6).
7. **Stale/legacy role.** Middleware with a stale **admin** JWT but the route guard reading a **member**
   fresh role → route guard 403s (EC-1). Unknown role → reads pass, writes denied (EC-2).
8. **Cross-map consistency.** Assert the route map and the tool map agree on shared verbs
   (`createContact`/`POST /api/contacts` → `contacts:write`; `deleteContact`/`DELETE /api/contacts/[id]`
   → `contacts:delete`) (EC-8).
9. **Out-of-scope proof.** `git diff` shows **no** change to any `WHERE tenant_id` / `withTenantTx` /
   RLS migration file and **no** change to role-assignment code (`members` write logic) — CLE-12 touched
   only enforcement, not isolation or assignment.
10. **Regression + hygiene.** `regression.sh` green; `tsc --noEmit` 0 errors; the 59 existing
    `requireAdmin`/`requirePermission` call sites still compile and still 403 the same roles (the helper
    is additive, not a rip-and-replace of all 59 in this feature); a grep guard that no enforcement point
    re-introduces a hard-coded role→capability literal outside `permissions.ts`.

**Completeness target: 8/10** (`feature_list.json` CLE-12). The 2-point gap is deliberate and documented
(design.md §5, §8): the long tail of ~287 unmapped routes is covered by the **default posture**, not by
per-route capability assignment, in this feature — a security tradeoff stated explicitly, with the
checklist for closing it incrementally.
