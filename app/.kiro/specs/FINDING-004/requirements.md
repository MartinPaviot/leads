# FINDING-004 -- EU Region Pinning Absent Despite GDPR Claims

## Audit pillar
4.9 Security, guardrails & cost-of-failure

## Problem statement
The privacy page (`apps/web/src/app/(legal)/privacy/page.tsx`) claims "GDPR
compliant" and states "We maintain data processing agreements (DPAs) with all
sub-processors." In reality:

1. **Zero region pinning.** The Neon DATABASE_URL has no region constraint.
   Anthropic API calls go to `api.anthropic.com` (US). Resend has no EU
   routing. There is no Bedrock EU-west configuration.
2. **Email-TLD heuristic instead of geo-IP.** The exposure route
   (`apps/web/src/app/r/exposure/[id]/route.ts` line 31) explicitly
   comments: "True GDPR compliance would use a proper geo-IP provider."
3. **No DPA evidence.** The sub-processor table in the privacy page lists
   Anthropic, OpenAI, Apollo, Stripe, Google -- all marked US -- with no
   signed DPA artifacts referenced in the codebase or linked from the page.
4. **Privacy page claims Supabase EU (Frankfurt)** but code uses
   `drizzle-orm/postgres-js` pointed at a bare `DATABASE_URL` with no
   region enforcement.

## Acceptance criteria (EARS notation)

### AC-1: Neon EU region enforcement
WHEN the application connects to the database,
the `DATABASE_URL` SHALL resolve to a Neon project provisioned in a
European region (aws-eu-central-1 or aws-eu-west-1), verified by a
startup health-check that rejects non-EU connection strings.

### AC-2: Anthropic API EU routing
WHEN any server-side code calls the Anthropic API,
the SDK SHALL be configured to route through an EU endpoint
(eu.anthropic.com or Amazon Bedrock eu-west-1), ensuring no PII leaves the
EEA for LLM inference.

### AC-3: Runtime region assertion
WHILE the application is running in production,
a middleware or startup guard SHALL assert that all configured external
service URLs resolve to EU-based endpoints, and SHALL refuse to start (or
log a critical alert) if any sub-processor endpoint is non-EU.

### AC-4: Privacy page accuracy
WHEN a user visits the privacy policy page,
the sub-processor table SHALL accurately reflect the actual infrastructure
regions used, and SHALL NOT claim "EU (Frankfurt)" for services that are
not provably EU-hosted.

### AC-5: DPA registry
WHEN the privacy page references DPAs,
the codebase SHALL include a `/legal/dpas` manifest (JSON or markdown)
listing each sub-processor, DPA signing date, and document URL, so claims
are auditable.

### AC-6: Geo-IP upgrade for EU detection
WHEN the exposure redirect route detects user geography,
it SHALL use Vercel's `x-vercel-ip-country` header (already partially
used) as primary signal, with email-TLD as fallback only, and the code
comment about "True GDPR compliance" SHALL be removed once the upgrade is
in place.

## Edge cases
- User connects from EU but has a `.com` email: must still be treated as EU
  via geo-IP header.
- Vercel edge function may not forward geo headers in dev: health-check must
  degrade gracefully in `NODE_ENV=development`.
- Bedrock EU model availability: if Claude model is not available in
  eu-west-1, fall back to eu.anthropic.com direct endpoint with documented
  trade-off.

## Out of scope
- Actually signing DPAs with sub-processors (legal/business task).
- Migrating existing US-region data to EU (separate migration ticket).
- OpenAI EU routing (OpenAI does not offer EU endpoints as of April 2026;
  document this gap).
