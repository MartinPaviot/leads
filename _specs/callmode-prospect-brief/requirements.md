# callmode-prospect-brief — Requirements

## User story

As a rep about to dial a prospect in Call Mode, I want a quick brief on
(1) who the person is — career background, with a one-click path to their
recent LinkedIn activity — and (2) what the company actually does according
to its own website, so I open the call informed without leaving the cockpit.

## Acceptance criteria

1. GIVEN a queued prospect is selected in Call Mode (idle, pre-call)
   WHEN the fiche renders
   THEN a "brief" card auto-loads (skeleton while building) showing:
   - **Le prospect**: a 1-2 sentence factual background (French) plus a
     deterministic career timeline (title, org, years — max 3 lines), and,
     when a LinkedIn URL is known, "Profil" + "Posts récents" links
     (recent-activity URL — we do NOT scrape posts; no LinkedIn data source
     exists yet, Unipile is a separate spec).
   - **L'entreprise — d'après le site**: 2-3 factual sentences (French)
     synthesized from the company's real homepage text, with the source
     domain shown.

2. GIVEN the brief was already built for this contact/company
   WHEN the fiche re-opens within 30 days
   THEN the card renders from cache (no Apollo call, no site fetch, no LLM).

3. GIVEN Apollo cannot match the person (or returns no employment history)
   THEN the person half degrades honestly: CRM title only, or an explicit
   "Parcours non trouvé" line. Never invented content.

4. GIVEN the company has no domain, or the site is unreachable/empty
   THEN the company half shows an honest unavailable line. Never invented.

5. GIVEN the LLM is unconfigured or fails
   THEN deterministic parts still render (career timeline, meta description
   verbatim labelled as such); LLM-text parts are empty — fail-closed.

6. GIVEN the LLM returns text not grounded in the provided inputs
   (no person data / site text below threshold)
   THEN the corresponding text is rejected server-side (forced empty).

## Edge cases

- Contact with no company / company without domain → person half only.
- employment_history entries missing dates, org, or title → skipped/partial.
- Apollo person matched via name+domain when linkedinUrl absent; discovered
  linkedin_url is written back to contacts.linkedinUrl (fills the gap).
- Apollo no-match is cached too (30d) — no per-open re-spend.
- React StrictMode double-mount → single in-flight request (client dedupe).
- Viewer role: GET route (read semantics) — not blocked by the write gate.
- Site HTML > 250KB → capped by existing fetcher; text capped ~6k chars.
- LLM refusal/apology text → sanitized to empty.

## Evaluation steps

1. Open Call Mode on the seeded campaign (martin.paviot@pilae.ch session),
   select a prospect with company domain → card appears after build,
   both halves filled, sources line present.
2. Re-select the same prospect → instant render (cache).
3. Select a prospect without domain → honest company-half fallback.
4. Unit tests green (core helpers); tsc green; no regression on fiche.
