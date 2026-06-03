# PROPOSAL-001: Tasks — DOCX template ingestion & component detection

Branch: `feat/proposal-autodraft`. Build in order; each task ends with a Verify +
a Test. Conventions: tenant-scope every query, no emoji, brand "Elevay".

## Task 1: Dependencies
- [ ] Add `mammoth` (DOCX text/outline extraction). No `docxtemplater` yet (that is
      PROPOSAL-002).
- [ ] Confirm `bytea` handling needs only a Drizzle `customType` (no new dep).
- **Verify**: `npm ls mammoth` resolves; `npm run tsc` clean.
- **Test**: a smoke import of `mammoth` in a unit test.

## Task 2: Schema (`src/db/schema/proposals.ts`)
- [ ] Define `proposalTemplates` and `proposalAssets` per design (text PK
      `crypto.randomUUID`, `tenantId` FK + indexes, `withTimezone` timestamps,
      `deletedAt` soft delete, jsonb fields, `bytea` customType for `bytes`).
- [ ] Re-export from `src/db/schema.ts` barrel.
- [ ] `npm run db:generate`; review the emitted SQL is additive `CREATE TABLE` only.
- **Verify**: generated migration creates exactly the two tables + indexes; no ALTER
      to existing tables. Apply with `db:migrate:apply` only after the diff check.
- **Test**: a schema-shape unit test asserts the table objects expose the expected
      columns (`tenantId`, `status`, `componentMap`, `storageRef`).

## Task 3: Storage abstraction (`src/lib/proposals/storage.ts`)
- [ ] `ProposalStorage` interface: `put(tenantId, bytes, contentType) -> ref`,
      `get(tenantId, ref) -> { bytes, contentType }`, `delete(tenantId, ref)`.
- [ ] DB-blob implementation backed by `proposalAssets`; `get`/`delete` enforce
      `tenantId` (reject cross-tenant ref).
- [ ] Export a `getProposalStorage()` selector (DB-blob default; reads an env flag
      reserved for a future Supabase/S3 impl).
- **Verify**: put then get round-trips identical bytes; cross-tenant get returns
      null/throws.
- **Test**: round-trip + tenant-isolation unit tests.

## Task 4: DOCX ingestion (`src/lib/proposals/ingest-docx.ts`)
- [ ] `extractDocx(bytes) -> { text, outline, error? }` using `mammoth`
      (`extractRawText` for text; derive `outline` from heading styles via
      `convertToHtml` or messages — ordered `{ level, text, offset }`).
- [ ] Include table-cell and list-item text in `text`, in document order.
- [ ] Never throw: catch and return `{ text: "", outline: [], error }`.
- **Verify**: run against a real propale `.docx` fixture; text + headings present,
      table text included.
- **Test**: fixtures for (a) normal doc with headings+table, (b) heading-less doc,
      (c) corrupt bytes → `error` set, no throw.

## Task 5: Component detection (`src/lib/proposals/detect-components.ts`)
- [ ] `componentMapZod` matching the design contract.
- [ ] `detectComponents(text, outline, { tenantId }) -> { componentMap, meta }`
      via `tracedGenerateObject({ model: getModelForTask("chat"), schema, prompt,
      _trace: { agentId: "skill-proposal-detect-components", tenantId } })`.
- [ ] Prompt: classify the doc into ordered sections + fields, suggest
      `placeholderToken` + `dataKey` from a fixed Elevay data vocabulary
      (`company.*`, `deal.*`, `contact.*`, `date.today`, `null`=generated section),
      never drop a section (low-confidence instead), keep document order via
      `offset`.
- [ ] Bound the input window; set `meta.truncated`. Retry once on
      schema-parse/validation failure, then throw a typed `DetectionUnavailable`.
- **Verify**: against the fixture, sections like Exec Summary/Scope/Pricing surface
      with sane tokens + dataKeys.
- **Test**: mock the LLM to return (a) a valid map → parsed; (b) malformed once
      then valid → retried; (c) malformed twice → throws.

## Task 6: Detection skill (`src/skills/intelligence/proposal-template-detect/`)
- [ ] `schema.ts` (`{ templateId }` -> `{ templateId, componentMap, detectionMeta }`),
      `handler.ts`, `index.ts` (`SkillDefinition`, category `intelligence`,
      costEstimate ~"$0.01-0.03 per template").
- [ ] Handler loads the template tenant-scoped; if no `extractedText` →
      `degradationReason='insufficient_context'`; if `DetectionUnavailable`/no key →
      `degradationReason='missing_required_data'` + `userSuggestion`. Pure (no DB
      write).
- [ ] Register in `register-all.ts`.
- **Verify**: run the skill on a detected template id; returns the map. With no LLM
      key, returns degraded.
- **Test**: skill returns map on happy path; degraded on missing text / missing key.

## Task 7: Upload + detect API (`src/app/api/proposals/templates/route.ts`)
- [ ] `POST`: parse multipart, validate format/size (MIME sniff + `.docx` + ≤10MB),
      `storage.put`, insert template, run `extractDocx`, persist text/outline (or
      `failed`/`unreadable_docx`), run detection, persist map + `status='detected'`
      (or `degraded`, stay `uploaded`). Return 201 contract.
- [ ] `GET`: list tenant templates, newest first, exclude soft-deleted.
- **Verify**: curl/Playwright upload a real `.docx` → 201 with a `componentMap`;
      oversize + wrong-type rejected; list shows it.
- **Test**: route tests for success, `file_too_large`, `unsupported_format`,
      `unreadable_docx`, and tenant isolation on GET.

## Task 8: Detail / confirm / delete API (`.../templates/[id]/route.ts`)
- [ ] `GET` (tenant-scoped detail incl. map + outline), `PATCH` (confirm map with
      completeness validation → `status='mapped'`; or rename), `DELETE` (soft).
- [ ] Validation: reject `empty_map`, and any component missing `label`, or any
      `field` missing `dataKey`, naming the offending component id.
- **Verify**: confirm a real map → `status='mapped'`; incomplete map rejected;
      cross-tenant id → 404.
- **Test**: PATCH valid/invalid map, DELETE soft-delete, tenant 404.

## Task 9: Minimal management UI (`src/app/(dashboard)/proposals/`)
- [ ] `page.tsx`: list templates (name, format, status, updated), an upload zone
      (`.docx`), and a detected-component review panel (rename/reorder/remove a
      component, remap a field's `dataKey`, then Confirm → PATCH). No emoji;
      lucide-react icons; "Elevay" copy. Thin by design — the rich proofread UX is
      PROPOSAL-004.
- [ ] Register the sidebar nav entry (user-facing; not admin-gated).
- **Verify**: in the running app, upload → see detected components → edit → confirm
      → status flips to mapped (screenshot before/after).
- **Test**: component render test for the list + review panel with fixture data.

## Task 10: Chat tool (read-only)
- [ ] Add a tenant-scoped `listProposalTemplates` tool (and template detail) to the
      chat tool set; update the relevant tool group + any system-prompt capability
      line. Read-only this increment.
- **Verify**: ask the chat to list proposal templates → tenant-scoped result with
      component maps.
- **Test**: tool returns only the caller tenant's templates.

## Task 11: Tests + regression
- [ ] Ensure every new query is covered by / passes the `anti-creep-pilae`
      tenant-guard test (add the new modules if the test enumerates them).
- [ ] `npm run tsc`, `npm run test` (vitest), `regression.sh`.
- **Verify**: all green; no regressions.
- **Test**: the full PROPOSAL-001 suite (Tasks 3-10) passes.

## Done = PASS criteria
All AC in `requirements.md` demonstrably pass on the live app (Evaluation Steps 1-8),
tenant isolation proven, detection degrades cleanly without an LLM key, `tsc`/tests/
regression green. On PASS: merge to main, mark PROPOSAL-001 DONE in `roadmap.md`,
proceed to PROPOSAL-002.
