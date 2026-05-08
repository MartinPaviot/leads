# Audit 2026-05-08 — Monaco-Parity P0 + observability stack

> Hostile QA. Guilty until proven innocent.
> Per CLAUDE.md §Phase 6 — every claim is suspect until evidence is on disk.

## User story

GIVEN we shipped 74 commits in this session — 9 P0 merge branches +
schema-collision fix (`eval_runs` split → migration 0050) + PostHog
SDK upgrade (autocapture / replay / identify / tenant-grouping) +
admin app import repoint + 50→0 TS-error sweep + mètis-aligned stall
evidence,

WHEN the founder needs a single PASS/FAIL verdict on each feature
BEFORE pushing main to `origin` or letting Vercel deploy,

THEN this audit runs end-to-end and produces, per feature, a
quotable evidence package on disk + an aggregate verdict, with no
unverified claim left standing.

The audit is the inversion of the philosophy of the build : the
build prizes mètis (adaptive ruse), the audit prizes mnemosyne
(memory + evidence). Nothing passes on assertion. Everything
passes on a screenshot, a query result, or a captured event.

## Scope — what's being audited

The 16 features below, in dependency order. Cross-references give the
commit hash so the audit can `git show <hash>` a feature's diff
without searching.

| # | Feature | Commit | Migrations |
|---|---|---|---|
| F1  | P0-3 onboarding wizard polish + autosave + velocity tile | `7ea5c42` | — |
| F2  | P0-4 coaching grounded + video player + freshness alerts | `a2e85d1` | — |
| F3  | Speaker-aware transcript retrieval bias                   | `0ea53ea` | — |
| F4  | Eval per-case persistence + admin drilldown              | `b665a90` | 0047 |
| F5  | Eval prompt-variant A/B framework                        | `b8ac431` | — |
| F6  | P0-5 deal autofill cascade + LLM synthesise worker       | `a1964e7` | 0044 |
| F7  | P0-1 sequence drafts queue + manual approval mode        | `545c6cf` | 0045, 0046 |
| F8  | P0-2 visitor-id complete (Snitcher / RB2B / Clearbit)    | `ddd7d8d` | 0048, 0049 |
| F9  | SHIP_GUIDE merge-train doc                               | `901c6ab` | — |
| F10 | Post-merge TS hygiene (4 spots, 0 behaviour change)      | `b09cef9` | — |
| F11 | Schema-collision split — `eval_runs` → `llm_eval_runs`   | `8e1ef53` | 0050 |
| F12 | PostHog autocapture + session replay (root layout)       | `36deb11` | — |
| F13 | PostHog boundary-tripped events                          | `ac1d20a` | — |
| F14 | Admin app — `@web/lib/agent-registry` repoint            | `d7a8a5e` | — |
| F15 | PostHog chat_message_sent + home_action_clicked          | `9184505` | — |
| F16 | CSP whitelist PostHog EU hosts                           | `f484f98` | — |
| F17 | Stall indicators carry concrete evidence (mètis)         | `e9b95f4` | — |

(F9 is documentation only — passes by inspection, no runtime audit.)

## Acceptance criteria for the audit itself

The audit is **complete** when every row of `tasks.md` is checked
off and `_reports/audit-2026-05-08/SUMMARY.md` carries a PASS/FAIL
verdict per feature with an evidence-file pointer for each
dimension scored.

The audit is **passing** (and the head commit is push-safe) when :

- **0 features at score < 0.7 on any dimension** (hard gate)
- **Mean score across 16 audited features ≥ 0.85**
- **No regression test added during audit fails** (catches the
  guilty-until-proven-innocent loop : every issue uncovered must
  end as a vitest case so the next build can't lose what we
  re-verified manually)

## Evaluation rubric (5 dimensions per feature)

Per CLAUDE.md §Phase 6 — score each on 0.0-1.0, hard threshold 0.7
per dimension :

| Dimension | What it asks |
|---|---|
| **Functional correctness** | Does the feature do exactly what the RUNBOOK / spec promised ? |
| **Integration** | Does it compose cleanly with neighbouring features (no broken contracts at the seam) ? |
| **Failure modes** | Graceful when env / network / DB is missing — never a silent drop, always a logger.warn or visible UI fallback ? |
| **Observability** | Can we *see* it working in production (metric, log, telemetry event, PostHog dashboard) without SSH into a worker container ? |
| **UX / polish** | Does it match the design language we set up (no emoji per memory ; brand reads "Elevay" not "LeadSens" ; no hype copy) ? |

**Score calibration** :

| Score | Meaning |
|---|---|
| 0.0  | Crashes or doesn't load |
| 0.3  | Loads but doesn't do what the spec says |
| 0.5  | Happy path works, edge cases broken |
| 0.7  | Happy path + edge cases work, polish missing |
| 0.85 | Full functional + observable + graceful |
| 1.0  | Ahead of spec (e.g. P0-2 spec asked for one provider, we shipped a 3-provider fallback chain → 1.0 on functional) |

## Edge cases the audit must catch

These are the failure modes that pass tsc + vitest but fail in
production. Each gets at least one targeted check in `tasks.md` :

1. **Migration that runs locally but fails on prod** (the
   `eval_runs` collision is exactly this class — `IF NOT EXISTS`
   was a no-op but vitest didn't notice because it mocks the DB).
   → L4 layer replays migration 0050 against a fresh + against a
     prior-state DB.
2. **Worker registered but never fires** (event topic typo,
   Inngest dashboard mismatch).
   → L5 manually triggers each new event topic.
3. **Autocapture call site that fires but lands with `null`
   distinct_id** because identification raced.
   → L3 + L6 inspect the actual PostHog `$identify` then `$autocapture`
     ordering in the network panel.
4. **CSP that blocks PostHog only in production** (the prod
   header is set per-env ; CSP fix at `f484f98` could regress
   silently).
   → L6 curls the deployed `/` and greps the response header for
     `eu.i.posthog.com`.
5. **Test that mocks the DB so well it never hits the schema
   split bug we just fixed** — vitest passed both before and
   after the bug was real.
   → L4 hits the actual `/api/admin/llm-evals` route end-to-end
     against a real Postgres after applying every migration in
     order.
6. **Per-tenant settings ignored** because the migration that
   backfills `settings.approvalMode='manual'` only touched rows
   that existed at apply time ; new tenants might still default
   to `auto`.
   → L4 inserts a new tenant + verifies the default.
7. **Stall indicator evidence empty when buyer-intent scoring
   throws** — the catch swallows but the UI must still render
   the chip without a ghost bullet list.
   → L3 forces a buyer-intent throw + screenshots the deal page.
8. **Rejection learner that runs but doesn't actually update
   `sequences.campaignConfig.rejectionInsights`** because of an
   optimistic-lock conflict.
   → L7 (over time) — verify after a week's worth of rejections.

## Out-of-scope

- Visual redesign of any surface (audit verifies fidelity to existing
  design, doesn't propose new design).
- Performance benchmarking (separate effort — load testing belongs
  in its own spec).
- Penetration / security review (handled by `/security-review` skill
  on a separate pass).
- Multi-tenant data isolation review (RLS coverage was migration
  0038's concern ; trust that prior audit).

## Definition of done

A signed-off `_reports/audit-2026-05-08/SUMMARY.md` that :

1. Names every commit in scope (74 commits, 16 features),
2. Scores each feature on all 5 dimensions,
3. Cites the evidence file backing each score,
4. Lists every regression test added during audit (so reruns are
   automated next time),
5. Names the deploy-readiness verdict : **GO** / **NO-GO** / **GO with patches**,
6. If NO-GO, explicitly names what must be patched to flip to GO.
