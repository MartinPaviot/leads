# Tasks — Inbound lead recognition

## Tranche 1 — deterministic gates + warm-leads semantics (SHIPPED c42d730e)

- [x] **T1. Pure classifier module** `lib/inbound/lead-classification.ts`
- [x] **T2. Classifier unit tests** `__tests__/inbound-lead-classification.test.ts`
- [x] **T3. Capture gating** `lib/capture/email-capture.ts`
- [x] **T4. Warm-leads floor** `lib/deals/warm-leads.ts`
- [x] **T5. Gate** — `tsc` clean + targeted `vitest` green

## Tranche 2 — RFC headers + LLM relationship classifier (this sprint)

- [x] **2a. Wire RFC headers** from EmailEngine payload + IMAP (`parsed.headers`)
      + Gmail (`payload.headers`) + Outlook (`internetMessageHeaders` added to
      `$select`) into `captureInboundEmail({ headers })`. `SyncedEmail.headers`
      added; both pull consumers pass it. Now the deterministic stage catches
      human-looking newsletters via List-Unsubscribe. Test: capture
      List-Unsubscribe case.
- [x] **2b. LLM relationship classifier** `lib/inbound/relationship-classifier.ts`
      (Haiku via `getModelForTask("lightweight")` + `tracedGenerateObject`,
      ICP-aware, fail-open null). Pure of DB; tested with AI mocked (5 cases).
- [x] **2c. Hot-inbound gate** — `lib/inbound/relationship-check.ts`
      (`confirmHotInboundIsLead`, DB orchestration) wired into
      `onContactCreatedEnrichAndQualify`: inbound-email hot leads must clear the
      relationship LLM (prospect, not vendor/recruiter) before the "Hot inbound
      lead" notification fires. `captureInboundEmail` now stamps
      `source: "inbound_email"` so sourced/imported contacts never masquerade as
      inbound hot leads. Fail-open.

## Tranche 3 — correction loop + UI (this sprint)

- [x] Persist the relationship verdict onto `contacts.properties.leadRelationship`
      (relationship-check.ts) and have `rankWarmLeads` + `hot-inbounds` READ it —
      the LLM verdict now hides a contact, not just gates the notification.
- [x] "Not a lead" control on `WarmLeadPrompt` & `HotInboundsWidget` →
      `POST /api/contacts/:id/lead-feedback` → `contacts.properties.leadFeedback`,
      read by both surfaces. Human override beats the LLM + deterministic stages.
      SSOT pure helper `lib/inbound/lead-status.ts` (isExcludedAsLead precedence).
      57 tests green (helper truth table + endpoint + warm-leads exclusion).

## Tranche 4 — learning + backfill (next)

- [ ] Surface the "why" reason line in a review view (the verdict reason is
      already stored on `leadRelationship`).
- [ ] Persist corrections as few-shot into the relationship stage; per-domain
      short-circuit so a judged domain never re-surfaces.
- [ ] One-time reclassify sweep over already-captured activities/contacts
      (script, like `_rolefix.mjs`).
- [ ] DOM tests for the two widgets' "Not a lead" interaction.
