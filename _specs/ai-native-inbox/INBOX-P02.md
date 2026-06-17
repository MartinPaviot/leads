# INBOX-P02 — Link-safety / phishing warnings
> Theme: T11 · Autonomy rung: passive→helper · Priority: P0
> Pillar: P1 fidelity / cross (trust)

## User story
As a user about to click a link in an email, I want to see where it really goes — and be warned
when the visible text disguises the true destination, when the domain mimics a brand, or when the
sender is unauthenticated — so I don't get phished while triaging fast.

## Why (audit anchor)
Faithful, safe links are table stakes (INBOX-R03): every credible client makes links real `<a href>`
and shows a hover destination. Superhuman renders real clickable links and a clean reading pane
(`findings.md` §C) but its anti-phishing is implicit (it relies on Gmail/MS upstream). We render the
body as plain text today (`_conversation-pane.tsx:471`) so links aren't even clickable; the sanitizer
(`sanitize-html.ts:30`) already forces `rel="noopener noreferrer"` + `target="_blank"` and neutralises
`javascript:`/`data:` hrefs — a real seed, but no destination-preview, no look-alike detection, no
"text ≠ href" warning. Because we own the GTM graph and the sequence/outbound data, we can also do
something they can't: tell the user when a link claims to be from a brand the sender is **not**
authenticated to send for. Sovereignty: the safety check runs on our infra (or self-host), not a US
safe-browsing API that exfiltrates every URL the user hovers.

## Requirements (EARS)
- WHEN rendering an HTML email, the system SHALL keep every link a real, sanitized `<a>` with
  `rel="noopener noreferrer"` and `target="_blank"` (already enforced) and SHALL neutralise
  `javascript:`/`data:`/`vbscript:` and other non-`http(s)`/`mailto:`/`tel:` schemes.
- The system SHALL show the link's **true destination host** on hover/focus (a tooltip/affordance),
  derived from the actual `href`, not the link text.
- WHEN a link's visible text is itself a URL whose host **differs** from the `href` host (classic
  disguise, e.g. text "paypal.com" → href "evil.ru"), the system SHALL mark the link with an inline
  warning and surface the real host.
- WHEN a link host is a likely **look-alike** of a well-known brand/the user's own domain
  (homoglyph/typosquat/punycode `xn--`), the system SHALL flag it as "Look-alike domain".
- WHEN the user clicks any flagged link, the system SHALL interpose a **confirm interstitial** showing
  the real destination, the reason it was flagged, and "Continue" / "Cancel" — never auto-navigate a
  flagged link.
- WHEN the sending domain **fails authentication** (no/`fail` DMARC/SPF/DKIM, where the capture retained
  auth results) and the email contains links, the system SHALL show a thread-level "Sender not verified"
  notice (composes with sender-identity INBOX-R06).
- The system SHALL render punycode hosts in their decoded Unicode form **with** the raw `xn--` form
  shown, so the user can see the spoof.
- The deterministic checks (scheme, text≠href, punycode, look-alike against a local brand/own-domain
  list) SHALL run with **no external network call and no LLM call**; any optional reputation lookup
  SHALL be explicitly gated and run through our own infra (no per-hover URL exfiltration).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a link with text "https://www.bank.ch/login" and `href="https://bank-ch.ru/x"` WHEN opened THEN
  the link shows a warning and the true host `bank-ch.ru`; clicking opens the confirm interstitial.
- GIVEN a link to `https://xn--pypal-4ve.com` WHEN opened THEN it renders as the decoded look-alike
  with the `xn--` form shown and a "Look-alike domain" flag.
- GIVEN a benign link text "Read the docs" → `href="https://elevay.dev/docs"` from a verified sender
  WHEN hovered THEN it shows `elevay.dev`, no warning, no interstitial.
- GIVEN a link `href="javascript:fetch('//evil')"` WHEN opened THEN the href is neutralised to `#`
  (sanitizer) and the link is inert.
- GIVEN an email whose `From` domain failed DMARC (auth result retained at capture) and contains a
  login link WHEN opened THEN a "Sender not verified" thread notice appears above the body.
- GIVEN a flagged link WHEN the user clicks "Cancel" in the interstitial THEN no navigation occurs and
  focus returns to the message.
- GIVEN dark mode WHEN a warning/interstitial renders THEN all colors read from tokens (warning =
  `--color-warning`), no emoji.

## Edge cases & failure handling
- URL shorteners (`bit.ly`, `t.co`) → cannot resolve client-side without a network call; show "Shortened
  link — destination hidden" and route through the interstitial; optional server-side unwrap is gated.
- Sender legitimately sends brand links (e.g. our own transactional mail) → the auth check (DMARC pass)
  and the own-domain allow path prevent false "not verified"; brand list is for *mimicry*, not for any
  use of a brand word in text.
- `mailto:`/`tel:` → allowed, no interstitial; non-`http`/`mailto`/`tel` schemes neutralised.
- IP-literal hosts (`http://203.0.113.5/login`) → flagged "Raw IP address" + interstitial.
- Auth results not retained at capture (older rows / providers that don't expose them) → omit the
  "not verified" notice rather than asserting "verified"; never claim a sender is authenticated when
  unknown (mirror role-freshness honesty: don't assert what we can't prove).
- Malformed `href` → treat as opaque, route through interstitial, never throw.
- Multi-tenant/per-user: brand list + own-domain derived from the viewer's tenant/mailbox
  (`lib/inbox/user-scope.ts`); no cross-tenant link state.

## Best-in-class bar
- **Sovereign by construction** — the disguise/look-alike/punycode checks are local and need no
  safe-browsing API, so hovering a link never ships that URL to a US reputation service. The optional
  reputation lookup, if enabled, runs on our infra. Superhuman/Shortwave inherit Google/MS safe-browsing
  (and the data exposure that comes with it); we can offer the check without the exfiltration.
- **GTM-grounded "not verified"** — because we hold the outbound/auth graph, "Sender not verified" is
  grounded in retained DMARC/SPF/DKIM results, not a guess. A generic client can't tie link-safety to
  sender authentication state the way we can.
- **Interstitial states the reason** — not a generic "external link" wall; it names *why* (text≠href /
  look-alike / raw IP / shortener / unverified sender), so the user learns to spot the pattern.

## Design sketch
- **Data:** none persisted for the deterministic path. Capture should retain `metadata.authResults`
  (DMARC/SPF/DKIM) at ingestion (small extension to `email-capture.ts` /`imap.ts`) so the "not verified"
  notice has a source; the own-domain comes from `connected_mailboxes.domain`
  (`db/schema/outbound.ts:248`).
- **API:** the link-classify pass extends `lib/inbox/sanitize-html.ts` `walk()`'s `<a>` branch (`:30`)
  — keep the existing scheme neutralisation, add: extract `href` host, compare with link-text host,
  punycode-decode, and check against a local brand/own-domain list; annotate the node with
  `data-link-warn="text-mismatch|lookalike|raw-ip|shortener"`. Optional gated reputation:
  `GET /api/inbox/link-check?u=…` on our infra (SSRF-guarded; off by default).
- **UI:** rendered in `_email-body.tsx` (INBOX-R01) inside `_conversation-pane.tsx`. Hover/focus host
  affordance + inline warning glyph on flagged links; a confirm interstitial dialog; a thread-level
  "Sender not verified" strip. Tokens: warning `--color-warning` (+`-soft`), text
  `--color-text-secondary`, card `--color-bg-card`; lucide `ShieldAlert` (warning), `ExternalLink`
  (destination), `ShieldCheck` (verified sender). Shortcut: **`Enter`** confirms / **`Esc`** cancels in
  the interstitial. Light + dark via tokens, no emoji, no provider name, the "not verified" notice cites
  its source ("based on the sender's authentication results").
- **AI:** none for the safety verdict (deterministic). AI may *optionally* explain a flagged link in
  plain language in the assistant panel, but the verdict and the block never depend on it.
- **Security/perf:** all checks on the sanitized DOM (fail closed); no per-hover network; CSP already
  blocks active content; interstitial prevents drive-by navigation on flagged links.

## Tasks (ordered, each with verify + test)
1. Extend `sanitize-html.ts` `<a>` branch with host extraction, text≠href comparison, punycode decode,
   and local look-alike/own-domain/brand check → `data-link-warn`. (verify: unit) (test:
   `sanitize-html.test.ts` — disguise, punycode `xn--`, raw IP, benign all classified correctly)
2. Retain `metadata.authResults` at capture (`email-capture.ts`/`imap.ts`); expose on the read model
   (`lib/inbox/load.ts` / `conversations.ts`). (verify: a DMARC-fail email carries the flag) (test:
   capture shape test)
3. `_email-body.tsx`: hover-destination affordance + inline warnings + confirm interstitial (Enter/Esc).
   (verify: browser — a disguised link routes through the interstitial; a clean link does not) (test:
   dom + interaction)
4. Thread-level "Sender not verified" strip wired to `authResults` (compose INBOX-R06). (verify: shows
   only when auth failed/unknown→absent, never false "verified") (test: render matrix)
5. (Optional, gated) `GET /api/inbox/link-check` on our infra, SSRF-guarded, off by default. (verify:
   disabled by default; when on, no URL leaves to a third party) (test: route + gate test)

## Current-state notes (VERIFY before building — code moves)
- `lib/inbox/sanitize-html.ts:30-37` already forces `rel="noopener noreferrer"`+`target="_blank"` and
  neutralises `javascript:`/`data:` hrefs — extend this branch; do not duplicate it.
- No link-safety / phishing / safe-browsing / URL-rewrite code exists in the inbox today (grep for
  `phishing|safe-browsing|link-check|punycode|lookalike` → none). The gap is real.
- Links aren't even clickable yet (`_conversation-pane.tsx:471` renders plain text); this spec composes
  with INBOX-R01 (HTML) and INBOX-R03 (safe links) and INBOX-R06 (sender identity/verified domain).
- Capture (`lib/capture/email-capture.ts`, `lib/integrations/imap.ts`) does not currently retain
  DMARC/SPF/DKIM auth results — task 2 adds it; until then the "not verified" notice must stay silent,
  never assert "verified".
- `/security` page already advertises "SSRF guards on user-supplied URL fetches" (`:138`) — the optional
  link-check endpoint must reuse that guard.
- Own-domain + brand context per-tenant/user via `connected_mailboxes.domain` and
  `lib/inbox/user-scope.ts`.
