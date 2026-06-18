# INBOX-R07 — Tracking-pixel blocking (default-on)
> Theme: T1 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity / P11 trust

## User story
As a user, I want invisible tracking pixels stripped from incoming mail by default, so opening an
email never silently tells the sender that I read it, when, where, or on what device.

## Why (audit anchor)
Tracking pixels are the privacy default battleground. Superhuman exposes an **"Images" workflow
setting** to control remote content (`feature-inventory.md` → Workflow › Images) and ships
**Read Statuses / Recent Opens** — i.e. they understand open-tracking deeply (they even sell it
for your *outbound*). The honest posture for inbound is to **block tracking by default**. Our
sanitizer allows `<img>` with no gate (`lib/infra/sanitize-html.ts:4,8`), so today every 1×1
beacon fires on open. This spec strips trackers before render; it is the privacy half of INBOX-R02
(which proxies the legitimate images you choose to load) and the inbound side of INBOX-P01.

## Requirements (EARS)
- The system SHALL, by default, block remote-image loading on inbound mail (no network on open),
  surfacing INBOX-R02's "Show images" affordance for legitimate content.
- The system SHALL detect and strip known tracking-pixel patterns regardless of the image setting:
  1×1 / 0×0 images, zero-opacity images, images from known tracker hosts/paths, and `display:none`
  beacons — these are removed, not merely proxied.
- The system SHALL strip CSS-based beacons (`background-image:url(...)` on hidden elements) during
  sanitization so a tracker can't hide in a style.
- WHEN the user enables "load images" for a message/sender (INBOX-R02), the system SHALL still strip
  the identified tracking pixels (you can see the newsletter art without confirming the open).
- The system SHALL default to ON (block) for every user, with an opt-out in settings (INBOX-P01/O06).
- The system SHALL never itself fetch the tracker to "check" it (no leak via the check).
- The stripping SHALL apply at render over the retained body, and MAY also be applied at capture so
  stored HTML is already beacon-free.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an email with a 1×1 remote pixel WHEN opened (default settings) THEN no request to the tracker
  host is made and the pixel is absent from the DOM.
- GIVEN an email with a legitimate remote banner image WHEN opened THEN it is blocked-by-default with a
  "Show images" control (INBOX-R02), not auto-loaded.
- GIVEN the user clicks "Show images" WHEN the email also contained a 1×1 beacon THEN the banner loads
  (proxied) but the beacon stays stripped.
- GIVEN a CSS `background-image` beacon on a `display:none` div WHEN opened THEN no request fires.
- GIVEN an image from a known tracker host (open-tracking path) WHEN opened THEN it is stripped even if
  larger than 1×1.
- GIVEN a user who opted out of blocking WHEN opening mail THEN remote images load (proxied via R02),
  but obvious beacons are still removed.

## Edge cases & failure handling
- Legitimate 1×1 spacer gifs in old HTML layouts → stripping a spacer is harmless (no layout reliance
  on a beacon); acceptable.
- Tracker disguised as a content image (e.g. a real logo that's also the beacon) → proxy-on-load (R02)
  already prevents the silent open; explicit user load is an informed choice.
- New/unknown tracker hosts → the size/opacity/hidden heuristics catch most; host list is additive.
- Plain-text mail → no images, nothing to strip.
- Capture-time stripping must not corrupt the stored HTML for legitimate images (only remove beacons).
- Multi-tenant: setting is per-user (`user_preferences`); no cross-tenant effect.

## Best-in-class bar
- We **block by default AND strip beacons even when you load images** — most clients are all-or-nothing
  (load everything or nothing); ours lets you see the art while still denying the open-receipt.
- Honest asymmetry: we sell open-tracking for *your outbound* (Recent-Opens parity, INBOX/T10) but
  **protect you from it on inbound** — a coherent, stated trust posture a tracking-funded client won't take.

## Design sketch
- **Data:** per-user block setting in `user_preferences` (default ON); additive tracker-host list in code.
- **API:** none beyond INBOX-R02's image proxy (which simply isn't called when blocked).
- **AI:** none.
- **UI:** no dedicated surface beyond INBOX-R02's "Show images" bar and the settings toggle (INBOX-P01/
  O06). The "Images hidden to protect your privacy" copy lives on R02's bar (`ImageOff` lucide,
  `--color-text-secondary`). Settings toggle uses the existing settings control idiom. Light+dark via
  tokens, no emoji, no provider name, cited.
- **Security/perf:** beacon stripping is pure DOM/CSS analysis (no fetch); applied in `_email-body.tsx`
  transform and optionally at capture (INBOX-R13).

## Tasks (ordered)
1. `lib/inbox/tracker-strip.ts` — pure: given HTML, remove 1×1/0×0/zero-opacity/hidden images +
   CSS-bg beacons + known tracker hosts → cleaned HTML. (verify: unit across beacon fixtures) (test:
   `tracker-strip.test.ts`)
2. Apply in the render transform (and pass the "blocked" state to R02). (verify: no network on open in
   the live app) (test: DOM has no beacon)
3. Optional capture-time strip (INBOX-R13) so stored HTML is beacon-free. (verify: stored HTML clean)
   (test: capture test)
4. Per-user setting (default ON) + opt-out wiring (INBOX-P01/O06). (verify: opt-out loads images via R02)
   (test: pref persistence)

## Current-state notes (VERIFY before building)
- `lib/infra/sanitize-html.ts:4,8` allows `<img>` with no size/opacity/host gate and does **no CSS
  sanitization** — beacons pass today; this spec adds the strip layer (don't loosen the sanitizer).
- No tracker-strip module exists in `lib/inbox/`. Depends on INBOX-R01 (render host) + R02 (proxy/load).
- Pairs with the user-facing controls in INBOX-P01 and the settings hub INBOX-O06.
