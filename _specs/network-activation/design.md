# Design — Network activation

## System fit (reuse map — verified against the live code)
| Step | Reused seam | Location |
|---|---|---|
| CSV field parsing | PapaParse (importer's engine) | already a dep; `app/api/import/route.ts` uses it |
| Contact insert/dedup | `db.insert(contacts)` + email/linkedin pre-check | `app/api/import/smart/commit/route.ts` |
| Contacts schema | `contacts.properties` jsonb, `linkedinUrl`, `sourceSystem`, `score` | `db/schema/core.ts` |
| ICP scoring | `scoreContactIcpBatch(tenantId, ids, activeIcps)` (self-chunks 100) | `lib/scoring/contact-icp-fit.ts:108` |
| Bulk enrich | `enqueueFullEnrichForContacts({ tenantId, contactIds, baseUrl })` (cap 100) | `lib/integrations/fullenrich-enqueue.ts:36` |
| Call-list facets | `SprintAudience` + `sprintAudienceConditions()` | `lib/voice/sprint-audience.ts:25`, `lib/voice/call-sprint.ts` |
| Contacts filters | inline `?fXxx=` params → SQL | `app/api/contacts/route.ts:110` |

The ONLY net-new module is the parser (`lib/network/linkedin-connections.ts`).

## Data model
No migration. Network membership lives on the existing `contacts.properties` jsonb:
```jsonc
properties: {
  network: true,                       // the cohort tag (filter key)
  networkConnectedOn: "2024-06-15",    // ISO, from the export's "Connected On"
  networkImportedAt: "2026-06-16T…Z"   // when this import ran
}
```
- `sourceSystem` stays NULL (we never surface a provider name; the UI infers
  "Importé depuis LinkedIn" from `properties.network`). Rationale: keep parity with
  generic CSV imports, which also leave `sourceSystem` NULL.
- Dedup key on import = normalized `linkedinUrl` first, else lowercased `email`.

## API contracts
### `POST /api/network/import`  (new)
- Auth: tenant session (write role). Body: `multipart/form-data` file OR `{ csv: string }`.
- Guard: reject > ~5 MB / > 50k rows (a LinkedIn export is a few thousand rows).
- Flow: `parseLinkedInConnections(csv)` → for each connection, upsert company by
  name (tenant-scoped, `onConflictDoNothing` style), upsert contact deduped by
  (linkedinUrl|email) within tenant, set the `network` props → collect inserted ids
  → `scoreContactIcpBatch(tenantId, ids, activeIcps)`.
- Response: `{ ok, parsed, imported, duplicates, skipped, scored, headerFound }`.

### `GET /api/contacts?fNetwork=true`  (extend)
- Adds one condition: `properties->>'network' = 'true'`. Mirrors existing `fLinkedin`
  has/empty boolean-style filters. Count + list both respect it.

### Call list  (extend)
- `SprintAudience` gains `network?: boolean`. `sprintAudienceConditions()` adds
  `if (a.network) push(sql\`(${contacts.properties}->>'network') = 'true'\`)`.
- A "Mon réseau" list = `{ label: "Mon réseau", industries: [], personas: [], network: true }`.

## Data flow
```
Connections.csv
  → parseLinkedInConnections()           (pure: BOM, preamble, dedup, dates)
  → upsert company-by-name + contact      (tenant-scoped, dedup url|email)
  → tag properties.network + connectedOn
  → scoreContactIcpBatch()                (existing ICP engine)
  → surface: Contacts ?fNetwork=true  &  Call list "Mon réseau"
  → enrich top-of-ICP slice               (existing enqueueFullEnrichForContacts)
```

## Failure handling
- Parser never throws on bad input: returns `headerFound:false` / counts skipped.
- Import is best-effort per row; a single bad row is skipped, not fatal; response
  reports counts so the founder sees "imported 412, skipped 7, duplicates 31".
- Scoring failure (e.g. no active ICP) → import still succeeds; `scored:0` with a
  warning (the contacts exist and can be scored later by the normal recompute).
- Enrich is async (webhook) and is a SEPARATE user action, not coupled to import.

## Security / house rules
- Strict tenant scoping on every read/write (`tenantId` in every WHERE/insert).
- File-size + row cap to bound work; CSV parsed in-memory, no temp files.
- No third-party provider names in any added UI; cohort = "Mon réseau". No emojis
  (icon === "" rule); use lucide-react icons only.
- Enrichment spend remains behind the existing FullEnrich path (cap 100/batch);
  optional follow-up: a pre-run cost preview (the YALC credit-gate idea, reco #3).
