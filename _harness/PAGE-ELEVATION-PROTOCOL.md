# Page Elevation Protocol

Goal: bring every user-facing page to top-0.1% (feature / technologie / technique / UI), the way
the best Anthropic PM would. One page at a time, isolated, deep, meticulous. Output = a concrete
improvement spec per page, grounded in real code + live test + best-in-market teardown.

## Per-page phases (run in order, isolated per page)

A. INTRINSIC PURPOSE — JTBD + Forces of Progress
   - The job the user hires this page for (functional + emotional + social).
   - Primary user, their state on arrival, the moment of success ("definition of done" for them).
   - Push/pull/anxiety/habit forces that bring them here and block them.

B. PLACE IN THE GLOBAL FLOW — Service blueprint + jobs-to-loops + Hook model
   - Upstream (what routes the user here) / downstream (where they go next).
   - Data/state consumed and produced; the cross-page CONTRACTS (what must be true in/out).
   - Which core loops it participates in; what must work together for it to deliver its job.

C. CORRECT FUNCTIONING MODEL — first principles
   - The ideal interaction + data model derived from A+B, independent of current impl.
   - Full state machine: empty / loading / partial / error / success / edge.
   - The "expected behavior" spec (what a correct version does).

D. CURRENT REALITY (VERIFIED) — read + TEST
   - Read real code (page + components + API + flow links).
   - Drive it live with Playwright: capture every state (screenshots), confirm/deny code-inferred
     behavior, find broken/missing. "Test everything."
   - Coverage diff: required-set (from C) vs actual -> the gaps (BLOCKS / DEGRADES / TABLE-STAKES).

E. BEST-IN-MARKET TEARDOWN (top 0.1%) — feature-granular, cross-category
   - The 2-3 best implementations of THIS page type (decomposed, not whole-product).
   - Tear down their feature/tech/technique/UI with evidence (primary docs / Playwright / changelog).
   - Extract the patterns that define the ceiling.

F. FOUR-LENS ELEVATION — Kano + Google HEART, anchored 0-10 rubric (current -> target)
   - FEATURE: best-in-class capability set + the differentiator beyond it.
   - TECHNOLOGIE: SOTA stack / providers / models (Context7-current).
   - TECHNIQUE: the craft — algorithms, perf, correctness, optimistic UI, streaming, virtualization,
     conflict resolution — what separates a 10 from a 7.
   - UI: top-0.1% interaction — states, motion, density, a11y, the feel.
   - Evidence rule: a score >=7 requires primary evidence (live screenshot / official doc / measured
     number). Vendor claim caps at 6; reasoning-only caps at 4.

G. CONCRETE IMPROVEMENT SPEC — Amazon Working Backwards / PR-FAQ + Kiro + RICE
   - Working-Backwards: 1-paragraph statement of the elevated page experience (write it first).
   - Kiro spec: requirements (EARS / GIVEN-WHEN-THEN), design (data model, API contracts, data flow,
     states, failure handling, security), tasks (ordered, each with a verify step + test to write).
   - Prioritize within the page (RICE/ICE).
   - Persist to _specs/page-elevation/<page>/{purpose,flow,teardown,spec}.md.

## Cross-cutting rigor
- Calibrate the rubric once before scoring (reject a known-bad, approve a known-good).
- Evidence grading on every claim {primary | vendor | secondary} + date + confidence.
- Model-per-role: Opus = judgment/synthesis/spec; Sonnet/Haiku = breadth teardown; Playwright = live
  evidence (ONE browser, sequential); Context7 = tech currency; Rippletide graph = durable cross-page
  model (relate pages, contracts, decisions).
- Test everything: each page driven live; plus one end-to-end test of the core loop.
- One page at a time. Long, meticulous. Depth over breadth.

## Output per page
_specs/page-elevation/<page>/ with: purpose.md (A-C), reality.md (D), teardown.md (E),
spec.md (F-G PR-FAQ + Kiro + RICE). A running index at _specs/page-elevation/INDEX.md.

## Elite frameworks used
JTBD + Forces of Progress (Christensen/Moesta) · Amazon Working Backwards / PR-FAQ · Service blueprint ·
Kano model · Google HEART · Nielsen heuristics · Hook model / engagement loops · RICE/ICE ·
first-principles (three-layers).
