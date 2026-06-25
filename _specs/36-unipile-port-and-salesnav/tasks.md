# 36 — Tasks (test-first)

Each task: code → test → verify. No live Unipile call until T12. Adapter layer
(T1–T3, T7–T8) ships behind `LINKEDIN_OUTREACH_PROVIDER` exactly as spec-24
HeyReach shipped with "no live action in CI".

- **T0 — RECONCILE.** Confirm against live code: port unchanged
  (`sending/linkedin/port.ts:56`), spec-21 has no mailbox table (pure-functional,
  `sending/identity/capacity.ts:14`), `emitEvent` is in-memory (`linkedin.ts:16`),
  the dispatch stub names "unipile" (`sequence-dispatch/linkedin-adapter.ts:20`).
  → `RECONCILE.md`. `=== GATE: reconciliation ===` *(no test)*.

- **T1 — provider_id resolution.** `resolveProviderId(profileUrl, account_id)` +
  the `linkedin_provider_identity` cache. **Test:** public URL→`provider_id`;
  viewer-scoping (resolve uses the sending `account_id`); cache hit short-circuits;
  unresolved → `no-profile`-class.

- **T2 — UnipileAdapter (connect/message).** ✅ *shipped this slice* —
  `lib/providers/unipile/{client,linkedin-adapter}.ts`. Implements `LinkedInPort`;
  invite-note ≤300 clamp; `provider_id` via injected `TargetResolver`; chat-vs-reply
  branch; `LinkedInError` mapping (429/5xx→server_error, other 4xx→client_error).
  **Test:** `__tests__/linkedin-adapter.test.ts` (payload shapes, missing
  `provider_id`→client_error, error mapping, runs through `runLinkedInAction`).

- **T3 — InMail branch.** ✅ *shipped* — `UnipileAdapter.message` InMail path
  (`inmail`+`api`), no-credit 4xx terminal, existing-chat precedence. 20 adapter tests.

- **T4 — schema + migration 0103.** ✅ *shipped (files)* — `db/schema/linkedin.ts`
  (3 tables) + barrel + `drizzle/0103_linkedin_account.sql` (idempotent).
  **PENDING: apply** to localdev (`db:push`) then prod via `DATABASE_URL_OWNER` —
  the round-trip + `actionsToday` COUNT test runs against the applied DB.

- **T5 — account-health capacity gate.** ✅ *shipped* —
  `lib/sending/linkedin/capacity.ts` `getLinkedInSendableCapacity`, fail-closed when
  not `connected`, LinkedIn warmup ramp. Full pure test suite green.

- **T6 — connect IN ELEVAY (hosted-auth) + callback webhook.** ✅ *shipped* —
  `lib/providers/unipile/http.ts` (hosted-auth + config + token verify),
  `app/api/linkedin/connect/route.ts` (GET status + POST mint link),
  `app/api/linkedin/unipile/account-webhook/route.ts` (persists on
  `CREATION_SUCCESS`/`RECONNECTED`), UI card `_linkedin-connect.tsx` in
  settings/sending-infrastructure. Callback secured by `?token=UNIPILE_WEBHOOK_SECRET`.
  Pure-helper tests green. **Live verify pending** (needs DSN + secret + deploy).

- **T7 — wire into runLinkedInAction.** ✅ *shipped* —
  `lib/providers/unipile/messaging-client.ts` (LIVE UnipileClient: invite JSON,
  chats multipart, InMail `linkedin[...]`), `lib/sending/linkedin/factory.ts`
  (`buildLinkedInPort` selects Unipile/HeyReach by `LINKEDIN_OUTREACH_PROVIDER`,
  fail-closed null), `lib/sending/linkedin/db-store.ts` (durable `actionsToday`
  COUNT + idempotency-as-event-row on `linkedin_action_event`),
  `lib/sending/linkedin/dispatch.ts` (`dispatchLinkedInAction`: health gate →
  factory → store → `runLinkedInAction`, warmup caps authoritative). Migration
  0103 **applied to prod** (EU, verified). Tests green; dispatch/db-store are
  DB/live glue (integration-verified at T12). **Remaining glue: T1 live
  `resolveProviderId`** (GET /users/{identifier} + cache) feeding `resolveTarget`.

- **T8 — sequence-engine routing live.** Un-stub `linkedinMessageAdapter.dispatch`
  → call the port; degree branching. **Test:** a `linkedin` step dispatches,
  pausable on guard-27, haltable on reply.

- **T9 — relations→graph ingester.** ✅ *shipped* — `relationship-graph.ts`
  `buildKnowsFromLinkedInRelations` + shared `upsertKnowsEdge` entry point +
  `matchRelationToContactId` (exported `linkedinPath`), `channel="linkedin"`,
  confidence 0.80. Pure-helper tests green; the live relations fetch + contact
  match is the T11/wiring step.

- **T10 — message webhook → ingestReply.**
  `app/api/linkedin/unipile/message-webhook/route.ts`; normalize→`ReplyEvent`;
  provider-message-id idempotency; opt-out→suppression+lock release+halt.
  **Test:** dup message-id no-ops; opt-out suppresses by resolved email/account.

- **T11 — enrichment + search adapters.** Unipile `ContactEnrichmentProvider`
  (confirmed profile retrieval); Sales-Nav search source feeding `sourceContacts`
  (15) + the company waterfall. **Test:** `linkedinUrl` normalized via
  `linkedinPath`; provenance recorded; Apify stays the default role-verifier.

- **T12 — GATE: first live LinkedIn action via Unipile.** Connect a dedicated seat
  through hosted auth; send one allowlisted connect+message; verify the event row,
  reply-webhook round-trip, and a graph edge. End on own verification log.
  `=== GATE: first live LinkedIn action ===`.

## eval.md (inline)

- Deterministic: `pnpm test unipile` green against fixtures; an action on a
  suppressed/collision-locked/no-provider_id contact is impossible; daily limits
  hold; a retried step acts once; error mapping (429/5xx retry, 4xx terminal).
- No live Unipile call in CI before T12.
- DoD: AC1–AC15 green or explicitly deferred with a flag; `RECONCILE.md` committed.
