# callmode-prospect-brief — Tasks

1. [x] Spec (this folder).
2. [ ] Branch `feat/callmode-prospect-brief` off main.
3. [ ] `apollo-client.ts`: add optional `employment_history` to ApolloPerson
       (additive type widening). Verify: tsc.
4. [ ] `lib/call-mode/prospect-brief-core.ts`: pure helpers + types
       (extractWebsiteText, buildCareerTimeline, sanitizeLlmText,
       validateBriefTexts, isFresh, recentActivityUrl).
       Verify: unit tests (step 8) cover all edge cases.
5. [ ] `lib/call-mode/prospect-brief.ts`: orchestrator (cache read/write via
       jsonb || merge, Apollo match-key fallback chain, site fetch, one
       tracedGenerateObject, linkedinUrl backfill, in-flight map).
       Verify: tsc; manual route hit in step 9.
6. [ ] `app/api/call-mode/prospect-brief/route.ts`: GET, withAuthRLS,
       400/404/200 contract. Verify: curl-equivalent via Playwright fetch.
7. [ ] `_panels.tsx`: ProspectBriefCard (client fetch + dedupe map, skeleton,
       two halves, LinkedIn Profil/Posts récents links, sources line, honest
       fallbacks) inserted after the chips row in PreCallBrief.
       Verify: live UI in step 9.
8. [ ] `src/__tests__/prospect-brief.test.ts` on core helpers. Verify: vitest
       green from app/apps/web.
9. [ ] Live eval (hostile): dev server, minted pilae session, Playwright —
       fresh build, cached re-open, no-domain fallback, fiche regression.
10. [ ] Commit + push + PR + preview green + merge. Doc/memory update.
