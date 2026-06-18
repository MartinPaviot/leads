# INBOX-R02 — Inline images + remote-image privacy proxy
> Theme: T1 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity

## User story
As a user reading mail, I want images to render — inline (`cid:`) attachments and remote
`<img>` — but with remote images proxied so opening an email never silently leaks my IP,
location or read-status to the sender, so the inbox looks right AND respects my privacy.

## Why (audit anchor)
HTML render (INBOX-R01) is hollow without images: signatures, product screenshots, logos and
newsletters are mostly imagery. But remote images are the #1 tracking vector — Superhuman ships
an explicit **"Images" workflow setting** (`feature-inventory.md` → Workflow › Images) and
Gmail proxies remote content. Our sanitizer currently allows `<img src>` verbatim
(`lib/infra/sanitize-html.ts:4,8`) with **no proxy and no gate** — so today we'd leak on every
open. This spec makes images work AND private (pairs with INBOX-R07 tracking-pixel blocking and
the INBOX-P01 controls).

## Requirements (EARS)
- WHEN a message body contains a remote `<img src="http(s)://…">`, the system SHALL route it
  through a first-party image proxy (`/api/inbox/img?u=…`) by default, never the origin URL.
- The system SHALL strip the sender's ability to learn the open: the proxy SHALL NOT forward the
  user's IP, cookies, or `Referer` to the origin.
- WHEN remote images are blocked by setting (default per INBOX-R07), the system SHALL show a
  per-message "Images hidden — Show images" affordance, and SHALL remember a per-sender allow choice.
- WHEN a message has inline `cid:` images (attachment parts), the system SHALL resolve them from
  the stored attachment and render them inline without any network call.
- The system SHALL render images inside the scoped message container at constrained max-width so
  a huge image never breaks the pane (INBOX-R01 container).
- The system SHALL fail safe: a proxy fetch error renders a neutral broken-image placeholder, never
  the raw origin URL as a fallback.
- The proxy SHALL allow only `http(s)` image content types, reject non-image responses, and cap size.
- The system SHALL be per-user/tenant scoped — the proxy only serves images referenced by a
  message the requesting user is allowed to read.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an HTML email with a remote `<img>` and images allowed WHEN opened THEN the image loads
  via `/api/inbox/img?...` and the origin server sees the proxy, not the user's IP.
- GIVEN images blocked (default) WHEN opened THEN images are suppressed and a "Show images" control
  appears; clicking it reveals them for this message.
- GIVEN the user clicks "Always show from this sender" WHEN a later mail from that sender opens THEN
  its images load automatically.
- GIVEN an inline `cid:` signature logo WHEN opened THEN it renders with no outbound network request.
- GIVEN a remote `<img src="javascript:…">` or a non-image URL WHEN proxied THEN it is rejected and a
  placeholder shows.
- GIVEN a 30 MB image URL WHEN proxied THEN the proxy caps/streams and never OOMs the function.

## Edge cases & failure handling
- `data:` image URIs → allow small inline `data:image/*` (already partly handled at sanitize
  `:41`), reject `data:text`.
- `cid:` with no matching attachment → placeholder, not a dangling broken icon.
- Origin returns HTML/redirect chain → proxy refuses (content-type gate), no open redirect.
- Tracking pixels (1×1) → blocked by INBOX-R07 before they reach the proxy allow path.
- Offline / proxy down → placeholder; never expose origin URL.
- Multi-tenant: proxy validates the caller can read the referencing message; signed/short-lived URL.

## Best-in-class bar
- Default-private (proxy + block) like Gmail, but with a **per-sender memory** and an honest
  "images hidden" state — Superhuman exposes the toggle; we make the privacy posture the default
  AND legible, and inline `cid:` images never touch the network at all.
- Sovereign-friendly: the proxy is first-party and self-hostable (no third-party image CDN), so a
  Pilae deployment leaks nothing to a US proxy.

## Design sketch
- **Data:** per-sender image-allow stored in user prefs (reuse `user_preferences`); attachment
  bytes for `cid:` resolution come from INBOX-R04's stored parts. No new table.
- **API:** new `GET /api/inbox/img?u=<signed>` server route — validate signature + reader scope
  (`lib/inbox/user-scope.ts`), fetch with no creds, content-type+size gate, stream back with
  caching headers. Rewrite happens in the body transform (below).
- **UI:** in `_email-body.tsx` (INBOX-R01 scoped container) a transform rewrites remote `src`→proxy
  (or removes when blocked) and resolves `cid:`→data/proxy; a "Show images" bar uses `Image`/
  `ImageOff` (lucide), tokens `--color-bg-card`, border `--color-border-default`, text
  `--color-text-secondary`, accent `--color-accent` for the action; shortcut: none (mouse/Enter on
  the bar). Light+dark via tokens, no emoji, no provider name, cited (the bar reads "Images hidden
  to protect your privacy").
- **AI:** none.
- **Security/perf:** signed short-lived proxy URLs; SSRF guard (no internal IPs/metadata endpoints);
  size+type caps; lazy-load images below the fold (INBOX-R11).

## Tasks (ordered)
1. `/api/inbox/img` proxy with signature + reader-scope check + SSRF/content-type/size guards.
   (verify: proxies an image, rejects non-image + internal IP) (test: route test)
2. Body transform in `_email-body.tsx`: remote `src`→proxy or strip-when-blocked; `cid:`→inline.
   (verify: DOM has proxy URLs / no remote origin) (test: transform unit)
3. "Show images" bar + per-sender allow (user_preferences). (verify: toggle reveals; sender memory
   persists) (test: pref persistence)
4. Default-block wiring to INBOX-R07; placeholder on failure. (verify: live email opens with images
   hidden then shown) (test: blocked-state render)

## Current-state notes (VERIFY before building)
- `lib/infra/sanitize-html.ts:4,8` allows `<img src>` with **no proxy, no gate** — must be wrapped
  by the render transform; do not loosen the sanitizer.
- No image proxy route exists (`app/api/inbox/` has conversations/detail only — `_CODEBASE-NOTES.md`).
- `cid:` resolution depends on INBOX-R04 (stored attachment parts) and INBOX-R13 (HTML retained).
- Per-sender prefs: reuse `user_preferences` (used for avatars/profile per memory) — VERIFY shape.
