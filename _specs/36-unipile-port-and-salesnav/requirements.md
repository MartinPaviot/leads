# 36 — Unipile LinkedIn port + Sales Navigator connect

> Feature-spec (Kiro). Inherits `/spec/steering`. Brownfield: the LinkedIn port
> (spec 24) already exists — Unipile is a **second adapter** behind it, plus the
> net-new account-auth + relations + reply-webhook surface. T0 is reconciliation.
>
> Research artifact (live Unipile docs, adversarially verified — 29-agent run):
> `_research/` workflow output, summarized in `design.md` §"Verified capabilities".

## Context

Founder goal, four parts:
1. **Enrich TAM** (accounts) and **contacts** from LinkedIn / Sales Navigator.
2. **Run LinkedIn campaigns** (connect + message sequences).
3. **Build a connection graph** (who on the team knows whom at a target account).
4. **Connect the founder's Sales Navigator account** (requirement #1).

Unipile (unified messaging/enrichment API; EU-only hosting, France/Scaleway,
SOC2 Type II, GDPR processor; €49/mo incl. up to 10 accounts) provides all four
through one connected LinkedIn seat. It slots in as a `UnipileAdapter implements
LinkedInPort` (sibling to `HeyReachAdapter`, `lib/providers/heyreach/linkedin-adapter.ts:68`),
reusing the entire spec-24 orchestration unchanged.

Depends on: 00 (canonical identity), 14 (anti-collision), 22 (suppression),
24 (LinkedIn port — BUILT), 25 (sequence engine), 26 (reply ingest),
35 (targeting — LIVE). New dependency it INTRODUCES: a LinkedIn sending-identity
model (there is **no** LinkedIn analog to spec 21, which is email-only).

## Story

As the engine, I want a Unipile adapter behind the existing LinkedIn port — with
the founder's Sales Navigator seat connected via hosted auth — so I can source +
enrich from Sales Nav, run connect/message campaigns within platform-safe rates,
ingest replies, and surface 1st-degree connections as warm paths, without any new
sending orchestration.

## Acceptance criteria (EARS)

### A. Sales Navigator connection (requirement #1)
- **AC1.** THE SYSTEM SHALL connect a LinkedIn account via Unipile **hosted auth**
  (`POST /hosted/accounts/link`, opened in a new tab — never an iframe), with **no
  credentials touching our servers**. Sales Navigator is auto-detected from the
  premium login; no separate flow.
- **AC2.** WHEN Unipile POSTs the hosted-auth `notify_url` with
  `status=CREATION_SUCCESS`, THE SYSTEM SHALL persist `unipile_account_id` against
  a `linkedin_account` row keyed by our pre-issued `name`, and set
  `status='connected'`. The webhook SHALL verify a signature before trusting it.
- **AC3.** WHEN a session expires (Unipile status flips to `CREDENTIALS` — password
  change, checkpoint, ~1y lifetime), THE SYSTEM SHALL mark the account
  `reconnect_required`, report **zero capacity**, and surface a reconnect
  hosted-auth link to the founder. No dispatch occurs while `status != 'connected'`
  (fail-closed, mirroring spec-21 `verifyAuth`).

### B. LinkedIn campaigns (sending)
- **AC4.** THE SYSTEM SHALL implement `UnipileAdapter` satisfying `LinkedInPort`
  (`connect`/`message`), mapping `LinkedInRequest` to Unipile: `connect` →
  `POST /users/invite` (`{account_id, provider_id, message≤300}`); `message` →
  `POST /chats` (new chat to a 1st-degree relation) or `POST /chats/{id}/messages`
  (reply in an existing chat).
- **AC5.** THE SYSTEM SHALL target a person by Unipile **`provider_id`**, resolved
  from the contact's `profileUrl` via `GET /users/{identifier}` **using the same
  sending account** (provider_id is viewer-scoped), cached per `(contact, account)`.
  A contact whose `provider_id` cannot be resolved is refused (`no-profile` class).
- **AC6.** THE SYSTEM SHALL reuse `runLinkedInAction` unchanged: suppression (22),
  anti-collision (14), per-account daily limits (`limits.ts`), idempotency per
  `(stepId, contactId)`, metering, and event emission. A LinkedIn touch counts
  toward the same per-account contact cap as email (spec-15 AC3).
- **AC7.** THE SYSTEM SHALL branch the send path on connection degree + seat:
  1st-degree → message; non-connection → connect (invite); non-connection +
  premium seat + InMail credits → InMail (`options.linkedin.inmail=true`). It SHALL
  NOT call `startNewChat` on a non-relation (LinkedIn 422s).
- **AC8.** THE SYSTEM SHALL map Unipile HTTP errors: `429` and `5xx` → retryable
  (`server_error`); other `4xx` incl. `422 cannot_resend` → terminal
  (`client_error`). InMail-no-credit → terminal, surfaced as "needs InMail seat".

### C. Account health / caps (the spec-21 LinkedIn analog — NET-NEW)
- **AC9.** THE SYSTEM SHALL expose `getLinkedInSendableCapacity(account)` returning
  `remaining = dailyCap − actionsToday` per action, **0** when the account is not
  `connected`. `actionsToday` SHALL be a `COUNT(*)` on a durable
  `linkedin_action_event` table (today `emitEvent` is in-memory only).
- **AC10.** THE SYSTEM SHALL apply a warmup ramp on a new seat
  (`warmup_started_at`): start ≤5 connects/day, ramp to the `limits.ts` defaults
  (20 connect / 100 message) over ~2 weeks. It SHALL never exceed LinkedIn's
  ceiling (~80–100 invites/day) — Unipile does **not** enforce caps; we must.

### D. Connection graph
- **AC11.** THE SYSTEM SHALL ingest the connected account's 1st-degree relations
  (`GET /users/relations`, cursor-paginated) into `upsertKnowsEdge`
  (`relationship-graph.ts`) as a new channel `linkedin`, matching each relation's
  `public_profile_url` → contact via `linkedinPath` (`identity.ts:88`).
- **AC12.** THE SYSTEM SHALL assign a confirmed 1st-degree connection a **fixed
  confidence 0.80** (structural fact, not the email-frequency curve). The accounts
  "Connected to" column surfaces it with `channel="linkedin"` via the existing
  `findWarmPathsToCompanies` — **zero UI change**.

### E. Enrichment (TAM + contacts)
- **AC13.** THE SYSTEM SHALL add a Unipile contact-enrichment provider
  (`ContactEnrichmentProvider`, `contact-enrichment/types.ts:97`) contributing a
  verified, normalized `linkedinUrl` + title/seniority from profile retrieval;
  `isAvailable()` gates on a **connected** `linkedin_account`, not just an env key
  (reads burn the seat's rate budget). Apify (`lib/linkedin/apify-profile.ts`)
  stays as the no-seat-at-risk fallback role-verifier — **not replaced**.
- **AC14.** THE SYSTEM SHALL support Sales Navigator **search** for TAM/contact
  sourcing: `POST /linkedin/search` (`api="sales_navigator"`), search-by-URL, and
  `GET /linkedin/search/parameters` to resolve filter IDs. Results feed
  `sourceContacts(account, persona)` (spec-15) and the company waterfall; every
  emitted `linkedinUrl` SHALL be normalized via `linkedinPath` before persistence.
  `provider_id` is **never** a canonical identity (viewer-scoped vendor data).

### F. Reply ingest
- **AC15.** THE SYSTEM SHALL ingest Unipile message webhooks
  (`source=messaging`, `message_received`) into spec-26 `ingestReply(raw)→ReplyEvent`,
  matching by `account_id` + sender `provider_id` → contact, idempotent on the
  Unipile **provider message id**. A LinkedIn opt-out SHALL suppress (22/35 at the
  resolved email/account scope), release the spec-14 lock, and halt the sequence
  (25). A polling fallback feeds the **same** normalizer when webhooks are absent.

## Out of scope
- Email sending (23) and email identity/warmup (21). WhatsApp/other Unipile
  channels. Two-hop warm-path inference (graph stays one-hop, per current v0).
- Withdrawing a pending invitation — **no confirmed Unipile API**; the UI must not
  promise it (pending invites expire LinkedIn-side).

## Open questions (founder-facing — see design §13)
1. Sales Navigator seat vs classic premium? (Gates InMail-to-non-connections.)
2. Dedicated automation account vs the founder's personal/Sales-Nav login?
   (Ban-risk recommendation: dedicated.)
3. Target weekly volume? (Sets the warmup ramp + caps.)
4. EU data region — **answered**: Unipile is EU-only (France/Scaleway). Provision
   the EU DSN.
