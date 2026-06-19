# INBOX-R03 — Safe clickable links (rewrite, hover-preview, phishing warn)
> Theme: T1 · Autonomy rung: helper · Priority: P0
> Pillar: P1 fidelity / P11 trust

## User story
As a user reading mail, I want links to be clickable but safe — I see where a link really goes
before I click, deceptive links are flagged, and dangerous schemes are neutralized — so the
inbox is as convenient as Gmail without being a phishing trap.

## Why (audit anchor)
Superhuman renders real clickable `<a href>` links (`findings.md` §C). Convenience is table
stakes; safety is the differentiator. Our sanitizer already forces `target="_blank"
rel="noopener noreferrer"` and neutralizes `javascript:`/`data:` hrefs
(`lib/infra/sanitize-html.ts:30-37`) — a solid floor — but does **nothing** about
display-text-vs-href mismatch (the classic "you see paypal.com, it goes to evil.ru" trick),
no hover preview, and no warning interstitial. This spec adds the link-safety layer (ties to
INBOX-P02 phishing warnings).

## Requirements (EARS)
- The system SHALL render links clickable, always with `target="_blank" rel="noopener noreferrer"`.
- The system SHALL neutralize `javascript:`, `vbscript:`, and `data:` (non-image) hrefs (already
  partly done at `sanitize-html.ts:34`) — extend to all dangerous schemes.
- WHEN a link's visible text presents a URL/domain that differs from its real `href` host, the
  system SHALL surface the real destination (mismatch indicator + the true host on hover).
- The system SHALL show, on hover/focus, the link's real resolved host (a preview), not the raw
  long URL only.
- WHEN a link points to a known-risky pattern (IP-literal host, punycode/homograph, credential-in-URL
  `user:pass@`, or a flagged TLD), the system SHALL show a warning affordance before navigation.
- The system SHALL open external links in a new context and never within the app origin.
- The system SHALL linkify bare URLs in plain-text bodies (INBOX-R09) with the same safety rules.
- The system SHALL NOT auto-fetch or pre-resolve link targets on render (no SSRF, no leak); preview
  is computed from the URL string itself.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN `<a href="http://evil.ru">www.paypal.com</a>` WHEN rendered THEN a mismatch indicator shows
  and hover reveals the true host `evil.ru`.
- GIVEN `<a href="javascript:alert(1)">click</a>` WHEN clicked THEN nothing executes (href neutralized).
- GIVEN a punycode/homograph host (`xn--pypal-4ve.com`) WHEN rendered THEN it is shown decoded with a
  warning before navigation.
- GIVEN a link with `https://user:pass@host/` WHEN rendered THEN the embedded credentials are flagged.
- GIVEN any external link WHEN clicked THEN it opens in a new tab with `noopener` (no `window.opener`).
- GIVEN a plain-text body with a bare `https://…` WHEN rendered THEN it is clickable and safety-checked.
- GIVEN a normal benign link WHEN hovered THEN the real host previews with no warning and no network call.

## Edge cases & failure handling
- Tracking/redirect wrappers (`t.co`, marketing redirectors) → show the wrapper host honestly; do
  not unwrap by fetching (no network on render).
- Relative/anchor links inside email HTML → strip or neutralize (no app-origin navigation).
- `mailto:`/`tel:` → allowed, handled by the OS, no warning.
- Extremely long URLs → preview truncates the path but always shows the full host.
- Mismatch false-positives (link text is a brand name, not a URL) → only flag when the visible text
  itself looks like a URL/host, to avoid crying wolf.
- Multi-tenant: pure string analysis, no per-tenant state; no leak.

## Best-in-class bar
- We flag **display-vs-destination mismatch and homographs** inline — most consumer clients (and
  Superhuman) just open the link; ours surfaces the deception at the point of decision.
- Zero network on render (preview is parsed from the URL), so checking safety never itself leaks a
  signal to the attacker — cleaner than link-scanners that pre-fetch.

## Design sketch
- **Data:** none (pure URL analysis). Optional per-tenant allow/deny host lists later (out of scope).
- **API:** none (no fetch on render). A future server check could enrich, but v1 is client-pure.
- **AI:** none (deterministic URL heuristics; keep it explainable, not a model guess).
- **UI:** in `_email-body.tsx` (INBOX-R01) a link transform wraps each `<a>`: adds a hover/focus
  popover with the true host and, on risk, an `AlertTriangle` (lucide) + `ShieldAlert` warning chip
  using `--color-warning` / `--color-warning-soft`, text `--color-text-secondary`; benign hover uses
  `--color-bg-card` + `--shadow-floating`. Link color `--color-accent`. Keyboard: links are
  focusable; the preview shows on focus too. Light+dark via tokens, no emoji, no provider name, cited
  (warning explains why: "destination doesn't match the link text").
- **Security/perf:** scheme allowlist extends `sanitize-html.ts`; homograph detection via punycode
  decode; no render-time fetch.

## Tasks (ordered)
1. `lib/inbox/link-safety.ts` — pure: classify(href, visibleText) → { realHost, mismatch, risk[],
   neutralizedHref }. (verify: unit on mismatch/punycode/creds/js-scheme) (test: `link-safety.test.ts`)
2. Harden `sanitize-html.ts` scheme handling (vbscript, all `data:` non-image). (verify: unit)
   (test: sanitize cases)
3. Link transform + hover/warning UI in `_email-body.tsx`. (verify: browser — mismatch link shows
   true host + warning) (test: transform render)
4. Plain-text linkify with the same rules (INBOX-R09). (verify: bare URL clickable + checked) (test:
   linkify unit)

## Current-state notes (VERIFY before building)
- `lib/infra/sanitize-html.ts:30-37` already sets `rel`/`target` and blocks `javascript:`/`data:`
  hrefs — extend, don't duplicate. No mismatch/homograph/hover-preview logic exists.
- Render host is `_email-body.tsx` (new in INBOX-R01); today links live inside the plain-text `<p>`
  at `_conversation-pane.tsx:471` (not linkified at all).
- No link-safety module exists in `lib/inbox/`.
