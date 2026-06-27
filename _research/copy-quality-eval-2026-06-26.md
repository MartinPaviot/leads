# Copy quality verification — 2026-06-26 (pre-launch)

> **Ask.** Before launching campaigns, verify the autonomous copy quality.
> **Method.** Sampled the 6 top-`priority_score` real prospects of the live tenant (`fdf9b795`, martin@elevay.dev) and generated the engine's **actual** outbound copy via the autopilot's real path (`generateCopyMessage` / `lib/copy/personalization/db-shadow`), plus a `forceRefresh` research pass (`prepareProspect`) on the top 3. **No sends.** Graded with the in-repo deterministic grader (`lib/evals/email-quality-grader.ts`) + the message's own `flags`/`personalization_level`/`evidence`, and cross-checked the brief + asset tables in prod.

## Verdict: NOT launch-ready — there is no copy to verify yet

The engine produces **empty messages** for the top prospects: blank body, no subject, `personalization_level: low`, `evidenceCount: 0`, `flags: [low-personalization, no-evidence]` — for **all 6** sampled (deterministic grade 0.57, see grader flaw below). Example output (verbatim) for the #1 and #2 prospects: **subject = (none), body = (empty)**.

So "is the copy good?" can't be answered as written — the engine isn't generating usable copy at all.

## Root causes (prod-confirmed unless noted)

1. **No copy assets exist — the launch blocker.** `copy_asset_block` (the asset store the copy engine assembles from) has **0 rows for this tenant and 0 across every tenant** in prod. The message = assets (value props / template / voice) + a grounded personalization line; with no assets, the body is empty regardless of research. This is the Monaco-onboarding prerequisite (hand over messaging/templates) — Elevay's "day-one pre-built" bet, but the asset store is empty.
2. **The evidence/brief layer is empty.** `prospectContextToEvidence` (`lib/copy/personalization/db-evidence.ts`) found **0 facts** → empty personalization line. The `intelligence_briefs` rows have `public_content_depth: 0`, no firmographics, empty `website_summary` (`sources_attempted: 2, succeeded: 1` but nothing extracted). *Caveat:* the 3 briefs queried were written by THIS eval's `forceRefresh` run, where `RESEARCH_AGENT_ENABLED` is **absent locally** (Vercel-only) and the research agent extracted nothing — so brief-emptiness is partly a **local-infra artifact**; a prod-side research check is needed to know if prod populates briefs. (The asset finding above is NOT local — it's a prod query.)
3. **The autopilot never researches per prospect.** `inngest/daily-autopilot.ts:109` calls `prepareProspect(tenantId, contactId, companyId)` with **no `forceRefresh`** → it relies on a pre-populated brief cache. Nothing wires brief population before enrollment, so even with assets the copy would be ungrounded unless briefs are filled first.
4. **The quality gate would not catch this.** `gradeEmail` scores an **empty body 0.57** (it never floors blank/missing content to ~0). So `eval:run` / the deterministic grader gives a passing-looking number on empty copy — a real gap in the eval gate.

## Recommendations (ranked, to do before any launch)
1. **Load copy assets** for the tenant (value props, proof points, template structure, voice/banned-phrases) into `copy_asset_block`. Until this exists, the engine cannot produce a body. *(P0 — the blocker.)*
2. **Guard the empty-body path**: `generateCopyMessage` should never return `body: ""` silently — emit a `no-assets`/`no-body` flag and have the enroll path refuse to send an empty message (a send-gate check). *(P0 — safety: prevents shipping blanks.)*
3. **Fix `gradeEmail`** to floor empty/near-empty bodies to ~0 so the eval gate catches non-copy. *(P1 — the gate missed it.)*
4. **Verify prod research** actually populates briefs (run one `forceRefresh` in prod with `RESEARCH_AGENT_ENABLED=1` + full web infra, check `public_content_depth > 0`); if not, the grounding layer is broken, not just empty. *(P1.)*
5. **Decide the autopilot's grounding contract**: either populate briefs before enrollment (a pre-pass) or have `prepare` `forceRefresh` per prospect (cost trade-off). *(P1.)*

## Honest caveats
- Local reproduction: `RESEARCH_AGENT_ENABLED` is Vercel-only (absent in `.env.local`); I set it but the local research agent still extracted nothing. The **asset** + **no-per-prospect-research** + **grader** findings are reproduction-independent; the **research-yields-nothing** finding needs a prod check.
- This eval wrote 3 (empty) `intelligence_briefs` rows to prod for the sampled companies (the engine's normal enrichment output) — harmless, they expire. No sends, no other writes.
