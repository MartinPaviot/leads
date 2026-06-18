# INBOX-P01 — Tracking-pixel & remote-content controls (the "Images" setting)
> Theme: T11 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity / cross (trust)

## User story
As a user reading my mail, I want remote images and tracking pixels blocked by default — with
a one-tap "Load images" per message and a per-sender allowlist — so a sender can't silently log
that I opened, where I am, or which device I used, while I can still see the images I trust.

## Why (audit anchor)
Every credible client defends the reader against the open-tracking pixel; Superhuman ships an
explicit **"Images" (remote-image) control** under Workflow (`feature-inventory.md` §Workflow) —
yet it is itself a *sender* of read-receipts ("Recent Opens" / "Read Statuses", ON by default), so
its incentives are mixed. We currently render the body as plain text (`_conversation-pane.tsx:471`),
so today nothing renders **and** nothing is blocked deliberately — the moment we ship HTML
rendering (INBOX-R01/R02/R07) we MUST ship blocking with it, or we regress privacy. Sovereignty is
the moat: a self-hostable, EU/CH-resident inbox that does not leak the open event is a category a US
SaaS on Google/MS cannot credibly serve.

## Requirements (EARS)
- The system SHALL, by default, render an email's HTML with all **remote** resource loads
  suppressed: external `<img src>`, `background:url()` in inline style, remote `srcset`, and any
  CSS image referencing an off-origin URL.
- The system SHALL detect and strip **tracking pixels** — images that are 1×1, zero-area, or
  `display:none`/`visibility:hidden`, or whose URL matches known open-tracking shapes — and SHALL
  NOT fetch them even when the user clicks "Load images".
- WHEN remote content was blocked, the system SHALL show an inline, non-modal banner at the top of
  the message: "Images blocked to protect your privacy · Load images" with a count.
- WHEN the user clicks "Load images" on a message, the system SHALL load that message's non-tracking
  remote images **through the privacy proxy** (INBOX-R02), never via a direct browser request that
  reveals the user's IP/UA to the sender.
- The system SHALL offer "Always load images from this sender" which adds the sender address/domain
  to a per-user allowlist; allowlisted senders auto-load (still proxied, still pixel-stripped).
- `cid:` inline attachment images (embedded in the MIME, not remote) SHALL render without counting
  as "remote content" (they leak nothing).
- The system SHALL expose a single global default under Settings — "Load remote images:
  Never (recommended) / From allowlisted senders / Always" — defaulting to **Never**.
- The system SHALL never make blocking depend on the AI layer; it is deterministic and runs with no
  LLM call.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an HTML email with a 1×1 remote pixel and two real remote images WHEN opened THEN no network
  request leaves for any of the three, and the banner reads "2 images blocked" (the pixel is not
  counted as loadable).
- GIVEN that email WHEN the user clicks "Load images" THEN the two real images load **via the proxy**
  (request Referer/IP is Elevay's, not the user's) and the pixel is still never fetched.
- GIVEN a sender on the allowlist WHEN their next email opens THEN its real images auto-load through
  the proxy, and any pixel in it is still stripped.
- GIVEN an email whose only image is a `cid:` inline attachment WHEN opened THEN it renders with no
  "blocked" banner (nothing remote was suppressed).
- GIVEN the global default = "Never" and a non-allowlisted sender WHEN opened THEN images stay blocked
  until the user acts; the choice is per-message (does not silently allowlist).
- GIVEN a pixel hidden as `width=1 height=1 style="display:none"` behind a CSS class WHEN opened THEN
  it is detected and never requested, even after "Load images".
- GIVEN dark mode WHEN the blocked-image placeholder renders THEN it reads from tokens (no white box).

## Edge cases & failure handling
- Pixel disguised as a legit asset (e.g. a real 600×200 banner that is also the tracker) → we cannot
  know intent; "Load images" loads it via proxy (proxy still hides IP/UA) — blocking IP leakage is the
  guarantee, not blocking the sender knowing the proxy fetched once.
- Data-URI images (`data:image/png;base64,…`) → render inline, not remote, no leak; but `data:text/html`
  is already neutralised by the sanitizer (`sanitize-html.ts:41`).
- CSS `@import` / web-font URLs → stripped by the sanitizer/CSP; never fetched.
- Allowlist entry for a spoofable domain → allowlist keyed on the parsed `From` address; show the
  full address in the banner so the user knows whom they trusted.
- Malformed/oversized HTML → INBOX-R01's best-effort sanitize; blocking is applied on the sanitized DOM
  so a parser failure fails *closed* (everything blocked), never open.
- Multi-tenant / per-user: the allowlist and the global default are per-user (`lib/inbox/user-scope.ts`);
  one user's "always load" never affects a teammate.

## Best-in-class bar
- **Proxy-by-default even after "Load images"** — Superhuman's setting toggles loading on/off; ours
  keeps the IP/UA-hiding proxy on the path *always*, so loading an image never re-exposes the reader.
- **Tracking pixels are stripped, not merely deferred** — a click-through to "Load images" still does
  not fetch the pixel, because we classify it as a tracker, not as content. Most clients fetch
  everything once you "show images"; ours never fetches the classified pixel.
- **Honest count** — the banner counts loadable images, not trackers, so "2 images blocked" means two
  things you'd actually want to see, not noise.

## Design sketch
- **Data:** new per-user `inbox_image_prefs` (or a `user_preferences` JSON key) — `{ defaultMode:
  'never'|'allowlist'|'always', allowlist: string[] }`, tenant- + user-scoped. Per-render block decisions
  are computed, not stored.
- **API:** the block/classify pass lives in `lib/inbox/sanitize-html.ts` (extend the existing `walk()`
  at `:14` — it already strips `<script>`/`on*` and rewrites `<a>` at `:30`; add an `<img>` branch that,
  for remote src, swaps `src`→`data-blocked-src` and flags trackers). A `GET /api/inbox/image-proxy`
  (new — none exists today; confirmed by grep) fetches an allowlisted remote image server-side, strips
  the request of user IP/UA, validates content-type is an image, caps size, SSRF-guards the URL
  (reuse the existing SSRF guard referenced on the `/security` page §4). `GET/PUT /api/inbox/image-prefs`
  for the default + allowlist.
- **UI:** the blocked banner + "Load images"/"Always from sender" lives in the new `_email-body.tsx`
  (INBOX-R01) inside `_conversation-pane.tsx` (replacing the plain `<p>` at `:471`). Surface: inline
  card strip above the body — tokens `--color-bg-card`, border `--color-border-default`, text
  `--color-text-secondary`; lucide `ImageOff` (blocked) / `Image` (load) / `ShieldCheck` (privacy);
  shortcut **`Shift+I`** = load images for the open message. Global default lives in Settings →
  Privacy and data (`settings/privacy/page.tsx`, a new "Remote images" card matching the existing
  card idiom at `:220`). Light + dark via tokens, no emoji, no provider name, the banner copy is
  factual ("to protect your privacy"), cited where the proxy is the source.
- **AI:** none — deterministic classifier; explicitly no LLM call (keeps it private + instant).
- **Security/perf:** proxy is SSRF-guarded + size-capped + image-content-type-checked; CSP `img-src`
  restricts to the proxy origin + `data:` + `cid:` so even a missed remote `src` can't load; blocking
  runs on the already-sanitized DOM so it fails closed.

## Tasks (ordered, each with verify + test)
1. Extend `lib/inbox/sanitize-html.ts` `walk()` with an `<img>` branch: defer remote `src`→
   `data-blocked-src`, classify trackers (1×1 / zero-area / hidden / known shapes) → drop entirely;
   leave `cid:`/`data:image` inline. (verify: unit) (test: `sanitize-html.test.ts` — pixel dropped,
   2 remote images deferred, cid kept)
2. `GET /api/inbox/image-proxy` — SSRF-guarded, IP/UA-stripped, size-capped, image-only fetch.
   (verify: returns bytes for a real image, 4xx for a non-image / private-IP host) (test: route test +
   SSRF case)
3. `inbox_image_prefs` storage + `GET/PUT /api/inbox/image-prefs` (default + allowlist), per-user
   scoped. (verify: PUT persists; another user unaffected) (test: scope test)
4. `_email-body.tsx` blocked-banner + "Load images" (proxies deferred srcs) + "Always from sender"
   (writes allowlist). (verify: browser — open a real tracking-pixel email; pixel never requested in
   network panel; banner count correct) (test: dom render + click)
5. Settings → Privacy "Remote images" default card. (verify: changing default to "allowlist" auto-loads
   only allowlisted senders) (test: settings integration)
6. CSP `img-src` lockdown to proxy origin + `data:`/`cid:`. (verify: a missed remote `src` cannot load
   in the live app) (test: CSP header assertion)

## Current-state notes (VERIFY before building — code moves)
- `lib/inbox/sanitize-html.ts` exists and already strips scripts/iframes/`on*` and forces
  `rel="noopener noreferrer"`+`target="_blank"` on `<a>` (`:30-37`); its `<img>` branch (`:39-44`) only
  blocks `javascript:`/`data:text` — it does **NOT** block remote images or pixels yet. This is the seam.
- No image-proxy / remote-image / tracking-pixel route exists today (grep for
  `image-proxy|remote-image|tracking-pixel` → 0 files). The gap is real.
- Body still renders plain text at `_conversation-pane.tsx:471` (`whitespace-pre-wrap`); this spec
  composes with INBOX-R01 (HTML render), INBOX-R02 (proxy), INBOX-R07 (pixel-block default-on).
- Outbound (our own sends) injects a 1×1 pixel in the send worker — unrelated to *reading* defense; do
  not confuse the two paths.
- `/security` page (`app/(legal)/security/page.tsx`) already claims "SSRF guards on user-supplied URL
  fetches" (`:138`) — reuse that guard in the proxy; keep the page honest by shipping the proxy.
- Allowlist + default are per-user via `lib/inbox/user-scope.ts` (inbox is personal).
