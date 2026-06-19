# INBOX-S05 — Entity extraction (people / companies / dates / amounts)
> Theme: T3 · Autonomy rung: helper · Priority: P1
> Pillar: P2 reading / P5 GTM moat

## User story
As a user reading my mail, I want the people, companies, dates and amounts in a message recognized
and made actionable — each tied to where it appeared — so I can book the date, open the company, or
log the amount without retyping it.

## Why (audit anchor)
Entity extraction (people/companies/dates/$) is a core taxonomy capability (audit §2/§4 P2).
Superhuman's agentic compose already **looks up the contact** and **reads the calendar** to ground a
draft (`findings.md` §I) — entity recognition is the substrate. We extract none today; the row shows
raw text. Our edge: extracted entities **resolve against our CRM graph** (this person = that contact,
this company = that account) with citations, and dates feed the sovereign calendar — Lightfield
recall, not a generic NER.

## Requirements (EARS)
- WHEN a message/thread is enriched, the system SHALL extract entities — persons, organizations,
  dates/times, monetary amounts (and optionally locations) — each with the source span + message id,
  produced "via Elevay".
- The system SHALL attempt to **resolve** each person/company to an existing CRM contact/account
  (by name + email/domain) and mark it Verified / Likely / Inferred (`confidence-state.tsx`); an
  unresolved entity SHALL stay "Inferred", never silently linked to the wrong record.
- Dates/times SHALL be normalized (ISO, with the message tz) so they can drive booking (INBOX-CAL01/02);
  amounts SHALL be normalized (value + currency) for logging.
- The system SHALL persist extracted entities (cached) so rendering triggers no per-render LLM call.
- The system SHALL NOT fabricate or over-resolve: a name with no confident CRM match resolves to no
  record (offer "Add to CRM", INBOX-G02), not the nearest guess.
- Each entity chip SHALL deep-link: person/company → CRM record (or capture CTA); date → "book"
  (INBOX-CAL02); amount → "log to deal" (INBOX-G09) where a deal exists.
- The system SHALL respect per-user/tenant scope; resolution only against the viewer's tenant graph.
- WHEN zero-retention AI is enabled, extraction SHALL run without third-party body retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN "Let's meet Tuesday at 3pm; budget is around €40k — loop in Marie from Acme" WHEN extracted THEN chips appear: a normalized date (next Tue 15:00, message tz), "€40,000", person "Marie", org "Acme".
- GIVEN "Marie" resolves to a known contact at Acme WHEN shown THEN her chip is Verified and links to her CRM record; "Acme" links to the account.
- GIVEN a person with no confident match WHEN shown THEN the chip is Inferred and offers "Add to CRM" (G02), never linked to a wrong contact.
- GIVEN the date chip WHEN clicked THEN it opens one-click book (CAL02) prefilled with the normalized time.
- GIVEN the amount chip with an open deal WHEN clicked THEN it offers "log to deal" (G09).
- GIVEN an ambiguous date ("next month") WHEN extracted THEN it is shown as a range or omitted, never pinned to a wrong day.
- GIVEN another tenant's "Acme" WHEN resolving THEN it is never linked (scope).

## Edge cases & failure handling
- Name collisions (two "Marie"s) → resolve by thread context (sender domain / cc); if still ambiguous, leave Inferred with a disambiguation popover, never auto-pick.
- Relative dates without an anchor ("Thursday") → resolve against the message date + tz; if the tz is unknown, show date without time or mark Inferred.
- Currency-less numbers ("40k") → infer currency from locale/thread only if confident; else show the number, no currency.
- Signature noise (addresses/phone in footer) → don't extract footer boilerplate as live entities (reuse INBOX-R05 boundaries).
- Body unavailable (snippet-only) → extract from snippet, all Inferred.
- Multi-tenant/user scope enforced for every resolution.

## Best-in-class bar
- Entities **resolve to our CRM graph** with Verified/Likely/Inferred confidence and citations — a generic NER can't; this is the Lightfield-recall substrate that makes dates bookable and companies openable in one click.
- **Never over-resolves**: no confident match ⇒ capture CTA, not a wrong link — the human-in-the-loop discipline (Lightfield approval) applied to entity linking.

## Design sketch
- **Data:** `metadata.entities: [{ id, type:'person'|'org'|'date'|'amount'|'location', text, span, sourceMessageId, normalized?, resolvedRef?:{kind,id}, confidence:'verified'|'likely'|'inferred' }]` on the activity (JSONB; no migration). Resolution reads `contacts`/`accounts` (`db/schema/core.ts`).
- **API:** extract inside the deep per-message pass (`enrichment/email-extract-batch-requested`, `inngest/sync-functions.ts:551`) — add an `entities` field; resolution step matches name+domain/email against the tenant's contacts/accounts (reuse the capture resolver in `lib/capture/email-capture.ts`, which already resolves sender→contact by email/domain). Surface via `load.ts` + detail route.
- **UI:** entity chips inline under the message header (and tappable inside the body where feasible). Surface = `Badge`/chip in token colors — person/org use `IndustryBadge`/`TitleBadge` where resolved, dates/amounts use neutral `--color-bg-selected` chips; lucide `User`/`Building2`/`Calendar`/`Banknote`; confidence via `components/ai-ui/confidence-state.tsx`; citation popover via `cited-claim.tsx`; date→book uses CAL02, amount→deal uses G09. Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = grounded NER + normalizer; grounding = message body; resolution = deterministic match against CRM graph (LLM proposes, matcher confirms — never LLM-only linking, per no-hardcoded-matching/LLM-over-real-data discipline). Autonomy = helper. Fail-closed: no confident resolution ⇒ Inferred + capture CTA.
- **Security/perf:** folds into existing extraction; scoped resolution; cached; zero-retention honored.

## Tasks (ordered, each with a verify step + test to write)
1. Add `entities` to the email-extract schema + a CRM-resolution step (name+domain/email → contact/account). (verify: seeded email yields typed, normalized entities; known names resolve, unknowns stay Inferred) (test: `entities.test.ts` — normalization (date tz, currency); over-resolution guard (no wrong link); scope)
2. Surface entities via `load.ts` + detail route. (verify: API returns resolved + unresolved entities) (test: load-shape)
3. Entity chips UI with confidence + citation + deep links (CRM / book / log-to-deal). (verify: browser — chips render, date→book prefilled, unknown person→Add-to-CRM) (test: dom + link wiring)
4. Disambiguation popover for collisions. (verify: two "Marie"s → no auto-pick, popover offered) (test: collision unit)

## Current-state notes (VERIFY before building)
- `lib/capture/email-capture.ts` already resolves sender→contact by email then domain→account (header comment in `conversations.ts`) — reuse that resolver for entity linking; don't write a second matcher.
- `enrichment/email-extract-batch-requested` (`inngest/sync-functions.ts:551`) is the extraction pass to extend. VERIFY the schema file.
- `components/ai-ui/confidence-state.tsx` provides Verified/Likely/Inferred; `IndustryBadge`/`TitleBadge` for resolved org/person chips.
- Feeds INBOX-S04 (due dates), INBOX-CAL01/02 (booking), INBOX-G09 (log amount to deal), INBOX-G02 (capture unknown). No entity UI exists today.
