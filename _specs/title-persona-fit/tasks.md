# Tasks — title-persona-fit

1. [x] Spec (this directory).
2. [x] `lib/scoring/title-persona.ts` — vocabulary, hash, cache read, batched fail-closed resolver.
   - Verified: `title-persona.test.ts`, 12 tests (validation, hash stability, batching, fail-closed, negative-vs-unresolved).
3. [x] `lib/scoring/contact-icp-fit.ts` — scorable set += person_titles; title back in SELECT; fast-path + cache + resolve + inject + write-through; reasons.
   - Verified: `contact-icp-fit.test.ts` extended (alias match, resolved-empty, unresolved no-penalty, required doctrine, hiring still ignored).
4. [x] `lib/icp/ui-state.ts` — comment now states person fields are contact-scored.
5. [x] Chat skills migrated to the shared lib + stored score; `icpSettings`/`breakdown` dropped from schemas; onboarding call site updated; `lib/scoring/contact-scoring.ts` deleted (zero references left).
   - Verified: `skills-lead-qualification.test.ts` (R8: stored score quoted, refresh-through-lib, skip-when-unscorable).
6. [x] tsc clean; 104 tests green across the 7 touched/adjacent suites.
7. [x] Live evaluation — see `eval.md` (dormant regression byte-identical; real-LLM dry-run 443/446 resolved, 150 matched, French spot-checks pass).
8. [x] Commit, push, stacked PR (base: feat/accounts-more-rescore).
