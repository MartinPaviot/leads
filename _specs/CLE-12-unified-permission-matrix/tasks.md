# CLE-12 — Unified permission matrix — Tasks

> Branch: `feat/CLE-12-unified-permission-matrix` (off `main`). Implement in order; each task = action +
> file + verify + test. Commit after each task with trailer `Co-Authored-By: Rippletide
> <admin@rippletide.com>`. `tsc --noEmit` 0 errors and `regression.sh` green before merge.
> Depends on CLE-04 (`page-actions.ts`, `VIEWER_GATEWAY_TOOLS`) and CLE-10 (`decideAction` real body)
> already on the branch's base. Anchors: design.md §-refs; requirements.md AC/EC-refs.

---

### T1 — Extend the capability enum + `ROLE_PERMISSIONS` (the SSOT)
- **Action.** In `src/lib/auth/permissions.ts`: widen `Permission` → rename to `Capability` (keep
  `export type Permission = Capability` alias), add the new members (`accounts:write`, `outbound:send`,
  `outbound:paid`, `enrichment:run`, `members:read`, `workflows:manage`, `knowledge:write`) to the union
  and to `ALL_CAPABILITIES`. Update `ROLE_PERMISSIONS` per design.md §2 (member gets `outbound:send`,
  `enrichment:run`, `accounts:write`, `members:read`; member does **not** get `outbound:paid`,
  `settings:write`, `members:invite/manage`, `mcp:manage`, `workflows:manage`, `knowledge:write`).
  Rename `requirePermission`→`requireCapability` and `export const requirePermission = requireCapability`.
- **Verify.** `tsc --noEmit` passes with **zero** changes to the 15 existing `requirePermission(...)`
  call sites (the alias holds). `grep -rn "requirePermission" src/app/api | wc -l` still 15+.
- **Test.** `permissions.matrix.test.ts` (design §9 bullet 1): `hasPermission` truth table for the full
  enum × `{admin, member, viewer, "owner", undefined}`; compile-time `Permission`≡`Capability`. (AC-1/
  AC-2/AC-14)

### T2 — `capabilityForTool` + the `TOOL_CAPABILITY` map
- **Action.** In `permissions.ts`, add `TOOL_CAPABILITY: Record<string, Capability>` mapping the
  mutating/admin/outbound tools (design §3.3 list: `updateICP`/`updateWorkspace`/`updatePipelineStages`/
  `updateCustomFieldSchema`/`updateCustomSignalDefinitions`/`updateMailCalendarIntegration`/
  `updatePrivacySettings`→`settings:write`; `updateWorkflows`→`workflows:manage`; `create/update/
  deleteKnowledgeEntry`→`knowledge:write`; `inviteMember`/`resendInvite`→`members:invite`;
  `updateMemberRole`→`members:manage`; `create/updateCustomObjectType`→`settings:write`;
  `deleteContact`/`mergeContacts`→`contacts:delete`; `deleteAccount`→`companies:delete`;
  `deleteDeal`→`deals:delete`; `composeEmail`→`outbound:send`) and `export function
  capabilityForTool(name): Capability | undefined`.
- **Verify.** `capabilityForTool("updateICP") === "settings:write"`, `capabilityForTool("queryContacts")
  === undefined` (read tool, no entry) in a node REPL / the test.
- **Test.** Covered by T6's parity test (the map's correctness is *defined* as "reproduces the legacy
  Sets").

### T3 — `capabilityForRoute` + the route map + `DEFAULT_POSTURE`
- **Action.** In `permissions.ts`, add `ROUTE_CAPABILITY_RULES` (design §4), `HIGH_RISK_DEFAULT_DENY`
  + `DEFAULT_POSTURE` (design §5.1), and `export function capabilityForRoute(pathname, method):
  Capability | undefined` (SAFE methods → undefined; longest-prefix-wins; DELETE→`del ?? write`;
  fallthrough → `DEFAULT_POSTURE`).
- **Verify.** REPL: `capabilityForRoute("/api/settings/members/invite","POST")==="members:invite"`;
  `capabilityForRoute("/api/contacts","POST")==="contacts:write"`;
  `capabilityForRoute("/api/contacts/x","DELETE")==="contacts:delete"`;
  `capabilityForRoute("/api/settings/icp","GET")===undefined`;
  `capabilityForRoute("/api/foo","POST")===undefined` (default-member);
  `capabilityForRoute("/api/settings/brand-new","POST")==="settings:write"` (default-deny).
- **Test.** `route-capability.test.ts` (design §9 bullet 3 — the required "high-risk rejects member"
  table). (AC-4/AC-5/AC-6/AC-12/EC-3/EC-6)

### T4 — `requireCapabilityForRequest` (the shared route guard)
- **Action.** In `permissions.ts` (or `lib/auth/route-guard.ts` re-exporting), add
  `requireCapabilityForRequest(authCtx: Pick<AuthContext,"role">, req)` per design §3.5: resolve
  pathname from `req.nextUrl?.pathname ?? new URL(req.url!).pathname`, `cap =
  capabilityForRoute(...)`, `return cap ? requireCapability(authCtx.role, cap) : null`.
- **Verify.** `tsc` passes; a member `authCtx` + a fake `POST /api/settings/members/invite` Request →
  returns a 403 `Response`; admin → `null`.
- **Test.** Folded into `route-capability.test.ts` (drive the guard, not just the map). (AC-13)

### T5 — `capabilityForPageAction` (manifest metadata → capability)
- **Action.** In `permissions.ts`, add `capabilityForPageAction(entry: { id; mutating; outbound?; cost?;
  reversible? }): Capability | undefined` per design §3.4: `cost:"money"`→`outbound:paid`;
  `outbound`→`outbound:send`; `mutating && id.startsWith("accounts.")`→`accounts:write`; `mutating &&
  reversible===false`→ `*:delete` by id namespace (`contacts.`→`contacts:delete`, etc.); `mutating`
  (generic)→ `*:write` by namespace; pure-read→`undefined`.
- **Verify.** REPL on the CLE-04 fixture entries: `sequences.launch{outbound,cost:money}`→`outbound:paid`;
  `accounts.applyFilter{read}`→`undefined`.
- **Test.** Covered by T9's `page-action-permission.test.ts`.

### T6 — Migrate the capability-resolver to DERIVE verdicts + the KEYSTONE parity test
- **Action.** In `src/lib/agents/capability-resolver.ts`: add `toolAdminOnly(name)` and
  `toolViewerAllowed(name)` per design §3.3 (use `capabilityForTool` + `hasPermission`; keep
  `VIEWER_GATEWAY_TOOLS` short-circuit and the `getToolGroup`/`VIEWER_ALLOWED_GROUPS` fallback for
  unmapped read tools). Replace the `ADMIN_ONLY_TOOLS.has(name)` and `!isViewerAllowedTool(name)` checks
  in `resolveCapabilities` (`:179,:183`) with the derived fns. **Keep** `DESTRUCTIVE_TOOLS` +
  `allowDestructive` and `PRO_TIER_TOOLS` + `planTier` gates unchanged (`:187-194`). Retain the legacy
  `ADMIN_ONLY_TOOLS`/`VIEWER_*` Sets **only** as the parity-test fixture (annotate them as such).
- **Verify.** `resolveCapabilities` for admin/member/viewer over a fixture registry drops the same tool
  names as before this change (eyeball the `droppedTools` reasons).
- **Test (required).** `capability-resolver.parity.test.ts` (design §9 keystone): for **every** tool in
  `buildAllChatTools(ctx)`, assert `toolAdminOnly(name) === ADMIN_ONLY_TOOLS.has(name)` and
  `toolViewerAllowed(name) === legacyIsViewerAllowed(name)`; differences must be exactly the declared
  `INTENTIONAL_DELTAS` set; assert `toolViewerAllowed("invokePageAction")===true`; assert a delete tool
  with `allowDestructive:false` is still dropped `destructive-gated`. (AC-7/AC-8/AC-9/AC-10)

### T7 — Add the admin/member gate to the middleware
- **Action.** In `src/middleware.ts`, **after** the viewer block (`:152-163`) and **before** `return
  NextResponse.next()` (`:165`): `const cap = capabilityForRoute(pathname, req.method); if (cap &&
  !hasPermission(sessionRole ?? "member", cap)) return NextResponse.json({error:{code:"FORBIDDEN",...,
  requiredCapability:cap}},{status:403});` (design §3.1, §5.2). JWT role only; no DB read.
- **Verify.** Viewer write still 403s with `reason:"viewer-read-only"` (the viewer branch wins, runs
  first). A member JWT on `POST /api/settings/members/invite` 403s with `requiredCapability:
  "members:invite"`. A member JWT on `POST /api/contacts` passes. A public path (`/api/inngest`,
  `/api/calls/twiml`) is untouched (gate not reached).
- **Test.** `middleware-capability.test.ts` (design §9 bullet 4) — factor the gate into a testable pure
  helper if the `auth()` wrapper makes the closure hard to unit-test; assert viewer-first ordering
  (AC-3), member-vs-admin (AC-5), public-skip (EC-5).

### T8 — Insert the matrix gate into `invokePageAction` (before `decideAction`)
- **Action.** In `src/lib/chat/tools/page-actions.ts` (CLE-04), inside `invokePageAction.execute`, after
  the schema `safeParse` and **before** the `decideAction({...})` call (CLE-04 design §2.3): `const
  requiredCap = capabilityForPageAction(entry); if (requiredCap && !hasPermission(role, requiredCap))
  return { error: \`Cannot run "${actionId}": your role (${role}) lacks "${requiredCap}".\` };` (no
  `_uiDirective` key). (design §3.4)
- **Verify.** Member + a `cost:"money"` fixture action → `{ error }` with no directive, and a spy shows
  `decideAction` was **not** called. Member + read action → reaches `decideAction`.
- **Test.** `page-action-permission.test.ts` (design §9 bullet 5). (AC-11/EC-7) Re-run CLE-04's
  `page-actions.tools.test.ts` — must stay green for the read/member-write cases.

### T9 — Apply `requireCapabilityForRequest` to the highest-risk write routes
- **Action.** Add `const denied = requireCapabilityForRequest(authCtx, req); if (denied) return denied;`
  (inside the `withAuthRLS` callback, so `authCtx.role` is the **fresh** DB role) to the routes in
  design §5.3 step 5: members (`/api/settings/members/invite`, `/api/settings/members/invites`, member
  role-change), settings/config (`icp`, `autonomy`, `mail-calendar`, `data-model`, `custom-signals`,
  `compliance`, `settings/knowledge`, `mcp/*`), sends/enroll (`emails/send`, `sequences/[id]/enroll`,
  `sequences/drafts/bulk-approve`, `sequences/[id]/autopilot`, `meetings/[id]/notes/send-follow-up`),
  money (`calls/buy-number`→`outbound:paid`), deletes (`contacts/[id]`, `accounts/[id]`,
  `deals|opportunities/[id]` DELETE, `gdpr/delete`). Where a route already calls `requireAdmin`/
  `requirePermission`, **add** the shared guard alongside (belt-and-braces, fresh role) — do not remove
  the legacy line in this feature (the long-tail checklist §5.4 converges later).
- **Verify.** For 3-4 representative routes, a member `authCtx` → 403 from the guard before any handler
  work; admin → proceeds. Existing tests for those routes (if any) still pass.
- **Test.** `route-capability.test.ts` already drives the guard for the map; add one focused per-route
  assertion for `calls/buy-number` (`outbound:paid` → member 403, admin pass) and
  `sequences/[id]/enroll` (`sequences:write` → member pass, viewer blocked). (AC-13)

### T10 — Cross-map consistency + out-of-scope + hygiene guards
- **Action.** Add `cross-map-consistency.test.ts` (design §9 bullet 6 / EC-8) asserting tool-vs-route
  agree on shared verbs. Add the `regression.sh` greps: (a) `git diff` touches no `withTenantTx`/`WHERE
  tenant_id`/`db/migrations`/RLS file and no membership-write logic (eval step 9); (b) no role→capability
  literal (`role === "admin"`/`=== "viewer"` deciding a capability) outside `permissions.ts` +
  `viewer-guard.ts`; (c) the 59 legacy `requireAdmin`/`requirePermission` sites still present and
  compiling.
- **Verify.** `bash regression.sh` green; `tsc --noEmit` 0 errors.
- **Test.** The three greps + `cross-map-consistency.test.ts` are the tests.

### T11 — Acceptance pass + doc/checklist
- **Action.** Run the full requirements §7 evaluation (steps 1-10). Record the long-tail checklist
  (design §5.4) in the PR description. If any AC fails or the spec proves wrong → `spec-issues.md`, back
  to Phase 4. Do **not** flip `allowDestructive`/`planTier`; do **not** edit the 287 unmapped routes.
- **Verify.** All ACs green; parity test (T6) green with `INTENTIONAL_DELTAS` empty or explicitly
  justified; viewer floor byte-identical; completeness self-scored 8/10 with the §8 tradeoff written
  into the PR.
- **Test.** `regression.sh` + all CLE-12 suites + CLE-04/CLE-10 suites green (no regression in the
  sibling specs' tests — esp. `decide-action.test.ts` unchanged: CLE-12 does not touch `decideAction`).

---

## Task → AC/EC coverage map

| Task | Covers |
|---|---|
| T1 | AC-1, AC-2, AC-14; EC-2 |
| T2 | AC-7 (input to keystone) |
| T3 | AC-4, AC-5, AC-6, AC-12; EC-3, EC-6 |
| T4 | AC-13; EC-1 (fresh-role guard) |
| T5 | AC-11 (input) |
| T6 | AC-7, AC-8, AC-9, AC-10 (keystone parity) |
| T7 | AC-3, AC-4, AC-5, AC-6; EC-1, EC-5 |
| T8 | AC-11; EC-7 |
| T9 | AC-13; rollout §5.3 |
| T10 | EC-8; out-of-scope (RLS/assignment); hygiene |
| T11 | full §7 eval; §8 tradeoff; completeness 8/10 |
