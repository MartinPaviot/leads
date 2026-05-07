# MONACO-PARITY-04: Visitor ID — Snitcher / RB2B / Clearbit Reveal

P0 per `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 7. Effort L (2-3 sem). The single visible gap that independent reviews flag (MarketBetter 4/8) — and Monaco itself doesn't ship as a feature even though they use Snitcher on their own site. Shipping this exceeds Monaco.

## Requirements

### Story
As a founder, I want to know which companies are visiting my marketing site without filling a form, so I can trigger outbound to high-intent anonymous traffic before they cold-shop competitors.

### Acceptance
- GIVEN I install the Elevay tracking pixel on my marketing site
- WHEN a visitor from `acme.com` (de-anonymized via Snitcher/RB2B/Clearbit) lands on my pricing page
- THEN within 60s, an account `acme.com` is upserted in my TAM
- AND a signal `website_visit` is emitted with `properties = { pages: ["/pricing"], referrer, utm_*, sessionDurationSec, lastSeen }`
- AND if the account is already in TAM with score ≥ B, a `hot` notification fires
- AND if NEW account, the signal is emitted with `priority = "scoring_pending"` and TAM scoring runs

### Edge cases
- Provider returns no match (~50% of B2B traffic) → emit anonymous traffic count for trend analysis only.
- Provider rate-limit exceeded → backoff with exponential, keep raw events in queue.
- GDPR / "Do Not Track" → respect; don't de-anonymize.
- Same visitor returns next day → dedupe per `(companyId, day)` for signal purposes; full visit log persists.

## Design

### Provider abstraction
`lib/visitor-id/provider.ts` exposes:
```ts
interface VisitorIdProvider {
  identify(ip: string, ua: string): Promise<{ companyDomain: string; companyName: string; confidence: number } | null>;
  estimatedCost(): "low" | "medium" | "high";
}
```
Three implementations:
- `SnitcherProvider` (per-resolution pricing)
- `RB2BProvider`
- `ClearbitRevealProvider` (deprecated by Clearbit but still usable for Elevay-internal customers via partner deal)

Tenant chooses one in settings; only one active at a time. Fallback to next on rate-limit.

### Pixel
`/v1/pixel.js` served from our own domain (avoid third-party-cookie blockers).
- Drops a first-party cookie `_eve_v` (UUID, 90d).
- Posts `{ url, referrer, utm, ts, _eve_v }` to `/v1/visit/track`.

### Visit table
```
visits (
  id text primary key,
  tenantId text not null,
  visitorId text not null,           -- _eve_v
  companyDomain text,                 -- null until identified
  companyId text,
  ipHash text not null,               -- never store raw IP
  url text not null,
  referrer text,
  utm jsonb,
  identifiedAt timestamptz,
  createdAt timestamptz default now()
)
```

### Pipeline
1. `POST /v1/visit/track` — synchronous: write `visits` row with `companyDomain = null`.
2. Async Inngest `identify-visit`: pull batch, call provider, upsert `companies`, write back `companyDomain` + `companyId`.
3. Inngest `emit-visit-signal`: dedup per (tenantId, companyId, day), emit `signals` row, fan out to notification if hot.

### Pricing impact
- Snitcher / RB2B charge per-resolution. Pass through as a metered add-on on Elevay's bill: $X/1000 visits identified.
- Implement cost cap per tenant per month; suspend identification when exceeded.

## Tasks

1. Pick first provider (Snitcher recommended — best-in-class US coverage).
2. Sign up dev account, add credentials to `_credentials/`.
3. Schema migration: `visits` table.
4. `/v1/pixel.js` route + tests.
5. `/v1/visit/track` POST handler.
6. `lib/visitor-id/snitcher.ts` provider.
7. Inngest `identify-visit` (batched, rate-limited).
8. Inngest `emit-visit-signal`.
9. Hot notification fan-out.
10. Settings UI to pick provider + cost cap.
11. Onboarding integration (Phase 4 of MONACO-PARITY-03 should suggest installing the pixel).
12. Doc update + master plan ✅.
