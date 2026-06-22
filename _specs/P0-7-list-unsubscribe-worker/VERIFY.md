# P0-7 — list-unsubscribe-worker — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. The BullMQ send path now emits a RFC-8058
One-Click `List-Unsubscribe` header at parity with the Inngest path. No schema,
no new migration, no provider change.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| R1/R2 header on worker path | DONE | `send.worker.ts:85-99` passes `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` |
| R3 shared builder (no dup) | DONE | `worker/src/services/unsubscribe.ts` re-exports `buildUnsubscribeUrl` from `@web/lib/emails/unsubscribe-token` |
| R4 app URL from env | DONE | `NEXT_PUBLIC_APP_URL` fallback `https://app.elevay.com` — parity with `email-send-worker.ts:437` |
| R5 emailengine header merge | DONE | `emailengine.ts:71-99` adds `headers?` param, merges In-Reply-To/References + arbitrary, omits `headers` when empty |
| R8 fail-closed on missing secret | DONE | `buildUnsubscribeUrl`→`generateUnsubscribeToken` throws if `AUTH_SECRET` unset; call is in the `try` → email goes `failed`, not sent unsigned |
| R9 Inngest path untouched | DONE | diff touches only worker pkg + `email-send-worker.unsub-header.regression.test.ts` |
| vitest @web alias (Fix 4) | DONE | `worker/vitest.config.ts` mirrors the tsconfig `@web/*` path |

## Tests (all green)
- `emailengine.headers.test.ts` (4) — 4-key merge, 2-key headers-only, no-headers
  absent, threading-only.
- `unsub-token.crossruntime.test.ts` (3) — worker-built URL verifies via the web
  `verifyUnsubscribeToken`; `+`tag / mixed-case; tampered token rejected.
- `send.worker.unsub-headers.test.ts` (1) — processor passes a One-Click header
  matching `^<https?://.+/api/unsubscribe\?.+>$` with `tenant=t1`.
- `email-send-worker.unsub-header.regression.test.ts` (web, 1) — Inngest path still
  emits both One-Click sites.
- `pnpm --filter worker tsc`: 0 errors from this change; `pnpm --filter web tsc`: 0.

## Honest scope note
`workers.test.ts` (9 tests) remains RED — pre-existing under vitest 4: its `ioredis`
mock uses an arrow `vi.fn()` impl that is not constructible by `new Redis()` in
`queues/index.ts`. Proven independent of this change: the failures are in
reply/warmup/health/queues (untouched files) and none reference the new code. The
P0-7 tests deliberately mock `bullmq` with real classes to avoid that trap.
Out of scope: repairing the `workers.test.ts` ioredis harness (separate cleanup).
Infra prerequisite: `AUTH_SECRET` + `NEXT_PUBLIC_APP_URL` must be present in the
worker process env (else R8 fails sends closed).
