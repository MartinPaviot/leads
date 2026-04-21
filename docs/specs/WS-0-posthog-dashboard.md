# WS-0 — PostHog Dashboard Spec

**Purpose:** describe the PostHog UI configuration Martin (or whoever holds PostHog admin) applies manually after WS-0 PR 2 ships. PostHog has no repo-committable dashboard format that we already use, so this doc is the source of truth. Apply once, keep in sync by editing this file + the UI together.

**Apply when:** WS-0 PR 1 + PR 2 + PR 3 are merged to `main` and the first onboarding events are visible in PostHog Live Events (typically <5 minutes after a fresh signup).

**Scope:** 1 dashboard, 4 insights, 2 funnels, 1 cohort. Everything else (chat volume, sequence sends, etc.) stays on whatever dashboards already exist — WS-0 adds a single focused "Onboarding baseline" surface.

---

## Dashboard: "Onboarding baseline (v1)"

Tags: `onboarding`, `ws-0`, `baseline`
Description: v1 onboarding funnel + latency + drop-off. Frozen as the pre-refactor baseline; WS-5 ramp adds a v2 variant alongside for comparison.
Time range default: **Last 14 days**, grouped by day.

The dashboard holds the 4 insights + 2 funnels + 1 cohort described below, arranged in this order top-to-bottom:

1. **Funnel — Signup → Onboarding complete** (wide, top)
2. **Funnel — OAuth complete → dashboard land with data (TTFAA v1 proxy)** (wide, second row)
3. **Insight — Per-step median + p95 duration** (half width)
4. **Insight — Drop-off % per step** (half width, alongside #3)
5. **Insight — API latency distribution by endpoint** (half width)
6. **Insight — TAM build success vs failure by error class** (half width, alongside #5)
7. **Cohort — "Founder-led OAuth users"** (sidebar or right panel)

---

## 1. Funnel: Signup → Onboarding complete

**Insight type:** Funnel
**Name:** `Onboarding v1 — Signup to Complete`
**Steps** (strictly ordered, matching):

| Step | Event | Filter |
|------|-------|--------|
| 1 | `signup_completed` | — |
| 2 | `onboarding_started` | — |
| 3 | `onboarding_step_completed` | property `step` = `"welcome"` |
| 4 | `onboarding_step_completed` | property `step` = `"connect"` |
| 5 | `onboarding_step_completed` | property `step` = `"product"` |
| 6 | `onboarding_step_completed` | property `step` = `"icp"` |
| 7 | `onboarding_build_tam_triggered` | — |
| 8 | `onboarding_build_tam_completed` OR `onboarding_build_tam_failed` | — (either terminal state of the TAM build) |
| 9 | `onboarding_completed` | — |

**Conversion window:** 24 hours.
**Breakdown:** none at the funnel level (keep it clean); add breakdowns in the insights below.

**What to look for:**
- The biggest single-step drop is the v1 diagnosis. Per the audit, the two most likely candidates are Step 4→5 (product → ICP — the 113-item industry dropdown friction) and Step 7→8 (TAM build — the 30-90s wait).
- If Step 2 is much lower than Step 1, the wizard mount is broken (PR 2 regression) — investigate immediately.

---

## 2. Funnel: OAuth complete → dashboard land with data (TTFAA v1 proxy)

**Insight type:** Funnel
**Name:** `TTFAA v1 proxy`
**Steps:**

| Step | Event | Filter |
|------|-------|--------|
| 1 | `ttfaa_started` | — |
| 2 | `ttfaa_completed_v1_proxy` | — |

**Conversion window:** 30 minutes (tight — TTFAA should be seconds, not minutes).
**Breakdown:** property `provider` on step 1 (`google` vs `microsoft-entra-id`).

**Secondary insight — TTFAA duration distribution:**
- Insight type: Trends → formula
- Property: `ttfaa_completed_v1_proxy.durationMs`
- Aggregation: histogram with buckets `[0, 10s], (10s, 30s], (30s, 60s], (60s, 120s], (120s, 300s], (300s, ∞)`
- Median (p50) and p95 displayed alongside.

**Target numbers** (per master brief §6):
- p50 ≤ 90 s.
- p95 ≤ 180 s.
- v1 proxy baseline is what we measure today to set the refactor's "must not regress below" floor.

---

## 3. Insight — Per-step median + p95 duration

**Insight type:** Trends
**Event:** `onboarding_step_completed`
**Aggregation:** median `durationMs` and p95 `durationMs` (two series).
**Breakdown:** property `step` (so each step gets its own line).
**Chart:** Time series, daily.

**What to look for:**
- Any step with p95 > 120 s is a UX friction hotspot.
- `step=icp` p95 is expected to be high (users adjust multiple filters); the metric tells us whether the "live Apollo count" chip in WS-2 actually reduces the time.

---

## 4. Insight — Drop-off % per step

**Insight type:** Trends
**Event:** `onboarding_step_completed`
**Aggregation:** unique users per step, expressed as % of `onboarding_started` users.
**Breakdown:** property `step`.
**Chart:** bar chart, one bar per step, newest period first.

**What to look for:**
- Exit condition for WS-0 is: identify the **2 highest-friction steps with numbers**. This insight is the primary artifact.

---

## 5. Insight — API latency distribution by endpoint

**Insight type:** Trends
**Event:** `onboarding_api_latency`
**Aggregation:** median and p95 `durationMs`.
**Breakdown:** property `endpoint`.
**Chart:** time series, daily.
**Filter:** exclude rows with `status < 200` (network errors — tracked separately in insight #6).

**Target endpoints covered:**
- `/api/onboarding/enrich-icp`
- `/api/onboarding/find-contacts`
- `/api/onboarding/email-intelligence`

LLM-traced endpoints (`analyze-website`, `tam`, `narrate-website`) are NOT in this insight — see the "Agent health dashboard" elsewhere, backed by `agent_traces`. For a cross-check, hit `GET /api/admin/onboarding-metrics?since=<date>` — it returns per-agent p50/p95/p99 from the DB side.

---

## 6. Insight — TAM build success vs failure by error class

**Insight type:** Trends
**Events:** `onboarding_build_tam_completed` + `onboarding_build_tam_failed`.
**Aggregation:** count of unique users per event.
**Breakdown on failures:** property `errorClass`.
**Chart:** stacked bar chart by day; legend shows success (green) vs each errorClass (red family).

**What to look for:**
- Failure rate > 10% is critical — either Apollo is flaky, or the LLM strategy generator is producing invalid filter sets.
- `errorClass` distribution tells us which kind of failure dominates. The brief §4.4 severity tiering helps decide UX treatment for each.

---

## 7. Cohort — "Founder-led OAuth users"

**Cohort type:** Behavioral
**Definition:**
- performed event `onboarding_completed` in the last 30 days
- AND performed event `onboarding_email_connected` with property `provider` = `google` OR `microsoft`
- AND performed event `onboarding_step_completed` with property `step` = `"product"` where `salesMotion` = `"Founder-led sales"` — NOTE: `salesMotion` is on the `primaryChallenge`-adjacent save, not on the event. We actually need to identify founder-led users via the user property set on `identifyUser` calls. FOLLOW-UP: add `salesMotion` to the `identifyUser` properties so this cohort works natively. File as BUG-WS0-010 in the bug inventory.

**Interim workaround:** filter by provider only (Google/Microsoft OAuth completion) and accept that "founder-led" is the 80%+ majority for early-stage signups.

**Use:** every WS-0 insight above should have the option to filter to this cohort so the baseline reflects our actual target audience.

---

## Applying this spec to PostHog

1. Log into PostHog as an admin.
2. Create a new dashboard titled `Onboarding baseline (v1)`.
3. Create each insight and funnel per the tables above. PostHog's "Save to dashboard" puts them on the new board.
4. Create the cohort separately in the "Cohorts" section, then attach as a filter to each insight.
5. Pin the dashboard to the project's top-level shortcut bar.
6. Share the dashboard link with the team in `#growth` (or the equivalent).

---

## Exit verification

WS-0 exit condition (per `WS-0-plan.md §5.3`) is signed off when:
- ≥ 30 distinct signup sessions in the last 3 days on this dashboard.
- Insight #4 surfaces the 2 highest-friction steps with clear numbers.
- Insight #3 shows the expected per-step duration distribution (sanity: `welcome` is fast, `icp` and `building` are slow).
- TTFAA funnel (insight #2) has data with a median that's believable for a v1 flow (likely 60-180 s, matching our hypothesis).
- No gap ≥ 12h in the event stream (instrumentation isn't dropping out silently).

After exit, copy the numbers into `docs/specs/WS-0-retro.md` as the pre-refactor baseline. Every subsequent workstream compares against those numbers.
