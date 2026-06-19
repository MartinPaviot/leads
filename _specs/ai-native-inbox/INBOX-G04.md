# INBOX-G04 — Signal surfacing (funding / hiring / intent) in-thread (freshness-gated, cited)
> Theme: T7 · Autonomy rung: helper · Priority: P1
> Pillar: P5 GTM moat

## User story
As a founder reading a prospect's email, I want the live buying signals on their company — recent
funding, active hiring, web/intent activity — surfaced in-thread but only while they're still
fresh, each cited, so I can ground my reply in a real, current reason to engage.

## Why (audit anchor)
Monaco's bar is signal-based prioritization; The Method (step 7) states it plainly: citing a stale
signal is **worse than citing none** because it proves the outreach is automated
(`lib/signals/freshness.ts:1`). Superhuman has no signal graph at all — its sidebar shows static
social links (`findings.md` §D). We have the signal engine **and** the freshness SSOT
(`isSignalFresh`, per-type TTLs), so we can surface "Série A · il y a 2 mois" in-thread and
automatically suppress a hiring signal once it's older than 30 days. That truthful, time-bound,
cited surfacing is the moat over a generic enriched-contact card.

## Requirements (EARS)
- WHEN a conversation is open, the system SHALL surface the resolved company's signals in the GTM
  sidebar, each with a citation (source label "via Elevay" + observed date) and a human one-liner.
- The system SHALL apply `isSignalFresh` (`lib/signals/freshness.ts`) per signal type and SHALL
  suppress any signal past its TTL — never display a stale signal.
- The system SHALL treat a structural fact with `null` TTL (e.g. investor overlap) as always fresh,
  and a signal with no observed date as fresh (the conservative "keep" rule).
- The system SHALL group signals by family (funding / hiring / intent / leadership / tech) and SHALL
  order them by recency within a family.
- The system SHALL render each signal as a sober chip (no status-jewelry icon) with one lucide glyph
  per family, a tooltip carrying the citation, and the relative observed age.
- WHEN no fresh signal exists, the system SHALL show nothing for signals (no "0 signals" noise, no
  invented signal).
- The system SHALL hard-scope to the viewer's tenant and SHALL NEVER name the upstream data vendor
  ("Série A" not "Crunchbase: Series A").
- The system MAY offer the freshest signal as a one-click "use as opening reason" that feeds the
  grounded draft (INBOX-G08), reusing the same freshness gate.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a company with a funding signal observed 60 days ago WHEN opened THEN it shows "Levée de
  fonds · il y a 2 mois" with a citation (funding TTL = 180 d, still fresh).
- GIVEN a hiring signal observed 45 days ago WHEN opened THEN it is suppressed (hiring TTL = 30 d).
- GIVEN a `website_visit` signal observed 10 days ago WHEN opened THEN it is suppressed
  (website_visit TTL = 7 d).
- GIVEN an `investor_overlap` structural fact WHEN opened THEN it always shows (null TTL).
- GIVEN a signal with no observed date WHEN opened THEN it is kept (conservative rule).
- GIVEN a company with no fresh signal WHEN opened THEN the signals area is empty, not "No signals".
- GIVEN the sidebar WHEN any signal chip is shown THEN no provider name appears and the tooltip
  cites "via Elevay" + the date.
- GIVEN two tenants WHEN signals render THEN only the viewer-tenant's signals appear.

## Edge cases & failure handling
- Unknown / unmapped signal type → `DEFAULT_SIGNAL_TTL_DAYS` (90 d) applies, never "lives forever".
- Future-dated signal (clock skew) → kept (the `ageDays < 0 → keep` rule).
- Signal store empty / lookup fails → render nothing, never block the body or throw.
- Mixed fresh + stale of the same type → only the fresh ones surface.
- Borderline at TTL boundary → `<=` is inclusive (a 30-day-old hiring signal is still fresh).
- Locale → relative age + family label in the user's UI language.

## Best-in-class bar
- **Freshness is enforced, not decorative**: the same `isSignalFresh` SSOT already used in scoring,
  drafts and calls is applied in-thread, so the inbox never shows a stale signal — the explicit
  anti-pattern The Method warns against. Superhuman shows no signals; a generic CRM would show them
  all, stale included.
- **Cited + vendor-blind**: every signal carries provenance ("via Elevay" + date) and never leaks
  the upstream source name, matching our UI DNA and the citation bar.

## Design sketch
- **Data:** signals (today carried on `companies.properties`/`scoreReasons` and the scoring
  pipeline; see `lib/scoring/score-with-signals.ts`); freshness via `SIGNAL_TTL_DAYS` +
  `isSignalFresh` + `filterFreshSignals` (`lib/signals/freshness.ts:31,80,100`).
- **API:** extend `GET /api/inbox/context` (G01) to include `signals[]` already passed through
  `filterFreshSignals`, each `{ family, label, observedAt, citation:"via Elevay" }`. Reuse whatever
  signal assembler the priority scorer uses so the inbox and the queue agree.
- **UI:** a "Signaux" sub-section in the G01 sidebar (`_conversation-pane.tsx`): family chips using
  the sober one-glyph-per-family idiom (lucide `TrendingUp` funding, `Users` hiring, `MousePointer`
  intent, `UserCog` leadership, `Cpu` tech), `--color-accent-soft` background, tooltip with the
  cited date. No badge for absent signals. Shortcut: within the sidebar. Light+dark via tokens, no
  emoji, no provider name, every chip cited.
- **AI:** the one-liner is a deterministic template over the signal fields (no generation) so there
  is nothing to hallucinate; only the optional "opening reason" handoff feeds G08.
- **Security/perf:** tenant scope; freshness filter applied server-side; signals computed by the
  existing pipeline, just read here.

## Tasks (ordered)
1. Reuse the scorer's signal assembler → pass through `filterFreshSignals` → shape `signals[]` for
   the context endpoint. (verify: stale hiring dropped, fresh funding kept) (test: freshness-gate
   test mirroring `SIGNAL_TTL_DAYS` boundaries)
2. Add `signals[]` to `GET /api/inbox/context`. (verify: API returns only fresh, cited signals)
   (test: route test — TTL boundary cases)
3. "Signaux" sidebar sub-section with sober family chips + cited tooltips. (verify: browser — fresh
   funding chip shows, stale hiring absent) (test: render + empty-state test)
4. Optional "use as opening reason" handoff to G08. (verify: clicking feeds the fresh signal into
   the grounded draft) (test: handoff passes the freshness-gated signal only)

## Current-state notes (VERIFY before building — code moves)
- `lib/signals/freshness.ts` is the SSOT: `SIGNAL_TTL_DAYS` (`:31`), `isSignalFresh` (`:80`),
  `filterFreshSignals` (`:100`), `DEFAULT_SIGNAL_TTL_DAYS = 90` (`:63`). It is already applied at
  scoring, drafts (`lib/context/prospect-context.ts`) and calls (`lib/call-mode/live-script.ts`).
  **Reuse it; never re-implement TTLs.**
- Signal data lives with the scoring pipeline (`lib/scoring/score-with-signals.ts`,
  `priorityScore`/`scoreReasons` on `companies`, `db/schema/core.ts:84,65`) — confirm the exact
  signal shape there before wiring (it moves).
- No inbox signal surface exists yet (grep: none in `_conversation-pane.tsx` for signals).
- UI DNA: sober one-icon-per-family, no status-jewelry (`feedback_no-status-jewelry-icons`); no
  provider names (`_UI-DNA.md`).
