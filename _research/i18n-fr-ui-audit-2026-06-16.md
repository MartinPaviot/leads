# FR → EN UI debt — scoped audit (2026-06-16)

Trigger: the "UI in English" rule (product chrome English; only Pilae business
content — call scripts / knowledge — stays FR). Existing already-merged code drifted
FR. This scopes the debt so it can be swept cleanly instead of chipped piecemeal.

## Scope (measured)
- **~82 FR user-facing strings across 15 `.tsx`** (string literals with French
  accents), **plus** more in `.ts` (e.g. `lib/calllist/reachability.ts` labels) and
  any unaccented FR ("Pas de mobile", "Numéro hors-CH").
- **Concentration — Call Mode (~53 of 82):** `_panels.tsx` (25), `_call-script.tsx`
  (20), `page.tsx` (8), `_reachability-info/_reachability-summary` (3).
- **Scattered chrome (the clear part):** `settings/sending-infrastructure` (8),
  `settings/recording` (3), `components/meeting-scheduler` (4),
  `collision/contact-collision-notice` (2), `meetings/[id]/_meeting-recorder` (1),
  `accounts/page` (1), `insights/pilae/page` (1).

## The real blocker — a shared FR time formatter
`lib/contacts/role-status.ts` exports **`relativeFr`** ("il y a 2 semaines"), used by
`reachability.ts` (and others). Translating any one consumer to English produces an
**EN-label / FR-date** mix. A clean pass needs an **English relative-time** (a
`relativeEn`, or a proper i18n layer) applied everywhere those dates render — this is
why piecemeal fixes are worse than none.

## Categorization (recommendation — Martin confirms)
| Zone | Call? | Verdict |
|---|---|---|
| Call Mode `_call-script.tsx` (script text, openers, sector knowledge) | yes | **KEEP FR** — Pilae business content (the rule's exception) |
| Call Mode `_panels.tsx` / `page.tsx` (mix: script chrome vs buttons/labels) | yes | **ASK per-string** — buttons/status = EN, script content = FR |
| `reachability.ts` labels + `_reachability-*` (Mobile suisse / Joignable / Poste vérifié · il y a X) | shown in Call Mode | **AMBIGUOUS** — chrome by nature, but rendered inside the FR rep call screen → Martin's call |
| `settings/sending-infrastructure`, `settings/recording`, `meeting-scheduler`, `collision-notice`, `_meeter-recorder`, generic toasts ("Erreur réseau", "Site injoignable…") | no | **TRANSLATE** — unambiguous product chrome |

## Why NOT piecemeal
1. `relativeFr` ripple → EN/FR date inconsistency unless swept together.
2. Call Mode is mostly intentional Pilae FR; blind translation would flip business
   content the rule explicitly protects.
3. The chrome-vs-content split inside Call Mode needs a human judgment per zone.

## Recommended approach (a dedicated sweep, ~1 focused branch)
1. Add an English relative-time helper (or adopt an i18n lib) and migrate the
   chrome consumers off `relativeFr`.
2. Translate the **unambiguous chrome bundle** (settings × 2, meeting-scheduler,
   collision-notice, meeting-recorder, generic toasts) — safe to do now.
3. Martin decides the **Call Mode** split (reachability labels + `_panels`
   buttons = EN? script/knowledge = FR). Then translate the agreed chrome.
4. Optional guardrail: an ESLint rule banning accented string literals in chrome
   dirs (`settings/`, `components/`, non-call-mode pages) to stop re-drift.

## Decision needed from Martin
- For **Call Mode** (reachability facts/labels + `_panels` buttons): English chrome,
  or keep FR because it's the Pilae rep's French call screen?
- Green-light to translate the **unambiguous chrome bundle** now (settings × 2,
  meeting-scheduler, collision-notice, meeting-recorder) with a `relativeEn` helper?
