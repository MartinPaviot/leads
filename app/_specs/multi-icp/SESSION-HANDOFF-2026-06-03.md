# Session handoff — CH/FR cold-call tooling (2026-06-03)

Branch: `feat/ch-fr-prospecting` (off `main`). All work committed, 0 type
errors across the branch, 181 affected-suite tests green.

## What shipped (commits on the branch)

1. **`e30bd316`** — CH/FR tools + ICP fit/sourcing reliability (27 files)
2. **`feat(opener)`** — gap D, signal→opener generator
3. **`feat(capture)`** — gap E, approval queue (backend + API)
4. **`9096110b`** — gap E meeting path gated
5. **`feat(capture)`** — gap E review UI + nav
6. **`7099e369`** — voice:stream script fix

## The cold-call chain — status by stage

| Stage | State |
|---|---|
| 1. Target identification (multi-ICP, TAM) | **Working.** 2 ICPs, criteria→Apollo, fit matrix. Count-subquery bug fixed → Build TAM enabled. |
| 2. Enrichment — company | **Working.** Apollo→Datagma(EU)→Firmable(AU)→Crunchbase→Hunter→LLM waterfall. |
| 2. Enrichment — contact mobile/email | **CH/FR waterfall built** (Apollo→Kaspr→Lusha, geo-routed, mobile-first, `phoneType`→call priority). **Needs `KASPR_API_KEY`/`LUSHA_API_KEY`** + a payload-mapping verification pass (clients can't be validated without a live key). Degrades to Apollo-only without keys. |
| 3. Prioritisation (priority_score, call queue) | **Working** (pre-existing). |
| 4. The call (Twilio + Call Mode) | **Working** (pre-existing). CH added to two-party recording consent. |
| 4b. Live transcription/coaching | **Code complete + verified-loadable** (`scripts/voice-stream-server.ts` + Deepgram v5 + coaching tap). **Needs `DEEPGRAM_API_KEY`** + hosting the server where Twilio can reach it over wss (deploy decision). Run: `pnpm voice:stream`. |
| 5. Capture → CRM (email/meeting/call) | **Working** (pre-existing) + now optionally gated by human approval (gap E). |
| 6. Reuse (coaching RAG, deal intel, briefs, chat) | **Working** (pre-existing). |

## Reliability fixes (why the TAM showed 0 before)

- `api/icps` + `api/eval/datasets`: correlated-subquery outer ref was an
  unqualified `"id"` (bound to the inner table) → criteria/fit counts always
  0 → Build TAM permanently disabled. Fixed.
- DB drift: live Supabase missing `0027` logo columns → every TAM insert
  failed `42703` silently. Applied 0027. (DB was migrated outside the runner;
  `__drizzle_migrations` absent — diff schema vs `information_schema` before
  trusting inserts.)
- Geography zeroed every French company: `norm()` now strips diacritics
  (Île-de-France) + equates `&`/`and`; matches region against Apollo's `state`.
- Recompute wired after build; page cap 3→6; `TAM_SKIP_NARRATION` for bulk.

## New things you can use

- **`scripts/source-icp-tam.ts <tenant> "<ICP>" [target] [maxPages]`** — full
  TAM source via the proven pipeline, no 300s limit, recomputes fit at the end.
- **`GET /api/contacts/[id]/opener`** — grounded opener from a contact's
  company signals + ICP/product + seniority (gap D).
- **Capture approval**: set `tenants.settings.captureApprovalMode = "review"`
  to queue captured email/meeting/call activities; review at
  **/settings/capture-approvals**. Default `auto` = unchanged.

## Needs you (5h-away checklist)

1. **Keys**: `KASPR_API_KEY`, `LUSHA_API_KEY` (FR/CH mobiles), `DEEPGRAM_API_KEY`
   (live transcription). Add to `.env.local` / prod env.
2. **Verify** the Kaspr/Lusha response mapping once a key is in (clients are
   defensive but unverified against a live response).
3. **Deploy** `voice:stream` on a long-running host with a public wss tunnel;
   point the TwiML `<Stream>` at it.
4. **Decide** ICP-1 precision: `industry` is soft, so ~37% of "fit" are truly
   in-industry (publishing/insurance pass on geo+size+tech). One-toggle fix:
   make `industry` required → free recompute. ICP-2 is already ~73%.

## Open / not done

- **ICP-2 (Finance)** sourced partially (~92/116): the bulk script crawls in
  this sandbox because it hits an LLM endpoint unreachable here (fine in prod).
  ICP-1 = 526 sourced. Re-run `source-icp-tam.ts` in prod to finish, or it's
  enough as a secondary ICP.
- **Signal→opener UI**: the generator + API are done; surfacing it in the Call
  Mode brief is a small, verifiable follow-up (held — UI couldn't be
  visually verified this session due to a Playwright profile-lock issue).
