# MONACO-PARITY-01 — Design

## System fit
Signal generation today flows through `skills/signals/signal-scanner/handler.ts` and emits rows whose schema is in `skills/signals/signal-scanner/schema.ts`. The schema currently has `strength: enum(high|medium|low)` and `dataSource: string` (free text). We replace `strength` with a richer 4-state `verificationStatus` and add a typed `sourceUrl` plus `verifiedAt`.

A new helper `lib/signals/url-verifier.ts` performs HEAD checks behind a Postgres-backed cache and a token-bucket rate limiter.

The default TAM view (`app/(dashboard)/contacts/page.tsx`, `app/(dashboard)/accounts/page.tsx`) gains a filter that hides `unverified` and `uncertain` signals unless the user toggles "Show all".

## Data model

### New table: `signal_url_cache`
```
id              text primary key (default uuid)
url             text not null unique  -- normalized: lowercased host, no fragment
status          int not null          -- last HTTP status (or -1 for timeout, -2 for DNS fail)
checkedAt       timestamptz not null
expiresAt       timestamptz not null  -- checkedAt + 7 days
```
Index: `(url)`, `(expiresAt)` for cache eviction sweeps.

### Extend `signals` table
Add columns:
- `sourceUrl text` — null when the signal has no URL evidence.
- `verificationStatus text not null default 'uncertain'` — enum-as-text: `verified | likely | uncertain | unverified`.
- `verifiedAt timestamptz` — when HEAD last succeeded; null otherwise.
- `confidence numeric(3,2)` — LLM-reported, 0.00–1.00. Used when no URL is available.

Migration `drizzle/0xxx-signals-factual.sql` is additive only; existing rows get `verificationStatus = 'uncertain'` and surface as such until a re-scan rewrites them.

## API contracts

### Internal helper
```ts
// lib/signals/url-verifier.ts
export async function verifySignalUrl(rawUrl: string): Promise<{
  status: "verified" | "unverified";
  httpStatus: number;
  fromCache: boolean;
}>;
```
- Normalizes URL (drops fragment, lowercases host, strips tracking params per `lib/util/url-tracking-params.ts`).
- Reads `signal_url_cache`; if fresh, returns cached result with `fromCache: true`.
- Otherwise, performs `fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) })`.
- On non-2xx that's also non-blocking-CDN (LinkedIn 999, X 403), caches and returns `verified` (treat as well-formed).
- On private IPs / file:// → throws `InvalidUrlError` immediately, never HEADs.
- Token-bucket: 10 req/s per host via in-memory map (no Redis dep).

### Generation pipeline change
`skills/signals/signal-scanner/handler.ts` now:
1. Generates signal candidates from LLM (existing).
2. For each candidate with `sourceUrl`, calls `verifySignalUrl`.
3. Computes `verificationStatus`:
   - URL `verified` → `verified`
   - URL `unverified` → `unverified`
   - No URL but `confidence ≥ 0.7` → `likely`
   - Else → `uncertain`
4. Persists with the four new columns.

### Default-view filter
TAM/account list APIs accept `?signalStatus=verified,likely,unverified,uncertain` (default: `verified,likely`). Front-end queries with the default; "Show all" toggle adds `&signalStatus=all`.

## Failure handling
- HEAD throws → log warn (not error), persist as `unverified` with reason in `verifiedAt = null`.
- Cache table grows unbounded → daily cron evicts rows where `expiresAt < now()`.
- LLM returns malformed URL → wrap `new URL(raw)` in try/catch; on failure treat as no URL.
- Concurrent verifies of the same URL → DB unique constraint on `url` makes the upsert idempotent; second writer just updates `checkedAt`.

## Security
- HEAD only — no GET, no body fetched, no JS executed. Server-side only.
- Block private IPs (10/8, 172.16/12, 192.168/16, 127/8, fe80::/10) at the verifier — no SSRF surface.
- HEAD on attacker-controlled URLs: bound by token bucket, 5s timeout, no redirects followed (`redirect: "manual"`); attacker cannot use us as a port scanner or DDOS amplifier.
