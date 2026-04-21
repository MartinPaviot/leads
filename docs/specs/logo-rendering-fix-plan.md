# Logo Rendering Fix — Plan

**Status:** Approved by Martin (answers to all 9 OQs + ΔE addition provided 2026-04-21). Executing PR A immediately after this doc.
**Spec:** `docs/specs/logo-rendering-fix-spec.md` (approved 2026-04-21).

---

## 1. OQs locked (decisions applied)

| # | Question | Decision |
|---|---|---|
| Q1 | Single-word initials | 2 chars always (`Stripe` → `ST`, `Forerunner` → `FV`). Exception: names ≤2 chars total render the full name (`X` → `X`, `AI` → `AI`). |
| Q2 | Gradient vs flat tile | Gradient directly, no flag. Commit to brand-aligned gradient as canonical. |
| Q3 | Feature flag system | Existing: `lib/experiments.ts` (per-tenant, DB-backed via `tenants.settings.experiments`, convention `workstream.feature-name`). Add `logo.v2.cascade` to `KNOWN_FLAGS`. No env var. |
| Q4 | PostHog domain privacy | SHA-256(domain) before emitting `logo_tier_hit` / `logo_cascade_exhausted`. Raw domains only in a server-side admin log row (see T B.7). |
| Q5 | User-upload stretch | Deferred. `userUploadedLogoUrl` column added for forward-compat only. Follow-up tracked under `custom-company-logo-upload` (open a GitHub issue as part of PR C close-out — task T C.9). |
| Q6 | Spec template | `WS-1-spec.md` 12-section layout is canonical going forward. Master onboarding brief path TBD by Martin. |
| Q7 | Brand palette | Three chrome anchors `#17C3B2`, `#2C6BED`, `#FF7A3D`. Grep confirmed no extended palette token file exists; these three are the palette. |
| Q8 | Negative-cache TTL | **24h** (not 7d). Add admin invalidation endpoint `DELETE /api/admin/company-logo/negative-cache` — scoped into PR B (task T B.8). |
| Q9 | Apollo field name | Locked. Apollo raw: `logo_url` (`lib/apollo-client.ts:216`). Normalized: `logoUrl` (`lib/providers/company-enrichment/types.ts:29`). Persisted: `companies.properties.logo_url` (JSONB, written at `app/(dashboard)/accounts/page.tsx:92` and `lib/tam-stream/per-company.ts:364`). Tier 3 reads `properties.logo_url`. |
| Q10 (new) | Gradient perceptual-distance floor | Extend oracle test: **no pair of generated gradients may have ΔE < 15 in CIE2000** across a 100-name corpus. If current FNV-1a + uniform-`t` fails, apply secondary hash perturbation (xor-shift the bottom 8 bits with the high 24 before modulo) to disperse the distribution. Document achieved ΔE floor in the PR A description. |

---

## 2. Additional render sites discovered (beyond the 7 listed in spec §1.6)

Grep after spec approval surfaced two more ad-hoc logo render paths that must migrate to `<CompanyLogo>` for cascade uniformity:

| File:line | Current behavior | Migration |
|---|---|---|
| `components/ui/command-palette.tsx:113-183` (`ResultIcon` inline component) | Clearbit-only `<img src="https://logo.clearbit.com/${domain}">` with `onError` falling back to a lucide icon | Replace `ResultIcon` with `<CompanyLogo domain={...} name={...} size={20} />`. Deleted component's fallback icon becomes the `lucide` icon prop on `<CompanyLogo>`'s wrapper — no, scratch that: `CompanyLogo` already has `<GeneratedCompanyAvatar>` tier 6, so just drop the lucide fallback entirely for company results. Keep lucide icon for non-company palette results (e.g., "settings", "navigate to…"). |
| `components/entity-link.tsx:84-131` | Raw `<img src={`https://logo.clearbit.com/${domain}`}>` for `type === "account"` with `onError` fallback to a `<span>` badge | Replace with `<CompanyLogo domain={domain} name={label} size={16} />`. Delete `logoError` local state. |

Total call sites to migrate: 7 (from spec §1.6) + 2 (newly found) = **9 call sites**.

---

## 3. PR strategy

```
PR A (schema + avatar component + ΔE oracle)
  ↓
PR B (server resolver + endpoint + cache + telemetry + admin invalidation + robots.txt + fingerprint evidence doc)
  ↓
PR C1 (CompanyLogo refactor + coalescer + flag + unit tests — no call-site migrations)
  ↓
PR C2 (command-palette.tsx + entity-link.tsx migrations + E2E + 7-site regression grid)
```

Stacked, same rebase-on-merge pattern as WS-0/WS-1. Each PR ends with: typecheck clean, vitest clean, `gh pr create --base main`, squash-merge, rebase next branch.

**Sequencing rationale:**
- **PR A is independent.** The generated avatar is a pure presentational component; the schema migration is additive (4 nullable columns). Both can merge without touching live behavior.
- **PR B stacks on A** because the resolver persists to the new columns and the telemetry events need the `EventCatalog` additions. But B's code is dormant — no UI calls the endpoint yet.
- **PR C1 activates the pipeline** by flipping `<CompanyLogo>` to consume the resolver behind `isFlagEnabled("logo.v2.cascade")`. The 7 existing `CompanyLogo` callers upgrade transparently — no file touches.
- **PR C2 migrates the 2 ad-hoc render sites** (`command-palette.tsx`, `entity-link.tsx`) and ships the E2E + regression evidence.

**PR C split rationale (Martin's addition #1):** one combined PR estimates at ~460 LoC (refactor ~100 + coalescer ~80 + FlagsProvider contingency ~50 + 2 non-mechanical migrations ~60 + E2E ~120 + unit tests ~50). Splitting into C1/C2 keeps each PR in the 200-250 LoC band and under the 400-LoC review ceiling (onboarding brief §9.2). The 7 pre-existing `CompanyLogo` callers genuinely require zero migration — only the 2 ad-hoc sites need real work, which is why they land in their own PR with the E2E evidence attached.

---

## 4. Task list per PR

### PR A — Schema + generated avatar + ΔE oracle
**Branch:** `feat/logo-fix-pr-a-avatar-and-schema`. **Base:** `main`.

- **T A.1** — Extend `db/schema.ts` `companies` table: `resolvedLogoUrl text`, `resolvedLogoTier integer`, `logoResolvedAt timestamptz`, `userUploadedLogoUrl text`. All nullable.
- **T A.2** — Generate Drizzle migration via `npm run db:generate`. Verify SQL is additive only. Commit under `app/apps/web/drizzle/`.
- **T A.3** — Add index `companies_logo_resolved_at_idx ON companies (logo_resolved_at)`.
- **T A.4** — Create `lib/logo/hash.ts` — FNV-1a + xor-shift perturbation (secondary dispersion per Q10). Exported utilities: `fnv1a(str): number`, `perturbedHash(str): number`.
- **T A.5** — Create `lib/logo/gradient.ts` — `gradientFor(companyName): { stop1: string; stop2: string; anchor: 0|1|2 }`. Implements the brand-anchor ring interpolation from spec §6.3. Pure function, no React.
- **T A.6** — Create `lib/logo/initials.ts` — `initialsFor(companyName): string`. Implements stopword filter + 2-char rule + ≤2-char-full-name exception (Q1). Exported corpora: `STOPWORDS`, `SUFFIX_WORDS`.
- **T A.7** — Create `lib/logo/__tests__/gradient-perceptual.test.ts` — the **ΔE<15 oracle**. Hand-roll CIE2000 ΔE computation (~40 LoC, no new dep). Generate 100 synthetic company names (mix of real Fortune-500 + random). Compute gradient stop1 for each, pairwise ΔE matrix, assert `min(ΔE) >= 15`. If the test fails on first run, tune the xor-shift constants in `hash.ts` until it passes. Document achieved `min(ΔE)` in a test comment + PR description.
- **T A.8** — Create `lib/logo/__tests__/initials.test.ts` — covers the Q1 rules including `Stripe`→`ST`, `The Hershey Company`→`HC` (stopword `The`, suffix `Company` skipped), `X`→`X`, `AI`→`AI`, `Forerunner Ventures`→`FV`, whitespace-only → `?`, non-ASCII preserved.
- **T A.9** — Create `components/ui/generated-company-avatar.tsx` — consumes `gradient.ts` + `initials.ts`. Pure SVG (not CSS gradient — SVG guarantees pixel-perfect rendering and inline export for email later). Props: `{ companyName, size?, className? }`.
- **T A.10** — Create `components/ui/__tests__/generated-company-avatar.test.tsx` — snapshot on 10 known inputs, asserts deterministic output across re-renders, WCAG AA contrast assertion (white on stop1 AND on stop2 both ≥4.5:1).
- **T A.11** — Commit + open PR A. PR description must include: achieved ΔE floor from T A.7, screenshot grid of 20 sample avatars, migration SQL diff.

### PR B — Resolver + endpoint + cache + telemetry
**Branch:** `feat/logo-fix-pr-b-resolver` (stacked on A).

- **T B.1** — Create `lib/logo/cache.ts` — Upstash REST wrapper. Mirrors `lib/rate-limit-store.ts`: env-gated (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`), fail-open. Exports `getCached(domain)`, `setCached(domain, value, ttlSec)`, `setNegative(domain, ttlSec)`, `isNegative(domain)`, `invalidateNegative(domain)`. TTLs: positive 30 days, negative **24h** (Q8).
- **T B.2** — Create `lib/logo/google-globe-fingerprint.ts`. Constant `GLOBE_CONTENT_LENGTH_RANGES: Array<[min, max]>`. **Side-quest** (T B.2a): before finalizing, curl `t2.gstatic.com/faviconV2?...` for 10 domains known to have no favicon (e.g., `example-nonexistent-brand-x.com`, a newly-registered test domain, etc.) + 10 known-good domains (stripe.com, google.com, github.com). Record `content-length` header for each. Store ranges in the constant with a comment citing the measurement date + methodology. If ranges overlap between globe-default and real-favicon responses, fall back to MD5 of response body (cheaper than perceptual hash, deterministic).
- **T B.2b (Martin's addition #2)** — Create `docs/specs/logo-rendering-fix-fingerprint-evidence.md`. Document all 20 curl samples with: domain, HTTP status, `content-length` header, `Content-Type` header, MD5 of body, response-size bucket. Include a histogram (ASCII or mermaid) of the content-length distribution separating no-favicon vs known-good. If we escalate from content-length to MD5-of-body, the escalation decision must be traceable to the data in this file — capture the reasoning as a mini-ADR section at the bottom. PR B must not merge without this file present and linked from the PR description.
- **T B.3** — Create `lib/logo/resolver.ts`. Implement `resolveCompanyLogo(domain, companyName, existingLogoUrl?)` and `resolveCompanyLogoBatch(requests)`. Tier order per spec §2.1. Each tier has its own timeout: tier 2 (Clearbit) 2s, tier 3 (Apollo JSONB read) instant, tier 4 (Google V2) 2s, tier 5 (homepage scrape) 3s. All tiers wrapped in try/catch advancing the cascade silently. Writes on success: Upstash positive + DB columns from T A.1. Writes on cascade-exhaust: Upstash negative + `resolvedLogoTier: 6`.
- **T B.4** — Tier 5 HTML parser. Use existing `htmlparser2` if present in deps; grep confirms during exec. If not, hand-roll 30-line regex parser for `<link rel="apple-touch-icon" href="...">`, `<meta property="og:image" content="...">`, `<link rel="icon" href="...">`. User-Agent header: `Elevay-Logo-Resolver/1.0 (+https://elevay.com/bot)`.
- **T B.4a (Martin's addition #3)** — **robots.txt respect is mandatory, not optional.** Before fetching `/` on a target domain, Tier 5 issues a `GET /robots.txt` (2s timeout, cached in Upstash under `logo:robots:{domain}` with 24h TTL). Parse the response with the existing Node `RobotsParser` if present, else hand-roll per RFC 9309 (Allow/Disallow rules on path `/`, User-Agent `Elevay-Logo-Resolver`). If `/` is disallowed for our UA, Tier 5 is skipped for that domain (cascade proceeds straight to Tier 6). Emit `logo_tier_hit` with `tier: 5, skipped: "robots-disallow"` so we can quantify the skip rate. Robots-fetch errors (404, timeout, 5xx) treated as "no restrictions" per spec defaults. ~15 LoC per plan §5.6 estimate.
- **T B.5** — Create `app/api/company-logo/resolve-batch/route.ts`. `POST` handler, session-gated via existing `getSession()`, rate-limited via existing `hit()` helper (120 req/min/tenant). Batch size cap 50. Concurrency cap 8 inside the resolver (Promise.all over chunks of 8).
- **T B.6** — Extend `lib/analytics.ts` `EventCatalog` with `logo_tier_hit` and `logo_cascade_exhausted`. Domain field sent as `domainHashed: sha256Hex(domain)` (Q4). Emission is server-side only (from the resolver, never from the endpoint handler — that way batch resolution emits one event per tier hit, not one per batch).
- **T B.7** — Create `app/api/admin/company-logo/resolutions/route.ts` — admin-only `GET` endpoint returning last N resolutions with raw domains for debugging (Q4 "admin-only server log"). Gated by the same admin check used in existing `/api/admin/*` routes.
- **T B.8** — Create `app/api/admin/company-logo/negative-cache/route.ts` — admin-only `DELETE ?domain=…` endpoint to clear a negative-cache entry (Q8 escape hatch).
- **T B.9** — Create `lib/logo/__tests__/resolver.test.ts` — each tier mocked via `globalThis.fetch`, asserting cascade advancement, globe-fingerprint rejection, negative-cache skip, stale-positive-with-background-refresh, batch concurrency cap.
- **T B.10** — Create `lib/logo/__tests__/cache.test.ts` — TTL values, key naming, MGET batching, fail-open on missing env vars.
- **T B.11** — Commit + open PR B (base: PR A branch).

### PR C1 — CompanyLogo refactor + coalescer + flag + unit tests
**Branch:** `feat/logo-fix-pr-c1-refactor` (stacked on B). No call-site migrations in this PR.

- **T C.1** — Extend `lib/experiments.ts`: add `"logo.v2.cascade"` to `KNOWN_FLAGS` tuple. No other changes to that file.
- **T C.2** — Refactor `components/ui/company-logo.tsx`. Remove inline initials block + FNV-1a + palette (tasks A.4/A.5/A.6 supersede). Add `logoUrl?: string | null` prop. New behavior:
  - Paint `<GeneratedCompanyAvatar>` immediately as initial state.
  - `useEffect` pushes `{ domain, companyName, existingLogoUrl }` into module-level request coalescer (`lib/logo/client-coalescer.ts` — new file in T C.3).
  - On coalescer resolve: if `tier <= 5`, swap to `<img src={resolvedUrl}>` (keeps generated avatar layer beneath for load-time continuity). If `tier === 6`, stay on generated avatar.
  - Wrap the whole thing behind `isFlagEnabled(tenantId, "logo.v2.cascade")` — when false, keep the current Clearbit→Google-V1→initials path (renamed to `CompanyLogoV1`, kept as a named export for 1 release cycle then deleted).
  - Flag resolution: since `CompanyLogo` is client-side and `isFlagEnabled` is server-only, pass the flag value down via a root layout `<FlagsProvider>` (grep for existing provider, or add one in this task — expect it already exists given `lib/experiments.ts` §4.4).
- **T C.3** — Create `lib/logo/client-coalescer.ts`. Module-level queue + 50ms debounce. Flushes batches of up to 50 to `/api/company-logo/resolve-batch`. Returns per-domain promises to callers. Handles unmount cleanup (cancels pending resolves for domains whose callers unmounted).
- **T C1.4** — Unit tests for `CompanyLogo` refactor: renders `<GeneratedCompanyAvatar>` immediately on mount (no spinner), swaps to resolved URL after mocked coalescer flush, handles unmount mid-flight without `setState`-on-unmounted warning. Fallback to `CompanyLogoV1` when `isFlagEnabled(...)` returns false.
- **T C1.5** — Unit tests for coalescer: 50ms debounce flushes one batch, batch size capped at 50 (overflow flushes in separate batch), per-domain promise fan-out, unmount cancellation.
- **T C1.6** — Commit + open PR C1 (base: PR B branch). PR description: LOC breakdown by file, flag default (`false`), note that no call sites are migrated in this PR.

### PR C2 — Call-site migrations + E2E + regression evidence
**Branch:** `feat/logo-fix-pr-c2-migrations` (stacked on C1).

- **T C2.1** — Migrate `components/ui/command-palette.tsx:113-183`: replace `ResultIcon` component with `<CompanyLogo>` for company results. Keep lucide icon rendering for non-company palette entries. Delete now-dead Clearbit URL construction at line 183.
- **T C2.2** — Migrate `components/entity-link.tsx:84-131`: replace raw `<img>` + `logoError` state with `<CompanyLogo>`. Delete `logoError` local state.
- **T C2.3** — Verify the other 7 call sites from spec §1.6 (accounts, opportunities, contacts, contacts-merge x2, home x2, onboarding-wizard x2) require no prop changes. Expected: no code touch — they already pass `{domain, name, size}`. Capture a screenshot per site with flag on, attach to PR description as the "7-site regression grid".
- **T C2.4** — Delete the ad-hoc `properties.logo_url = row.company.logoUrl` line at `app/(dashboard)/accounts/page.tsx:92` now that the resolver owns persistence via `resolvedLogoUrl`. Keep read-compat in the resolver's Tier 3 (already specified in T B.3) for data seeded before this PR.
- **T C2.5** — Create `tests/e2e/logo-cascade.spec.ts`. Playwright test:
  1. Log in as seed tenant with flag `logo.v2.cascade: true`.
  2. Seed 30 companies: 10 with known-good Clearbit logos, 10 with Clearbit-404-but-Google-V2-favicon, 10 with neither (cold start).
  3. Navigate to `/accounts`.
  4. Wait for all 30 rows.
  5. Assert zero `<img>` elements have `src` containing `www.google.com/s2/favicons` (V1 URL) — proves the V1 path is gone.
  6. Assert zero `<img>` elements resolve to Google's default-globe byte signature (cross-reference with T B.2's fingerprint).
  7. Assert all 10 cold-start rows render an SVG matching `<GeneratedCompanyAvatar>`'s output shape.
  8. Measure CLS via `performance.getEntriesByType("layout-shift")`, assert near-zero.
- **T C2.6** — Open GitHub issue `custom-company-logo-upload` with the stretch spec from §1.4 copy-pasted as the body. Link the issue from the PR C2 description.
- **T C2.7** — Commit + open PR C2 (base: PR C1 branch). PR description must include: the flag rollout plan (staging → 10% → 100% per spec §9.2), a before/after screenshot of the Accounts list, and a tier-distribution table from staging soak.

---

## 5. Dependencies and sequencing concerns

1. **ΔE oracle in T A.7 may iterate.** If the first FNV-1a + xor-shift pass doesn't hit ΔE ≥15, we tune the perturbation constants until it does. Budget 2-3 hours contingency inside PR A. If after that we still can't hit the floor, fall back to a curated 24-colour-pair palette table (like the current 8-swatch design, but with pre-computed perceptually-distant gradient pairs) — that's a design deviation worth a mini-ADR and a quick Martin sign-off.
2. **Google globe fingerprint measurement in T B.2a is empirical.** If Google's response distribution is bimodal with clean separation on `content-length`, we're done in 20 minutes. If it's overlapping, we need MD5-of-body matching (still cheap but adds a round-trip for rejection — acceptable). Worst case: perceptual hash (new dep). Don't pre-commit to the approach until data is in hand.
3. **Flag propagation to client component (T C.2).** If no `FlagsProvider` exists, we add one in this PR — that's boilerplate, not risk, but callouts out that T C.2 grows ~50 LoC.
4. **Schema migration before resolver writes (T A.1 → T B.3).** PR A must land and be deployed (migration run) before PR B's resolver code goes live, else writes to `resolved_logo_url` fail. With stacked PRs and the "A merges to main before B is merged" pattern, this is automatic. Belt-and-suspenders: T B.3 wraps DB writes in try/catch so a missing column doesn't crash the resolver — just bypasses caching for the request.
5. **Upstash availability in CI.** Tests in T B.9/B.10 must not require real Upstash. Follow the `lib/rate-limit-store.ts` precedent: mock via `globalThis.fetch`, assert request bodies.
6. **Tier 5 homepage scrape + robots.txt.** Spec marks robots.txt check as "optional in v1". Plan keeps it optional. If legal pushback surfaces during PR B review, we add it — 15 LoC.
7. **`CompanyLogoV1` deprecation window.** PR C keeps the V1 path for 1 release cycle. Concrete cleanup: add a `// TODO(logo-v1-cleanup, delete by 2026-05-21)` marker on the V1 component. One-month window is comfortable for flag ramp.
8. **`properties.logo_url` read-compat vs write-migration.** T C.7 stops writing to the JSONB field, but existing rows still have it. T B.3 Tier 3 reads it as a seed. Net: no data migration needed; JSONB entries age out naturally as the resolver re-runs.

---

## 6. Risk register

- **ΔE floor unreachable with brand-anchor constraint.** Mitigation: curated-palette fallback (see §5.1). Probability: low (three hue anchors = 120° spacing on the ring, ΔE 15 is achievable within arcs).
- **Google silently changes default-globe bytes.** Mitigation: fingerprint constant + fail-open — worst case reverts to current UX for affected domains until we update the constant. Monitoring via `logo_cascade_exhausted` event volume spike.
- **Clearbit aggressive rate-limiting.** Mitigation: 24h negative cache + Upstash batch reads + feature flag to bypass Clearbit entirely if we see 429s.
- **Thundering herd on flag flip.** 10% ramp → 48h soak → 100% per spec §9.2. Upstash handles 10k+ req/s; 50 logos × 100 concurrent users = 5k resolves at flip-over — trivial.
- **Flag misconfiguration on prod tenant.** Mitigation: unknown flags default to `false` per `lib/experiments.ts:38` — fail-safe.
- **Negative cache blacklists a transiently-failing Clearbit outage.** Mitigation: 24h TTL + admin invalidation endpoint (T B.8).
- **E2E flakiness from external fetches.** Mitigation: PR C's Playwright test mocks the `/api/company-logo/resolve-batch` endpoint entirely — no real Clearbit/Google calls during E2E.

---

## 7. Exit condition (restated)
Spec §11 holds. All 10 checkboxes green. Retro at `docs/specs/logo-rendering-fix-retro.md` after PR C merge + 72-hour flag-100% soak. The retro must include: final ΔE floor, tier distribution in the wild (% of logos served by each tier), p50/p95 resolver latency, count of true cold-start companies in the DB.

---

## 8. First action
Execute **PR A** now. Branch: `feat/logo-fix-pr-a-avatar-and-schema`. Base: `main`. First task: T A.1 (schema extension).

Before branching, one final sanity check: confirm no one is mid-flight on a branch that touches `db/schema.ts` or `components/ui/company-logo.tsx`. Grep open PRs for conflicts; proceed if clean.
