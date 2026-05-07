# MONACO-PARITY-03 — Tasks

Branch: `feat/MONACO-PARITY-03-onboarding`. Owner: UX + Code Agent. Effort: L (3-4 sem).

1. **Schema + state API**
   - Migration: `onboarding_progress`, `tenants.voiceProfile`, `tenants.icpConfidence`.
   - `GET /api/onboarding/state` + `POST /api/onboarding/phase/:n`.
   - Verify: round-trip a full 7-phase fixture; resume after browser close shows last phase.

2. **Phase 1 — Diagnostic UI**
   - `/onboarding/1`: 4 questions, ICP validator (`industry + size + buyer`).
   - Stack-detection sidebar showing "you can replace [...]".
   - Verify: empty ICP blocks; partial ICP surfaces inline insistence; valid ICP advances.

3. **Phase 2 — ICP & TAM UI**
   - `/onboarding/2`: best/anti-ICP capture; live TAM stream; per-account thumb up/down.
   - Validation gate via existing `account_grades` count.
   - Verify: <3 A-grade marked → blocked; >=3 → proceed.

4. **Phase 3 — Email & Calendar OAuth**
   - Reuse existing `auth-callback.ts` flows.
   - Post-OAuth, run sync probe; show counts.
   - Verify: empty inbox → blocked; >0 emails → proceed.

5. **Phase 4 — Signal Configuration**
   - Pre-built signals (suggested per ICP).
   - 3-question custom signal builder (form + LLM-assisted phrasing).
   - Verify: <3 custom → blocked.

6. **Phase 5 — Voice & Sequences**
   - 5-email upload OR loom 60s.
   - `lib/voice/extract-tone.ts` returns 4-axis profile.
   - Generate 3 sequences via existing `sequence-generator.ts` with voice in prompt.
   - User approves ≥1 in `manual` mode.
   - Verify: 0 approved → blocked.

7. **Phase 6 — Pipeline Setup**
   - Free input → suggest defaults if low confidence.
   - Verify: ≥3 stages → proceed.

8. **Phase 7 — Coaching activation**
   - Inline chat panel with prompt suggestions.
   - Verify: ≥1 query made → unblock complete.

9. **Final checklist + complete**
   - `POST /api/onboarding/complete` runs all hard gates.
   - On success, redirect to `/home`.
   - Verify: missing any hard gate → 400 with explicit list.

10. **Premium upsell**
    - "Founder-led onboarding ($Z one-off)" CTA on the diagnostic page.
    - Hooks Stripe checkout (existing `lib/billing/stripe.ts`).

11. **Telemetry**
    - Log phase entry + exit + duration to `events` table.
    - Track time-to-first-value, completion rate, per-phase drop-off.

12. **Doc + master plan update** → ✅.
