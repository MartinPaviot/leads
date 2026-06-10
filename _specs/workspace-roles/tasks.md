# Tasks — workspace-roles

- [ ] T1. `lib/auth/viewer-guard.ts` — pure guard + allowlist. **Verify**: unit test (methods, paths, allowlist, non-viewer roles). **Test**: `lib/auth/__tests__/viewer-guard.test.ts`.
- [ ] T2. `middleware.ts` — wire the guard after the public/session checks. **Verify**: tsc; guard logic covered by T1's pure tests.
- [ ] T3. `lib/auth/fresh-role.ts` — cached DB role + invalidate. **Verify**: unit test with mocked `@/db` (cache hit, TTL expiry, invalidate, db-error→null). **Test**: `lib/auth/__tests__/fresh-role.test.ts`.
- [ ] T4. `lib/auth/auth-utils.ts` — overlay fresh role in `getAuthContext`. **Verify**: tsc + existing auth tests still green.
- [ ] T5. `lib/auth/permissions.ts` — member += contacts:delete, deals:delete, sequences:execute. **Verify**: matrix unit test. **Test**: `lib/auth/__tests__/permissions-matrix.test.ts`.
- [ ] T6. `lib/agents/capability-resolver.ts` — viewer groups/denylist/unknown-drop + prompt addendum. **Verify**: unit test viewer vs member registries. **Test**: extend `capability-resolver` tests (locate existing or create `lib/agents/__tests__/capability-resolver-viewer.test.ts`).
- [ ] T7. `api/calls/numbers/route.ts` — billing:manage on POST + DELETE. **Verify**: grep + tsc.
- [ ] T8. `api/sequences/[id]/route.ts` (status) + `api/sequences/[id]/autopilot/route.ts` — sequences:execute. **Verify**: grep + tsc.
- [ ] T9. Invite/member plumbing — invite route allowlist parse, members PUT validation + cache bust, members page selects + badge, schema comment, invite email copy check. **Verify**: extend `members-invite-api.test.ts` with viewer case; Playwright screenshot of both selects.
- [ ] T10. Run `npx tsc --noEmit` and `npx vitest run` from `app/apps/web` (capture exit codes). Fix anything red.
- [ ] T11. Commit, push, PR; preview deploy green; merge.
