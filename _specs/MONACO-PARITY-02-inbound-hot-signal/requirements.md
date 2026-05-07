# MONACO-PARITY-02: Inbound Demo Request → Hot Signal

## User Story
As a founder, when a website visitor submits a "Request demo" form (or any inbound contact landing through the existing webhook), I want the system to (a) match them against my TAM in real time, (b) if they map to an account I've already scored A/Burning, mark the contact as "Hot" and surface them at the top of the dashboard, and (c) trigger the appropriate sequence for that account tier — so I never miss a high-intent inbound that should jump the queue.

Source : `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 4 Étape 2 — "Demo request inbound capture | Form + webhook ingestion existante (`inbound-lead-enrichment`) | Vérifier que ça matche bien sur l'account cible et que ça remonte comme signal 'Hot' dans le dashboard | S (2-3j) | P1".

## Acceptance Criteria

### Scenario: Inbound matches a TAM A-grade account
GIVEN account `acme.com` is in my TAM with `score = "A"`
AND `jane@acme.com` submits a demo form
WHEN the inbound webhook fires
THEN a contact is created/upserted with `companyId = acme account id`
AND a signal of type `inbound_demo_request` is emitted with `verificationStatus = "verified"` (the form submission IS the verifying event)
AND a notification is created: "Hot inbound: Jane (Acme, score A)"
AND the dashboard "Hot" widget surfaces this contact at top

### Scenario: Inbound matches a low-priority account
GIVEN `bob@small-startup.io` submits a demo form
AND `small-startup.io` is in my TAM with `score = "C"`
THEN the contact is created normally
AND a signal `inbound_demo_request` is emitted but with `priority = "normal"`
AND it does NOT bubble to the Hot widget

### Scenario: Inbound from a NEW domain (not in TAM)
GIVEN `alice@unknown.io` submits and `unknown.io` is not in TAM
THEN a new company `unknown.io` is created with `score = null`
AND the contact is created
AND `inbound-lead-enrichment` is enqueued to enrich both
AND after enrichment, a `score-tam-match` Inngest job re-checks ICP fit and assigns a tier
AND if tier ≥ B, the contact is promoted to Hot post-hoc

### Scenario: Duplicate inbound within 24h
GIVEN `jane@acme.com` already submitted yesterday
AND submits again today
THEN no duplicate contact is created
AND no second signal is emitted (deduped on `(contactId, type, day)`)

## Edge Cases
- Email domain is a free provider (gmail, yahoo, outlook) → match on personal email is unreliable; flag as `requires_manual_match = true` and don't auto-assign account.
- Form payload missing email → reject 400 at the webhook.
- Form payload includes a `companyName` field that disagrees with the email domain → trust the email domain (legal entity), surface the conflict in a property `nameClaim`.
- Account exists but score is `null` (not yet scored) → still emit signal, mark as `priority = "scoring_pending"`, re-evaluate when scoring runs.
- Webhook is replayed by the form provider → idempotency key on `(formProviderEventId)` makes replay a no-op.

## Evaluation Steps
1. Seed TAM with 3 accounts: A-grade, C-grade, untracked.
2. POST to inbound webhook with each domain.
3. Assert: A-grade → Hot widget; C-grade → present but not Hot; untracked → enrichment queued.
4. POST same A-grade payload twice within 60s; assert single contact, single signal.
5. Verify dashboard query returns Hot inbounds in <500ms (no N+1 on TAM lookup).
