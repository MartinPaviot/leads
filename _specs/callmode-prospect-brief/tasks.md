# callmode-prospect-brief — Tasks

1. [x] Spec (this folder).
2. [x] Branch `feat/callmode-prospect-brief` off main.
3. [x] `apollo-client.ts`: add optional `employment_history` to ApolloPerson
       (additive type widening). Verified: tsc.
4. [x] `lib/call-mode/prospect-brief-core.ts`: pure helpers + types.
       Verified: 20 unit tests.
5. [x] `lib/call-mode/prospect-brief.ts`: orchestrator. Verified: tsc + live.
       Eval fixes: site timeout 6s→15s (Swiss SMB homepages take 8-12s —
       afiro.ch measured at 10.7s, was caching an empty company half);
       fresh person half is reused without an Apollo re-match when only
       the company half rebuilds.
6. [x] `app/api/call-mode/prospect-brief/route.ts`: GET. Verified live.
7. [x] `_panels.tsx`: ProspectBriefCard in PreCallBrief. NOTE: the JSX
       insertion was clobbered once by a concurrent editor save — re-applied
       and verified rendered.
8. [x] `src/__tests__/prospect-brief.test.ts` — 20/20 green (run from
       app/apps/web).
9. [x] Live eval (minted pilae session, 127.0.0.1:3000):
       - Afiro / Fabien Courvoisier: person half grounded (DG since 2023,
         Mobilet history matches the 5 cached career entries), timeline,
         Profil + Posts récents links; company half = real afiro.ch summary
         (insertion AI, 4 sites) with "Synthèse du site · afiro.ch" source.
       - Bricks.co / Ines Dias: PwC→Sogenial→Bricks career + AMF/10€/230M€
         site summary.
       - Failed-fetch path exercised for real (pre-fix): honest "Site
         injoignable" + cached-empty short TTL, then recovery after fix.
       - Full reload → card renders from DB cache in seconds, no rebuild.
       - 0 console errors; fiche regression OK (Autorité/Signaux/Relation/
         dossier/script intact).
       Screenshots: screenshots/001 (Afiro), 002 (Bricks).
10. [ ] Push + PR + preview green + merge. Doc/memory update.
