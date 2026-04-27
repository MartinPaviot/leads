# Tasks — FINDING-002 Correct 3 overstated marketing claims

> Lie a : `.kiro/specs/FINDING-002/{requirements.md,design.md}`

## Phase 1 — Landing page copy corrections

- [ ] **T1. Fix CLAIM-013: "autonomous" -> "progressively autonomous" in tagline**
  - Eval-first: Write a snapshot test for the hero section tagline text. Assert it does NOT contain the bare word "autonomous" without the qualifier "progressively".
  - Action: In `apps/web/src/app/(marketing)/page.tsx`, change the tagline from "The autonomous GTM engine for founders" to "The progressively autonomous GTM engine for founders".
  - Verification: Snapshot test passes. Visual check in dev server.
  - Estimation: 30min

- [ ] **T2. Fix CLAIM-001 + CLAIM-003: rewrite meeting-bot claims across 5 locations**
  - Eval-first: Write a grep-based lint check that the string "joins your calls" does not appear in `page.tsx`. Assert "Recall.ai" appears at least 3 times in marketing copy.
  - Action: Update Hero H1, Step 02 (title + desc), Foundations card (title + body), and FAQ answer per the copy table in design.md section 3a.
  - Verification: Lint check passes. All 5 locations updated. Dev server visual review.
  - Estimation: 1h

- [ ] **T3. Update hero subtitle to reflect progressive autonomy**
  - Eval-first: Assert hero subtitle no longer says "joins your calls" or implies native capability.
  - Action: Change "An AI bot joins your calls, transcribes everything, and updates your CRM. You just review and close." to "A Recall.ai bot joins your meetings, transcribes everything, and surfaces deal intel. You review, confirm, and close."
  - Verification: Snapshot test for subtitle passes.
  - Estimation: 30min

## Phase 2 — Recall.ai fallback handling

- [ ] **T4. Add Recall.ai error handling with user notification**
  - Eval-first: Write an integration test that mocks Recall.ai returning 500 and asserts: (1) user receives a notification within 5s, (2) meeting.botStatus is set to "failed", (3) retry is queued.
  - Action: In the meeting bot scheduling path (meetings/route.ts or recall client), wrap the Recall.ai POST in a try/catch. On failure: log the error, set botStatus to "failed", return a user-facing message. Add retry logic (max 3 attempts, exponential backoff via Inngest step.sleep).
  - Verification: Integration test passes. Manual test with mocked failure.
  - Estimation: 2h

## Phase 3 — Code documentation + traceability

- [ ] **T5. Enhance approval-mode.ts comment on sequence-enrollment threshold**
  - Eval-first: Assert that approval-mode.ts line 88-98 region contains the string "FINDING-002" and "WS-7" in comments.
  - Action: Expand the existing comment on `"sequence-enrollment": 1.1` per design.md section 3c. Explain why 1.1 is intentionally unreachable, what WS-7 changes, and reference this spec.
  - Verification: Comment present, file still compiles (pnpm tsc).
  - Estimation: 15min

- [ ] **T6. Add claim-to-code traceability comments in page.tsx**
  - Eval-first: Assert that each marketing claim in page.tsx has a `// Claim trace:` comment linking to the implementing file.
  - Action: Add inline comments above each revised claim pointing to the implementation file (e.g., `// Claim trace: meetings/route.ts:16 — Recall.ai bot scheduler`). This makes future DD audits trivial.
  - Verification: Comments present in all 5 claim locations.
  - Estimation: 30min

- [ ] **T7. Add "claims verified" item to PR template**
  - Eval-first: Assert `.github/PULL_REQUEST_TEMPLATE.md` exists and contains "Claims verified" checkbox.
  - Action: If PR template does not exist yet (it doesn't — see FINDING-003), create or update `.github/PULL_REQUEST_TEMPLATE.md` with a checklist item: `- [ ] Marketing claims in page.tsx still match implementation (if touching marketing pages)`. Coordinate with FINDING-003 T2 if both ship together.
  - Verification: File exists, checklist item present.
  - Estimation: 15min

## Acceptance gate

- [ ] All 7 tasks completed
- [ ] Zero instances of "joins your calls" in page.tsx
- [ ] "Recall.ai" appears in marketing copy at all meeting-bot claim locations
- [ ] Tagline reads "progressively autonomous"
- [ ] Recall.ai failure path tested with mocked 500
- [ ] Martin signs off on revised wording
