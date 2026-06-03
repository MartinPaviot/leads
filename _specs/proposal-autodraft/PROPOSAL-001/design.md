# PROPOSAL-001: Design — DOCX template ingestion & component detection

## System Fit
New `proposals` domain alongside the existing skill + API architecture.
- New schema file `src/db/schema/proposals.ts`, re-exported from `src/db/schema.ts`.
- New storage abstraction `src/lib/proposals/storage.ts` (DB-blob default).
- New ingest lib `src/lib/proposals/ingest-docx.ts` (uses `mammoth`).
- New detection lib `src/lib/proposals/detect-components.ts` (uses
  `tracedGenerateObject` + `getModelForTask("chat")`), wrapped by a new
  intelligence skill `proposal-template-detect` (tracing/budget/flywheel for free,
  chat-invocable).
- New API routes under `src/app/api/proposals/templates/`.
- Minimal management page under `src/app/(dashboard)/proposals/`.
- One read-only chat tool to list/inspect templates.

Reuses verified infra: `tracedGenerateObject` (`_trace: { agentId, tenantId }`),
`getModelForTask`/`anthropic` (EU-routed), the skill registry (`registerSkill` in
`register-all.ts`), Drizzle conventions from `schema/core.ts` (text PK via
`crypto.randomUUID()`, `tenantId` FK + index, `withTimezone` timestamps, soft
delete via `deletedAt`, jsonb for flexible structures).

## Data Model

### New table: `proposalTemplates` (`schema/proposals.ts`)
```
id                text PK  $defaultFn(crypto.randomUUID)
tenantId          text FK -> tenants.id  NOT NULL  (indexed)
createdByUserId   text FK -> users.id
name              text NOT NULL                      // defaults to filename
sourceFormat      text NOT NULL                      // 'docx' (only, in v1)
originalFileName  text NOT NULL
storageRef        text NOT NULL                      // opaque id from ProposalStorage
status            text NOT NULL default 'uploaded'   // uploaded|detected|mapped|failed
extractedText     text                               // plain text, doc order
extractedOutline  jsonb default []                   // [{ level, text, offset }]
componentMap      jsonb                              // proposed (detected) OR confirmed (mapped)
mapConfirmed      boolean default false
detectionMeta     jsonb default {}                   // { truncated, model, confidenceOverall }
extractionError   text
mappedByUserId    text FK -> users.id
mappedAt          timestamptz
deletedAt         timestamptz
createdAt         timestamptz defaultNow
updatedAt         timestamptz defaultNow
index(tenantId), index(tenantId, status)
```

### New table: `proposalAssets` (DB-blob backing for the default storage)
```
id          text PK
tenantId    text FK -> tenants.id NOT NULL (indexed)
contentType text NOT NULL
byteSize    integer NOT NULL
bytes       bytea  NOT NULL        // drizzle customType('bytea')
createdAt   timestamptz defaultNow
```
`storageRef` on a template equals the `proposalAssets.id`. The `ProposalStorage`
interface (`put(tenantId, bytes, contentType) -> ref`, `get(tenantId, ref) ->
{bytes, contentType}`, `delete(tenantId, ref)`) lets us swap to Supabase-EU/S3
later by config without touching callers. v1 ships only the DB-blob impl.

NOTE: the `proposals` (filled instances) and `proposalComponents` tables are
introduced in PROPOSAL-002/003, not here — keep this migration minimal.

### `componentMap` shape (the contract 002/003/004 consume)
```typescript
type ComponentMap = {
  version: 1;
  components: Array<{
    id: string;                       // stable uuid
    kind: "section" | "field";
    label: string;                    // human label, e.g. "Executive Summary"
    placeholderToken: string;         // e.g. "{{exec_summary}}" (used to templatize in 002)
    dataKey: string | null;           // e.g. "deal.summary","company.name","date.today", or null = LLM-generated section
    anchor: { headingText: string | null; offset: number | null }; // locate in 002
    required: boolean;
    confidence: "high" | "medium" | "low";
    order: number;
  }>;
};
```
Detected map: tokens/dataKeys are *suggestions*. Mapped map: user-confirmed,
validated complete (every component has a non-empty label; every `field` has a
`dataKey`).

## API Contracts (all require an auth session; `tenantId`+`userId` from session)

### POST `/api/proposals/templates`
Multipart `FormData { file: File, name?: string }`.
- Validate: extension `.docx`, MIME, size ≤ 10 MB → else 400
  `{ error: 'unsupported_format' | 'file_too_large' }`.
- `storage.put` the bytes → `storageRef`; insert template `status='uploaded'`.
- Run extraction (`ingest-docx`); persist `extractedText` + `extractedOutline`
  (or `extractionError` + `status='failed'` on unreadable docx → 422
  `unreadable_docx`).
- Fire detection (synchronously for v1; bounded) → on success persist
  `componentMap` + `status='detected'`; on degrade leave `status='uploaded'` and
  include `degraded` in the response.
- 201 `{ id, status, componentMap?, degraded?, degradationReason? }`.

### GET `/api/proposals/templates`
- Returns the session tenant's non-deleted templates (id, name, sourceFormat,
  status, updatedAt), newest first.

### GET `/api/proposals/templates/[id]`
- Tenant-scoped fetch; 404 if not in tenant. Returns template + `componentMap` +
  `extractedOutline`.

### PATCH `/api/proposals/templates/[id]`
Body `{ componentMap: ComponentMap }` (confirm/adjust) or `{ name }`.
- Tenant-scoped. Validate map completeness (Feature 4) → 400 with offending
  component id on failure.
- On valid map: persist as confirmed, `mapConfirmed=true`, `status='mapped'`,
  `mappedByUserId`, `mappedAt`. 200 with updated template.

### DELETE `/api/proposals/templates/[id]`
- Soft delete (`deletedAt`), tenant-scoped.

## Skill: `proposal-template-detect` (category `intelligence`)
- `inputSchema`: `{ templateId: string }`.
- `outputSchema`: `{ templateId, componentMap, detectionMeta }`.
- Handler `(input, { tenantId })`: load template tenant-scoped → if no
  `extractedText`, return `degraded`/`insufficient_context` → else
  `detectComponents(extractedText, extractedOutline)` → return map. Does NOT write
  the DB (the route owns persistence); keeps the skill pure + reusable from chat.
- `detectComponents` uses `tracedGenerateObject({ model: getModelForTask("chat"),
  schema: componentMapZod, prompt, _trace: { agentId: "skill-proposal-detect-components",
  tenantId } })`; retry once on parse failure; bound the input text window
  (`detectionMeta.truncated`). Register in `register-all.ts`.

## Data Flow
```
User uploads .docx
   |  POST /api/proposals/templates  (session -> tenantId, userId)
   v
storage.put(bytes) -> storageRef ; insert proposalTemplates(status=uploaded)
   v
ingest-docx (mammoth: extractRawText + outline) -> extractedText, extractedOutline
   v
detectComponents (LLM, tracedGenerateObject) -> componentMap (suggested)
   |        \__ no key / parse fail x2 -> degraded; status stays 'uploaded'
   v
persist componentMap ; status=detected ; return to client
   v
User reviews + confirms (proposals page or PATCH) -> validated, status=mapped
   v
Reusable mapped template ready for PROPOSAL-002 (fill)
```

## Migrations
- Add tables to `schema/proposals.ts`; export from `schema.ts` barrel.
- `npm run db:generate` (drizzle-kit) to emit SQL. Apply with
  `npm run db:migrate:apply` (`scripts/apply-migrations.ts`). DO NOT use
  `npm run db:migrate` (intentionally broken at journal idx 12). `bytea` via a
  Drizzle `customType<{ data: Buffer }>`.
- Before applying against any shared DB, diff live schema first (migration-drift
  memory): additive `CREATE TABLE` only, no alters to existing tables.

## Failure Handling
- Unreadable/corrupt docx → `status='failed'`, `extractionError` set, 422; bytes
  retained for debugging.
- LLM unavailable / over budget (`enforceLlmBudget` throws) → `degraded`, template
  stays `uploaded`, user can re-trigger detection later.
- Storage failure → no template row created; 500 with generic message (no secret
  leakage).
- Malformed detector JSON → retry once → degrade.

## Security
- Every route resolves `tenantId` from the session and scopes every query with
  `and(eq(t.tenantId, tenantId), eq(t.id, id))` — must pass the
  `anti-creep-pilae` tenant-guard test.
- Upload limits: `.docx` only, ≤ 10 MB, MIME sniff (not just extension).
- Stored bytes are tenant-scoped; `storage.get` requires the caller's `tenantId`
  and rejects cross-tenant refs.
- No emoji in any UI string; user-facing brand is "Elevay".
- Filenames sanitized before display/storage; never echoed into a shell or path.
