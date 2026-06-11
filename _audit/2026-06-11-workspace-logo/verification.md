# Workspace logo — live verification (2026-06-11)

Feature: Settings → General gains a "Workspace logo" block (upload / replace /
remove); the sidebar account bubble shows the logo instead of the workspace
initials, with the brand gradient kept as the bubble background (visible
through transparent logo regions — explicit requirement).

Environment: next dev on 127.0.0.1:3000 against the live DB, session minted as
martin.paviot@pilae.ch (tenant 47dca783), own headless system-Chrome instance
(the Playwright MCP browser was held by a parallel session). The machine's
network to Supabase flapped repeatedly during the session (EHOSTUNREACH /
ENOTFOUND / ERR_NETWORK_CHANGED windows), which is why several runs needed
retries; every failure below traced to those windows, none to the feature.

## Evidence

| # | Screenshot | What it shows |
|---|------------|---------------|
| 001 | settings-before-initials | Logo block with the gradient initials bubble, no logo stored |
| 002 | settings-after-upload | Elevay PNG uploaded: round preview shows the logo over the gradient; Saving… → Remove visible |
| 003 | settings-after-reload-persisted | After reload the sidebar still carries the versioned logo URL (SSR). Caveat: the preview block's own client fetch hit a network-flap 500 during this exact load and fell back to initials with an empty name field — degraded-network rendering, not a logo bug. 004 is the strong persistence proof. |
| 004 | settings-logo-before-remove | 1h07 later, after a dev-server restart: name loaded, Replace logo + Remove present (logoUrl live), preview circle shows the gradient backdrop while the image bytes were still in flight — the graceful-loading behavior the gradient requirement was about |
| 005 | settings-after-remove-initials-back | After remove: gradient initials bubble back (preview + sidebar), Upload logo button restored |
| 006 | ui-click-upload-rendered | Post-merge follow-up: REAL "Upload logo" button click → file chooser → logo rendered over the gradient, name loaded, Replace/Remove present (healthiest full render of the series) |
| 007 | ui-click-remove-initials-back | REAL "Remove" button click → preview + sidebar back to gradient initials |

## Programmatic assertions (passed 2026-06-11 ~10:34)

Both the sidebar bubble (24px) and the settings preview (40px) rendered the
uploaded logo with:

- `src=/api/settings/workspace/logo?v=2026-06-11T08%3A30%3A35.390Z` (versioned)
- `complete && naturalWidth > 0` (bytes actually served and decoded)
- `background-image: linear-gradient(90deg, rgb(23,195,178), rgb(44,107,237), …)`
  (gradient backdrop kept — the requirement)
- `object-fit: contain`, `border-radius: 3.35544e+07px` (round, non-cropping)

PUT /api/settings/workspace → 200 on upload (real UI file-input path);
GET /api/settings/workspace → logoUrl versioned; persisted across reload.

## Remove path

During the network-flap windows the UI Remove click could not be
live-completed (the page's initial GET 500'd → no Remove button rendered);
removal was executed through the same authenticated endpoint the button
calls and verified at the source (`logo_len: 51030` → `null`).

**Closed post-merge (same day, ~11:06Z), network stable:** the FULL UI
cycle ran with real button clicks —

- "Upload logo" click → native file chooser → PNG picked → PUT 200 →
  sidebar bubble + preview both rendered the logo bytes (006).
- "Remove" click → PUT 200 → both imgs detached, initials back (007).
- Authenticated GET /api/settings/workspace/logo after removal →
  **404 application/json** (fail-closed verified live, not just in tests).
- DB after: `logo_len: null`, `logoUpdatedAt: 2026-06-11T11:06:50.768Z`.

Live tenant left clean: no logo stored, name/domains untouched.
