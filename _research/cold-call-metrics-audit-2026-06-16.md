# Cold-call metrics audit — what experts measure vs what Elevay surfaces

Date: 2026-06-16 · Branch: feat/call-readiness-insights · Trigger: Martin —
"ajoute le NRP, c'est essentiel; cherche aussi tout ce que mesurent les experts
cold-call qu'on ne mesure pas encore."

## 1. What the experts measure (sourced benchmarks)

Canonical cold-calling KPI set, with 2025-2026 B2B benchmark bands:

| KPI | Benchmark (typical → top) | Source |
|---|---|---|
| Connect rate (reached the human / dials) | 5-12% → 25%+ | skipcall, cleverly |
| Dials to connect | ~18 dials / connect | martal, skipcall |
| Dials to meeting | ~40-45 → 12-20 | saleshive, skipcall |
| Meeting-booked rate (per dial) | ~2.3-2.5% → 5-8% | saleshive |
| Talk time / day (live) | 90-120 min | outboundsalespro |
| Talk-to-listen ratio (agent share) | ~55% (band 40-70) | Gong, our lever-scoring |
| Quality conversation rate | core KPI | scalelist, prospeo |
| Meeting show rate | 75-80% | martal |
| Bad-number / data-quality rate | <3% connect ⇒ data problem | skipcall |
| Best time to call (connect rate by hour/day) | timing discipline | OSP, ConnectAndSell lore |

Key expert insight (recurring across sources): **connect rate beats dial count** —
80 dials into dead numbers lose to 40 into a clean list. So the rates that explain
*why a dial did or didn't reach a human* (NRP, voicemail, busy, bad-number,
gatekeeper) are the operational core, not vanity dial totals.

## 2. What Elevay already CAPTURES (columns on `calls`)

- `outcome` enum (11): connected, voicemail_left, no_answer, busy, gatekeeper,
  wrong_number, do_not_call, meeting_booked, callback_requested, not_interested,
  failed → **full outcome distribution is already in the DB.**
- `startedAt` / `connectedAt` / `endedAt` → ring & time-of-day & day-of-week.
- `durationSec` → call length; `talkTimeSec` → prospect talk seconds (diarised).
- `answeredBy` (Twilio AMD: human/machine_*).
- `leverScores.talkRatioPct` → agent talk share (already computed per call).
- `scriptContext` → reason-anchored A/B seed.
- `voiceUsageMonthly`: callsAttempted, callsConnected, minutesUsed.

## 3. What Elevay SURFACES today (the gap)

`/api/calls/campaign/stats` + `_funnel-bar.tsx` show only:
callsToday/quota · week goal · meetings · cadence(status) · callable · script A/B.

**No rate is shown anywhere.** Absolute `connects_week` / `meetings_week` exist but
there is no connect rate, no NRP, no outcome breakdown, no dials-to-meeting, no
talk-time/ratio aggregate, no best-time-to-call.

## 4. Gap table — this build

| Metric | Data exists? | Surfaced before? | This build |
|---|---|---|---|
| **NRP rate** (no_answer/dials) | yes | NO | funnel cell + modal |
| **Connect rate** (reached/dials) | yes | partial (abs only) | funnel cell + modal |
| Voicemail rate | yes | no | modal |
| Busy rate | yes | no | modal |
| Bad-number rate (wrong_number) | yes | no | modal |
| Gatekeeper rate | yes | no | modal |
| Not-interested rate | yes | no | modal |
| Meeting rate (per dial) | yes | partial | modal |
| Meeting conversion (per connect) | yes | no | modal |
| Dials per meeting | yes | no | modal |
| Dials per connect | yes | no | modal |
| Avg connected-call duration | yes (durationSec) | no | modal |
| Total / daily talk time | yes (durationSec) | no | modal (vs 90-120 band) |
| Talk ratio (agent %) | yes (leverScores) | per-call only | modal aggregate (vs 40-70 band) |
| **Best time to call** (connect rate by hour, local tz) | yes (startedAt) | no | modal |
| Best day of week | yes | no | modal |

Connect definition (SSOT in `lib/voice/call-metrics.ts` CONNECT_OUTCOMES):
reached the target human = connected + meeting_booked + callback_requested +
not_interested. Gatekeeper EXCLUDED (reached a human, not the target → its own rate).

Rates gated by a 20-dial floor (repo no-noise convention, cf. cohort-insights):
below floor → shown as "—" with "échantillon insuffisant", never a noisy %.

## 5. Oceans (flagged, NOT in this build — need new instrumentation)

- **Longest monologue / questions-asked / interactivity** (Gong-grade conv analytics):
  we store `transcript` jsonb but aggregating chunk-level speech patterns is a
  separate pass. Phase 2 candidate (data is there, the analysis isn't).
- **Meeting show rate / no-show**: needs the booked meeting's *held* outcome tracked
  back; lives in meetings domain, not call-mode. Out of scope here.
- **Prospect-local-time dialing**: best-time uses the rep's local tz (passed from the
  browser). True prospect-local timing needs per-contact timezone — not stored yet.

## 6. Build artifacts

- `lib/voice/call-metrics.ts` — pure: CONNECT_OUTCOMES, computeCallMetrics, bestWindows, benchmark bands.
- `src/__tests__/call-metrics.test.ts` — floor guard, rate math, best-window ranking.
- `app/api/calls/metrics/route.ts` — 30d window, tz-aware timing, scope me/team.
- `app/api/calls/campaign/stats/route.ts` — add no_answer_week; connects_week via CONNECT_OUTCOMES.
- `call-mode/_metrics-modal.tsx` — the expert dashboard.
- `call-mode/_funnel-bar.tsx` — NRP + Connect cells + "Détails" trigger.
