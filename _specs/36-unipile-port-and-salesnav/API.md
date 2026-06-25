# Unipile API reference — spec 36

> Complete API reference for the Elevay Unipile/LinkedIn/Sales-Navigator integration.
> Fetched from the live developer.unipile.com docs and assembled 2026-06-25
> (10-agent workflow). Design + tasks: `design.md`, `tasks.md`. Verified-facts
> summary in memory `project_unipile-integration`.
>
> All paths are relative to the per-tenant DSN base `https://{YOUR_DSN}/api/v1`.
> Auth on every call: header `X-API-KEY: {access token}`. provider_id is
> **viewer-scoped** — resolve it with the same account that will act.

## Table of contents

- 1. Fundamentals & Auth
- 2. Accounts — connect & lifecycle (non-hosted)
- 3. Hosted Auth (the Sales Navigator connect path)
- 4. Users — profiles, relations, invitations
- 5. Messaging — chats, messages, InMail
- 6. LinkedIn / Sales Navigator search
- 7. Webhooks
- 8. Errors, rate limits & account safety
- 9. Node SDK, pricing & compliance
- 10. Build-critical clarifications (completeness pass)
- 11. Endpoint → spec-36 task map

---

## 1. Fundamentals & Auth

Unipile is a unified messaging API (LinkedIn, email, WhatsApp, etc.). Every account runs against a **dedicated, per-tenant host** (the DSN), not a single shared `api.unipile.com`. All paths below are relative to your DSN base URL.

### Base URL / DSN model

The REST base URL is:

```
https://{YOUR_DSN}/api/v1
```

where `{YOUR_DSN}` resolves to a host of the form:

```
{subdomain}.unipile.com:{port}
```

so a fully-expanded base URL looks like `https://api8.unipile.com:13443/api/v1` (subdomain and port are assigned to your account — copy the exact DSN from the dashboard, don't construct it by hand). The DSN "must be used for your requests" — there is no global hostname.

- **Get your DSN:** log in to the [API Dashboard](https://dashboard.unipile.com/login); the DSN is shown on the dashboard.
- **Get your Access Token (API key):** generate one at [dashboard.unipile.com/access-tokens](https://dashboard.unipile.com/access-tokens). "Your Access Tokens carry many privileges, so be sure to keep them secure."
- **Doc:** https://developer.unipile.com/docs/getting-started · https://developer.unipile.com/docs/api-usage

### API versioning

The current API is **v1.0**, pinned in the URL path (`/api/v1/...`). The docs version switcher also exposes **v2.0**; v2 differences were not documented on the reachable pages (unverified — not on fetched pages). Version is carried in the path, not in a header.

### Authentication

All requests authenticate with an **API key in the `X-API-KEY` header** (the value is your Access Token). There is no OAuth handshake for the REST API itself — end-user account connection is a separate flow (hosted auth wizard); the API key authenticates *your* server to Unipile.

- **Auth scheme:** `apiKey`, in header, name `X-API-KEY`.
- **Required headers:** `X-API-KEY: {YOUR_ACCESS_TOKEN}` and `accept: application/json` on every request; add `content-type: application/json` on POST/PUT/PATCH with a JSON body.

```bash
curl --request GET \
     --url https://{YOUR_DSN}/api/v1/accounts \
     --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
     --header 'accept: application/json'
```

### Response envelope

List endpoints return a standard envelope. The top-level discriminator is the **`object`** field (names the resource type / collection), the rows are in **`items`**, and the **`cursor`** field carries the next-page token (`null` when exhausted). Some endpoints additionally surface a **`paging`** object (`start`, `page_count`, `total_count`).

```json
{
  "object": "AccountList",
  "items": [ { "object": "Account", "id": "..." } ],
  "cursor": "eyJ...next...",
  "paging": { "start": 0, "page_count": 50, "total_count": 213 }
}
```

- `object` — type tag; every resource (and the list wrapper) carries one, so you can dispatch on it.
- `items` — the page of results.
- `cursor` — opaque next-page token; `null` means there are no more results.
- `paging.start` / `paging.page_count` / `paging.total_count` — offset of this page, items in this page, and total matching rows.

> Note: the field *names* above (`object`, `items`, `cursor`, `paging{start,page_count,total_count}`) are documented in /docs/api-usage; the combined JSON block is reconstructed from those names — reference pages only render live responses via the "Try It!" widget. See `gaps`.

### Cursor-based pagination

Pagination is **cursor-based** (not page-number). Pass `cursor` (and optionally `limit`) as query params; copy the `cursor` from each response into the next request and repeat until `cursor` is `null`.

```bash
curl --request GET \
     --url 'https://{YOUR_DSN}/api/v1/accounts?limit=50&cursor=eyJ...next...' \
     --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
     --header 'accept: application/json'
```

- `limit` — integer, **1–250** (per-endpoint cap; default per endpoint).
- `cursor` — string (length ≥ 1); omit on the first request.

### Global error model

Errors return a JSON problem-style body. Documented fields: **`status`** (HTTP status), **`type`** (machine-readable error type), **`title`** (short summary), **`detail`** (human-readable explanation), and a top-level **`error`** flag/field.

```json
{
  "status": 401,
  "type": "errors/invalid_credentials",
  "title": "Invalid credentials",
  "detail": "The provided X-API-KEY is missing or invalid."
}
```

- `status` mirrors the HTTP status code.
- `type` is the stable slug to branch on in code (don't match on `title`/`detail` text).
- The full per-status `type` catalogue is in the interactive reference (not enumerable via fetch — see `gaps`).

### OpenAPI schema

Machine-readable specs are served off your DSN:

- `https://{YOUR_DSN}/api-json` (OpenAPI JSON)
- `https://{YOUR_DSN}/api-yaml` (OpenAPI YAML)

---

### `GET /accounts`
List the messaging accounts connected to your Unipile instance (used here as the canonical example of the envelope + pagination + auth).

- **Auth/headers:** `X-API-KEY: {YOUR_ACCESS_TOKEN}`, `accept: application/json`.
- **Path params:** none.
- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `cursor` | string (len ≥ 1) | no | Pagination cursor from the previous response's `cursor`. Omit for the first page. |
| `limit` | integer (1–250) | no | Max items to return in this page. |

- **Request example:**

```bash
curl --request GET \
     --url 'https://{YOUR_DSN}/api/v1/accounts?limit=50' \
     --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
     --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "AccountList",
  "items": [
    { "object": "Account", "id": "abc123", "type": "LINKEDIN" }
  ],
  "cursor": "eyJ...next...",
  "paging": { "start": 0, "page_count": 50, "total_count": 213 }
}
```

`object` tags the collection; `items[]` are the accounts; `cursor` is the next-page token (`null` when done); `paging` gives offset/size/total. Item-level fields (`id`, `type`, …) are covered in the Accounts section of this doc.

- **Notes / gotchas / limits:** `limit` caps at 250; iterate by feeding `cursor` until it is `null`. Everything is scoped to the DSN+API-key pair — there is no cross-tenant access, and the same endpoint on a different DSN host returns a different account set. The response envelope and pagination shown here are the same pattern used by every list endpoint in the API.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_listaccounts

---

## 2. Accounts — connect & lifecycle (non-hosted)

This section covers the **Custom (native) authentication** path for LinkedIn — connecting an account directly via the API without the Hosted Auth wizard, solving security checkpoints, listing/retrieving/deleting accounts, and the reconnect / resync / restart lifecycle operations.

All endpoints are on base host `https://api{N}.unipile.com:{port}` (your dedicated DSN) and authenticate with the `X-API-KEY` header carrying your Access Token. Bodies are JSON (`Content-Type: application/json`).

> **Provider note.** Account connection is multi-provider; this section quotes the **LINKEDIN** variant only. The same `POST /accounts` endpoint connects WHATSAPP, INSTAGRAM, TELEGRAM, GOOGLE_OAUTH, OUTLOOK, IMAP, etc., with different body shapes.

### `POST /api/v1/accounts` (LinkedIn — username / password)

Connect a LinkedIn account using login credentials. Returns a created account, or a **202 Checkpoint** if LinkedIn demands a security step.

- **Auth/headers:** `X-API-KEY: <access-token>`, `Content-Type: application/json`
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `provider` | string | yes | Must be `"LINKEDIN"` |
| `username` | string | yes | LinkedIn login — email address or phone number |
| `password` | string | yes | LinkedIn account password |
| `user_agent` | string | no | Browser user-agent string; supply the UA of the browser the session originates from to reduce disconnections |
| `country` | string | no | ISO 3166-1 alpha-2 country code, used to infer the proxy location |
| `ip` | string | no | IPv4 address used to infer proxy location |
| `recruiter_contract_id` | string | no | Contract id to enable LinkedIn Recruiter |
| `disabled_features` | array | no | Features to disable: `"linkedin_recruiter"`, `"linkedin_sales_navigator"`, `"linkedin_organizations_mailboxes"` |
| `sync_limit` | object | no | `{ chats, messages }` — each an ISO 8601 datetime or a number, bounding initial sync |
| `proxy` | object | no | Custom proxy: `{ protocol, host, port, username?, password? }` |

- **Request example:**
```bash
curl -X POST 'https://api8.unipile.com:13851/api/v1/accounts' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "LINKEDIN",
    "username": "user@example.com",
    "password": "securePassword123",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "country": "FR"
  }'
```

- **Response example (201 — connected):**
```json
{
  "object": "AccountCreated",
  "account_id": "abc123-account-id"
}
```
`account_id` is the handle used for every later call (retrieve, messaging, resync, delete).

- **Response example (202 — checkpoint required):**
```json
{
  "object": "Checkpoint",
  "account_id": "098dez89d",
  "checkpoint": { "type": "2FA" }
}
```
When `object` is `"Checkpoint"`, the connection is paused; the same `account_id` must be passed to `POST /accounts/checkpoint`. `checkpoint.type` is one of `2FA`, `OTP`, `IN_APP_VALIDATION`, `CAPTCHA`, `PHONE_REGISTER` (see the checkpoint endpoint below).

- **Notes / gotchas / limits:**
  - The authentication intent (checkpoint window) is valid for **5 minutes**; after that you must restart the connect call.
  - `401 errors/invalid_credentials` on bad username/password; `425 errors/auth_in_progress` (Too Early) if an auth for this account is already in flight.
  - Always send a real `user_agent` (and ideally a stable proxy via `country`/`ip`/`proxy`) — mismatched UA/IP is a common cause of later `CREDENTIALS` disconnections.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_createaccount.md

### `POST /api/v1/accounts` (LinkedIn — cookie / `li_at`)

Connect a LinkedIn account using an existing browser session cookie instead of credentials. Same endpoint, different body.

- **Auth/headers:** `X-API-KEY: <access-token>`, `Content-Type: application/json`
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `provider` | string | yes | Must be `"LINKEDIN"` |
| `access_token` | string | yes | The LinkedIn access token — the value of the **`li_at`** cookie |
| `premium_token` | string | no | The **`li_a`** cookie value — required for Recruiter / Sales Navigator premium sessions |
| `user_agent` | string | no | UA of the browser the cookie was captured in — strongly recommended to avoid disconnection |
| `country` | string | no | ISO 3166-1 alpha-2 country code for proxy location |
| `ip` | string | no | IPv4 address for proxy location |
| `recruiter_contract_id` | string | no | Contract id to enable LinkedIn Recruiter |
| `disabled_features` | array | no | Same enum as credentials connect |
| `sync_limit` | object | no | `{ chats, messages }` initial sync bounds |
| `proxy` | object | no | `{ protocol, host, port, username?, password? }` |

- **Request example:**
```json
{
  "provider": "LINKEDIN",
  "access_token": "AQEDAXv5k8c9...",
  "premium_token": "AQFRz0C1k3m...",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "country": "FR"
}
```

- **Response example (201):**
```json
{
  "object": "AccountCreated",
  "account_id": "abc123-account-id"
}
```

- **Notes / gotchas / limits:**
  - Capture `li_at` (and `li_a` for premium) plus the **exact `user_agent`** from the same browser — the cookie is bound to that fingerprint; a mismatch produces a quick `CREDENTIALS` failure.
  - Cookie connections can still trigger a `202 Checkpoint` (e.g. `IN_APP_VALIDATION`) — handle it identically to the credentials flow.
  - `li_a` is the premium auth cookie; without it Recruiter / Sales Navigator features will not be available even if `recruiter_contract_id` is set.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_createaccount.md

### `POST /api/v1/accounts/checkpoint`

Solve a code-based security checkpoint (2FA / OTP) raised during connect or reconnect.

- **Auth/headers:** `X-API-KEY: <access-token>`, `Content-Type: application/json`
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | yes | The id returned in the `Checkpoint` response |
| `provider` | enum | yes | One of `LINKEDIN`, `INSTAGRAM`, `TWITTER`, `MESSENGER` |
| `code` | string | yes | The code that solves the checkpoint. If the code is a phone number, prefix it with the international dialling code in brackets |

- **Request example:**
```bash
curl -X POST 'https://api8.unipile.com:13851/api/v1/accounts/checkpoint' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "account_id": "098dez89d",
    "provider": "LINKEDIN",
    "code": "123456"
  }'
```

- **Response example (201 — solved):**
```json
{
  "object": "AccountCreated",
  "account_id": "098dez89d"
}
```
On success the account transitions to a connected state. If LinkedIn chains a second checkpoint, expect another `202 Checkpoint` body to come back instead (unverified — not explicitly documented).

- **Checkpoint types and meaning** (from the connect `checkpoint.type`):
  - `2FA` — two-factor authentication code (authenticator app / SMS).
  - `OTP` — one-time password sent by LinkedIn.
  - `IN_APP_VALIDATION` — approve the login from the LinkedIn mobile app. The user can request `TRY_ANOTHER_WAY` to fall back to a code-based method if they cannot approve in-app (mechanism described in prose, exact param unverified).
  - `CAPTCHA` — a CAPTCHA challenge must be solved.
  - `PHONE_REGISTER` — LinkedIn requires registering/confirming a phone number.

- **Notes / gotchas / limits:**
  - The checkpoint must be solved within the **5-minute** authentication-intent window.
  - `401 errors/invalid_checkpoint_solution` if the code is wrong/expired.
  - For `OTP`/`2FA` that did not arrive, use the resend endpoint below rather than re-issuing the connect call.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_solvecheckpoint.md

### `POST /api/v1/accounts/checkpoint/resend`

Re-trigger the checkpoint notification (e.g. resend the OTP / re-prompt the mobile app) for an in-progress connection.

- **Auth/headers:** `X-API-KEY: <access-token>`, `Content-Type: application/json`
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | yes | The in-progress account id (min length 1) |
| `provider` | string | yes | One of `LINKEDIN`, `INSTAGRAM`, `MESSENGER` |

- **Request example:**
```json
{
  "account_id": "098dez89d",
  "provider": "LINKEDIN"
}
```

- **Response example (200):**
```json
{
  "object": "CheckpointResend",
  "account_id": "098dez89d",
  "success": true
}
```
`success` confirms the notification was re-issued; it does not mean the checkpoint is solved.

- **Notes / gotchas / limits:** Provider enum here is narrower than the solve endpoint (no `TWITTER`). Still bound by the 5-minute intent window — repeated resends do not extend it.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_resendcheckpoint.md

### `GET /api/v1/accounts`

List all connected accounts, with cursor pagination.

- **Auth/headers:** `X-API-KEY: <access-token>`
- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `cursor` | string | no | Pagination cursor from the previous response's `cursor` to fetch the next page |
| `limit` | integer | no | Items per page, 1–250 (e.g. 100) |

- **Request example:**
```bash
curl 'https://api8.unipile.com:13851/api/v1/accounts?limit=100' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY"
```

- **Response example (200):**
```json
{
  "object": "AccountList",
  "items": [
    {
      "object": "Account",
      "type": "LINKEDIN",
      "id": "abc123-account-id",
      "name": "Jane Founder",
      "created_at": "2026-06-25T10:12:00.000Z",
      "connection_params": { "...": "provider-specific" },
      "current_signature": "sig_1",
      "signatures": [{ "title": "Default", "content": "Best,\nJane" }],
      "groups": ["team-eu"],
      "sources": [{ "id": "src_1", "status": "OK" }]
    }
  ]
}
```
Key fields: `sources[].status` is the live health of the connection (see status table under the Account object below); `type` is the provider; `connection_params` is provider-shaped.

- **Notes / gotchas / limits:** Paginate by passing the returned `cursor` until empty. The list mixes all providers — filter client-side by `type === "LINKEDIN"`.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_listaccounts.md

### `GET /api/v1/accounts/{id}`

Retrieve a single account, including its current source status — the canonical way to poll whether a connect/checkpoint finished or whether the account needs reconnection.

- **Auth/headers:** `X-API-KEY: <access-token>`
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `id` | string | yes | The id of the account to retrieve |

- **Request example:**
```bash
curl 'https://api8.unipile.com:13851/api/v1/accounts/abc123-account-id' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY"
```

- **Response example (200):**
```json
{
  "object": "Account",
  "type": "LINKEDIN",
  "id": "abc123-account-id",
  "name": "Jane Founder",
  "created_at": "2026-06-25T10:12:00.000Z",
  "connection_params": { "...": "LINKEDIN-specific" },
  "current_signature": "sig_1",
  "signatures": [{ "title": "Default", "content": "Best,\nJane" }],
  "groups": ["team-eu"],
  "sources": [{ "id": "src_1", "status": "OK" }]
}
```

#### Account object — fields

| field | type | description |
|------|------|-------------|
| `object` | string | Always `"Account"` |
| `id` | string | Unique account identifier |
| `type` | string | Provider: `MOBILE`, `MAIL`, `GOOGLE_OAUTH`, `ICLOUD`, `OUTLOOK`, `GOOGLE_CALENDAR`, `WHATSAPP`, `LINKEDIN`, `SLACK`, `TWITTER`, `EXCHANGE`, `TELEGRAM` |
| `name` | string | Display name of the account |
| `created_at` | ISO 8601 datetime (UTC) | When the account was connected |
| `connection_params` | object | Provider-specific connection details (shape varies by `type`) |
| `current_signature` | string | Id of the active signature |
| `signatures` | array | Objects `{ title, content }` |
| `groups` | array | Group ids (strings) |
| `sources` | array | Objects `{ id, status }` — one per data source; `status` carries the live health (below) |

#### Source `status` values (all)

| status | meaning |
|--------|---------|
| `OK` | The service is running normally. |
| `CONNECTING` | The service is connecting. |
| `CREDENTIALS` | Credentials need to be refreshed before the service can run (re-auth required — reconnect the account). |
| `PERMISSIONS` | Some permissions are missing on the host device for the service to run. |
| `STOPPED` | The service has been stopped. |
| `ERROR` | The service hit an unspecified error and was stopped. |

- **Notes / gotchas / limits:**
  - After a connect/checkpoint call, poll this endpoint until `sources[].status === "OK"`.
  - `CREDENTIALS` is the signal to drive the reconnect flow (and to surface a re-login prompt to the user); subscribe to account-status webhooks to avoid polling.
  - `STOPPED`/`ERROR` (a "frozen" account) is the case the `restart` endpoint addresses.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_getaccountbyid.md

### `DELETE /api/v1/accounts/{id}`

Unlink an account from Unipile.

- **Auth/headers:** `X-API-KEY: <access-token>` (no body)
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `id` | string | yes | The id of the account to delete |

- **Request example:**
```bash
curl -X DELETE 'https://api8.unipile.com:13851/api/v1/accounts/abc123-account-id' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY"
```

- **Response example (200):**
```json
{ "object": "AccountDeleted" }
```

- **Notes / gotchas / limits:** Errors: `400` invalid params, `401` invalid credentials, `404 Account not found`, `500`, `503 Please try again later`, `504 Request Timeout`. Deletion is the hard unlink — to merely re-authenticate, use reconnect, not delete-then-recreate.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_deleteaccount.md

### `POST /api/v1/accounts/{id}` (reconnect)

Re-authenticate an existing account that has gone into `CREDENTIALS` (or otherwise needs new auth) — same account id, fresh credentials or cookie.

- **Auth/headers:** `X-API-KEY: <access-token>`, `Content-Type: application/json`
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `id` | string | yes | The id of the account to reconnect |

- **Body params (LinkedIn):** same shape as connect — either credentials (`provider`, `username`, `password`, optional `user_agent`, `recruiter_contract_id`) or cookie (`provider`, `access_token`, optional `premium_token`). Universal optionals also apply: `country`, `ip`, `disabled_features`, `sync_limit`, `proxy`.

| name | type | required | description |
|------|------|----------|-------------|
| `provider` | string | yes | `"LINKEDIN"` |
| `username` | string | cond. | Credentials reconnect |
| `password` | string | cond. | Credentials reconnect |
| `access_token` | string | cond. | Cookie reconnect (`li_at`) |
| `premium_token` | string | no | Cookie reconnect (`li_a`) |
| `user_agent` / `country` / `ip` / `disabled_features` / `sync_limit` / `proxy` | mixed | no | Same semantics as connect |

- **Request example:**
```json
{
  "provider": "LINKEDIN",
  "username": "user@example.com",
  "password": "secure_password",
  "country": "FR"
}
```

- **Response example (201):**
```json
{
  "object": "AccountReconnected",
  "account_id": "abc123-account-id"
}
```

- **Notes / gotchas / limits:** Reconnect can also return a `202 Checkpoint` — solve it via `POST /accounts/checkpoint` exactly as on first connect. Use reconnect (not delete + recreate) to preserve the account id, history, and webhooks.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_reconnectaccount.md

### `GET /api/v1/accounts/{account_id}/sync` (resync)

Trigger — and poll the status of — a re-synchronization of an account's messaging data. (Despite mutating, this is a `GET` in the Unipile API.)

- **Auth/headers:** `X-API-KEY: <access-token>`
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | yes | The account to resynchronize |

- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `partial` | boolean | no | LinkedIn only — preserve existing data (incremental) instead of a full re-sync |
| `chunk_size` | number | no | Chats synchronized per chunk (LinkedIn, Telegram) |
| `linkedin_product` | string | no | `"classic"`, `"recruiter"`, or `"sales_navigator"` |
| `after` | number | no | Start of time span, epoch milliseconds |
| `before` | number | no | End of time span, epoch milliseconds |

- **Request example:**
```bash
curl 'https://api8.unipile.com:13851/api/v1/accounts/abc123-account-id/sync?partial=true&chunk_size=50&linkedin_product=classic' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY"
```

- **Response example (200):**
```json
{
  "object": "AccountResync",
  "status": "SYNC_STARTED"
}
```
`status` is one of `SYNC_STARTED`, `SYNC_RUNNING`, `CHUNK_DONE`, `SYNC_DONE`, `SYNC_ERROR`. Poll the same route to monitor progress.

- **Notes / gotchas / limits:**
  - Supported for **LinkedIn and Telegram**; Instagram and WhatsApp are not supported.
  - Resync moves *data* (re-pull chats/messages, optionally within a time span). It is distinct from **reconnect** (re-auth a `CREDENTIALS` account) and **restart** (re-activate a frozen account's sources).
- **Doc:** https://developer.unipile.com/reference/accountscontroller_resyncaccount.md

### `POST /api/v1/accounts/{id}/restart`

Restart the sources of a frozen/stopped account, restoring it to operational status.

- **Auth/headers:** `X-API-KEY: <access-token>` (no body)
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `id` | string | yes | The id of the account to restart |

- **Request example:**
```bash
curl -X POST 'https://api8.unipile.com:13851/api/v1/accounts/abc123-account-id/restart' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY"
```

- **Response example (200):**
```json
{ "object": "AccountRestarted" }
```
On failure:
```json
{ "object": "AccountFailedToRestart" }
```

- **Notes / gotchas / limits:** Use restart for a `STOPPED`/`ERROR` (frozen) account whose credentials are still valid. If the underlying cause is auth (`CREDENTIALS`), restart won't fix it — reconnect instead.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_restartaccount.md

---

#### Lifecycle quick-reference

| Symptom (`sources[].status`) | Action |
|---|---|
| `CONNECTING` | Wait / poll `GET /accounts/{id}` |
| `OK` | Healthy — no action |
| `CREDENTIALS` | `POST /accounts/{id}` (reconnect) with fresh credentials/cookie |
| `STOPPED` / `ERROR` (frozen, auth still valid) | `POST /accounts/{id}/restart` |
| `PERMISSIONS` | Fix host-device permissions, then re-check |
| Stale / missing messages | `GET /accounts/{id}/sync` (resync) |
| 202 `Checkpoint` during connect/reconnect | `POST /accounts/checkpoint` (and `…/checkpoint/resend` to re-trigger) within 5 min |

---

## 3. Hosted Auth (the Sales Navigator connect path)

This is how a founder connects their LinkedIn Sales Navigator seat (and email/calendar) without ever handing us credentials. You call one server-side endpoint, get back a single-use hosted URL, redirect the founder to it, and Unipile runs the entire OAuth / credential / captcha flow on its own pages. When the seat is connected, Unipile POSTs a callback to your `notify_url` with the new `account_id`, which you store against your internal user.

> **Backend-only.** Every call carries your `X-API-KEY`. Make the call from our server (e.g. an API route / worker), never from the browser, so the key is never exposed.

### `POST /hosted/accounts/link`
Generate a single-use Hosted Auth wizard URL for the founder to connect (or reconnect) a provider account.

- **Auth/headers:**
  - `X-API-KEY: <your-unipile-api-key>` (backend only)
  - `Content-Type: application/json`
  - `Accept: application/json`
  - Host is your dedicated DSN, e.g. `https://apiXXX.unipile.com:XXX` (the same value you pass as `api_url` in the body).

- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `type` | `string` | yes | `"create"` for a brand-new connection, or `"reconnect"` to re-auth an account that dropped (e.g. Sales Navigator session expired). |
| `providers` | `string` \| `string[]` | yes | Which providers the wizard offers. `"*"` for all, or restrict to one — for the Sales Navigator path use `["LINKEDIN"]`. Documented provider names: `LINKEDIN`, `WHATSAPP`, `INSTAGRAM`, `TELEGRAM`, `GOOGLE`, `MICROSOFT`, `IMAP` (X/Twitter exists but is unmaintained). |
| `api_url` | `string` | yes | Your Unipile API endpoint / DSN, format `https://apiXXX.unipile.com:XXX`. Must match the host the wizard reports back to. |
| `expiresOn` | `string` (ISO 8601) | yes | Link expiry timestamp, e.g. `"2024-12-22T12:00:00.701Z"`. See the expiry gotcha below. |
| `name` | `string` | no | Your internal user/tenant id. Unipile echoes it back verbatim in the `notify_url` callback so you can match the connected account to the founder. |
| `notify_url` | `string` | no | Webhook URL Unipile POSTs to when the connection completes (carries `account_id` + `name`). This is how we learn the new `account_id`. |
| `success_redirect_url` | `string` | no | Where the founder's browser lands after a successful connect. |
| `failure_redirect_url` | `string` | no | Where the founder's browser lands after a failed/abandoned connect. |
| `reconnect_account` | `string` | conditional | The existing `account_id` to reconnect. Required when `type` is `"reconnect"`. |
| `disabled_features` | (see notes) | no | Restrict which features/auth methods the wizard offers. Used e.g. to hide the LinkedIn Recruiter feature when only Sales Navigator/Classic is wanted. *(Exact accepted value list unverified — see notes.)* |
| `sync_limit` | (see notes) | no | Caps how much historical data is synced on connect. *(Exact type/shape unverified — see notes.)* |

- **Request example:**

```bash
curl -X POST 'https://apiXXX.unipile.com:XXX/api/v1/hosted/accounts/link' \
  -H 'X-API-KEY: '"$UNIPILE_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "type": "create",
    "providers": ["LINKEDIN"],
    "api_url": "https://apiXXX.unipile.com:XXX",
    "expiresOn": "2026-06-26T12:00:00.000Z",
    "name": "founder_1234",
    "notify_url": "https://app.elevay.dev/api/unipile/account-connected",
    "success_redirect_url": "https://app.elevay.dev/settings/connections?connected=1",
    "failure_redirect_url": "https://app.elevay.dev/settings/connections?error=1"
  }'
```

For a reconnect (Sales Navigator session dropped):

```json
{
  "type": "reconnect",
  "reconnect_account": "e54m8LR22bA7G5qsAc8w",
  "api_url": "https://apiXXX.unipile.com:XXX",
  "expiresOn": "2026-06-26T12:00:00.000Z",
  "notify_url": "https://app.elevay.dev/api/unipile/account-connected"
}
```

- **Response example:**

```json
{
  "object": "HostedAuthURL",
  "url": "https://account.unipile.com/<encoded_token>"
}
```

  - `object` — always `"HostedAuthURL"`.
  - `url` — the single-use hosted wizard URL. Redirect the founder here; Unipile renders the provider login, captcha, and OAuth screens itself. Generate a fresh link per session — do not cache or reuse it.

- **`notify_url` callback payload** (Unipile → your webhook, on completion):

```json
{
  "status": "CREATION_SUCCESS",
  "account_id": "e54m8LR22bA7G5qsAc8w",
  "name": "founder_1234"
}
```

  - `status` — confirmed values: `"CREATION_SUCCESS"` (new account connected) and `"RECONNECTED"` (an existing account re-authenticated). *(Failure/abort statuses, if any, unverified.)*
  - `account_id` — the Unipile account id for the connected seat. **Persist this** against your user — it's the handle for every subsequent LinkedIn/email API call.
  - `name` — the exact value you sent in the request `name` field; use it to match the account back to the founder. The callback does not depend on the browser landing on `success_redirect_url`, so treat the webhook as the source of truth for "connected".

- **Notes / gotchas / limits:**
  - **Link expiry — read this:** beyond your `expiresOn`, *"All links expire upon daily restart, regardless of their stated expiration date."* So a link you minted yesterday can be dead today even if `expiresOn` is in the future. Always mint a fresh link at the moment the founder clicks "Connect", never pre-generate.
  - **iframe / captcha warning:** *"We do not recommend embedding our link in an iframe as this may cause some issues with solving the LinkedIn captcha or loading the Microsoft OAuth screen."* For the Sales Navigator connect, open the `url` as a full-page redirect (or new tab), not inside an embedded frame — otherwise the LinkedIn captcha can fail to solve.
  - **Backend-only key:** the `X-API-KEY` must stay server-side. The browser only ever sees the returned `url`.
  - **Webhook is the trigger, not the redirect:** rely on `notify_url` (with `account_id` + `name`) to record the connection; `success_redirect_url` is purely UX.
  - **Node SDK equivalent:** `client.account.createHostedAuthLink({ type, expiresOn, api_url, providers, success_redirect_url, failure_redirect_url, notify_url })` (the SDK README example omits `name` / `reconnect_account` / `disabled_features` / `sync_limit`, but the underlying endpoint accepts them).
  - **`disabled_features` / `sync_limit` (partial):** web search surfaced a related `disabled_options` array with values `proxy`, `cookie_auth`, `credentials_auth`, plus a `disable_feature` mechanism to hide LinkedIn Recruiter; the canonical accepted-value enum for `disabled_features` and the shape of `sync_limit` were not confirmable from a primary reference page — treat the exact values as unverified until checked against `developer.unipile.com/reference`.

- **Doc:** https://developer.unipile.com/docs/hosted-auth (and https://developer.unipile.com/docs/hosted-auth.md)

---

## 4. Users — profiles, relations, invitations

This section covers resolving a person to a provider-internal id, listing your first-degree connections, and the full connection-request lifecycle (send → list pending → cancel), plus company-profile retrieval.

> **`provider_id` is VIEWER-SCOPED.** The `provider_id` Unipile returns for a person is the id *the connected account uses internally to reference that person*. For LinkedIn it is the member's `ACoAAA…` URN segment as seen **through that account's session**, and it **differs per connected account** for the same human ([users-overview](https://developer.unipile.com/docs/users-overview); [unipile.com guide](https://www.unipile.com/how-to-get-linkedin-id-using-an-api/)). Never cache a `provider_id` resolved with account A and reuse it with account B — re-resolve via `GET /users/{identifier}` with the same `account_id` you will act with. The `public_identifier` (the public handle, e.g. `linkedin.com/in/<public_identifier>`) is stable across accounts and is the safe thing to persist.

> **Base URL.** All paths below are relative to your DSN: `https://{subdomain}.unipile.com:{port}/api/v1`. All requests authenticate with the `X-API-KEY` header.

> **LinkedIn-only for invitations.** Sending / listing / cancelling invitations currently supports LinkedIn only. LinkedIn throttles new/low-activity accounts; expect `provider_error` if the account is too fresh to send invites ([invite-users](https://developer.unipile.com/docs/invite-users)).

---

### `GET /users/{identifier}`
Resolve a profile (and its viewer-scoped `provider_id`) from a public URL handle **or** a provider-internal id.

- **Auth/headers:** `X-API-KEY: <key>`, `Accept: application/json`.
- **Path params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `identifier` | string | yes | Either the provider's **public id** (e.g. the `john-doe` in `linkedin.com/in/john-doe`) **or** the provider's **internal id** (`provider_id`) of the requested user. |

- **Query params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `account_id` | string | yes | The connected account performing the lookup. The returned `provider_id` is scoped to this account. |
  | `linkedin_sections` | array<string> | no | LinkedIn profile sections to hydrate. Use `*` for all, `*_preview` for preview data, or specific selectors, e.g. `["*_preview","experience","skills"]`. Fetch only what you need — heavy full-section requests are throttled by LinkedIn and may return empty. |
  | `linkedin_api` | string | no | Which LinkedIn surface to query (`recruiter` or `sales_navigator`) if the account is subscribed. |
  | `notify` | boolean | no | If `true`, the viewed user is notified of the profile visit. Default `false`. |

- **Request example:**
  ```bash
  curl -G 'https://{subdomain}.unipile.com:{port}/api/v1/users/john-doe' \
    -H 'X-API-KEY: <YOUR_API_KEY>' \
    -H 'Accept: application/json' \
    --data-urlencode 'account_id=<ACCOUNT_ID>' \
    --data-urlencode 'linkedin_sections=*'
  ```

- **Response example** (LinkedIn; trimmed to the load-bearing fields named in the reference — exact JSON sample is not rendered in the static docs, see note):
  ```json
  {
    "object": "UserProfile",
    "provider": "LINKEDIN",
    "provider_id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
    "public_identifier": "john-doe",
    "first_name": "John",
    "last_name": "Doe",
    "headline": "Founder & CEO at Acme",
    "occupation": "Founder & CEO at Acme",
    "network_distance": "DISTANCE_2",
    "is_relationship": false,
    "shared_connections_count": 14,
    "location": "Paris, Île-de-France, France",
    "current_company": { "name": "Acme", "id": "acme-corp" }
  }
  ```
  - `provider_id` — viewer-scoped internal id; the value to pass to `POST /users/invite`.
  - `public_identifier` — stable public handle; persist this, not `provider_id`.
  - `network_distance` — degree of separation between the viewer account and this profile (e.g. self / 1st / 2nd / 3rd+ / out of network). **(enum literal values unverified — not rendered in docs.)**
  - `is_relationship` — `true` when this person is already a 1st-degree connection of the connected account (i.e. would appear in `/users/relations`).
  - `shared_connections_count` — number of mutual connections, as seen by the viewer account.
  - `occupation` vs `headline` — `headline` is the free-text tagline; `occupation` is the current role/company summary. (Naming per the field index; some profiles populate only one.)

- **Notes / gotchas / limits:** Returns `404` if the user can't be resolved, `401` if the account is disconnected, `403` on permission/restriction, `429` when rate-limited. Because `provider_id` is viewer-scoped, resolve with the **same `account_id`** you will later invite/message with. Prefer `*_preview` sections to avoid LinkedIn throttling.
- **Doc:** https://developer.unipile.com/reference/userscontroller_getprofilebyidentifier

---

### `GET /users/relations`
List the connected account's 1st-degree connections (LinkedIn "Relations" / Facebook "Friends"). These are exactly the people Unipile treats as "known" attendees.

- **Auth/headers:** `X-API-KEY: <key>`, `Accept: application/json`.
- **Query params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `account_id` | string | yes (if `user_id` not provided) | The account whose relations to list. |
  | `limit` | integer | no | Items per page. Range **1–1000**. |
  | `cursor` | string | no | Pagination cursor returned by the previous page; omit for the first page. |
  | `filter` | string | no | Narrows results by matching against user names. |

- **Request example:**
  ```bash
  curl -G 'https://{subdomain}.unipile.com:{port}/api/v1/users/relations' \
    -H 'X-API-KEY: <YOUR_API_KEY>' \
    -H 'Accept: application/json' \
    --data-urlencode 'account_id=<ACCOUNT_ID>' \
    --data-urlencode 'limit=50'
  ```

- **Response example** (shape; the per-item `UserRelation` JSON sample is not rendered in the static docs — see note):
  ```json
  {
    "object": "UserRelationList",
    "items": [
      {
        "object": "UserRelation",
        "provider_id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
        "public_identifier": "john-doe",
        "first_name": "John",
        "last_name": "Doe",
        "headline": "Founder & CEO at Acme",
        "member_urn": "urn:li:fsd_profile:ACoAAAEkwwAB...",
        "created_at": 1700000000000
      }
    ],
    "cursor": "eyJwYWdlIjoy..."
  }
  ```
  - Each item is a 1st-degree connection; `provider_id` here is viewer-scoped (usable directly for messaging — they are already a relation, so no invite is needed).
  - `cursor` (top level) — pass back as the `cursor` query param to fetch the next page; `null`/absent when exhausted.

  > **(UserRelation item field names beyond `provider_id`/`public_identifier`/name/`headline` are unverified — the reference page does not render the per-item schema. Treat `member_urn`/`created_at` as illustrative.)**

- **Notes / gotchas / limits:** Cursor-based pagination — loop, passing the returned `cursor` until none is returned. `limit` max is **1000** (higher than the 250 cap on the invitations-sent list). `401/403/404/429/5xx` per the standard error set.
- **Doc:** https://developer.unipile.com/reference/userscontroller_getrelations

---

### `POST /users/invite`
Send a LinkedIn connection request to a user you are **not** yet connected to.

- **Auth/headers:** `X-API-KEY: <key>`, `Content-Type: application/json`, `Accept: application/json`. (JSON body — not multipart.)
- **Body params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `provider_id` | string | yes | The target user's provider-internal id (resolve via `GET /users/{identifier}`). Must be the `provider_id`, not a public handle (except Instagram, which also accepts the username — not `provider_messaging_id`). |
  | `account_id` | string | yes | The connected account that will send the request. Must be the same account used to resolve `provider_id`. |
  | `message` | string | no | Optional note attached to the request. **Maximum 300 characters.** |
  | `user_email` | string | no | Email of the target; LinkedIn sometimes requires this to allow the invite. |

- **Request example:**
  ```bash
  curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/users/invite' \
    -H 'X-API-KEY: <YOUR_API_KEY>' \
    -H 'Content-Type: application/json' \
    -d '{
      "account_id": "<ACCOUNT_ID>",
      "provider_id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
      "message": "Hi John — loved your post on PLG onboarding. Would be great to connect."
    }'
  ```
  ```json
  {
    "account_id": "<ACCOUNT_ID>",
    "provider_id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
    "message": "Let's connect!"
  }
  ```

- **Response example** (the success body is not detailed in the docs; a representative success shape):
  ```json
  { "object": "UserInvitationSent", "invitation_id": "inv_12345" }
  ```
  > **(Exact success-response fields unverified — the reference page documents only the 200 status, not the body. `invitation_id` is the value used by the cancel endpoint.)**

- **Notes / gotchas / limits:** LinkedIn only. `message` is capped at **300 chars**. New/low-engagement accounts are restricted by LinkedIn from sending invites → expect `errors/provider_error`. Re-resolve `provider_id` with the same `account_id` (viewer-scoping). Use the workflow: `GET /users/{identifier}` → take `provider_id` → `POST /users/invite`.
- **Doc:** https://developer.unipile.com/reference/userscontroller_adduserbyidentifier

---

### `GET /users/invite/sent`
List the connected account's **pending** sent invitations. Polling this list is the supported way to detect accepted/declined invites (a previously-listed invitation that disappears was accepted or rejected).

- **Auth/headers:** `X-API-KEY: <key>`, `Accept: application/json`.
- **Query params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `account_id` | string | yes | The account whose sent invitations to list. |
  | `limit` | integer | no | Items per page. Range **1–250**. |
  | `cursor` | string | no | Pagination cursor from the previous response. |

- **Request example:**
  ```bash
  curl -G 'https://{subdomain}.unipile.com:{port}/api/v1/users/invite/sent' \
    -H 'X-API-KEY: <YOUR_API_KEY>' \
    -H 'Accept: application/json' \
    --data-urlencode 'account_id=<ACCOUNT_ID>' \
    --data-urlencode 'limit=100'
  ```

- **Response example** (shape; per-item fields not rendered in the static docs — see note):
  ```json
  {
    "object": "UserInvitationsSentList",
    "items": [
      {
        "object": "UserInvitationSent",
        "invitation_id": "inv_12345",
        "provider_id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
        "public_identifier": "john-doe"
      }
    ],
    "cursor": "eyJwYWdlIjoy..."
  }
  ```
  - `invitation_id` — pass to `DELETE /users/invite/sent/{invitation_id}` to cancel.
  - `cursor` — next-page token; absent when exhausted.

  > **(Item field names are unverified — the reference page returns "a list of all invitations sent that are pending" but does not render the item schema. Treat `provider_id`/`public_identifier` as illustrative beyond `invitation_id`.)**

- **Notes / gotchas / limits:** Only **pending** invitations are returned. `limit` max **250** (note this differs from `/users/relations`' 1000). Cursor pagination as elsewhere. To detect accepted invitations, snapshot this list periodically and diff ([detecting-accepted-invitations](https://developer.unipile.com/docs/detecting-accepted-invitations)).
- **Doc:** https://developer.unipile.com/reference/userscontroller_listalluserinvitationssent

---

### `DELETE /users/invite/sent/{invitation_id}`
Cancel (withdraw) a pending sent invitation.

- **Auth/headers:** `X-API-KEY: <key>`, `Accept: application/json`.
- **Path params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `invitation_id` | string | yes | The id of the invitation to cancel, from `GET /users/invite/sent`. (On Instagram, pass the user's `provider_id`, not `provider_messaging_id`.) |

- **Query params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `account_id` | string | yes | The account that sent the invitation. |

- **Body params:** none.

- **Request example:**
  ```bash
  curl -X DELETE \
    'https://{subdomain}.unipile.com:{port}/api/v1/users/invite/sent/inv_12345?account_id=<ACCOUNT_ID>' \
    -H 'X-API-KEY: <YOUR_API_KEY>'
  ```

- **Response example:**
  ```json
  { "status": "ok" }
  ```
  Error (invalid id):
  ```json
  { "type": "api.Error.BadRequest.invalid_invitation_id", "detail": "The invitation ID provided is invalid" }
  ```

- **Notes / gotchas / limits:** `account_id` goes in the **query string**, the invitation id in the **path**; no request body. `400` with `invalid_invitation_id` if the id is wrong/already gone; `401 missing_credentials` if auth is absent. On Instagram this endpoint also unfollows the previously-followed user.
- **Doc:** https://developer.unipile.com/reference/userscontroller_cancelinvitation

---

### `GET /linkedin/company/{identifier}`
Retrieve a LinkedIn **company** profile (distinct from the person endpoint above) by public id, numeric id, or URN.

- **Auth/headers:** `X-API-KEY: <key>`, `Accept: application/json`.
- **Path params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `identifier` | string | yes | Company identifier — public id (e.g. `acme-corp` in `linkedin.com/company/acme-corp`), numeric id, or URN. |

- **Query params:**

  | name | type | required | description |
  |------|------|----------|-------------|
  | `account_id` | string | yes | The connected account performing the request. |

- **Request example:**
  ```bash
  curl -G 'https://{subdomain}.unipile.com:{port}/api/v1/linkedin/company/acme-corp' \
    -H 'X-API-KEY: <YOUR_API_KEY>' \
    -H 'Accept: application/json' \
    --data-urlencode 'account_id=<ACCOUNT_ID>'
  ```

- **Response example** (fields per the reference's field index; full JSON sample not rendered — see note):
  ```json
  {
    "object": "CompanyProfile",
    "id": "1234567",
    "provider_id": "1234567",
    "public_identifier": "acme-corp",
    "name": "Acme Corp",
    "description": "We make everything.",
    "industry": "Software Development",
    "employee_count": 230,
    "followers_count": 48210,
    "website": "https://acme.example",
    "locations": [{ "city": "Paris", "country": "FR" }],
    "logo": "https://media.licdn.com/.../logo.png"
  }
  ```
  - `employee_count` / `followers_count` — useful firmographics for ICP scoring.
  - `locations` — array (HQ + offices).

  > **(Field-value sample is illustrative — the reference lists these field names but does not render a full JSON example.)**

- **Notes / gotchas / limits:** Path prefix is `/linkedin/company/...` (not `/users/...`). Accepts multiple identifier formats. `404` if the company can't be resolved, `422` if the account isn't valid for this feature, `403` on restriction.
- **Doc:** https://developer.unipile.com/reference/linkedincontroller_getcompanyprofile

---

**Typical flow (cold connect):** `GET /users/{identifier}` (resolve `provider_id` with account A; check `is_relationship`/`network_distance`) → if not a relation, `POST /users/invite` (≤300-char `message`, account A) → poll `GET /users/invite/sent` to confirm/detect acceptance → `DELETE /users/invite/sent/{invitation_id}` to withdraw if needed. Persist `public_identifier`, never the viewer-scoped `provider_id`.

---

## 5. Messaging — chats, messages, InMail

The Messaging API is viewer-scoped: every call acts as the connected account named by `account_id` (the LinkedIn/WhatsApp/etc. mailbox you connected through Unipile). All IDs are either Unipile IDs or the provider's internal IDs, and `provider_id` / `attendee_provider_id` fields expose the platform-native identifiers.

All endpoints share:

- **Base URL:** `https://{YOUR_DSN}/api/v1` (your Unipile DSN, e.g. `apiXXXX.unipile.com:13XXX`).
- **Auth/headers:** `X-API-KEY: {YOUR_ACCESS_TOKEN}` and `accept: application/json`. Write endpoints that accept files additionally require `content-type: multipart/form-data`.
- **Pagination:** cursor-based. List responses carry a top-level `cursor` (string or `null`); pass it back as the `cursor` query param to fetch the next page. `limit` is 1–250. `before` / `after` are ISO 8601 UTC datetimes (exclusive).

---

### `GET /chats`
List the connected account's conversations, with provider/status filters.

- **Auth/headers:** `X-API-KEY`, `accept: application/json`.
- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | no | Comma-separated Unipile account IDs to scope to. |
| `account_type` | enum | no | `WHATSAPP` \| `LINKEDIN` \| `SLACK` \| `TWITTER` \| `MESSENGER` \| `INSTAGRAM` \| `TELEGRAM`. |
| `unread` | boolean | no | If set, return only unread (`true`) or only read (`false`) chats. |
| `before` | string | no | ISO 8601 UTC; only chats before this datetime (exclusive). |
| `after` | string | no | ISO 8601 UTC; only chats after this datetime (exclusive). |
| `limit` | integer | no | 1–250 items per page. |
| `cursor` | string | no | Pagination cursor from a prior response. |

- **Request example:**

```bash
curl --request GET \
  --url 'https://{YOUR_DSN}/api/v1/chats?account_type=LINKEDIN&limit=50&unread=true' \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "ChatList",
  "items": [
    {
      "object": "Chat",
      "id": "chat_123",
      "account_id": "acc_456",
      "account_type": "LINKEDIN",
      "provider_id": "wa_789",
      "attendee_provider_id": "ACoAAAcDMMQ...",
      "name": "Support Group",
      "type": 1,
      "timestamp": "2025-01-15T10:30:00.000Z",
      "unread_count": 5,
      "archived": 0,
      "muted_until": null,
      "read_only": 0,
      "pinned": 1,
      "content_type": "inmail",
      "folder": ["INBOX", "INBOX_LINKEDIN_CLASSIC"],
      "disabledFeatures": []
    }
  ],
  "cursor": null
}
```

The **Chat object** fields: `object` (`"Chat"`), `id`, `account_id`, `account_type`, `provider_id` (platform-native chat id), `attendee_provider_id` (platform-native id of the other party in a 1:1), `name` (string|null), `type` (`0`=1:1, `1`/`2`=group/other), `timestamp` (ISO|null, last activity), `unread_count`, `archived` (`0`/`1`), `muted_until` (`-1` permanent | ISO | null), `read_only` (`0`/`1`/`2`), `pinned` (`0`/`1`), and LinkedIn-specific: `subject`, `organization_id`, `mailbox_id`, `content_type` (`"inmail"` | `"sponsored"` | `"linkedin_offer"`), `folder` (array, e.g. `"INBOX"`, `"INBOX_LINKEDIN_CLASSIC"`), `disabledFeatures` (array, e.g. `"reactions"`, `"reply"`).

- **Notes / gotchas:** `account_id` accepts a comma-separated list. `read_only` > 0 and `disabledFeatures` tell you whether replying/reacting is allowed before you attempt a send.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_listallchats.md

---

### `POST /chats`
Start a brand-new chat (1:1 or group) and send the first message; for LinkedIn this is how you send connection-message / InMail openers.

- **Auth/headers:** `X-API-KEY`, `accept: application/json`, **`content-type: multipart/form-data`** (this endpoint is multipart, not JSON — it accepts file attachments).
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | yes | The Unipile connected-account id that sends the chat. |
| `attendees_ids` | string[] | yes | One or more attendee **provider** internal IDs (repeat the field for groups). For WhatsApp use `<phone>@s.whatsapp.net`. |
| `text` | string | no | First message body. Supports HTML tags for LinkedIn recruiter. |
| `subject` | string | no | Optional conversation subject / group name. |
| `attachments` | file[] | no | One or more file attachments (multipart). |
| `voice_message` | file | no | Voice-message file (LinkedIn / WhatsApp). |
| `video_message` | file | no | Video-message file (LinkedIn only). |
| `linkedin[api]` | enum | no | LinkedIn product: `classic` \| `recruiter` \| `sales_navigator`. |
| `linkedin[inmail]` | boolean | no | `true` to send as an InMail (Premium accounts only). |

- **Request example (1:1):**

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/chats \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json' \
  --header 'content-type: multipart/form-data' \
  --form account_id=Yk08cDzzdsqs9_8ds \
  --form 'text=Hello world !' \
  --form attendees_ids=ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E
```

LinkedIn InMail variant (note the nested `linkedin[...]` form fields):

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/chats \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'content-type: multipart/form-data' \
  --form account_id=Asdq-j08dsqQS89QSD \
  --form 'text=Hello world !' \
  --form attendees_ids=ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E \
  --form linkedin[api]=classic \
  --form linkedin[inmail]=true
```

Group chat — repeat `attendees_ids` and add `subject`:

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/chats \
  --form account_id=k0_s8cdss9Dz8ds \
  --form 'text=Hello world !' \
  --form attendees_ids=33600000000@s.whatsapp.net \
  --form attendees_ids=33600000001@s.whatsapp.net \
  --form subject=Vacation
```

Node SDK equivalent (uses an `options.linkedin` object):

```json
{
  "account_id": "t5XY4yQzR9WVrlNFyzPMhw",
  "attendees_ids": ["ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E"],
  "text": "new chat with message",
  "options": { "linkedin": { "api": "classic", "inmail": true } }
}
```

- **Response example (201):**

```json
{ "object": "MessageSent", "message_id": "unique-message-id" }
```

`message_id` is the Unipile id of the newly sent message (`null` if the provider didn't return one).

- **Notes / gotchas / limits:**
  - **1st-degree restriction:** on LinkedIn without InMail you can only start a chat with your existing relations (1st-degree connections). Targeting a non-connection returns **422**.
  - **InMail requirement:** to message a non-connection you must set `linkedin[inmail]=true`, which requires a **Premium LinkedIn account with available InMail credits**; each send consumes a credit.
  - **Multipart only:** because of attachment/voice/video support the body is `multipart/form-data` — send `linkedin` options as `linkedin[api]` / `linkedin[inmail]` form fields, or as an `options.linkedin` object via the SDK.
  - Documented error codes include 400, 401, 403, 404, 415 (bad content type), 422 (non-relation / validation), 429 (rate limit), 500/501/503/504.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_startnewchat (markdown: `.md`); examples from https://developer.unipile.com/docs/send-messages.md

---

### `GET /chats/{chat_id}`
Retrieve a single chat by its Unipile or provider id.

- **Auth/headers:** `X-API-KEY`, `accept: application/json`.
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `chat_id` | string | yes | The Unipile **or** provider ID of the chat. |

- **Request example:**

```bash
curl --request GET \
  --url https://{YOUR_DSN}/api/v1/chats/9f9uio56sopa456s \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "Chat",
  "id": "chat_123",
  "account_id": "acc_456",
  "account_type": "LINKEDIN",
  "name": null,
  "type": 0,
  "unread_count": 0,
  "archived": 0,
  "pinned": 0,
  "lastMessage": {
    "object": "Message",
    "text": "Hello there!",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "is_sender": 1,
    "seen": 1,
    "attachments": [],
    "reactions": []
  }
}
```

Returns a single **Chat object** (same fields as in `GET /chats`) plus a nested `lastMessage` (a Message object: `text`, `attachments`, `timestamp`, `is_sender`, `reactions`, `seen`, `seen_by`).

- **Notes / gotchas:** accepts either the Unipile id or the provider id, so you can look up a chat directly from a provider-native id without first listing.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_getchat.md

---

### `POST /chats/{chat_id}/messages`
Reply in an existing chat (text and/or attachments).

- **Auth/headers:** `X-API-KEY`, `accept: application/json`, **`content-type: multipart/form-data`**.
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `chat_id` | string | yes | The id of the chat to send the message into. |

- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `text` | string | no* | Message content. |
| `attachments` | file[] | no* | One or more file attachments (multipart). |
| `voice_message` | file | no | Audio file for a voice message. |
| `video_message` | file | no | Video file for a video message. |

\* Provide at least a `text` or an attachment.

- **Request example:**

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/chats/9f9uio56sopa456s/messages \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json' \
  --header 'content-type: multipart/form-data' \
  --form 'text=Hello world !'
```

- **Response example (201):**

```json
{ "object": "MessageSent", "message_id": "unique-message-id" }
```

- **Notes / gotchas / limits:** multipart only. Because the chat already exists no relation/InMail check applies here — use `POST /chats` for first-contact. Respect the chat's `read_only` / `disabledFeatures` before replying.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_sendmessageinchat.md

---

### `GET /chats/{chat_id}/messages`
Retrieve the message history of one chat (newest-first, paginated).

- **Auth/headers:** `X-API-KEY`, `accept: application/json`.
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `chat_id` | string | yes | The id of the chat whose messages you want. |

- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `cursor` | string | no | Pagination cursor from a prior response. |
| `before` | string | no | ISO 8601 UTC; messages before this datetime (exclusive). |
| `after` | string | no | ISO 8601 UTC; messages after this datetime (exclusive). |
| `limit` | integer | no | 1–250. |
| `sender_id` | string | no | Only messages from this sender id. |

- **Request example:**

```bash
curl --request GET \
  --url 'https://{YOUR_DSN}/api/v1/chats/9f9uio56sopa456s/messages?limit=100' \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "MessageList",
  "items": [
    {
      "object": "Message",
      "id": "msg_123",
      "account_id": "acc_456",
      "chat_id": "chat_789",
      "chat_provider_id": "prov_chat_001",
      "provider_id": "linkedin",
      "sender_id": "user_111",
      "sender_attendee_id": "attend_222",
      "text": "Hello there!",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "is_sender": 1,
      "seen": 1,
      "seen_by": { "user_222": true },
      "hidden": 0,
      "deleted": 0,
      "edited": 0,
      "is_event": 0,
      "delivered": 1,
      "behavior": null,
      "subject": null,
      "attachments": [],
      "quoted": null,
      "reactions": [{ "value": "👍", "sender_id": "user_222", "is_sender": false }],
      "attendee_type": "MEMBER"
    }
  ],
  "cursor": null
}
```

The **Message object** fields: `object` (`"Message"`), `id`, `account_id`, `chat_id`, `chat_provider_id`, `provider_id`, `sender_id`, `sender_attendee_id`, `text` (string|null), `timestamp` (ISO), `is_sender` (`0`/`1` — whether the connected account sent it), `seen` (`0`/`1`), `seen_by` (object map of user id → read status), `hidden`, `deleted`, `edited`, `is_event` (system event), `delivered`, `behavior` (`0`|null), `subject` (string|null, email-like), `attachments` (array; item kinds include `img`, `video`, `audio`, `file`, `linkedin_post`, `video_meeting`), `quoted` (the message being replied to), `reactions` (array of `{value, sender_id, is_sender}`), `attendee_type` (`"MEMBER"` | `"ORGANIZATION"` | `"OTHER"`).

- **Notes / gotchas:** `sender_id` here filters by the message sender. Use `is_sender` to distinguish your own messages from the prospect's.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_listchatmessages.md

---

### `GET /messages`
List messages across all chats for the workspace/account — useful for a global inbox poll or backfill.

- **Auth/headers:** `X-API-KEY`, `accept: application/json`.
- **Query params:**

| name | type | required | description |
|------|------|----------|-------------|
| `account_id` | string | no | Scope to one connected account. |
| `sender_id` | string | no | Only messages from this sender id. |
| `before` | string | no | ISO 8601 UTC; before this datetime (exclusive). |
| `after` | string | no | ISO 8601 UTC; after this datetime (exclusive). |
| `limit` | integer | no | 1–250. |
| `cursor` | string | no | Pagination cursor from a prior response. |

- **Request example:**

```bash
curl --request GET \
  --url 'https://{YOUR_DSN}/api/v1/messages?account_id=acc_456&limit=100&after=2025-01-01T00:00:00.000Z' \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "MessageList",
  "items": [ { "object": "Message", "id": "msg_123", "chat_id": "chat_789", "text": "Hello there!", "is_sender": 0, "timestamp": "2025-01-15T10:30:00.000Z" } ],
  "cursor": null
}
```

Items are the same **Message object** as above.

- **Notes / gotchas:** unlike `GET /chats/{id}/messages` there is no `chat_id` filter here — cross-chat by design; narrow with `account_id` + time window. Paginate with `cursor`.
- **Doc:** https://developer.unipile.com/reference/messagescontroller_listallmessages.md

---

### `GET /chats/{chat_id}/attendees`
List the participants of a chat (their provider ids, names, profile URLs).

- **Auth/headers:** `X-API-KEY`, `accept: application/json`.
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `chat_id` | string | yes | The id of the chat whose attendees you want. |

- **Query params:** none documented in the OpenAPI parameters block. *(cursor/limit not explicitly listed — unverified.)*

- **Request example:**

```bash
curl --request GET \
  --url https://{YOUR_DSN}/api/v1/chats/9f9uio56sopa456s/attendees \
  --header 'X-API-KEY: {YOUR_ACCESS_TOKEN}' \
  --header 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "ChatAttendeeList",
  "items": [
    {
      "object": "ChatAttendee",
      "id": "attendee_123",
      "account_id": "account_456",
      "provider_id": "linkedin_user_789",
      "name": "John Doe",
      "is_self": 1,
      "hidden": 0,
      "picture_url": "https://example.com/pic.jpg",
      "profile_url": "https://linkedin.com/in/johndoe"
    }
  ],
  "cursor": null
}
```

The **Attendee (ChatAttendee) object** fields: `object` (`"ChatAttendee"`), `id` (Unipile attendee id), `account_id`, `provider_id` (platform-native user id — this is what you pass as `attendees_ids` when starting a chat), `name`, `is_self` (`0`/`1` — whether this attendee is the connected account itself), `hidden` (optional `0`/`1`), `picture_url` (optional), `profile_url` (optional), `specifics` (optional, provider-specific extra data).

- **Notes / gotchas:** the attendee's `provider_id` is the value you feed into `POST /chats` `attendees_ids`. Related attendee-scoped routes exist for broader use: `GET /chats/attendees` (list all attendees), `GET /chat_attendees/{id}` (retrieve one), `GET /chat_attendees/{id}/chats` (1:1 chats for an attendee), `GET /chat_attendees/{id}/messages` (messages for an attendee), and a profile-picture download route.
- **Doc:** https://developer.unipile.com/reference/chatscontroller_listattendees.md

---

#### Attachment constraints
- Attachments are sent via `multipart/form-data` on `POST /chats` and `POST /chats/{id}/messages` using the `attachments` field (plus `voice_message` / `video_message` for those media types).
- **Maximum file size is ~15MB** (the documented standard ceiling across PDF, image, and video). Individual providers may impose stricter limits.
- Retrieve received attachments via `GET /messages/{message_id}/attachments/{attachment_id}` (see the Messages controller); inbound attachment kinds reported on messages include `img`, `video`, `audio`, `file`, `linkedin_post`, and `video_meeting`.
- **Doc:** https://developer.unipile.com/docs/send-messages.md

---

## 6. LinkedIn / Sales Navigator search

Unipile exposes LinkedIn's search surface (Classic, Sales Navigator, Recruiter) through a single hosted endpoint. This is the primary engine for **TAM building** (auto-enumerate companies/people that match an ICP) and **contact sourcing** (resolve named accounts to reachable people). All requests run *through a connected LinkedIn account* (`account_id`), so results are scoped to that viewer's network visibility and that account's LinkedIn plan (Sales Navigator / Recruiter seats unlock the richer `api` modes).

Two-step pattern: filters are passed as **resolved numeric IDs**, not labels. First call `GET /linkedin/search/parameters` to turn a human keyword ("Los Angeles", "Software Development") into LinkedIn's internal ID, then pass those IDs into `POST /linkedin/search`. The alternative is to paste a LinkedIn/Sales Navigator search URL and let Unipile parse it (search-from-URL variant).

Base URL is your Unipile DSN: `https://{subdomain}.unipile.com:{port}/api/v1`.

---

### `POST /linkedin/search`

Run a paginated LinkedIn search (people / companies / jobs / posts) across Classic, Sales Navigator, or Recruiter, using resolved filter IDs in the body.

- **Auth/headers:** `X-API-KEY: <token>`, `Content-Type: application/json`, `accept: application/json`. The search is executed from a connected LinkedIn account identified by the `account_id` query param.
- **Query params:**

| name | type | required | description |
|---|---|---|---|
| `account_id` | string | yes | ID of the connected LinkedIn account to run the search from. Determines viewer scope and which `api` modes are available. |
| `limit` | integer (0–100) | no | Results per page. Defaults to 10. Up to 100 for Sales Navigator and Recruiter; LinkedIn Classic should not exceed 50. |
| `cursor` | string (len ≥ 1) | no | Opaque pagination cursor from a previous response; fetches the next page. |

- **Body params** (parameter-based search). Filters are arrays of resolved numeric IDs, or `{ "include": [...], "exclude": [...] }` objects for the filters that support exclusion:

| name | type | required | description |
|---|---|---|---|
| `api` | enum `classic` \| `sales_navigator` \| `recruiter` | yes | Which LinkedIn search surface to use. `sales_navigator`/`recruiter` require the account to have that seat. |
| `category` | enum `people` \| `companies` \| `jobs` \| `posts` | yes | What to search for. |
| `keywords` | string | no | Free-text query (boolean operators like `developer OR engineer` are supported inside `role.keywords` for Recruiter). |
| `location` | number[] (resolved IDs) | no | Geo filter; IDs from the parameters resolver (`type=LOCATION`). |
| `industry` | `{ include: (number\|string)[], exclude?: [] }` | no | Industry filter; IDs from `type=INDUSTRY`. |
| `company` | `{ include: [], exclude?: [] }` or number[] | no | Company filter; IDs from `type=COMPANY`. |
| `school` | number[] | no | School filter; IDs from `type=SCHOOL`. |
| `job_title` | number[] | no | Title filter; IDs from `type=JOB_TITLE`. |
| `seniority` | number[] | no | Seniority level filter (Sales Navigator). |
| `headcount` | array | no | Company headcount bucket filter (Sales Navigator / companies). Allowed bucket IDs not enumerated in docs *(unverified)*. |
| `tenure` | `[{ min?: number, max?: number }]` | no | Years in current company/role (Sales Navigator). |
| `profile_language` | string[] (e.g. `["en"]`) | no | Profile language filter. |
| `network_distance` | number[] e.g. `[1,2,3]` | no | Connection degree filter. |
| `role` | `[{ keywords, priority: MUST_HAVE\|DOESNT_HAVE, scope: CURRENT_OR_PAST }]` | no | Recruiter role filter with boolean keywords + scope. |
| `skills` | `[{ id: string, priority: MUST_HAVE\|DOESNT_HAVE }]` | no | Recruiter skills filter; IDs from `type=SKILL`. |
| `has_job_offers` | boolean | no | Companies filter — only companies currently hiring. |

- **Request example** (Sales Navigator people — TAM/contact sourcing):

```bash
curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/linkedin/search?account_id=ACCOUNT_ID&limit=50' \
  -H 'X-API-KEY: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "api": "sales_navigator",
    "category": "people",
    "keywords": "developer",
    "industry": { "include": [6] },
    "tenure": [{ "min": 3 }],
    "profile_language": ["en"],
    "network_distance": [1, 2, 3]
  }'
```

Companies (Classic) and Recruiter people examples:

```json
{ "api": "classic", "category": "companies", "has_job_offers": true, "location": [102277331, 102448103] }
```

```json
{
  "api": "recruiter",
  "category": "people",
  "network_distance": [1, 2, 3],
  "industry": { "include": ["4"] },
  "role": [{ "keywords": "developer OR engineer", "priority": "MUST_HAVE", "scope": "CURRENT_OR_PAST" }],
  "skills": [
    { "id": "261", "priority": "DOESNT_HAVE" },
    { "id": "50517", "priority": "MUST_HAVE" }
  ]
}
```

- **Response example** (people result page, trimmed to load-bearing fields):

```json
{
  "items": [
    {
      "type": "PEOPLE",
      "id": "ACoAAB...",
      "name": "Jane Doe",
      "first_name": "Jane",
      "last_name": "Doe",
      "public_identifier": "jane-doe",
      "public_profile_url": "https://www.linkedin.com/in/jane-doe",
      "profile_url": "https://www.linkedin.com/in/jane-doe",
      "profile_picture_url": "https://media.licdn.com/...",
      "headline": "Senior Backend Engineer",
      "location": "Los Angeles, California, United States",
      "network_distance": "DISTANCE_2",
      "premium": true,
      "open_profile": true,
      "pending_invitation": false,
      "current_positions": [
        {
          "company": "Acme Inc",
          "role": "Senior Backend Engineer",
          "tenure_at_company": { "years": 10 },
          "tenure_at_role": { "years": 3 }
        }
      ]
    }
  ],
  "cursor": "eyJhY2NvdW50X2lkIjoiOFJma0txU0tSTy1JbXpKT2k4T1I1USIsImxpbWl0Ijo1LCJzdGFydCI6NSwicGFyYW1zIjp7ImFwaSI6InNhbGVzX25hdmlnYXRvciIsImNhdGVnb3J5IjoiY29tcGFuaWVzIn19",
  "paging": { "start": 0, "page_count": 50, "total_count": 1000 }
}
```

Company result item shape (`category: "companies"`):

```json
{
  "type": "COMPANY",
  "id": "1234567",
  "name": "Acme Inc",
  "profile_url": "https://www.linkedin.com/company/acme",
  "summary": "We build...",
  "industry": "Software Development",
  "location": "San Francisco, California",
  "headcount": "54",
  "followers_count": 11000000,
  "job_offers_count": 427
}
```

Non-obvious fields:
- `type` — `"PEOPLE"` or `"COMPANY"`, mirrors `category`.
- `id` — LinkedIn URN/member id; stable handle to enrich or message the person/company.
- `network_distance` — `"DISTANCE_1"|"DISTANCE_2"|"DISTANCE_3"|"OUT_OF_NETWORK"`; gates whether you can DM vs must connect first.
- `open_profile` — person accepts messages without a connection (free InMail-equivalent).
- `pending_invitation` — you already have an outstanding connect request (anti-collision signal).
- `current_positions[].tenure_at_company` / `tenure_at_role` — `{ "years": n }`; useful for "new in role" buying signals.
- `headcount` (company) — string employee count; `followers_count`, `job_offers_count` (active job postings) are growth/hiring signals for scoring.
- `paging.total_count` — capped (see limits); not the true LinkedIn total beyond the cap.

- **Notes / gotchas / limits:**
  - **Viewer-scoped.** Results reflect the connected account's plan and network — Classic from a free account sees less than Sales Navigator.
  - **Filters are numeric IDs, not labels.** Resolve them via `GET /linkedin/search/parameters` first (except `keywords`, `tenure`, `network_distance`, `profile_language`, booleans).
  - **Per-query result ceilings:** Classic returns up to **1000** total results (`total_count` caps at 1000); Sales Navigator up to **2500**. Page through with `cursor`; you cannot exceed the ceiling regardless of paging.
  - **Page size caps:** `limit` up to 100 for Sales Navigator/Recruiter, ≤ 50 for Classic.
  - **Pagination** is forward-only via the opaque `cursor` (a base64 blob encoding account_id + start offset + the original params) — re-send the same body plus `cursor`.
  - Only `sales_navigator`/`recruiter` expose the advanced filters (`role`, `skills`, `tenure`, `seniority`, `headcount`); sending them with `api: classic` is ineffective.
- **Doc:** https://developer.unipile.com/docs/linkedin-search · https://developer.unipile.com/reference/linkedincontroller_search

---

### `POST /linkedin/search` (search-from-URL variant)

Run a search by handing Unipile a copied LinkedIn or Sales Navigator search URL instead of building the filter body yourself — Unipile parses the URL's filters.

- **Auth/headers:** same as above (`X-API-KEY`, `Content-Type: application/json`, `account_id` query param).
- **Query params:** identical to the parameter-based call — `account_id` (required), `limit`, `cursor`.
- **Body params:**

| name | type | required | description |
|---|---|---|---|
| `url` | string | yes | A full LinkedIn search or Sales Navigator search results URL (e.g. `https://www.linkedin.com/sales/search/people?query=(...)`). Unipile infers `api`/`category`/filters from it. |

- **Request example:**

```bash
curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/linkedin/search?account_id=ACCOUNT_ID&limit=50' \
  -H 'X-API-KEY: YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://www.linkedin.com/sales/search/people?query=(...)" }'
```

- **Response example:** identical envelope and item shapes as the parameter-based search (`items[]` of `PEOPLE`/`COMPANY`, `cursor`, `paging`). See above.

- **Notes / gotchas / limits:**
  - Fastest path for an operator who has already built a search in the LinkedIn UI — no ID resolution needed.
  - The URL's `api`/`category` are derived from which LinkedIn surface produced it (a `/sales/search/...` URL implies Sales Navigator); the account must have access to that surface.
  - Same per-query ceilings (1000 classic / 2500 SN) and cursor pagination apply.
  - Do not combine `url` with the parameter-based filter keys in the same body — use one mode or the other.
- **Doc:** https://developer.unipile.com/docs/linkedin-search

---

### `GET /linkedin/search/parameters`

Resolve a human-readable filter value (a city, industry, company, title, skill, school…) into the **numeric ID** that `POST /linkedin/search` requires.

- **Auth/headers:** `X-API-KEY: <token>`, `accept: application/json`. Runs from a connected account (`account_id`).
- **Query params:**

| name | type | required | description |
|---|---|---|---|
| `account_id` | string | yes | Connected LinkedIn account to resolve against. |
| `type` | enum | yes | What kind of parameter to resolve: `LOCATION`, `PEOPLE`, `CONNECTIONS`, `COMPANY`, `SCHOOL`, `INDUSTRY`, `SERVICE`, `JOB_FUNCTION`, `JOB_TITLE`, `EMPLOYMENT_TYPE`, `SKILL`. |
| `service` | enum `CLASSIC` \| `RECRUITER` \| `SALES_NAVIGATOR` | no | Which LinkedIn surface's ID space to resolve in. Defaults to `CLASSIC`. |
| `keywords` | string | no | The label to match (e.g. `los angeles`, `Software Development`). Not applicable to `EMPLOYMENT_TYPE`. |
| `limit` | integer (1–100) | no | Max items returned. Defaults to 10. |

- **Request example:**

```bash
curl -X GET 'https://{subdomain}.unipile.com:{port}/api/v1/linkedin/search/parameters?account_id=ACCOUNT_ID&type=INDUSTRY&keywords=software&limit=100' \
  -H 'X-API-KEY: YOUR_TOKEN' \
  -H 'accept: application/json'
```

- **Response example:**

```json
{
  "object": "LinkedinSearchParametersList",
  "items": [
    {
      "object": "LinkedinSearchParameter",
      "title": "Technology, Information and Internet",
      "id": "6"
    }
  ],
  "paging": { "page_count": 5 }
}
```

Fields:
- `items[].id` — the numeric ID to drop into the corresponding `POST /linkedin/search` filter (e.g. `industry: { include: [6] }`, `location: [<id>]`).
- `items[].title` — the human label LinkedIn returns for that ID; show it back to the user for confirmation.
- `paging.page_count` — number of pages of matches available.

- **Notes / gotchas / limits:**
  - This is the mandatory pre-step for the parameter-based search — LinkedIn filters are ID-keyed, and IDs differ per `service`, so resolve with the same `service` you'll search in.
  - `EMPLOYMENT_TYPE` ignores `keywords` (it's a fixed enum — call it to list the options).
  - IDs are returned as strings; both string and number forms appear in search bodies in the docs (`"6"` vs `6`) — either is accepted in worked examples.
- **Doc:** https://developer.unipile.com/reference/linkedincontroller_getsearchparameterslist

---

## 7. Webhooks

Unipile webhooks push real-time events to a URL you control. You create one webhook per **source** (`messaging`, `account_status`, `mailing`); each delivery is an HTTP `POST` of a JSON body to your `request_url`. The base path is `/api/v1/webhooks` on your Unipile DSN (`https://{subdomain}.unipile.com:{port}`).

### `POST /webhooks`
Create a webhook subscription for a given event source.

- **Auth/headers:** `X-API-KEY: <your_access_token>`; `Content-Type: application/json`; `accept: application/json`.
- **Body params:**

| name | type | required | description |
|------|------|----------|-------------|
| `source` | string (enum) | yes | Event category: `messaging` (new messages), `account_status` (account lifecycle), `mailing` (new/tracked emails). |
| `request_url` | string (URL) | yes | Your HTTPS endpoint that receives the event `POST`. |
| `name` | string | no | Human label for the webhook; echoed back in payloads as `webhook_name`. |
| `events` | array/filter | no | Webhook-level event filter to narrow which events of the source are delivered. (Accepted filter values per source not enumerated in docs — unverified.) |
| `headers` | array of `{key, value}` | no | Custom HTTP headers Unipile attaches to every outgoing delivery — used both for content negotiation and as your verification secret (see Notes). |

- **Request example:**
```bash
curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/webhooks' \
  -H 'X-API-KEY: YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'accept: application/json' \
  -d '{
    "source": "messaging",
    "request_url": "https://your-app.example.com/unipile/webhook",
    "name": "Webhook demo",
    "headers": [
      { "key": "Content-Type", "value": "application/json" },
      { "key": "Unipile-Auth", "value": "yoursecretkey" }
    ]
  }'
```

- **Response example:**
```json
{
  "object": "WebhookCreated",
  "message": "Webhook successfully added."
}
```
Returns `201 Created` on success. (Whether the response also returns the new webhook `id` is not shown in the fetched reference — unverified.)

- **Notes / gotchas / limits:**
  - `headers` is the verification mechanism: define a secret header (e.g. `Unipile-Auth: yoursecretkey`) at creation; Unipile sends it on every delivery so your endpoint can confirm the request really came from your configured webhook. There is no separate HMAC signature scheme documented — verification is the shared-secret header you set.
  - One webhook = one `source`; subscribe to messaging, account_status, and mailing separately.
  - **Doc:** https://developer.unipile.com/reference/webhookscontroller_createwebhook · https://developer.unipile.com/docs/webhooks-2

### `GET /webhooks`
List the webhooks configured on your account.

- **Auth/headers:** `X-API-KEY: <your_access_token>`; `accept: application/json`.
- **Query params:** none documented.
- **Request example:**
```bash
curl -X GET 'https://{subdomain}.unipile.com:{port}/api/v1/webhooks' \
  -H 'X-API-KEY: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json'
```
- **Response example:** (per-webhook object shape — id, source, request_url, name, headers — not shown in fetched pages; unverified)
```json
{ "object": "WebhookList", "items": [ /* webhook objects (unverified shape) */ ] }
```
- **Notes / gotchas / limits:** List/get is referenced as a standard REST operation but its exact response body is not documented on the pages reached (unverified — page not reachable in full).
- **Doc:** https://developer.unipile.com/docs/webhooks-2

### `DELETE /webhooks/{id}`
Delete a webhook by its id.

- **Auth/headers:** `X-API-KEY: <your_access_token>`; `accept: application/json`.
- **Path params:**

| name | type | required | description |
|------|------|----------|-------------|
| `id` | string | yes | Identifier of the webhook to delete. |

- **Request example:**
```bash
curl -X DELETE 'https://{subdomain}.unipile.com:{port}/api/v1/webhooks/{id}' \
  -H 'X-API-KEY: YOUR_ACCESS_TOKEN' \
  -H 'accept: application/json'
```
- **Response example:**
```json
{ "object": "WebhookDeleted" }
```
(Exact response body not shown in fetched pages — unverified.)
- **Notes / gotchas / limits:** Deletion-by-id is referenced via standard REST but the exact response is undocumented in the fetched content (unverified).
- **Doc:** https://developer.unipile.com/docs/webhooks-2

---

### Event payloads

#### Messaging — `message_received` (source: `messaging`)
Full payload Unipile POSTs to your `request_url` when a new message arrives:

```json
{
  "account_id": "dfXlh46vQYCsMbVarumWlg",
  "account_type": "LINKEDIN",
  "account_info": {
    "type": "LINKEDIN",
    "feature": "classic",
    "user_id": "ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E"
  },
  "event": "message_received",
  "chat_id": "R8J-xM9WX7eoHLp6gSVtWQ",
  "timestamp": "2023-09-24T13:49:07.965Z",
  "webhook_name": "Webhook demo",
  "message_id": "ykmhfXlRW0W_cqReJYrfBw",
  "message": "Hello World !",
  "sender": {
    "attendee_id": "C8zaRZTlVcmfnke_Vai4Gg",
    "attendee_name": "Kim Unipile",
    "attendee_provider_id": "ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E",
    "attendee_profile_url": "https://www.linkedin.com/in/ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E/"
  },
  "attendees": [
    {
      "attendee_id": "12Siz1Vcmfnke_Vai4Gg",
      "attendee_name": "Bastien Unipile",
      "attendee_provider_id": "AA1212sqqsMQBODyLwZrRcgYhrkCafURGqva0U4E",
      "attendee_profile_url": "https://www.linkedin.com/in/ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E/"
    }
  ],
  "attachments": [
    {
      "id": "2-MTY5MzQ3ODM0MTgxOWI4MDA4My0wMDMmNjg2M2E2MTgtNjM2Yi01OWNkLWFjNmQtYjE3Y2NjNTU5ZWZkXzAxMw==",
      "type": "img",
      "mimetype": "image/jpeg",
      "url": "att://iWfwCtGXSr288YQm5MbWVaeGtYNHQyaEZQcVpPbW5PdGNsQQ==",
      "size": { "height": "150", "width": "150" },
      "sticker": false,
      "unavailable": false
    }
  ]
}
```

Field notes:
- `event` — event type; `message_received` for new messages (`message_reaction` is also delivered on this source for reactions).
- `account_id` — the Unipile-connected account that received the message; use to route to the right tenant/mailbox.
- `account_info.user_id` — the **connected account's** provider id. Compare against `sender.attendee_provider_id` to tell whether the message was sent BY you vs received from someone else.
- `sender.attendee_provider_id` — the sender's native provider id (e.g. LinkedIn URN); `attendee_id` is Unipile's internal attendee id.
- `chat_id` — the conversation/thread id; `message_id` — the unique message id (use for idempotency/dedup).
- `message` — the text body. `timestamp` — ISO-8601 UTC. `account_type` — `LINKEDIN`, `WHATSAPP`, `INSTAGRAM`, `MESSENGER`, `TELEGRAM`, etc.
- `attendees` — other participants in the chat. `attachments` — media; `url` is an `att://` reference resolved via the messaging attachment endpoint.
- **Doc:** https://developer.unipile.com/docs/new-messages-webhook

#### Account status — `AccountStatus` (source: `account_status`)
Payload POSTed on every account lifecycle change:

```json
{
  "AccountStatus": {
    "account_id": "h_EKCy2lRLef5NzHp0iw4A",
    "account_type": "LINKEDIN",
    "message": "CREDENTIALS"
  }
}
```

`AccountStatus.message` values:

| value | meaning |
|-------|---------|
| `OK` | Everything in good order; data retrieval works (updates not guaranteed perfectly current). |
| `ERROR` / `STOPPED` | Synchronization stopped due to an unexpected error during data fetching. |
| `CREDENTIALS` | Sync interrupted — invalid/missing credentials (password change, revoked auth, expired session, or activity flagged as suspicious). Requires reconnect. |
| `CONNECTING` | Account is attempting to connect; temporary status during provider delay or sync catch-up. |
| `CREATION_SUCCESS` | Account successfully added; initial data sync has begun. |
| `RECONNECTED` | Account successfully restored after a disconnection. |
| `SYNC_SUCCESS` | (Re)synchronization finished (LinkedIn / IMAP / WhatsApp / Instagram / Telegram). LinkedIn premium accounts may receive dual payloads. |
| `DELETED` | User-initiated account removal. |

Field notes: `account_id` identifies the affected account; `account_type` is the provider; act on `CREDENTIALS`/`ERROR`/`STOPPED` by prompting the user to reconnect. Available across LinkedIn, WhatsApp, Instagram, Messenger, Telegram, X, Google, Microsoft, and IMAP.
- **Doc:** https://developer.unipile.com/docs/account-lifecycle

---

### Delivery semantics
- Your endpoint **must respond `HTTP 200` within 30 seconds**. Anything else (non-200, timeout >30s, connection error) is treated as a failed delivery.
- On failure Unipile makes **5 retry attempts**, with an **incremental (backoff) delay between each attempt**. After the retries are exhausted the event is dropped.
- Implication: acknowledge fast (return 200 immediately, process asynchronously) and **dedupe on `message_id`** (messaging) / on the account event, since retries can deliver the same event more than once.

### Authenticating / verifying incoming webhooks
- Unipile does not document an HMAC signature. Verification is a **shared-secret custom header** you set in the `headers` array at webhook creation, e.g. `{ "key": "Unipile-Auth", "value": "yoursecretkey" }`.
- Unipile attaches that header to every delivery `POST`; your endpoint reads it and rejects requests whose value doesn't match your stored secret. Keep the secret server-side and compare in constant time.
- **Doc:** https://developer.unipile.com/docs/webhooks-2

---

## 8. Errors, rate limits & account safety

Unipile is a **pass-through provider**: it relays your calls to LinkedIn (and the other channels) and surfaces a normalized error envelope, but it does **not** rate-limit, throttle, or queue your requests. The platform states plainly, for profile and search volume, that *"We don't enforce any limits on our side"* and *"we do not limit your requests."* Every per-action ceiling below is a **LinkedIn** limit that you, the integrator, must enforce in your own code. Exceed it and LinkedIn — not Unipile — penalizes the underlying account (warnings, temporary restrictions, or a permanent ban).

### Error model (the envelope)

Every error response is a single JSON object with a [Problem-Details](https://datatracker.ietf.org/doc/html/rfc9457)-style shape:

| field | type | required | description |
|---|---|---|---|
| `status` | number (enum) | yes | HTTP status code, mirrored in the body (e.g. `400`, `401`, `500`). |
| `type` | string (enum) | yes | Machine-readable error category, namespaced `errors/...` (e.g. `errors/invalid_parameters`). Switch on this, not on `title`. |
| `title` | string | yes | Short human-readable summary of the error class. |
| `detail` | string | no | Longer human-readable explanation of *this* occurrence. |
| `instance` | string | no | Reference/identifier for the specific failing request (useful in support tickets). |

```json
{
  "status": 400,
  "type": "errors/invalid_parameters",
  "title": "Invalid parameters",
  "detail": "The field 'provider' must be one of LINKEDIN, INSTAGRAM, TWITTER, MESSENGER.",
  "instance": "/api/v1/accounts/checkpoint"
}
```

- **`type`** — branch your retry/alert logic on this stable string, never on the localized `title`.
- **`status`** — duplicated in the body so you can dispatch without re-reading the HTTP line.
- **`instance`** — quote this when contacting Unipile support; it pins the exact request.

**Doc:** https://developer.unipile.com/docs/api-usage

### HTTP codes and what triggers each

| code | meaning | common `type` values | what triggers it |
|---|---|---|---|
| **400** Bad Request | Malformed input | `errors/invalid_parameters`, `errors/missing_parameters`, `errors/malformed_request`, `errors/invalid_request`, `errors/invalid_url`, `errors/content_too_large`, `errors/too_many_characters`, `errors/unescaped_characters`, `errors/limit_too_high`, `errors/invalid_action`, `errors/invalid_label` | Bad/missing params, payload too big, a `limit` query value above the allowed max, unescaped characters, an invalid action/label. |
| **401** Unauthorized | Auth / account-session problem | `errors/missing_credentials`, `errors/invalid_credentials`, `errors/expired_credentials`, `errors/invalid_checkpoint_solution`, `errors/checkpoint_error`, `errors/multiple_sessions`, `errors/invalid_proxy_credentials`, `errors/invalid_imap_configuration`, `errors/invalid_smtp_configuration`, `errors/insufficient_privileges`, `errors/disconnected_account`, `errors/disconnected_feature`, `errors/expired_link`, `errors/wrong_account`, `errors/invalid_credentials_but_valid_account_imap` | Missing/invalid API key; the connected account hit a **checkpoint** (2FA/OTP/in-app validation) or got disconnected; LinkedIn detected a second active session; expired hosted-auth link; action sent to the wrong `account_id`. |
| **403** Forbidden | Authorization failure | *(per-code enum not published)* | Authenticated, but lacks permission for the requested resource/feature. |
| **404** Not Found | Resource missing | *(per-code enum not published)* | The `account_id`, chat, message, or other referenced resource does not exist (or isn't visible to your key). |
| **422** Unprocessable Entity | Valid syntax, invalid state | reported as `cannot_resend_yet` *(unverified — not in the endpoint OpenAPI tables)* | Request was well-formed but cannot be processed yet — notably **resending a checkpoint too soon** (must wait before re-requesting the code), or an action that conflicts with the provider's current state. |
| **429** Too Many Requests | Rate-limited | `rate-limited` / "too many requests" | You've sent too many requests in too short a window. Per Unipile's guidance this surfaces LinkedIn's own throttling — *"Exceeding LinkedIn's limits will result in an HTTP 429 or 500 error."* Back off (exponential) and slow your cadence. |
| **500** Internal Server Error | Server-side failure | `errors/unexpected_error`, `errors/provider_error`, `errors/authentication_intent_error` | An unexpected Unipile error, or an error **bubbled up from the provider** (`errors/provider_error`) — including LinkedIn rejecting an over-limit action. |
| **503** Service Unavailable | Channel/session not ready | `errors/no_client_session`, `errors/no_channel`, `errors/no_handler`, `errors/network_down`, `errors/service_unavailable` | The provider channel/session isn't established or the upstream network is down; retry after a delay. |

> Reference endpoints also document **501 Not Implemented** (provider doesn't support the action — e.g. checkpoint resend on an unsupported channel) and **504 Gateway Timeout** (upstream timed out) on the checkpoint routes.

**Doc:** https://developer.unipile.com/docs/api-usage · https://developer.unipile.com/reference/accountscontroller_resendcheckpoint.md

### `POST /api/v1/accounts/checkpoint/resend`

Re-send a pending checkpoint notification (2FA / OTP / in-app validation) for a supported provider (LinkedIn, Instagram, Messenger).
- **Auth/headers:** `X-API-KEY: <your key>`; `Content-Type: application/json`. Call against your tenant subdomain/port (DSN).
- **Body params:**

| name | type | required | description |
|---|---|---|---|
| `account_id` | string | yes | The connected account currently sitting at a checkpoint. |

- **Request example:**
```bash
curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/accounts/checkpoint/resend' \
  -H 'X-API-KEY: REDACTED' \
  -H 'Content-Type: application/json' \
  -d '{ "account_id": "abc123" }'
```
- **Response example:**
```json
{ "object": "Checkpoint", "account_id": "abc123" }
```
- **Notes / gotchas / limits:** Resending too soon yields **422** (treated as `cannot_resend_yet` — *unverified against the endpoint schema*): wait the provider-imposed interval before retrying. Unsupported channels return **501**. Documented codes: 200, 400, 401, 500, 501, 503, 504.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_resendcheckpoint

### `POST /api/v1/accounts/checkpoint`

Submit the code/solution to clear a pending checkpoint and re-activate the account.
- **Auth/headers:** `X-API-KEY: <your key>`; `Content-Type: application/json`.
- **Body params:**

| name | type | required | description |
|---|---|---|---|
| `provider` | string (enum) | yes | One of `LINKEDIN`, `INSTAGRAM`, `TWITTER`, `MESSENGER`. |
| `account_id` | string | yes | Account at the checkpoint. |
| `code` | string | yes | The OTP / verification code the user received. |

- **Request example:**
```bash
curl -X POST 'https://{subdomain}.unipile.com:{port}/api/v1/accounts/checkpoint' \
  -H 'X-API-KEY: REDACTED' \
  -H 'Content-Type: application/json' \
  -d '{ "provider": "LINKEDIN", "account_id": "abc123", "code": "123456" }'
```
- **Response example:**
```json
{ "object": "AccountStatus", "account_id": "abc123", "status": "OK" }
```
- **Notes / gotchas / limits:** A wrong/expired code returns **401** (`errors/invalid_checkpoint_solution` / `errors/checkpoint_error`) — retry with a fresh code. Documented codes: 201, 400, 401, 403, 407, 408, 409, 500, 502, 503, 504.
- **Doc:** https://developer.unipile.com/reference/accountscontroller_solvecheckpoint

### LinkedIn per-action limits — recommended, NOT enforced by Unipile

Unipile does not throttle any of these; the numbers mirror LinkedIn's own ceilings and are **your responsibility to enforce**. Treat them as daily/weekly caps per connected account, spread across working hours.

| Action | Paid / active account | Free account |
|---|---|---|
| **Invitations** | ~**80–100 / day**, ~**200 / week** (note ≤ 300 chars) | ~**5 / month** with a note; up to **150 / week** without a note |
| **Profile views (retrieval)** | ~**100 / day** per account | ~100 / day (same recommendation) |
| **Search results** | **1,000 profiles/query** (classic) · **2,500 profiles/query** (`sales_navigator` / Recruiter); cap total retrieved to **1,000/day** (classic) or **2,500/day** (Sales Nav) | same query caps; classic search far more limited in the LinkedIn UI |
| **InMail** | spread randomly; **30–50 / day** recommended | free InMails to *open profiles*: **≤ 800 / month** per account |
| **Messages (and other routes)** | ~**100 / day** per account | ~100 / day (same recommendation) |

> Unipile, verbatim: *"We don't enforce any limits on our side."* If you exceed a LinkedIn limit you'll get the **exact same restriction as in the LinkedIn UI**, surfaced as a **429** or **500 (`errors/provider_error`)** — and, more importantly, LinkedIn may flag the account for automation. **Build a per-account, per-action quota counter and a token-bucket/scheduler in your own stack.**

**Doc:** https://developer.unipile.com/docs/provider-limits-and-restrictions

### Account warmup & anti-detection guidance

- **Ramp new / inactive accounts:** *"start with low quantities and increase gradually"* — do not run a fresh account at the full 80–100 invites/day on day one.
- **Never poll on a fixed clock:** avoid *"polling every hour or at fixed times"*; predictable cadence is an automation tell. Add jitter to every scheduled job.
- **Space and randomize calls:** *"Space out all calls rather than chaining them at regular intervals. Use random values"* — randomize both the per-action delay and the daily total.
- **Mimic human hours:** distribute actions *"across multiple launches during working hours,"* not in a single nightly burst.
- **Respect checkpoints:** when an account hits a checkpoint (401 / checkpoint error), pause **all** automation on that account until it's solved via the checkpoint routes above — continuing to push actions deepens LinkedIn's suspicion.

**Doc:** https://developer.unipile.com/docs/provider-limits-and-restrictions · https://developer.unipile.com/docs/account-lifecycle

---

## 9. Node SDK, pricing & compliance

The official wrapper is **`unipile-node-sdk`** — a typed Node.js client over Unipile's REST API (LinkedIn, WhatsApp, Instagram, Messenger, Telegram, X, and email). It requires **Node 18+**.

```bash
npm install unipile-node-sdk
```

### Client initialization

```javascript
import { UnipileClient } from 'unipile-node-sdk';

// dsn = your Unipile DSN URL (https://{subdomain}.unipile.com:{port}); accessToken = your API key
const client = new UnipileClient('https://{YOUR_DSN}', '{YOUR_ACCESS_TOKEN}');
```

The constructor is `new UnipileClient(dsn, accessToken)`. Every call below is authenticated with that access token (sent as the `X-API-KEY` header against the REST API). The DSN is account/region-specific — Unipile hosts each customer on a dedicated subdomain, so there is no single global base URL.

### Method → endpoint map

The SDK groups methods into namespaces. Below is each namespace, the SDK method, and the underlying REST endpoint it maps to (paths are relative to `/api/v1` on your DSN).

**`client.account.*`** — connect and manage messaging/social/email accounts.

| SDK method | REST endpoint | Purpose |
|---|---|---|
| `createHostedAuthLink({ type, expiresOn, api_url, providers, success_redirect_url, failure_redirect_url, notify_url })` | `POST /hosted/accounts/link` | Generate a Unipile-hosted auth flow link (`type: 'create' \| 'reconnect'`). |
| `connectLinkedin({ username, password })` | `POST /accounts` | Native LinkedIn connect via credentials. |
| `connectLinkedinWithCookie({ access_token, user_agent })` | `POST /accounts` | LinkedIn connect via session cookie (`li_at`) + matching user agent. |
| `connectWhatsapp()` | `POST /accounts` | Returns a QR code to scan. |
| `connectInstagram({ username, password })` | `POST /accounts` | |
| `connectMessenger({ username, password })` | `POST /accounts` | |
| `connectTelegram()` | `POST /accounts` | Returns a QR code. |
| `connectTwitter({ username, password })` | `POST /accounts` | X (Twitter). |
| `solveCodeCheckpoint({ account_id, provider, code })` | `POST /accounts/checkpoint` | Submit a 2FA/OTP checkpoint code. |
| `resyncLinkedinAccount({ account_id })` | `POST /accounts/{accountId}/reconnect` | Force a LinkedIn resync. |

**`client.messaging.*`** — chats, messages, attendees (all channels).

| SDK method | REST endpoint | Purpose |
|---|---|---|
| `startNewChat({ account_id, attendees_ids, text })` | `POST /chats` | Open a new conversation and send the first message. |
| `sendMessage({ chat_id, text, attachments? })` | `POST /chats/{chatId}/messages` | Send into an existing chat; `attachments` is an array of `[filename, Buffer]` (multipart). |
| `getAllMessagesFromChat({ chat_id })` | `GET /chats/{chatId}/messages` | |
| `getAllChats({ account_type?, account_id?, limit?, after? })` | `GET /chats` | Cursor-paginated; `after` is an ISO timestamp. |
| `getChat(chat_id)` | `GET /chats/{chatId}` | |
| `getAllAttendees({ account_id })` | `GET /chat_attendees` | |
| `getAllAttendeesFromChat(chat_id)` | `GET /chats/{chatId}/attendees` | |
| `getMessageAttachment({ attachment_id, message_id })` | `GET /messages/{messageId}/attachments/{attachmentId}` | Returns binary. |

**`client.users.*`** — profiles, invitations, posts, relations.

| SDK method | REST endpoint | Purpose |
|---|---|---|
| `getProfile({ account_id, identifier })` | `GET /users/{identifier}` | `identifier` = user id or provider id. |
| `getOwnProfile(account_id)` | `GET /users/me` | |
| `sendInvitation({ account_id, provider_id, message })` | `POST /users/invite` | LinkedIn connection request. |
| `getAllInvitationsSent({ account_id })` | `GET /users/invite/sent` | |
| `cancelInvitationSent({ account_id, invitation_id })` | `DELETE /users/invite/sent/{invitationId}` | |
| `getAllPosts({ account_id, identifier })` | `GET /users/{identifier}/posts` | |
| `getPost({ account_id, post_id })` | `GET /posts/{postId}` | |
| `createPost({ account_id, text })` | `POST /posts` | |
| `sendPostComment({ account_id, post_id, text })` | `POST /posts/{postId}/comments` | |
| `getAllPostComments({ account_id, post_id })` | `GET /posts/{postId}/comments` | |
| `sendPostReaction({ account_id, post_id, reaction_type })` | `POST /posts/{postId}/reaction` | e.g. `reaction_type: 'funny'`. |
| `getAllRelations({ account_id })` | `GET /users/relations` | LinkedIn 1st-degree connections. |
| `getCompanyProfile({ account_id, identifier })` | `GET /linkedin/company/{identifier}` | |

**`client.email.*`** — synced mailboxes. Several methods have a `.byProvider`/`.byProviderId` variant that accepts the provider's native id instead of Unipile's id.

| SDK method | REST endpoint | Purpose |
|---|---|---|
| `getAll({ account_id })` | `GET /emails` | List synced emails (folder/limit filters). |
| `getOne(email_id)` | `GET /emails/{emailId}` | |
| `getOne.byProvider(providerId, accountId)` | `GET /emails/{providerId}?account_id=` | Lookup by provider id. |
| `getAllFolders({ account_id })` | `GET /folders` | |
| `getOneFolder(folder_id)` | `GET /folders/{folderId}` | |
| `getOneFolder.byProviderId(folderProviderId, accountId)` | `GET /folders/{providerId}?account_id=` | |
| `getEmailAttachment({ email_id, attachment_id })` | `GET /emails/{emailId}/attachments/{attachmentId}` | |
| `getEmailAttachment.byProviderId({ account_id, email_id, attachment_id })` | `GET /emails/{providerId}/attachments/{attachmentId}` | |
| `delete(email_id)` | `DELETE /emails/{emailId}` | |
| `delete.byProviderId(providerId, accountId)` | `DELETE /emails/{providerId}` | |
| `send({ account_id, to, subject, body, reply_to? })` | `POST /mails/send` | `to` is `[{ identifier }]`; `reply_to` is the provider id of the parent email to thread on. |

**`client.webhook.*`** — register/list/remove webhooks. (SDK method names not shown in the README; the REST surface is `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/{id}` — the namespace exposes create/list/delete over those — *unverified method names*.)

### Generic request escape hatch — `client.request.send`

There is **no typed `search` helper** on the SDK, so the documented pattern for LinkedIn search (and any endpoint not wrapped) is the raw request escape hatch:

```javascript
const client = new UnipileClient(BASE_URL, "ACCESS_TOKEN", {});

await client.request.send({
  path: ["linkedin"],          // path segments appended to /api/v1
  method: "POST",
  parameters: { account_id: "!!YOURACCOUNTID!!" }, // -> query string
  body: { /* raw JSON body */ },
});
```

`client.request.send({ path, method, parameters, body, headers? })` issues an authenticated call to an arbitrary endpoint: `path` is an array of URL segments, `method` is the HTTP verb, `parameters` becomes the query string, and `body` is the raw JSON. This is the recommended way to call the search endpoint below.

---

### `POST /linkedin/search`
Run a LinkedIn search (people, companies, posts, jobs; Classic, Sales Navigator, or Recruiter) and page through results. Call it via `client.request.send` since there is no typed helper.

- **Auth/headers:** `X-API-KEY: {ACCESS_TOKEN}`; `Content-Type: application/json`.
- **Query params:**

| name | type | required | description |
|---|---|---|---|
| account_id | string | yes | The connected LinkedIn account that runs the search. |
| cursor | string (len ≥ 1) | no | Pagination cursor; pass the previous response's cursor to fetch the next page. |
| limit | integer 0–100 (default 10) | no | Max items returned. |

- **Body params:** (per search mode — Classic/Sales Navigator/Recruiter × People/Companies/Posts/Jobs, or "search from URL"):

| name | type | required | description |
|---|---|---|---|
| api | string | yes | Search surface: `classic`, `sales_navigator`, or `recruiter`. |
| category | string | yes | `people`, `companies`, `posts`, or `jobs`. |
| keywords | string | no | Free-text query. |
| url | string | no | A pasted LinkedIn search URL (mutually exclusive with structured filters). |

  *(Per-mode filter fields — e.g. location, industry, current_company — are documented per tab on the reference page but their exact names/types are unverified from the rendered excerpt.)*

- **Request example:**
```bash
curl -X POST 'https://{DSN}/api/v1/linkedin/search?account_id=t5XY4yQzR9WVrlNFyzPMhw&limit=10' \
  -H 'X-API-KEY: {ACCESS_TOKEN}' \
  -H 'Content-Type: application/json' \
  -d '{"api":"classic","category":"people","keywords":"founder fintech"}'
```
```javascript
await client.request.send({
  path: ["linkedin", "search"],
  method: "POST",
  parameters: { account_id: "t5XY4yQzR9WVrlNFyzPMhw", limit: 10 },
  body: { api: "classic", category: "people", keywords: "founder fintech" },
});
```

- **Response example:**
```json
{
  "object": "LinkedinSearch",
  "items": [ { "type": "PEOPLE", "id": "ACoAAA...", "name": "Jane Doe", "headline": "Founder @ Acme" } ],
  "cursor": "eyJwYWdlIjoyfQ==",
  "paging": { "start": 0, "page_count": 10, "total_count": 412 }
}
```
`items` — result rows (shape varies by `category`). `cursor` — opaque token; absent/null means no more pages. `paging.total_count` — estimated total matches.

- **Notes / gotchas / limits:** `limit` capped at 100; paginate with `cursor`, not offset. Search runs *as the connected LinkedIn account* (viewer-scoped) and consumes that account's LinkedIn quota; Sales Navigator / Recruiter modes require the account to hold the matching LinkedIn subscription. There is no typed SDK method — always go through `client.request.send`.
- **Doc:** https://developer.unipile.com/reference/linkedincontroller_search

### `POST /webhooks`
Register a webhook so Unipile pushes real-time events (new messages, new emails, account status, mail tracking) to your endpoint.

- **Auth/headers:** `X-API-KEY: {ACCESS_TOKEN}`; `Content-Type: application/json`.
- **Body params:**

| name | type | required | description |
|---|---|---|---|
| request_url | string | yes | Your HTTPS endpoint that receives the POST. |
| source | string | yes | Event family: `messaging`, `mailing`/`email`, `account_status`, `mail_tracking`, `relations` *(enum spelling unverified from the reference page)*. |
| name | string | no | Human label for the webhook. |
| events | string[] | no | Specific events to subscribe to (e.g. `message_received`, `mail_received`, `mail_sent`, `account.connected`, `account.disconnected`). *(per-source event list not exhaustively rendered — unverified)* |
| headers | object[] | no | Custom headers Unipile sends, as `{ key, value }` (e.g. an `Unipile-Auth` shared secret). |
| account_ids | string[] | no | Restrict to specific connected accounts; omit for all. |

- **Request example:**
```bash
curl -X POST 'https://{DSN}/api/v1/webhooks' \
  -H 'X-API-KEY: {ACCESS_TOKEN}' \
  -H 'Content-Type: application/json' \
  -d '{
    "request_url": "https://app.elevay.dev/api/unipile/webhook",
    "source": "messaging",
    "name": "inbound-messages",
    "headers": [{ "key": "Unipile-Auth", "value": "s3cr3t" }]
  }'
```

- **Response example:**
```json
{ "object": "WebhookCreated", "webhook_id": "kP3...Xy" }
```
`webhook_id` — store it to later `DELETE /webhooks/{id}`. *(Exact response field naming unverified — reference page Body/Response panels did not fully render.)*

- **Notes / gotchas / limits:** Your endpoint must reply HTTP **200 within 30 seconds**, otherwise Unipile retries **5 times** with incremental back-off. Use the custom `headers` (shared secret) to authenticate inbound webhook calls. Email and message webhooks deliver the new object inline so you usually don't need a follow-up GET.
- **Doc:** https://developer.unipile.com/reference/webhookscontroller_createwebhook

### `GET /webhooks`
List all registered webhooks.

- **Auth/headers:** `X-API-KEY: {ACCESS_TOKEN}`.
- **Path / Query params:** none required.
- **Request example:**
```bash
curl 'https://{DSN}/api/v1/webhooks' -H 'X-API-KEY: {ACCESS_TOKEN}'
```
- **Response example:**
```json
{ "object": "WebhookList", "items": [ { "webhook_id": "kP3...Xy", "request_url": "https://app.elevay.dev/api/unipile/webhook", "source": "messaging" } ] }
```
`items` — each registered webhook with its `webhook_id`, `request_url`, and `source`.
- **Notes:** Use this to reconcile/garbage-collect stale webhooks before re-registering.
- **Doc:** https://developer.unipile.com/llms.txt (index) → `/webhooks`

### `DELETE /webhooks/{id}`
Remove a webhook by id.

- **Auth/headers:** `X-API-KEY: {ACCESS_TOKEN}`.
- **Path params:**

| name | type | required | description |
|---|---|---|---|
| id | string | yes | The `webhook_id` returned at creation. |

- **Request example:**
```bash
curl -X DELETE 'https://{DSN}/api/v1/webhooks/kP3...Xy' -H 'X-API-KEY: {ACCESS_TOKEN}'
```
- **Response example:**
```json
{ "object": "WebhookDeleted", "deleted": true }
```
- **Notes:** Idempotent on a missing id is not guaranteed — expect a 404 if the id is unknown.
- **Doc:** https://developer.unipile.com/llms.txt (index) → `/webhooks/{id}`

---

### Pricing

| Item | Detail |
|---|---|
| **Base / minimum** | **€49/mo (~$55/mo)**, includes **up to 10 linked accounts**. |
| **1 account =** | 1 linked identity (one LinkedIn profile, one WhatsApp number, or one email address). |
| **11–50 accounts** | €5.00 / account / month. |
| **51–200 accounts** | €4.50 / account / month. |
| **201–1,000 accounts** | €4.00 / account / month. |
| **1,001–5,000 accounts** | €3.50 / account / month. |
| **5,001+ accounts** | €3.00 / account / month (contact sales for custom at the top end). |
| **Billing model** | **Post-paid.** Invoices are generated at the end of each 30-day period, billed on the **peak number of accounts active simultaneously** during that period. |
| **Trial** | **7-day free trial, no credit card required.** |

Volume tiers are graduated — the more accounts linked, the lower the per-account rate. Source: https://www.unipile.com/pricing-api/

### Data hosting

- **EU-only.** All data is hosted **exclusively in France on Scaleway datacenters** (European cloud provider, no on-premise servers).
- **No data transfer outside the European Union.**

### Compliance & security

- **SOC 2 Type II** certified — audited by an independent third party, covering the security, availability, and confidentiality trust-service criteria.
- **GDPR** compliant; Unipile acts as a **data processor**, with a **Data Processing Agreement (DPA)** available on request.
- **CASA Tier II** certified (Google Cloud Application Security Assessment).
- **Encryption at rest:** **AES-256-GCM** symmetric encryption via Scaleway Key Manager with built-in integrity verification (GCM tag); RSA-OAEP (2048/3072/4096-bit) for asymmetric needs.
- **Encryption in transit:** **TLS** for all communications.
- **Operational controls:** 24/7 monitoring with threat detection, mandatory MFA for internal tools, annual third-party penetration testing, full audit trails, and least-privilege access. SOC 2 report, DPA, and security whitepaper available on request.

Source: https://www.unipile.com/security-compliance/

---

## 10. Build-critical clarifications (completeness pass)

> Completeness critic score: 72/100. The items below were missing or under-specified in the fetched sections and are load-bearing for the build. Treat these as authoritative over any conflicting summary above.

### messaging-inmail
InMail send mechanism is entirely uncovered as a payload. The build needs the EXACT InMail shape: InMail is NOT a separate endpoint — it is POST /api/v1/chats with multipart/form-data fields linkedin[api]=classic|recruiter|sales_navigator AND linkedin[inmail]=true (plus account_id, text, attendees_ids). Section 5 listed POST /chats but never documented the linkedin[inmail] flag, the linkedin[api] sub-key, or that InMail uses the start-new-chat route. Also missing: the InMail `subject` field shape (group/chat title vs InMail subject) and that requests are multipart/form-data, not JSON.

**Doc:** https://developer.unipile.com/docs/send-messages.md

### messaging-attachments
POST /chats and POST /chats/{chat_id}/messages send as multipart/form-data with --form fields (not JSON). The `attachments` field is a file upload (multipart), not a URL/id. No section documented the multipart content-type requirement or the attachments upload form-field — critical for a working sender.

**Doc:** https://developer.unipile.com/docs/send-messages.md

### invitations
POST /users/invite (path: /api/v1/users/invite) full body is undocumented in any section as a send action. Required: provider_id (LinkedIn internal id ACoAA...), account_id, optional message. Section 4 listed POST /users/invite but gave no body/curl; this is the actual connection-request payload the build must send.

**Doc:** https://developer.unipile.com/docs/invite-users

### provider-id-resolution
How to RESOLVE provider_id (the build requirement) is uncovered. provider_id is obtained via GET /users/{identifier} where {identifier} accepts a public_identifier (e.g. 'satyanadella' — last path segment of a profile URL) OR an existing provider internal id; response returns provider_id + public_identifier + network_distance. Attendees/Messages expose only the provider internal id (no public_identifier), so resolution must round-trip through GET /users/{provider_id}.

**Doc:** https://developer.unipile.com/docs/retrieving-users

### webhooks-subscription
POST /webhooks create body for the two webhooks the build needs is uncovered. Messaging webhook: {request_url, source:"messaging", account_ids?:[], headers?:[{key,value}]}. Account-status webhook: {request_url, source:"account_status", headers?}. Field name is request_url (not url). The `source` enum values (messaging | account_status | mailing) were declared a gap in sections 7/9 — now confirmed. Also: webhooks created via API do NOT include a Content-Type: application/json header by default; you must add it via the headers array or your endpoint may receive an unparseable body.

**Doc:** https://developer.unipile.com/docs/webhooks-2.md

### webhooks-payload
Account-status webhook delivered payload is uncovered: {"AccountStatus":{account_id, account_type, message}} where message is the status value. Status enum: OK, ERROR, STOPPED, CREDENTIALS, CONNECTING, DELETED, CREATION_SUCCESS, RECONNECTED, SYNC_SUCCESS. The build must branch on CREDENTIALS/ERROR/STOPPED (re-auth needed) vs OK/RECONNECTED. This fills the section-3 gap on notify_url failure statuses.

**Doc:** https://developer.unipile.com/docs/account-lifecycle.md

### webhooks-payload
Messaging webhook delivered payload + event filter values are uncovered: top-level `event` enum = message_received | message_reaction | message_read | message_edited | message_deleted | message_delivered (sent messages also arrive as message_received). Payload fields: event, message_id, chat_id, account_id, sender{name,provider_id,profile_url}, message, timestamp, attachments[], reaction. Fills the section-7 'events exact schema unverified' gap.

**Doc:** https://developer.unipile.com/docs/new-messages-webhook

### rate-limits
Unipile does NOT impose its own rate limit — it surfaces LinkedIn's. Concrete pacing the build must encode: invitations 80-100/day & ~200/week (paid); profile fetches ~100/account/day; InMail to open profiles capped 800/month, pace 30-50/day; search per-query cap 1,000 (classic) / 2,500 (Sales Nav/Recruiter), daily retrieval cap same. Exceeding limits returns HTTP 429 or 500 — implement exponential backoff. There is no documented Retry-After header, so backoff must be self-driven.

**Doc:** https://developer.unipile.com/docs/provider-limits-and-restrictions

### invitations
Invitation-limit error: 422 with type cannot_resend_yet is returned when LinkedIn invite limits are hit. Sections 2/8 reported this as documented-but-unverified at endpoint-schema level — confirmed here as the live error for /users/invite when capped. Build must catch 422/cannot_resend_yet and defer, not retry immediately.

**Doc:** https://developer.unipile.com/docs/provider-limits-and-restrictions

### sales-nav-search
Sales Navigator vs classic search selection: POST /linkedin/search uses an `api` field (classic | sales_navigator | recruiter) to choose the search surface; Sales-Nav/Recruiter availability depends on the connected account's LinkedIn plan, and raises the result cap to 2,500. Section 6 listed the search endpoints but did not document the `api` selector that switches a connected account into the Sales Navigator search surface — this is the load-bearing field for the 'run Sales-Nav search' requirement.

**Doc:** https://developer.unipile.com/docs/sales-navigator

### linkedin-api-type
The linkedin[api] / api = classic|recruiter|sales_navigator selector is cross-cutting (search, messaging/InMail, profile retrieval) and gates which plan features are reachable on a connected account, but no section documented it as a parameter family. The build must thread the correct api value through every Sales-Navigator-scoped call, not just connection.

**Doc:** https://developer.unipile.com/docs/linkedin


---

## 11. Endpoint → spec-36 task map

How each documented capability wires into the Elevay build (`_specs/36-unipile-port-and-salesnav/tasks.md`). Adapter already built: `app/apps/web/src/lib/providers/unipile/{client,linkedin-adapter}.ts`.

| Unipile endpoint | Elevay use | Task / file |
|---|---|---|
| `POST /hosted/accounts/link` | Connect the founder Sales-Nav seat (new tab, not iframe) | T6 — `app/api/linkedin/connect/route.ts` |
| hosted-auth `notify_url` callback | Persist `unipile_account_id` on `CREATION_SUCCESS`/`RECONNECTED` | T6 — `app/api/linkedin/unipile/account-webhook/route.ts` |
| `GET /users/{identifier}` | Resolve `profileUrl` → viewer-scoped `provider_id` (+ degree) | T1 — `resolveProviderId` + `linkedin_provider_identity` cache |
| `POST /users/invite` | `LinkedInPort.connect` (note ≤300) | T2 — `UnipileAdapter.connect` (built) |
| `POST /chats` | `LinkedInPort.message` (new chat to a 1st-degree relation) | T2 — `UnipileAdapter.message` (built) |
| `POST /chats/{id}/messages` | `LinkedInPort.message` reply in an existing chat | T2 — `UnipileAdapter.message` chat-id branch (built) |
| `POST /chats` + `linkedin[inmail]=true` (multipart) | InMail to a non-connection (premium seat + credits) | T3 — InMail branch |
| `GET /users/relations` (cursor) | Feed 1st-degree connections into the graph | T9 — `buildKnowsFromLinkedIn` → `upsertKnowsEdge` (channel "linkedin", conf 0.80) |
| `POST /linkedin/search` (`api=sales_navigator`) + `GET /linkedin/search/parameters` | TAM + contact sourcing | T11 — Sales-Nav search source → `sourceContacts` (15) + company waterfall |
| `GET /users/{identifier}` (profile fields) | Contact enrichment (verified `linkedinUrl`, title, seniority) | T11 — Unipile `ContactEnrichmentProvider` (Apify stays fallback) |
| `POST /webhooks` `source=messaging` | Reply ingest | T10 — `app/api/linkedin/unipile/message-webhook/route.ts` → `ingestReply` (26) |
| `POST /webhooks` `source=account_status` | Session-health / reconnect | T5/T6 — flip `linkedin_account.status`; fail-closed capacity |
| provider limits (no Unipile enforcement) | Daily caps + warmup | T5/T7 — `getLinkedInSendableCapacity` + `lib/sending/linkedin/limits.ts` (20/100) |
| `GET /accounts`, `GET /accounts/{id}` | Health probe (`status?()`) | T5 |

**Cross-cutting `api` selector (classic | sales_navigator | recruiter):** thread the
connected seat's plan through every Sales-Nav-scoped call — search, InMail, and profile
retrieval — not just at connect. Stored on `linkedin_account.seat_type`.

**Secrets (env, gitignored — never in this public repo):** `UNIPILE_API_KEY`,
`UNIPILE_DSN` (`https://{subdomain}.unipile.com:{port}`), `UNIPILE_WEBHOOK_SECRET`.

