# INBOX-R08 — Dark-mode email rendering
> Theme: T1 · Autonomy rung: passive · Priority: P1
> Pillar: P1 fidelity

## User story
As a user in dark mode, I want email bodies to render legibly without a blinding white rectangle and
without breaking the sender's intended layout, so reading mail at night matches the rest of the
dark-mode app.

## Why (audit anchor)
The UI DNA mandates dark mode via the `.dark` class with token swaps, and that "every surface/text
must read from tokens so dark mode 'just works'" (`_UI-DNA.md`). But email bodies are author-styled
HTML (INBOX-R01) — most emails hardcode `color:#000` on `background:#fff`. In dark mode an
unmanaged email body is a glaring white card with possibly-invisible text. Superhuman renders email
in its dark theme cleanly; ours must too, the moment INBOX-R01 lands real HTML. The app chrome
already swaps via tokens; this spec is specifically about the **author-styled email content**.

## Requirements (EARS)
- WHEN the app is in dark mode (`.dark`), the system SHALL render email bodies on a token-driven
  surface (`--color-bg-card`) with token-driven default text, not raw white/black.
- The system SHALL adapt author colors for contrast in dark mode without destroying intended emphasis:
  default text/background follow tokens; explicit author colors are darkened/lightened to remain legible.
- The system SHALL preserve images and brand colors that are intrinsic to the message (logos, product
  screenshots) — never invert image content.
- WHEN an email hardcodes a light background on a content block, the system SHALL keep that block
  readable (e.g. retain the block's own background so its dark text stays legible, rather than forcing
  the page-dark behind light text).
- The system SHALL offer a per-message "view original colors" escape so a user can see the email exactly
  as sent if our adaptation looks wrong.
- The adaptation SHALL be scoped to the email container only (INBOX-R01 scope) and never leak into app chrome.
- The system SHALL apply the same treatment in the reading pane, compose-quote preview, and any inline
  email preview.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN dark mode and a `color:#000;background:#fff` email WHEN opened THEN text is legible on a
  token-dark card (no blinding white rectangle, no invisible text).
- GIVEN dark mode and an email with a colored CTA button WHEN opened THEN the button's brand color and
  contrast are preserved.
- GIVEN dark mode and an email with a product screenshot WHEN opened THEN the image is shown as-is (not
  inverted).
- GIVEN an email whose adapted colors look wrong WHEN the user clicks "view original colors" THEN the
  body renders with the sender's exact styling.
- GIVEN light mode WHEN opening any email THEN rendering is unchanged from INBOX-R01 (no regression).
- GIVEN a folded quote (INBOX-R05) in dark mode WHEN expanded THEN the quoted region is also legible.

## Edge cases & failure handling
- Emails with background images behind text → ensure text contrast (overlay/scrim) or fall back to
  "view original" rather than render unreadable.
- Transparent backgrounds → inherit the token card surface.
- `!important` author styles → our scoped overrides must win for defaults but not nuke intended accents.
- Very colorful marketing emails → prefer minimal intervention (keep block backgrounds) over aggressive inversion.
- Multi-tenant/theme: adaptation is purely presentational, no per-tenant state.

## Best-in-class bar
- We adapt **per-block, preserving intended backgrounds** (so dark text on the sender's light card
  stays readable) and never invert images — smarter than a blunt global invert that mangles brand
  emails, and it ties into our instant token-swap dark mode (no iframe reflow cost).
- An explicit **"view original colors"** escape hatch keeps trust — the user is never stuck with a bad
  auto-adaptation.

## Design sketch
- **Data:** none.
- **API:** none.
- **AI:** none (deterministic CSS adaptation).
- **UI:** in `_email-body.tsx` (INBOX-R01) the scoped container applies a dark-mode stylesheet under
  `.dark`: container `background: var(--color-bg-card)`, default `color: var(--color-text-primary)`,
  links `--color-accent`; a per-block pass keeps author backgrounds where present and ensures contrast.
  "View original colors" toggle (`Palette`/`Eye` lucide, `--color-text-tertiary`). Keyboard: toggle is
  focusable. Works because every chrome token already swaps under `.dark` (UI DNA). Light+dark via
  tokens, no emoji, no provider name, cited.
- **Security/perf:** CSS-only; no extra fetch; complements the scoped-container isolation of INBOX-R01.

## Tasks (ordered)
1. Dark-mode scoped stylesheet for the email container (defaults from tokens, block-background
   preservation, image-exempt). (verify: unit/snapshot of adapted styles) (test: style unit)
2. Per-block contrast pass (keep author light blocks legible). (verify: dark render of a black-on-white
   email is legible) (test: render snapshot)
3. "View original colors" per-message toggle. (verify: toggling restores exact styling) (test: render)
4. Regression: light mode unchanged; quotes/signatures (R05) legible in dark. (verify: browser both
   themes) (test: render both modes)

## Current-state notes (VERIFY before building)
- Today the body is plain text in a token-styled `<p>` (`_conversation-pane.tsx:471`,
  `color: var(--color-text-primary)`), so dark mode is fine for text — the problem only appears once
  INBOX-R01 renders author HTML. This spec depends on INBOX-R01.
- Dark mode is `.dark`-class based with token swaps (`_UI-DNA.md`); `globals.css` defines the `.dark`
  token values — VERIFY the email container reads only tokens.
- No email-specific dark adaptation exists yet.
