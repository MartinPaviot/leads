# Tasks — Network activation

Ordered. Each task: implement → verify → test → commit.

- [x] **T1 — Pure parser** `lib/network/linkedin-connections.ts`
  - `parseLinkedInConnections(csv)` + exported helpers `normalizeLinkedInUrl`,
    `parseConnectedOn`, `findHeaderIndex`, `stripBom`.
  - Verify: `vitest run` on `__tests__/network-linkedin-connections.test.ts` green.
  - Test: ≥12 cases (preamble+BOM, no-preamble, dedup url-variants, empty email
    kept, no-identity skipped, date formats, CRLF, garbage → headerFound false).

- [x] **T2 — Import endpoint** `app/api/network/import/route.ts`
  - Pure planner `lib/network/import-plan.ts` (dedup vs tenant by linkedinUrl|email,
    row shaping) + service `lib/network/import-service.ts` (parse → company
    upsert-by-name → contact insert tagged `properties.network` +
    `networkConnectedOn`) + thin route (auth, rate-limit "bulk", 5MB cap, JSON/file).
  - Verified: planner 7 tests + route 5 tests (mocked service, no fragile db mock);
    27 network tests total green; tsc clean.

- [x] **T3 — Wire ICP scoring** (folded into the import service)
  - `import-service` loads active ICPs + `scoreContactIcpBatch(tenantId, ids,
    activeIcps)` after insert; missing/empty ICP is non-fatal (`scored:0`, contacts
    kept for the next recompute).

- [x] **T4 — Contacts filter** `?fNetwork=true`
  - `app/api/contacts/route.ts`: `fNetwork` condition (`properties->>'network'`)
    + `networkCount` in the response. Contacts page: "Mon réseau (N)" toggle
    (shown when count > 0) wired through `serializeContactFilters`.

- [x] **T5 — Call list source** (`SprintAudience.network`)
  - `network?: boolean` on SprintAudience + readSprintAudience (a network-only
    segment is valid) + condition in `sprintAudienceConditions`. A "Mon réseau"
    list = segment `{ network: true }`. Test: network-sprint-audience.test (3).

- [x] **T6 — Enrich the cohort** (via the existing bulk action — no new code)
  - Once "Mon réseau" is filterable (T4), the existing select-all-matching +
    bulk enrich on Contacts runs `enqueueFullEnrichForContacts` over the cohort
    (`?fNetwork=true` flows into select-all-matching). Reuse, not rebuild.

- [x] **T7 — Upload UI**
  - Contacts toolbar: "Mon réseau LinkedIn" button → file input →
    `POST /api/network/import` → result banner (ajoutés/déjà présents/scorés) →
    list refresh reveals the cohort + the "Mon réseau (N)" toggle.

- [x] **T8 — Rebase + checks**
  - Rebased onto origin/main (c1c9d629, #257 reachability present). tsc 0 errors
    (whole project); 44 unit tests green. Full vitest suite = CI gate on PR.

## Status
FEATURE COMPLETE this session, end-to-end + verified (44 tests, tsc 0):
import (T1/T2/T3) → ICP score → Contacts "Mon réseau" filter+chip (T4) →
call-list facet (T5) → cohort enrich via existing bulk (T6) → upload UI (T7),
rebased on origin/main (T8). Branch feat/network-activation (worktree
leads-wt-network), NOT pushed. Optional follow-ups: cost-preview gate before
bulk enrich (YALC reco #3); call-readiness facts on cohort rows.
