# 36 — Design: Unipile LinkedIn port + Sales Navigator connect

## 1. Decision

Unipile is a **`UnipileAdapter implements LinkedInPort`** (sibling to
`HeyReachAdapter`, `lib/providers/heyreach/linkedin-adapter.ts:68`), behind the
existing port at `lib/sending/linkedin/port.ts:56`.

**Reused unchanged:** the port interface (`connect`/`message`/`status?`), the
whole orchestration in `runLinkedInAction` (`lib/sending/linkedin/linkedin.ts:62`
— idempotency, `isSuppressed` 22, `isCollisionLocked` 14, `actionsToday→
withinDailyLimit`, meter, `emitEvent`), the daily-limit constants
(`lib/sending/linkedin/limits.ts`, connect 20 / message 100), the spec-25
step-type→port routing, spec-26 `ingestReply`, and the canonical `linkedinPath`/
`contactIdentityKey` dedup (`db/canonical/identity.ts:88`).

**Net-new (the real delta):**
1. a `linkedin_account` sender-identity table + auth/health model — there is **no
   LinkedIn analog to spec 21** (spec 21 is email-only and pure-functional: the
   caller hands it `SendingMailbox[]`, `lib/sending/identity/capacity.ts:14`);
2. the Sales-Nav hosted-auth connect flow + webhook persistence;
3. a `provider_id` resolution+cache step (Unipile targets an opaque `provider_id`,
   **not** `profileUrl`; ids are **viewer-scoped**);
4. a Unipile relations→`upsertKnowsEdge` ingester as a new graph channel;
5. Unipile message webhooks → `ingestReply`.

**One hard new gate:** account-health-sendable, mirroring spec-21 `verifyAuth`
fail-closed, surfaced through the port's optional `status?()`.

## 2. Capability → seam map (all endpoints below are **confirmed** unless flagged)

| Unipile capability | Doc | Elevay seam (file:line) | Build |
|---|---|---|---|
| Invite w/ note `POST /users/invite` | reference/userscontroller_adduserbyidentifier | `LinkedInPort.connect` (`port.ts:57`) | `UnipileAdapter.connect`; map `note`→`message`, clamp ≤300; missing `provider_id`→`client_error` 400 |
| New chat `POST /chats` (multipart) | reference/chatscontroller_startnewchat | `LinkedInPort.message` (`port.ts:58`) | `startNewChat({account_id, attendees_ids:[provider_id], text})` |
| Reply in chat `POST /chats/{id}/messages` | docs/send-messages | adapter follow-up step | persist `chat_id` per `(contact,account)`; reuse it to avoid the 1st-degree re-check |
| Resolve URL→`provider_id` `GET /users/{identifier}` | docs/invite-users | pre-step before `runLinkedInAction` | `resolveProviderId(profileUrl, account_id)`, cache per `(contact, account)` — **same account that sends** |
| Degree/distance `GET /users/{id}`→`network_distance` | reference/userscontroller_getprofilebyidentifier | branch connect vs message vs InMail | store `connection_degree` on the cache row |
| InMail `POST /chats` `options.linkedin.inmail=true`, `api∈{classic,recruiter,sales_navigator}` | docs/send-messages | `message` InMail branch | **runtime UNCERTAIN** — can 4xx on missing credits; treat terminal, surface "needs InMail seat" |
| Hosted auth `POST /hosted/accounts/link` | docs/hosted-auth | `app/api/linkedin/connect/route.ts` | server action returns `{url}`; open in a tab, never iframe |
| Hosted-auth callback webhook | docs/hosted-auth | `app/api/linkedin/unipile/account-webhook/route.ts` | on `CREATION_SUCCESS`/`RECONNECTED` persist `account_id`↔our `name` |
| **Sales-Nav / LinkedIn search** `POST /linkedin/search` (`api="sales_navigator"`) | reference/linkedincontroller_search · docs/linkedin-search | company + contact enrichment waterfalls; `sourceContacts` (15) | **CONFIRMED** — people/company/job/post search, cursor pagination |
| Search-by-URL `POST /linkedin/search` `{url}` | docs/linkedin-search | TAM import from a pasted Sales-Nav search | **CONFIRMED** |
| Resolve filter IDs `GET /linkedin/search/parameters` | docs/linkedin-search | TAM pipeline pre-step | **CONFIRMED** — filters need numeric IDs, only `keywords` is free text |
| Relations list `GET /users/relations` (cursor, 1–1000/pg) | relations docs | `buildKnowsFromLinkedIn`→`upsertKnowsEdge` (`relationship-graph.ts`) | **CONFIRMED** — every item is implicitly 1st-degree; only `headline` for role |
| New-message webhook `source=messaging` `message_received` | docs/new-messages-webhook | `app/api/linkedin/unipile/message-webhook/route.ts`→`ingestReply` | **CONFIRMED** — 5 retries, must 200 within 30s |
| Account-status webhook `source=account_status` (`CREDENTIALS`) | docs/account-lifecycle | reconnect handling | **CONFIRMED** |
| Withdraw pending invite | — | — | **NOT FOUND** — do not promise in UI |

> Correction vs the first synthesis pass: **Sales-Nav search is CONFIRMED**
> (dedicated research topic, 3 `confirmed` verdicts), not uncertain. It is the
> primary TAM lever. Only the InMail *runtime* credit failure and the
> *withdraw-invite* API remain uncertain/absent.

## 3. Sales Navigator connection flow (requirement #1)

A Sales Nav login is a premium LinkedIn login — the standard hosted-auth path
covers it; Sales Nav features are auto-detected from the seat's entitlement.

1. Founder clicks **"Connect LinkedIn"** → server action calls
   `POST /api/v1/hosted/accounts/link` with `{type:"create", providers:["LINKEDIN"],
   api_url:<DSN>, expiresOn:<ISO+30min>, notify_url:<our webhook>,
   name:<linkedin_account.id we pre-insert status='pending'>, success_redirect_url,
   failure_redirect_url}` → `{url:"https://account.unipile.com/<token>"}`.
2. Open the URL in a **new tab** (iframe breaks the LinkedIn captcha). Founder does
   sign-in + 2FA + captcha on Unipile infra; **no credentials touch our servers**.
3. Unipile POSTs `notify_url` `{status:"CREATION_SUCCESS", account_id, name}`. The
   webhook verifies its signature, then sets `unipile_account_id`, `status='connected'`.
4. All future calls use `unipile_account_id` as `account_id`. Unipile holds the
   session (~1y; flips to `CREDENTIALS` on password change / checkpoint).
5. **Reconnect:** `status?()` health probe (or the account-status webhook) flips the
   row to `reconnect_required`; we mint a reconnect hosted-auth link; callback
   `RECONNECTED` restores it. While `status != 'connected'` → **zero capacity**,
   no dispatch.

## 4. New schema (`db/schema/linkedin.ts`, migration `0103_linkedin_account.sql` — localdev first, prod via `DATABASE_URL_OWNER`)

**`linkedin_account`** — sender identity + auth/health (the spec-21 mailbox analog,
which does not exist for LinkedIn):
```
id text pk · tenant_id→tenants · user_id→users · provider text default 'unipile'
unipile_account_id text unique (null until callback) · display_name text · profile_url text
seat_type text default 'classic'      -- classic|sales_navigator|recruiter (InMail api selector)
status text default 'pending'         -- pending|connected|reconnect_required|checkpoint|disabled
last_health_at timestamptz · health_detail jsonb default '{}'
daily_cap_connect int default 20 · daily_cap_message int default 100
warmup_started_at timestamptz · connected_at timestamptz · created_at · updated_at
-- idx (tenant_id), (unipile_account_id), (tenant_id, status)
```

**`linkedin_provider_identity`** — the viewer-scoped `provider_id` cache:
```
id pk · tenant_id→tenants · contact_id→contacts · linkedin_account_id→linkedin_account
profile_url text (normalized via linkedinPath) · provider_id text (Unipile opaque)
chat_id text (set after first message) · connection_degree text ('1st'|'2nd'|'3rd'|null)
resolved_at timestamptz
-- unique (linkedin_account_id, contact_id) ; idx (tenant_id, profile_url)
```

**`linkedin_action_event`** — durable `LinkedInActionEvent` (today in-memory only):
```
id pk · tenant_id→tenants · linkedin_account_id→linkedin_account · step_id text
contact_id→contacts · action text (connect|message) · provider_action_id text
idempotency_key text unique · at timestamptz · created_at
-- idx (tenant_id, linkedin_account_id, action, at)  -- backs actionsToday COUNT
```
`actionsToday(senderAccountId, action)` (`linkedin.ts:45`) becomes a `COUNT(*)` here.

## 5. Connection graph

`buildKnowsFromLinkedIn(tenantId, linkedinAccountId)`: pull relations
(`GET /users/relations`, cursor), match each `public_profile_url`→contact via
`linkedinPath` (`identity.ts:88`), upsert a KNOWS edge into `context_graph_edges`
with `metadata.channel="linkedin"`, `sourceType="enrichment"`,
`metadata.source="unipile.relations"`. Reuse the in-place upsert from
`buildKnowsFromActivities` (`relationship-graph.ts:235`).

**Confidence — NOT the frequency curve.** A 1st-degree connection is one
high-quality structural fact, not a count. Fixed **0.80** (above email's ~0.72 at
20 mails, below the ~0.95 ceiling). Surfacing is **free**:
`findWarmPathsToCompanies` (`relationship-graph.ts:287`) reads any KNOWS channel,
sorts by `strength`, and the accounts page popover already renders `channel` →
"Connected to … via LinkedIn".

## 6. TAM + contact enrichment

- **Contact waterfall** (`lib/providers/contact-enrichment/`): `unipile-adapter.ts`
  implementing `ContactEnrichmentProvider`, priority ~25 (after Apollo's cheap
  pass), `isAvailable()` requires a **connected** seat. Contributes verified
  `linkedinUrl` + title/seniority via `GET /users/{identifier}`. Provenance through
  `waterfall.ts:177`.
- **TAM/company** (`lib/providers/company-enrichment/` + `sourceContacts` 15):
  Sales-Nav **search** (`POST /linkedin/search` `api="sales_navigator"`,
  search-by-URL, `/search/parameters` for filter IDs). Cursor-paginate (2,500/query
  on Sales Nav). Keep Apollo/Sirene as a parallel backbone, not a replacement.
- **Identity:** normalize every emitted `linkedinUrl` through `linkedinPath` so
  `contactIdentityKey` `li:<linkedin>` and `contactMatchPlan {by:"linkedin"}` dedup
  (`identity.ts:99,121`). `provider_id` lives in `linkedin_provider_identity`, never
  in identity (vendor-id rule, `identity.ts:5`).
- **Apify stays.** `lib/linkedin/apify-profile.ts` is a no-cookie read with no seat
  at risk; Unipile retrieval is richer but spends the seat's budget. Unipile becomes
  the preferred role-verifier when a seat is connected + budget allows; Apify is the
  default/fallback. Do not delete.

## 7. LinkedIn campaigns

Connect→message runs through the spec-25 engine with **zero engine changes**: a
`linkedin` step calls `runLinkedInAction` via the port; the Unipile adapter is what
the port resolves to when `LINKEDIN_OUTREACH_PROVIDER=unipile`.

- **Reused gates** (all inside `runLinkedInAction`): suppression 22, anti-collision
  14, daily limits, idempotency, metering+event. Targeting 35 + lawful-basis 33 at
  enrollment, unchanged. The LinkedIn source (`campaign-engine/sources/linkedin.ts`)
  must register enrollments so spec-14 `detectAccountOverlap` sees them.
- **New pre-step:** `resolveProviderId(profileUrl, account_id)` before connect/
  message (Unipile targets `provider_id`). Resolution failure = `no-profile`-class.
- **New gate (spec-21 analog):** account-health sendable at the port's `status?()`
  seam feeding a `getLinkedInSendableCapacity` mirroring `capacity.ts:85` — a
  `reconnect_required`/`checkpoint`/`disabled` account reports `available=0`.
- **Three send paths** (branch on degree+seat): 1st-degree→message/startNewChat;
  non-connection→connect; non-connection+premium+credits→InMail. Never blind-call
  `startNewChat` (422 "not first degree").

## 8. Reply ingest

New webhook `app/api/linkedin/unipile/message-webhook/route.ts`: verify signature
(spec-26 open question L21 applies), normalize the Unipile message event →
`ReplyEvent`, match `account_id`+sender `provider_id` → contact, idempotent on the
Unipile **provider message id**. Opt-out → suppress at resolved email/account scope
(no native LinkedIn-profile suppression scope) → release spec-14 lock → halt
sequence (25 AC5). Polling fallback feeds the **same** `ingestReply`.

## 9. Trade-offs (each with a pick)

- **HeyReach vs Unipile.** Both implement `LinkedInPort` identically. HeyReach owns
  the seats (managed); Unipile = we own the seat + get relations/replies/hosted-auth
  + search. **Pick: Unipile default, KEEP HeyReach behind the env switch.** The port
  makes both free to retain; HeyReach is the fallback if Unipile session fragility
  bites an account. Deprecation is premature.
- **Session fragility + reconnect.** Sessions die on cookie rotation/captcha/
  checkpoint; reconnect is a founder-in-the-loop round-trip. **Pick:** fail-closed
  capacity + proactive `status?()` probe + first-class `reconnect_required` state +
  alert the founder immediately. Silent retry on a checkpointed account → ban.
- **Sales Nav ToS / ban risk.** Automation on a personal Sales Nav account risks the
  founder's real account + seat. **Pick: strongly prefer a DEDICATED account**, with
  warmup (`warmup_started_at`) and caps well under LinkedIn's ~80–100 invites/day. If
  the founder insists on personal, hard-cap connects ≤15/day + explicit consent.
- **Pricing.** €49/mo incl. 10 accounts; one seat per single-founder tenant at
  launch. **Pick:** one seat/tenant; revisit multi-seat on demand. Log the charge
  before connecting any paid seat (budget rule).
- **Data region — answered.** Unipile is EU-only (France/Scaleway), SOC2 Type II,
  GDPR processor. Good fit for Swiss/French prospects; no US-region toggle exists.

## 10. Rollout

- **Flag:** `LINKEDIN_OUTREACH_PROVIDER=unipile` flips
  `linkedinMessageAdapter.isAvailable()` (`sequence-dispatch/linkedin-adapter.ts:23`)
  and selects `UnipileAdapter` in the port factory. Unset → stub inert (today's
  behavior; no accidental sends).
- **Test-mode allowlist:** mirror the email allowlist (`elevay.dev` + outlook).
  `LINKEDIN_TEST_MODE_ALLOWLIST` of permitted target `profile_url`s; in test mode
  the adapter refuses non-allowlisted contacts as `client_error` **before** hitting
  Unipile. First live targets = our own controlled profiles.
- **Staged caps:** week 1 `daily_cap_connect=5`, `daily_cap_message=20`; ramp to
  20/100 over ~2 weeks via `warmup_started_at`.
- **Secrets:** `UNIPILE_API_KEY`, `UNIPILE_DSN`, `UNIPILE_WEBHOOK_SECRET` in env/.env
  (never committed — secret-scan hook).

## 11. Completeness score

| Component | Score | Missing |
|---|---|---|
| Adapter (connect/message/reply) | 9/10 | InMail runtime credit failure uncertain; multipart encoding must be exact |
| Auth / Sales-Nav connect | 8/10 | Webhook signature scheme not confirmed; reconnect UX founder-in-loop (inherent) |
| Search (TAM/contact) | 8/10 | Confirmed; filter-ID resolve adds a pre-step; rate-budget per seat |
| Connection graph | 9/10 | Relations pagination/rate not enumerated; 0.80 is a judgment call |
| Campaigns | 8/10 | New `provider_id` resolve + degree branching; `actionsToday` needs the event table |
| Replies | 8/10 | Webhook auth open (26 L21); LinkedIn opt-out→email/account suppression is indirect |

## 12. Tasks → `tasks.md` (T0 reconcile … T12 gate "first live LinkedIn action via Unipile").

## 13. Open questions for the founder

1. **Sales Nav seat?** Sales Navigator subscription, or classic premium? (Sets
   `seat_type`; InMail-to-non-connections needs a premium seat + credits.)
2. **Dedicated vs personal account?** Strong recommendation: a dedicated account
   (ban risk to your personal Sales Nav is real). OK to provision one?
3. **Target weekly volume?** Sets warmup ramp + caps (we start ≤5 connects/day,
   ramp to ~20; ceiling ~80–100/day).
4. **EU data region — answered** (Unipile EU/France). No action needed unless you
   want confirmation in the DPA.

## Verified capabilities (live docs, adversarially verified)

Endpoints all confirmed against `developer.unipile.com` (Jan–Jun 2026 docs):
`POST /users/invite`, `GET /users/{identifier}`, `GET /users/relations`,
`POST /chats`, `POST /chats/{id}/messages`, `POST /linkedin/search`,
`GET /linkedin/search/parameters`, `POST /hosted/accounts/link`,
`POST /webhooks` (`messaging` + `account_status`). Node SDK:
`new UnipileClient(dsn, accessToken)` with `client.account|messaging|users|email`
namespaces (search via the generic `client.request.send` escape hatch — no typed
helper in v1.9.x). Limits (Unipile does NOT enforce — we must): invites ~80–100/day
~200/week paid; profile views ~100/day; search 1,000/day standard, 2,500/day Sales
Nav; InMail 30–50/day rec., 800/mo free; HTTP 429/500/422 on breach.
