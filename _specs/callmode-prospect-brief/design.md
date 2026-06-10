# callmode-prospect-brief — Design

## System fit

Call Mode's fiche (`PreCallBrief` in `_panels.tsx`) already reads the brain
(`/api/brain/contact/[id]`, read-only) and a cached company dossier. The
brief is a NEW, cheap, person+website-grounded layer that the existing
dossier does not cover (dossier = Apollo firmographics + strategy; brief =
who this person is + what the company says about itself).

Reused primitives:
- `fetchSiteSignals` (lib/tech-detect/fetch) — homepage HTML, 6s timeout,
  fail-soft null, 250KB cap.
- `enrichPerson` (lib/integrations/apollo-client) — people/match; the live
  API returns `employment_history`; we extend the TS type (additive).
- `getModelForTask("lightweight")` + `tracedGenerateObject` — one structured
  LLM call, same pattern as dossier-builder.
- jsonb `properties` caches on contacts/companies — same as `dossier`.

## Data model (no migration — jsonb only)

`contacts.properties.brief`:
```json
{ "v": 1, "background": "…|null", "headline": "…|null",
  "career": [{ "title": "…", "org": "…", "startYear": 2021,
               "endYear": null, "current": true }],
  "linkedinUrl": "…|null", "source": "apollo|crm",
  "generatedAt": "ISO" }
```

`companies.properties.webBrief`:
```json
{ "v": 1, "summary": "…|null", "metaDescription": "…|null",
  "url": "https://domain/", "generatedAt": "ISO" }
```

Writes use `properties || $json::jsonb` merge (jsonb_set footgun memory).
Discovered `linkedin_url` also backfills the real `contacts.linkedin_url`
column when it was null.

## Flow

```
GET /api/call-mode/prospect-brief?contactId=X   (withAuthRLS, tenant-scoped)
  └ load contact (deletedAt null) + company
  └ fresh? (brief.generatedAt < 30d AND webBrief.generatedAt < 30d)
      → return cached payload
  └ rebuild:
      Apollo people/match (linkedin_url → name+domain → name+orgName;
        no reveal flags; null-safe)                       [1 credit / 30d]
      fetchSiteSignals(company.domain) → extractWebsiteText (title +
        meta descriptions + visible text, ≤6000 chars)
      ONE tracedGenerateObject (lightweight): zod
        { personBackground, companySummary } — French, facts-only,
        "" when insufficient
      validateBriefTexts: force "" when no person inputs / site text
        < 200 chars; sanitize refusal text; 600-char caps
      persist both halves (merge), backfill linkedinUrl
  └ respond { person, company } — each half null-safe, fail-soft
```

Server-side per-instance in-flight map (tenant:contact → Promise) +
client-side module map dedupe StrictMode/double-clicks.

## Module split (testability)

- `lib/call-mode/prospect-brief-core.ts` — PURE: extractWebsiteText,
  buildCareerTimeline, sanitizeLlmText, validateBriefTexts, isFresh,
  recentActivityUrl, types. Zero IO imports → hermetic vitest.
- `lib/call-mode/prospect-brief.ts` — IO orchestrator (db, apollo, fetch,
  LLM, caches).
- `app/api/call-mode/prospect-brief/route.ts` — thin GET.
- `_panels.tsx` — `ProspectBriefCard` inserted after the context-chips row
  in `PreCallBrief`; skeleton → card; honest empty states; sources line.

## Failure handling

Every external step is individually fail-soft (Apollo null, site null, LLM
null) — the route returns whatever halves it has; it 500s only on unexpected
errors. LLM text is fail-closed (empty over invented). UI renders each half
independently with explicit fallback copy.

## Security / privacy

- Tenant scoping on every query (tenantId from withAuthRLS).
- GET = read semantics (viewer-safe), same precedent as /api/research/dossier.
- Only the prospect's own public-web data + Apollo data we already license.
- No LinkedIn scraping; recent-activity link opens in the rep's browser.

## Costs

Apollo 1 credit / contact / 30d (no email/phone reveal). LLM: 1 lightweight
(Haiku) call / contact / 30d, ~6k-char prompt. Site fetch keyless.
