# INBOX-R06 — Sender identity (avatar / company logo / verified domain)
> Theme: T1 · Autonomy rung: helper · Priority: P1
> Pillar: P1 fidelity / P5 GTM moat

## User story
As a user scanning and reading mail, I want each sender shown with an avatar or company mark and a
clear indication that the sending domain is authenticated, so I can recognize who's writing at a
glance and trust that the sender is who they claim.

## Why (audit anchor)
Superhuman's Social Insights sidebar leads with an avatar + identity for the selected sender
(`findings.md` §D). Sender identity is both fidelity (a mailbox shows faces, not bare addresses)
and trust (is this domain authenticated?). Today the list shows a text name only
(`_conversation-list.tsx:99` snippet + `:113` reason) and the pane shows name + raw address
(`_conversation-pane.tsx:253-270`) — no avatar, no logo, no auth signal. We already have the
**IndustryBadge idiom** (`lib/ui/industry-style.ts`) and the **brand-gradient no-image fallback**
rule (per memory: gradient = no-image fallback ONLY) — reuse them, don't invent a new avatar system.

## Requirements (EARS)
- WHEN a sender resolves to a known contact/company, the system SHALL show that entity's avatar/logo
  (the existing per-user photo / workspace-logo idiom), else a deterministic brand-gradient initial
  fallback (`--gradient-brand`), never a generic placeholder.
- The system SHALL NOT fetch third-party avatar/logo services at render (no Clearbit/Gravatar leak);
  identity uses already-stored CRM data or the gradient fallback.
- The system SHALL show, for inbound mail, whether the sending domain passed authentication
  (SPF/DKIM/DMARC) using the captured RFC headers, as a sober "verified domain" indicator.
- WHEN authentication fails or is absent, the system SHALL show a neutral "unverified" state (not a
  scary red by default), escalating to a warning only on a clear spoof signal (ties INBOX-P02).
- The system SHALL show identity consistently in the list row, the pane header, and the GTM sidebar
  (INBOX-G01) — one identity component, not three.
- The system SHALL never show a status-jewelry icon (no crowns/badges of honor); verification is a
  sober check glyph + tooltip, per the UI DNA.
- The system SHALL be per-user/tenant scoped — only resolve identity within the viewer's tenant.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a sender who is a known contact with a stored photo WHEN listed THEN their avatar shows in the
  row and pane.
- GIVEN a sender at a known company with a stored logo WHEN listed THEN the company mark shows.
- GIVEN an unknown sender WHEN listed THEN a brand-gradient initials avatar shows (deterministic from
  the address), with no network call.
- GIVEN an inbound email whose headers show DKIM+DMARC pass WHEN opened THEN a "verified domain"
  check appears with a tooltip explaining what was verified.
- GIVEN an inbound email failing DMARC with a from/return-path mismatch WHEN opened THEN an "unverified
  sender" warning appears (INBOX-P02).
- GIVEN any sender WHEN shown THEN there is no crown/medal/insignia — only a sober glyph + color.

## Edge cases & failure handling
- No captured headers (legacy rows) → omit the auth indicator entirely (don't guess "verified").
- Display-name spoof ("PayPal <random@gmail.com>") → name shown but auth state reflects the real
  domain; pairs with INBOX-P02.
- Shared/role sender (`noreply@`) → company logo if the domain is known, gradient otherwise; no person avatar.
- Avatar image fails to load → fall back to the gradient initials (never a broken image).
- Multiple senders in a thread → identity is per message (the message header), plus the thread's
  primary counterparty in the pane header.
- Multi-tenant: resolve only within the viewer's tenant; never another tenant's logo.

## Best-in-class bar
- Identity is **CRM-grounded** (real contact/company marks from our graph) rather than a generic
  social avatar — the same component powers the GTM sidebar (INBOX-G01), so recognition and context
  are one system, not a bolt-on social card.
- **Zero third-party identity fetch** (no Clearbit/Gravatar) — sovereign + private by construction,
  which a US client that calls an avatar CDN can't claim.

## Design sketch
- **Data:** reuse stored contact photo (`user_preferences` per-user photos / workspace logo idiom) and
  company logo fields; SPF/DKIM/DMARC parsed from `activities.metadata` captured headers
  (`Authentication-Results`/`Received-SPF`). No new table; capture the auth result at ingestion
  (extend INBOX-R13's header handling).
- **API:** identity resolution rides the conversations/detail responses (no extra round-trip);
  auth-result parse is a pure helper over the stored headers.
- **AI:** none.
- **UI:** a shared `SenderIdentity` component (avatar + name + auth check) used in
  `_conversation-list.tsx` row, `_conversation-pane.tsx` header (`:253-270`), and INBOX-G01 sidebar.
  Avatar uses the existing avatar/gradient primitive; verified = `BadgeCheck`/`ShieldCheck` (lucide)
  in `--color-success`/`--color-text-tertiary` with tooltip; unverified = `ShieldAlert` in
  `--color-warning` only on spoof. Industry/company context via `IndustryBadge`. No keyboard shortcut
  (informational). Light+dark via tokens, no emoji, no provider name, no status-jewelry, cited.
- **Security:** auth indicator derived only from captured headers; never asserts beyond what headers prove.

## Tasks (ordered)
1. `lib/inbox/sender-auth.ts` — pure: parse SPF/DKIM/DMARC verdict from stored headers → {verified,
   reasons}. (verify: unit on pass/fail/missing fixtures) (test: `sender-auth.test.ts`)
2. Capture `Authentication-Results` into `metadata` at ingestion (extend INBOX-R13). (verify: stored)
   (test: capture test)
3. `SenderIdentity` shared component (avatar/gradient + auth check + tooltip), reusing the avatar
   primitive + IndustryBadge. (verify: render with photo/logo/gradient) (test: render)
4. Wire into list row, pane header, and G01 sidebar. (verify: browser — avatar + verified check on a
   real DKIM-passing email) (test: integration render)

## Current-state notes (VERIFY before building)
- List shows text only (`_conversation-list.tsx:99,113`); pane header shows name + raw address
  (`_conversation-pane.tsx:253-270`) — no avatar/logo/auth.
- `lib/ui/industry-style.ts` (IndustryBadge) exists; per-user photos via `user_preferences` and
  workspace logo exist (memory: gradient = no-image fallback ONLY) — REUSE these, verify field names.
- Captured headers are available (`SyncedEmail.headers`, `gmail.ts:72`; `InboundEmailInput.headers`,
  `email-capture.ts:95`) but `Authentication-Results` is not yet parsed/stored — add in INBOX-R13.
- No `sender-auth` helper or `SenderIdentity` component exists.
