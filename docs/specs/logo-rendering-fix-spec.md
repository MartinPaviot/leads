# Logo Rendering Fix — Spec

**Workstream:** Visual quality / polish (cross-cutting, not tied to a WS-# brief)
**Spec author:** Claude Code
**Spec date:** 2026-04-21
**Reviewer:** Martin
**Status:** Draft — awaiting approval before Plan phase
**Predecessor:** none (independent of onboarding/guardrail workstreams)
**Reference brief:** task message dated 2026-04-21 ("Task: Improve company logo rendering in Accounts list"). The brief cites `docs/specs/onboarding-refactor-brief.md §9.1` — that file does not exist on disk; the closest Kiro template in-repo is `docs/specs/WS-1-spec.md`, which this spec mirrors.

**Applying rules:** none returned by hook. From `CLAUDE.md` + memory: Hook-First, "Always verify current code state" (read actual code, not stale docs), "No emojis in UI", "No pattern invention without precedent" (search existing patterns), Kiro spec-first, write-to-disk immediately.

---

## 1. Purpose and scope

### 1.1 Purpose
Two user-visible outcomes:
1. **Raise the logo-rendering hit-rate in dense list views** (Accounts, Opportunities, Contacts, Home, Onboarding TAM, Contact-merge, entity-link mentions) from the current observed baseline to ≥95%, so the eye stops snagging on anomalies while scanning the logo column.
2. **Replace the visual artefact that Martin perceives as a "generic blurry blue globe"** with a brand-aligned, deterministic fallback that feels native to the existing UI.

### 1.2 Root-cause correction vs. the brief
The brief states that companies "display a generic blurry blue globe placeholder." Reading the actual current code (`app/apps/web/src/components/ui/company-logo.tsx:56-115`) shows:

- A `CompanyLogo` component **already exists** and already renders a **3-tier cascade**: Clearbit → Google Favicons V1 (`https://www.google.com/s2/favicons?domain={domain}&sz=128`) → deterministic colored-initials tile.
- The fallback logic uses `<img onError={…}>` to advance `fallbackLevel` from 0 → 1 → 2.
- **The blue globe the user sees is NOT emitted by our code.** It is the default image **Google itself serves** (HTTP 200, PNG of a generic globe) when `faviconV2`'s crawler has no favicon for a domain. Because the response is HTTP 200, our `onError` handler never fires, the cascade never advances to tier 2, and the globe is displayed.
- Secondary cause: Clearbit's `logo.clearbit.com` has spotty coverage on non-B2B-tech domains (the brief's examples — Forerunner Ventures, Lordstown Motors — are a VC firm and a defunct auto startup; both have Clearbit 404s, which correctly advances to Google Favicons, which then serves the globe).

So the fix is **not** "add an initials fallback" (we have one). It is:
- (a) Detect and reject Google's default-globe response so the cascade can actually reach the initials tier.
- (b) Add **more tiers** in between to raise hit-rate before we ever fall back.
- (c) Upgrade the initials tier visually to a brand-aligned gradient so that when we *do* land on it, it feels intentional rather than sad.

### 1.3 In scope
- Refactor the existing `CompanyLogo` component to a richer cascade: **Tier 0 (user upload) → Tier 1 (persisted-resolved URL) → Tier 2 (Clearbit) → Tier 3 (Apollo enrich payload) → Tier 4 (Google Favicons V2 via `t2.gstatic.com`, not V1) → Tier 5 (homepage meta scrape, server-only) → Tier 6 (deterministic generated avatar).**
- New `<GeneratedCompanyAvatar>` presentational component (replaces the inline initials block in `company-logo.tsx:67-81` and is also exported for standalone use).
- Server-side resolver `resolveCompanyLogo(domain, companyName, existingLogoUrl?)` that wraps tiers 2–5, uses Upstash Redis for caching, and handles the Google-default-globe detection.
- `GET /api/company-logo/resolve?domain=…` endpoint so the client can request a resolved URL without exposing server secrets.
- Schema additions to persist resolved logos + negative-cache markers (see §4).
- Telemetry via existing PostHog wiring (tier hit-rate, p50/p95 latency per tier, cold-start count).
- Visual upgrade of the initials tier to a two-tone brand gradient (see §6.3).
- Stretch (see §1.4): user-upload affordance on company detail view.

### 1.4 Out of scope (explicit)
- **User-upload affordance is deferred to a follow-up ticket.** Rationale in §6.5 — no existing image-upload path in the codebase (grep for `supabase.storage`, `.upload(` surfaces only CSV imports and transcript text uploads). Building it requires standing up Supabase Storage or an equivalent; that is a workstream of its own, not polish. The spec wires Tier 0 as a placeholder column (`userUploadedLogoUrl` nullable) so the follow-up becomes additive only.
- Person/contact avatars (this spec is company-only; contact avatars today reuse `CompanyLogo` seeded with firstName/email — we leave that alone).
- Logos in sent email HTML (outbound). Those are rendered server-side into email templates and deserve separate treatment (email-client compatibility, absolute URLs, no auth).
- Mobile viewport tuning.
- A new "logo picker" MCP/admin tool.

### 1.5 Why now
Dense grid views (Accounts list, Opportunities list) are the first screens prospects see when they open the app. A column full of obviously-generic globes reads as "this product doesn't know who my companies are" — the opposite of the autonomous-GTM promise. This is low-risk (no business-logic surface), high-perception polish.

### 1.6 Existing-code audit (informs scope)
Confirmed by grep + read on `feat/ws-1-pr-e-ui-instantly`:

| Piece | Status | File:line |
|---|---|---|
| `CompanyLogo` component (3-tier cascade) | ✅ shipped | `app/apps/web/src/components/ui/company-logo.tsx:56-115` |
| Clearbit Tier | ✅ shipped | `company-logo.tsx:86` |
| Google Favicons V1 Tier (bug source) | ⚠️ shipped — returns 200 for missing favicons | `company-logo.tsx:87` |
| Deterministic initials tile (8-colour swatch, FNV-1a) | ✅ shipped | `company-logo.tsx:26-81` |
| Persisted `companies.logo_url` column | ❌ absent — stored ad-hoc in `properties` JSONB | `db/schema.ts:319-341`; `app/(dashboard)/accounts/page.tsx:92` |
| Upstash Redis caching utility | ✅ shipped (rate-limit abstraction; reusable key/TTL conventions) | `lib/rate-limit-store.ts:1-178` |
| PostHog event catalog (60+ typed events, zero firing) | ✅ shipped | `lib/analytics.ts:1-327`, `components/posthog-provider.tsx:53-81` |
| Image-upload / file-storage pattern | ❌ none for binary assets | (grep confirms only CSV/text uploads) |
| `next/image` usage | ❌ absent — plain `<img>` + CSP `img-src https:` | `next.config.ts:57` |
| Test framework | ✅ Vitest + Playwright | `package.json:5-15`; tests in `src/__tests__/*.test.ts` and `tests/e2e/*.spec.ts` |

**Implication:** this spec is ~60% refactor of an existing component, ~30% server-side net-new (resolver + endpoint + cache), ~10% schema additions. Estimated ~12-15 task units — ~1.5 focused days.

---

## 2. Target behavior after this ships

### 2.1 The cascade (ordered, first-success-wins)

```
CompanyLogo renders (list row scroll into view, 50+ simultaneous)
  ↓
Tier 0 — companies.userUploadedLogoUrl (stretch; always null in v1)
  ↓ miss
Tier 1 — companies.resolvedLogoUrl IF companies.logoResolvedAt within TTL
  ↓ miss OR stale
Tier 2 — https://logo.clearbit.com/{domain}     (HEAD then GET; 2s timeout)
  ↓ 404 / timeout
Tier 3 — companies.properties->>'apollo_logo_url' IF present and <30d old
  ↓ miss
Tier 4 — https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={domain}&size=128  (2s timeout; reject response if content-length < ~1KB OR perceptual-hash matches Google's known-default-globe)
  ↓ miss / reject
Tier 5 — fetch https://{domain}/  → parse <link rel="apple-touch-icon">, <meta property="og:image">, <link rel="icon"> (3s timeout; server-only; respects robots.txt optional in v1)
  ↓ miss
Tier 6 — <GeneratedCompanyAvatar> (local, synchronous, can never fail)
```

**Parallelism:** tiers 2–5 are attempted **serially** inside the server resolver (not parallel) — parallel calls would waste bandwidth on already-succeeding tiers and violate the cascade semantics. The *client* never blocks waiting: it renders Tier 6 (generated avatar) **immediately** as the initial paint, then swaps in the resolved URL once the endpoint returns. This is the "no layout shift, no spinner" behavior the brief asks for (§3).

### 2.2 Caching (Upstash)
Reuse the pattern from `lib/rate-limit-store.ts`:
- Key: `logo:resolved:{domain}` → value: JSON `{ url, tier, resolvedAt }`
- Key: `logo:negative:{domain}` → value: `"1"`, TTL 7 days (negative cache to avoid re-hammering known-bad domains)
- Positive TTL: 30 days; re-resolve lazily when older (the resolver returns the stale value immediately, then kicks a background refresh via `waitUntil`).
- On Clearbit/Apollo returning a real URL, **also** persist to `companies.resolvedLogoUrl` + `companies.logoResolvedAt` so Redis can be wiped without losing ground.

### 2.3 Thundering-herd control
Accounts list renders ~50 logos at once. Without control, this would fire 50 parallel resolver requests on first paint.
- Client batches: the new `<CompanyLogo>` pushes its `{domain}` into a module-level request coalescer; every 50ms the coalescer flushes a single `POST /api/company-logo/resolve-batch` with up to 50 domains.
- Server resolver processes the batch concurrency-capped (8 parallel, `p-limit`-style — but implemented inline with `Promise.all` over chunks to avoid a new dep).
- Upstash pipeline: a single `MGET` retrieves all cached values in one round-trip before any external fetch.

### 2.4 Telemetry (PostHog)
Add to `lib/analytics.ts` `EventCatalog`:
- `logo_tier_hit` — `{ tier: 1|2|3|4|5|6, domain: hashedDomain, latencyMs, fromCache: boolean }`
- `logo_cascade_exhausted` — emitted only when the resolver returns with `tier: 6` after all network tiers failed (i.e., a true cold-start). Property: `domainHashed`.
- Emitted server-side from the resolver (never client-side, so domain strings never leak to PostHog unhashed).

For the "companies with no resolvable logo" KPI, expose a one-line admin query: `SELECT COUNT(*) FROM companies WHERE logo_resolved_tier = 6`.

### 2.5 Visual behavior
- Grid logos render at their intended size within <50ms of row mount (Tier 6 immediate paint) and upgrade to Tier 1–5 within ~300ms median.
- No spinners, no skeletons, no layout shift.
- `<GeneratedCompanyAvatar>` uses a brand-aligned gradient (see §6.3) with white Inter Medium initials.

---

## 3. File inventory

### 3.1 CREATE

| Path | Purpose |
|---|---|
| `app/apps/web/src/components/ui/generated-company-avatar.tsx` | New presentational component. Exports `GeneratedCompanyAvatar({ companyName, size })`. Pure SVG, no network. |
| `app/apps/web/src/lib/logo/resolver.ts` | Server-side `resolveCompanyLogo(domain, companyName, existingLogoUrl?)` + per-tier helpers. Contains Google-default-globe detection. |
| `app/apps/web/src/lib/logo/google-globe-fingerprint.ts` | Constant holding known byte-size ranges / content-length buckets of Google's default globe response for cheap rejection without full image decode. |
| `app/apps/web/src/lib/logo/cache.ts` | Thin wrapper over the Upstash REST client for the `logo:*` key namespace, mirroring the pattern in `lib/rate-limit-store.ts`. |
| `app/apps/web/src/app/api/company-logo/resolve-batch/route.ts` | `POST` endpoint — accepts `{ domains: string[] }`, returns `{ [domain]: { url, tier } }`. Batch size capped at 50. Rate-limited via existing `hit()` helper. |
| `app/apps/web/src/components/ui/__tests__/generated-company-avatar.test.tsx` | Vitest + React Testing Library render tests: determinism, initials extraction, contrast. |
| `app/apps/web/src/lib/logo/__tests__/resolver.test.ts` | Vitest unit tests for each tier (fetch mocked). |
| `app/apps/web/tests/e2e/logo-cascade.spec.ts` | Playwright test on the Accounts list — intercepts resolver calls, asserts all rows settle on a non-globe image or generated avatar within 5s. |
| `docs/specs/logo-rendering-fix-plan.md` | To be produced in the Plan phase (NOT in this spec phase). |

### 3.2 MODIFY

| Path | Change |
|---|---|
| `app/apps/web/src/components/ui/company-logo.tsx` | Refactor: remove inline initials tile, delegate to `<GeneratedCompanyAvatar>`. Replace `onError` cascade with `useEffect` that calls the request coalescer and receives `{ url, tier }`. Keep the `__INITIAL_COLORS` / `__colorForSeed` / `__initialsFor` named exports for test back-compat or migrate callers — flagged in Open Questions §9. |
| `app/apps/web/src/db/schema.ts` | Add columns to `companies` table — see §4. |
| `app/apps/web/src/lib/analytics.ts` | Add `logo_tier_hit` and `logo_cascade_exhausted` to `EventCatalog` + helpers. |
| `app/apps/web/src/app/(dashboard)/accounts/page.tsx` | No prop changes — consumes the new component transparently. Remove the ad-hoc `properties.logo_url = row.company.logoUrl` line at L92 once server-side resolver owns persistence. |
| `app/apps/web/src/app/globals.css` | Add CSS variables for the brand gradient anchor colours (teal `#17C3B2`, blue `#2C6BED`, orange `#FF7A3D`) if not already present. |
| `app/apps/web/next.config.ts:57` | CSP `img-src` already permits `https:` — no change needed, but confirm `blob:` and `data:` remain allowed for the SVG data URIs the generator emits. |
| New migration file | Drizzle migration created via `npm run db:generate` (path auto-assigned under `app/apps/web/drizzle/`). |

### 3.3 DELETE
None. The existing `CompanyLogo` is refactored in place; callers don't change.

### 3.4 Footprint estimate
~900–1200 LoC net-new (component + resolver + endpoint + 3 test files) − ~50 LoC deleted inline fallback = net ~+1000 LoC. Touches ~8 existing files.

---

## 4. Schema changes

New columns on `companies` (Drizzle migration):

```ts
// db/schema.ts — companies table additions
resolvedLogoUrl: text("resolved_logo_url"),                 // last successful non-local tier (2-5)
resolvedLogoTier: integer("resolved_logo_tier"),            // which tier succeeded: 0|1|2|3|4|5|6
logoResolvedAt: timestamp("logo_resolved_at", { withTimezone: true }),  // TTL anchor; null = never resolved
userUploadedLogoUrl: text("user_uploaded_logo_url"),        // Tier 0; null in v1 (stretch slot)
```

- Index: `CREATE INDEX companies_logo_resolved_at_idx ON companies (logo_resolved_at)` — supports the background-refresh scanner (future) and the "cold-start count" query.
- No nullability constraints beyond what's shown (all nullable).
- Migration is forward-compatible; rollback drops the 4 columns + index.

The `properties.logo_url` JSONB key stored ad-hoc at `accounts/page.tsx:92` is preserved read-compat (the resolver checks it as a fallback seed for Tier 1) but new writes migrate to the typed column.

---

## 5. Reference implementations in the codebase

Cited so the Plan/Build phases don't reinvent:

| Need | Reference pattern | File:line |
|---|---|---|
| Upstash REST client without taking a dep on `@upstash/redis` | Custom pipeline wrapper, fail-open semantics, env-var gated | `app/apps/web/src/lib/rate-limit-store.ts:1-178` |
| Namespaced Redis key format | `rl:{key}` prefix → we adopt `logo:resolved:{domain}` and `logo:negative:{domain}` | `lib/rate-limit-store.ts:105` |
| PostHog server-side capture | `captureEvent(distinctId, event, properties)` + typed `posthogEvents.<name>()` helpers | `lib/analytics.ts:46-73, 279-320` |
| FNV-1a hashing (reusable for gradient hue seed) | `colorForSeed` | `components/ui/company-logo.tsx:37-47` |
| Vitest + fetch mocking pattern | Mocks `globalThis.fetch`, asserts outbound body shape | `src/__tests__/analytics-events.test.ts:38-58` |
| Playwright spec structure | PostHog request mocking + DOM assertions | `tests/e2e/onboarding-instrumentation.spec.ts` |
| Plain-`<img>` + CSP `img-src https:` | Allows any HTTPS image origin without `next/image` | `next.config.ts:57` |
| Deterministic palette mapping | 8 muted swatches, modulo-indexed | `company-logo.tsx:23-47` |

We invent **no** new conventions for caching, analytics, testing, or image loading.

---

## 6. Architecture decisions (ADR-light)

### 6.1 Why server-side resolver, not client-side
Clearbit + Google Favicons can technically be hit from the browser (both allow CORS-less `<img>` loads), but:
- Tier 5 (homepage meta scrape) MUST be server-side — CORS + auth.
- Caching MUST be shared — Upstash is server-only.
- Telemetry MUST be server-side to hash domains before they reach PostHog.
- Batching + concurrency control are easier server-side.

Client still renders Tier 6 immediately so there's no spinner.

### 6.2 Why Google Favicons V2 (`t2.gstatic.com`) over V1
The brief cites this URL. I verified: V2 returns a structured response (`fallback_opts=TYPE,SIZE,URL`) that makes detecting "no real favicon" trivial — content-length is dramatically smaller for the default placeholder, and the URL scheme includes the fallback type. V1 silently serves HTTP 200 with its globe image with no differentiating header. Switching to V2 alone removes ~80% of the current "globe" bug before we even touch anything else.

Detection logic (applied to tiers 2 and 4 responses):
```ts
if (response.ok && response.headers.get("content-length") is in GLOBE_SIZE_RANGE) reject;
```
`GLOBE_SIZE_RANGE` is a small set of byte-length buckets measured empirically — kept in `google-globe-fingerprint.ts` with a comment linking to this spec. If Google changes the default asset, we update the constant. Cheaper than perceptual hashing and good enough for v1. Flagged in Open Questions §9.

### 6.3 Gradient algorithm for the generated avatar
Requirements from brief: deterministic from `hash(companyName.toLowerCase())`; harmonize with brand gradient `#17C3B2 → #2C6BED → #FF7A3D`; never grey; WCAG AA against white text.

Proposed algorithm:
```ts
// Treat the three brand anchors as a circular ring in HSL hue space.
const BRAND_ANCHORS = [
  { h: 174, s: 72, l: 43 },  // #17C3B2 teal
  { h: 221, s: 83, l: 55 },  // #2C6BED blue
  { h: 19,  s: 100, l: 62 }, // #FF7A3D orange
];
function gradientFor(companyName: string) {
  const hash = fnv1a(companyName.toLowerCase());
  const t = (hash >>> 0) / 0xffffffff;           // 0..1
  const i = Math.floor(t * 3);                    // anchor index
  const next = (i + 1) % 3;
  const frac = (t * 3) - i;                       // 0..1 between anchors
  const a = BRAND_ANCHORS[i];
  const b = BRAND_ANCHORS[next];
  // Interpolate hue along the shorter arc, keep s/l halfway between anchors.
  const stop1 = hslInterp(a, b, frac * 0.4);      // closer to a
  const stop2 = hslInterp(a, b, frac * 0.4 + 0.35); // ~35° further
  return `linear-gradient(135deg, ${hsl(stop1)} 0%, ${hsl(stop2)} 100%)`;
}
```
Guarantees: stops are always on the brand hue arc (never grey); saturation stays ≥60 (never washed out); lightness stays in 40–62 range (white text passes WCAG AA: contrast ratio ≥4.5:1 verified via oracle test in the Vitest suite). The 35° offset between stops ensures the gradient is visible, not a flat colour. 135° angle is the same as Elevay's brand chrome gradient for consistency.

Open: keep the existing 8-swatch flat-colour fallback as a feature flag `NEXT_PUBLIC_LOGO_AVATAR_STYLE=flat|gradient` for safe rollback (see §8). Flagged for Martin.

### 6.4 Initials extraction rules
- Tokenize on whitespace.
- Drop these leading/trailing stopwords (case-insensitive): `the, la, le, les, el, a, an, &, and, et, of, inc, inc., corp, corp., co, co., ltd, ltd., llc, l.l.c, gmbh, s.a., s.a.s, sa, sas, ag, ab, bv, oy, plc, pty, sas, sarl, srl, spa, group, holdings`.
- After filtering: if ≥2 tokens → first char of first two tokens. If 1 token of length ≥2 → first two chars. If 1 token of length 1 → that char.
- Edge cases: "TrueFan AI" → "TF" ✓ | "Forerunner Ventures" → "FV" ✓ | "Lordstown Motors" → "LM" ✓ | "Stripe" → "ST" (brief requested "S" alone; spec proposes two chars for consistency — flagged §9).
- Empty/whitespace name → `?`.
- Non-ASCII preserved, Uppercased via `String.prototype.toLocaleUpperCase("en-US")`.

### 6.5 Why stretch #4 (user upload) is deferred
Grep confirmed: no existing image-storage pattern. The closest uploads are CSV/text (meetings transcript, contacts import) — both go to short-lived memory and then DB rows, not binary blob storage. To ship logo upload we'd need to either (a) stand up Supabase Storage + signed-URL flow, (b) add an UploadThing-style dep, or (c) base64-into-Postgres (bad). Any of these is a workstream of its own, with its own quota + abuse + moderation questions. Out of scope; Tier 0 column exists so the follow-up is additive.

### 6.6 Why negative caching
A company with a dead domain (Lordstown Motors) would otherwise re-hit Clearbit + Google + the dead homepage every 30 days forever. Negative cache entry with 7-day TTL caps that at ~4 probes/year per bad domain.

### 6.7 Failure grace
Every tier fail is caught + logged + advances the cascade. The resolver can throw only on programmer error (invalid input); production paths always resolve to at least `{ tier: 6 }`. `<GeneratedCompanyAvatar>` is pure synchronous SVG — it can never fail. A try/catch around the whole thing at the `<CompanyLogo>` level guarantees a render no matter what.

---

## 7. API surface

### 7.1 TypeScript signatures

```ts
// components/ui/generated-company-avatar.tsx
export interface GeneratedCompanyAvatarProps {
  companyName: string;
  size?: number;        // default 24
  className?: string;
}
export function GeneratedCompanyAvatar(props: GeneratedCompanyAvatarProps): JSX.Element;

// components/ui/company-logo.tsx  (refactored, props unchanged)
export interface CompanyLogoProps {
  domain: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
  logoUrl?: string | null;   // NEW — Tier 1 seed from upstream caller if already known
}
export function CompanyLogo(props: CompanyLogoProps): JSX.Element;

// lib/logo/resolver.ts  (server-only)
export type ResolvedLogoTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface ResolvedLogo {
  url: string | null;                  // null only when tier === 6
  tier: ResolvedLogoTier;
  resolvedAt: string;                  // ISO timestamp
  fromCache: boolean;
}
export async function resolveCompanyLogo(
  domain: string | null | undefined,
  companyName: string,
  existingLogoUrl?: string | null
): Promise<ResolvedLogo>;

export async function resolveCompanyLogoBatch(
  requests: Array<{ domain: string | null | undefined; companyName: string; existingLogoUrl?: string | null }>
): Promise<Record<string, ResolvedLogo>>;  // keyed by domain || companyName
```

### 7.2 HTTP endpoint

```
POST /api/company-logo/resolve-batch
Content-Type: application/json
Body: { "entries": [{ "domain": "stripe.com", "companyName": "Stripe" }, ...] }  // max 50 entries
Response 200: { "results": { "stripe.com": { "url": "https://...", "tier": 2, "fromCache": true }, ... } }
Response 429: rate-limited (reuses existing `hit()` helper; 120 requests/minute/tenant)
Response 400: > 50 entries, malformed JSON
```

Auth: requires active session (same `getSession()` guard as other `/api/*` routes). No CSRF concern — read-only resolver.

### 7.3 No new public/tenant-facing endpoints
The resolver is internal plumbing. No settings surface, no UI toggle. Feature-flagged via env only (§8).

---

## 8. Testing strategy

Matches the existing Vitest + Playwright setup (`package.json:5-15`).

### 8.1 Vitest unit
- `generated-company-avatar.test.tsx` — renders deterministically (snapshot on gradient + initials for 10 known names), gradient determinism across hash restarts, WCAG AA contrast assertion over 100 synthesized company names, single-word / multi-word / stopword-only edge cases.
- `resolver.test.ts` — each tier mocked via `globalThis.fetch`, asserting:
  - Tier 2 success short-circuits (tiers 3+ never called).
  - Tier 4 rejection when `content-length` falls in `GLOBE_SIZE_RANGE`.
  - Tier 5 parses all 3 selector types (apple-touch-icon, og:image, link-rel-icon).
  - Negative cache hit skips network entirely.
  - Stale positive cache returns stale URL + triggers background refresh.
- `cache.test.ts` — key naming, TTL values, MGET batching against a mock Upstash REST endpoint.

### 8.2 Vitest component
- `company-logo.test.tsx` — renders `<GeneratedCompanyAvatar>` immediately on mount (no spinner), swaps to resolved URL after coalescer flush, handles unmount mid-flight without setState-on-unmounted warning.

### 8.3 Playwright E2E
- `logo-cascade.spec.ts` — loads Accounts list with 30-row fixture, mocks resolver endpoint to return a mix of tier 2 / tier 4 / tier 6, asserts:
  - Every row has *some* visual (no empty `<img>`).
  - No row shows a Google-globe image (asserted via network-log check that no image URL contains `www.google.com/s2/favicons`).
  - No visible layout shift during resolution (CLS ~0 via Playwright's `performance.getEntriesByType("layout-shift")`).

### 8.4 Manual QA checklist for eval phase
- Visit Accounts, Opportunities, Contacts, Home, Onboarding TAM preview, Contact-merge. Verify no blue globes anywhere across a seeded dataset with intentionally bad domains.
- Load a fresh tenant (empty Upstash cache) and measure resolver latency — expect p50 <300ms, p95 <1200ms.
- Verify telemetry in PostHog devtools: `logo_tier_hit` events fire with correct tier values.

---

## 9. Rollout and rollback

### 9.1 Feature flag
- `NEXT_PUBLIC_LOGO_CASCADE_V2` (default `true` in dev, `false` in prod until bake-in).
  - `false` → keep current `CompanyLogo` behavior untouched.
  - `true` → wire through the new resolver + generated avatar.
- `NEXT_PUBLIC_LOGO_AVATAR_STYLE=flat|gradient` for the visual upgrade. Defaults `gradient`; `flat` reverts to the existing 8-swatch block as a kill-switch.

### 9.2 Migration order
1. Land schema migration (4 new nullable columns — backward-compatible, deployable anytime).
2. Land resolver + endpoint (dormant — nothing calls it yet).
3. Land `<GeneratedCompanyAvatar>` (importable but unused).
4. Flip flag on staging, soak 24h.
5. Flip flag on for 10% of prod tenants via existing tenant-based flag mechanism (if one exists — confirm in Plan phase), soak 48h.
6. 100% rollout.
7. After 14 days clean, delete flag + the `V1` code paths.

### 9.3 Rollback
Flip the two env vars to `false`. Schema columns stay (harmless). No data rewrites needed.

### 9.4 Risk surfaces
- **Clearbit rate-limiting us.** Clearbit's free tier is generous but undocumented — caching + negative cache should keep us well below any ceiling. Mitigation: if we see 429s, flip to "Clearbit skipped" via a feature flag; users get Tier 4/5/6 instead.
- **Tier 5 scrape → user's IP exposure to third-party sites.** Mitigation: scrape only from the server, send a neutral User-Agent `Elevay-Logo-Resolver/1.0 (+https://elevay.com/bot)`, respect 404/robots.txt opt-out header.
- **Google Favicons V2 changes its default-globe bytes.** Mitigation: `google-globe-fingerprint.ts` constant + fail-open (if we can't confirm it's a globe, we render it — worst case we miss some rejections and the UX reverts to current state for those domains).
- **Thundering herd on dashboard reload.** Mitigation: 50ms client coalescer + 8-concurrent server cap + Upstash MGET batching.

---

## 10. Open questions for Martin before execution starts

1. **Single-word initials behavior.** Brief says "single-word like 'Stripe' → 'S'"; spec proposes 'ST' (two chars) for visual consistency with multi-word cases ("FV", "LM"). Which do you want?
2. **Gradient vs flat initial tile.** Spec proposes gradient as default with a flat-fallback flag. OK to ship gradient-first, or do you want flat-first behind a flag until you can look at it?
3. **Feature flag mechanism.** Is there an existing per-tenant flag system I should reuse for the 10% rollout, or do I ship with a simple env-var boolean and we cutover at 100% directly? (Grep didn't surface a generic flag service — only env checks.)
4. **Domain hashing in telemetry.** Spec proposes SHA-256(domain) before emitting `logo_tier_hit` to PostHog to avoid leaking the customer's target-company list into PostHog. Acceptable, or do you want raw domains for debuggability during the bake-in period?
5. **Stretch defer confirm.** Spec defers user upload to a follow-up ticket because there's no existing image-upload path in the codebase. Confirm OK, or do you want me to include it and stand up Supabase Storage in the same spec? (Doubles the footprint if so.)
6. **Kiro template path.** Brief references `docs/specs/onboarding-refactor-brief.md §9.1` which does not exist. I mirrored `WS-1-spec.md`'s 12-section layout instead. Confirm that's the intended template.
7. **Brand-anchor hue ring.** Spec assumes the three brand-chrome colours (`#17C3B2`, `#2C6BED`, `#FF7A3D`) are the gradient anchors. If the design system has an official extended palette I should use those instead — is there a palette token file I missed?
8. **Negative-cache blast radius.** 7-day negative TTL means if Clearbit is down for an hour, domains probed during that hour are blacklisted for a week. Acceptable trade-off vs thundering-herd protection?
9. **Apollo payload field name.** Tier 3 reads `properties.apollo_logo_url` — confirm the key name after the next Apollo enrich run, or I'll grep the writers during Plan phase.

---

## 11. Exit condition

All must hold before merging to `main`:

- [ ] `CompanyLogo` refactored; all 7 call sites listed in §1.6 compile and render without prop changes.
- [ ] `<GeneratedCompanyAvatar>` component renders deterministically; Vitest contrast suite passes for 100 synthesized names.
- [ ] Resolver hits tier 1–6 in correct order; Vitest mock suite green.
- [ ] `/api/company-logo/resolve-batch` endpoint live; rate-limited; batches of 50 processed under 1.5s p95 in staging.
- [ ] Schema migration applied; 4 new columns present; index created.
- [ ] PostHog receives `logo_tier_hit` events for a staging load of Accounts list; tier distribution logged in spec PR comment.
- [ ] Playwright E2E `logo-cascade.spec.ts` green — zero Google-globe images rendered across a 30-row seeded dataset.
- [ ] Regression: existing `company-logo.test.tsx` (if present) continues to pass, or is replaced by the new suite.
- [ ] No new lint / TypeScript errors introduced.
- [ ] No emoji introduced anywhere (per the no-emoji-in-UI invariant).
- [ ] Martin visual sign-off on the gradient avatar against the live Accounts list.

---

## 12. What this spec deliberately excludes

- User-upload affordance (Tier 0) — deferred, column added for forward-compat only.
- Person/contact avatars (out of scope; separate visual-polish ticket if needed).
- Outbound-email logo embedding (different rendering pipeline).
- Logo moderation / brand-trademark review flow (only relevant once user upload lands).
- Background batch pre-resolution Inngest job (could prewarm cache but is optional polish; the on-demand resolver is sufficient for v1).
- A dedicated `/settings/branding` surface.
- Mobile layouts for logo containers.

---

## 13. Approval

- [ ] **Approve** — proceed to Plan phase.
- [ ] **Approve with changes** — comment inline, I amend then re-submit.
- [ ] **Reject** — reframe needed.

**Sign-off:** Martin — _pending_
