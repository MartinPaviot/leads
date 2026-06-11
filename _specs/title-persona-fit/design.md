# Design — title-persona-fit

## System fit

The contact scorer (`lib/scoring/contact-icp-fit.ts`, PR #201) already evaluates ICP criteria over a merged contact context via `computeBlendedFit`. This feature only changes WHAT lands in the context for `person_titles` — the engine, the cells, the score scale, the writers all stay put.

Persona vocabulary source: `icp_criteria` rows with `fieldKey = "person_titles"` (operator `in`, authored by the ICP editor's People section via `uiStateToCriteria`, always soft from that path). NOT `metadata.sourcingFilters` (that holds only excludeGeographies/fundingRecencyDays).

## New module — `lib/scoring/title-persona.ts`

- `personaVocabulary(activeIcps): string[]` — union of all active ICPs' `person_titles` values, first-seen casing, normalized dedup (reuses the engine's `norm` semantics).
- `vocabHash(vocab): string` — sha256 of the sorted normalized vocabulary, 12 hex chars. Stable across order/casing changes.
- `readCachedPersonas(properties, hash): string[] | null` — returns the cached resolution when `properties.title_personas.h === hash`, else null. `[]` is a valid (negative) resolution.
- `resolveTitles(titles, vocab, tenantId): Promise<Map<normTitle, string[]>>` — batches of ≤50 titles per `tracedGenerateObject` call (model: `claude-haiku-4-5`, fallback `gpt-4o-mini`, none → empty Map). Prompt mirrors `industry-match.ts`: the EXACT vocabulary list + the EXACT titles; output `{ mappings: [{ title, personas[] }] }`. Validation: title must normalize to a requested title; personas filtered to verbatim vocabulary members; a requested title echoed with `[]` is cached as a negative; a title MISSING from the response stays UNRESOLVED (not cached). Any throw → empty Map (fail closed).

## Integration — `contact-icp-fit.ts`

- `CONTACT_SCORABLE_PERSON_FIELDS` += `person_titles` (CONTACT_SOURCING_ONLY shrinks to `hiring_job_titles`).
- Chunk SELECT re-adds `title`.
- `scoreContactIcpBatch` (outer) computes `vocab` + `hash` once. Per chunk:
  1. Literal fast-path: normalized title ∈ vocabulary → personas = [title] with no LLM.
  2. Cache read per contact (`title_personas.h === hash`).
  3. Remaining titles → `resolveTitles` (deduped across the chunk).
  4. Context injection ONLY when a resolution is known: `ctx.person_titles = [title, ...personas]`. Unknown (LLM down/missing) → key absent → engine no-penalty path + reason "Title not yet matched to personas — title criteria not evaluated".
  5. Write-through: the existing recordset UPDATE's `props` merge adds `title_personas: { h, p }` for contacts whose resolution was computed this run (fresh or fast-path; cached ones skip rewrite).
- Reasons: title criterion unmatched (resolved-empty) → "Title outside the target personas"; matched via mapping → no extra noise (the fit line carries it).
- Score scale, `properties.icp_fit` cells, grades: unchanged.
- `ui-state.ts` comment ("the fit engine ignores them") updated: person fields are scored for CONTACTS since PR #201/this.

## Chat skills alignment (R8)

`skills/scoring/lead-qualification` + `inbound-lead-qualification` stop calling the legacy `scoreContact`:
- refresh through `loadActiveIcps` + `scoreContactIcpBatch` (guarded by `hasContactScorableCriteria`), then read the stored rows (score, scoreReasons, properties.score_grade);
- `breakdown` (legacy seniority/engagement/sentiment shape) leaves the lead-qualification output schema — the only consumer is the chat narration (verified by grep);
- inbound thresholds (hot ≥60 / warm ≥40 / nurture ≥20 on the adjusted score) keep working on the 0-100 fit scale.
`lib/scoring/contact-scoring.ts` (scoreContact) then has zero callers and is deleted with its dead exports; `calculateContactFitScore` stays (still exported + tested as a pure function) — flagged for a later sweep.

## Failure handling

| Failure | Behavior |
| --- | --- |
| No ANTHROPIC/OPENAI key | empty Map → no injection, reason says not evaluated, coverage drops |
| LLM throws/timeouts | same as above (try/catch per batch) |
| LLM hallucinates labels | dropped by verbatim filter; empty result after filtering = negative resolution |
| Vocabulary edited mid-run | hash computed once per run; next run re-resolves (acceptable staleness: one run) |
| Required person_titles + unverifiable title | cell zeroed (engine doctrine), covered by a test |

## Security / cost

Tenant-scoped reads/writes only (same queries as today + `title` column). LLM sees job titles + persona labels only — no emails/names. Cost: first full run ≤ ⌈446/50⌉ = 9 haiku calls, then 0 (cache); per-sync increments resolve only new titles.
