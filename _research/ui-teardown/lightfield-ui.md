# Lightfield UI Forensics — Summary

## Methodology
Live DOM inspection via Playwright on crm.lightfield.app on 2026-04-01. Extracted CSS custom properties, computed styles, element dimensions, and page screenshots for every page in the app.

## Key Files
- `lightfield-design-tokens.md` — 351 CSS custom properties, complete color/typography/spacing system
- `lightfield-components.md` — Every component type with exact CSS values
- `lightfield-layouts.md` — Page-by-page layout analysis with measurements
- `lightfield-interactions.md` — Micro-interactions, navigation patterns, state management
- `lightfield-emotional.md` — Subjective analysis of what makes the UI feel professional

## Screenshots
- `lf-ui-001-meetings-page.png` — Meetings (empty state)
- `lf-ui-002-accounts-list.png` — Accounts table with industry badges
- `lf-ui-003-account-detail.png` — Account slide-over panel
- `lf-ui-004-opportunities.png` — Kanban board
- `lf-ui-005-chat-thread.png` — Chat with AI responses + inline CRM data
- `lf-ui-006-up-next.png` — Dashboard/Up Next with sections + chat input
- `lf-ui-007-contacts.png` — Contacts table
- `lf-ui-008-tasks.png` — Tasks grouped by date
- `lf-ui-009-settings.png` — Error page (404)
- `lf-ui-010-settings-mail.png` — Settings: Mail and Calendar
- `lf-ui-011-settings-notifications.png` — Settings: Notifications with checkboxes
- `lf-ui-012-notes.png` — Notes grouped by account

## Top 10 Design Insights

1. **OKLCH color space** — perceptually uniform, modern CSS, enables automatic theme generation
2. **System font stack** — no custom fonts, instant rendering, native OS feel
3. **Sub-pixel borders** (0.666667px) — adds definition without visual weight
4. **Transparency-based theming** — text/borders use alpha, works on any background
5. **Unusual font weights** (425, 450) — subtle density without boldness
6. **10% opacity badge backgrounds** — colored pills that are readable and harmonious
7. **Chat as persistent UI** — input bar visible across non-chat pages
8. **Slide-over detail panels** — entity details without full page navigation
9. **Minimal shadows** — `oklch(0 0 0 / 0.04)` lift on buttons, `0.06` on panels
10. **No loading states observed** — instant transitions, no spinners or skeletons visible

## What We Should Steal

### Definitely Adopt
- Sub-pixel border technique
- Transparency-based text/border colors
- Badge color-from-content system
- Persistent chat input pattern
- Slide-over detail panels
- 6px border-radius standard
- Minimal shadow philosophy

### Consider Adopting
- System fonts instead of Inter (faster, more native)
- OKLCH color space (modern but less browser-compatible)
- 425/450 font weights (need font support)
- Light mode as default (our current design-language.md is dark-first)

### Skip
- No loading/skeleton states (we need them for real data fetching)
- Bare empty states (we should add illustrations)
- No dark mode toggle visible (we should support both)
