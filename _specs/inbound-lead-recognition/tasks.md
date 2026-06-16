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

## Tranche 3 — correction loop + UI + backfill (next)

- [ ] Persist `isInboundLead` (the relationship verdict) onto
      `metadata.leadClassification` / contact, and have `rankWarmLeads` +
      `hot-inbounds` read it (today the verdict only gates the notification).
- [ ] "Not a lead" / "This is a lead" control on `HotInboundsWidget` &
      `WarmLeadPrompt`; the "why" reason line.
- [ ] Persist corrections; inject as few-shot into stage 2; per-domain
      short-circuit.
- [ ] One-time reclassify sweep over already-captured activities/contacts
      (script, like `_rolefix.mjs`).

## Tranche 3 — correction loop + UI + backfill (next)

- [ ] "Not a lead" / "This is a lead" control on `HotInboundsWidget` &
      `WarmLeadPrompt`; the "why" reason line.
- [ ] Persist corrections; inject as few-shot into stage 2; per-domain
      short-circuit.
- [ ] One-time reclassify sweep over already-captured activities/contacts
      (script, like `_rolefix.mjs`).
