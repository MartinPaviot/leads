# INBOX-R10 — Unicode / RTL / emoji correctness
> Theme: T1 · Autonomy rung: passive · Priority: P1
> Pillar: P1 fidelity

## User story
As a user receiving mail in any language, I want non-Latin scripts, right-to-left languages, accents,
and emoji to render correctly in subjects, bodies, sender names, and snippets, so an Arabic, Hebrew,
Chinese, or accented-French email reads exactly as the sender intended.

## Why (audit anchor)
A faithful mailbox (audit P1) is internationally correct — Superhuman handles Unicode invisibly; it's
only visible when it breaks (mojibake, reversed RTL, tofu boxes). For Elevay this is doubly important:
our wedge is **francophone / Suisse-romande** (accents everywhere) and our sovereign targets include
**international institutions in Geneva** (memory: international Geneva segment — ONG/UN/sport
federations, multilingual). Mojibake in a French or Arabic email is an immediate credibility failure.
Today bodies are passed through as plain text; correctness depends on decode + render discipline that
must be verified end-to-end (capture decode → storage → render).

## Requirements (EARS)
- The system SHALL decode email charsets and transfer encodings correctly at capture so stored
  `raw_content`/`bodyHtml` are valid UTF-8 (quoted-printable, base64, ISO-8859-x, Windows-1252,
  GB2312, Shift-JIS, etc.).
- The system SHALL decode RFC 2047 encoded-words in headers (subject, From display name) so
  `=?UTF-8?Q?...?=` never appears literally.
- WHEN a body or subject is right-to-left (Arabic/Hebrew), the system SHALL render it with correct
  bidi direction and alignment (per-paragraph direction, not a forced LTR).
- The system SHALL render emoji as emoji (color where the platform supports it), never as tofu or escapes.
- The system SHALL preserve combining marks and normalization (accented French é/è/ç, ligatures) without
  corruption.
- The system SHALL keep the UI chrome LTR while allowing the email **content** to be RTL (mixed-direction
  layout: app frame LTR, message body bidi-correct).
- The system SHALL apply the same correctness to list snippets and the GTM sidebar, not only the pane.
- The system SHALL guard against bidi-override spoofing in subjects/sender names (strip dangerous bidi
  control chars used to disguise text), tying to INBOX-P02.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an email subject `=?UTF-8?Q?Réunion_jeudi?=` WHEN listed THEN it shows "Réunion jeudi" (decoded).
- GIVEN an Arabic body WHEN opened THEN it renders right-to-left with correct alignment and joined letters.
- GIVEN a French body with é/è/ç/œ WHEN opened THEN all accents/ligatures render correctly (no `Ã©`).
- GIVEN a body with emoji WHEN opened THEN emoji display as emoji (no tofu, no `\u` escapes).
- GIVEN an ISO-8859-1 / Windows-1252 body with no proper UTF-8 declaration WHEN opened THEN it is decoded
  legibly (no mojibake).
- GIVEN a subject using RTL-override control characters to disguise a filename/URL WHEN listed THEN the
  override is neutralized (anti-spoof).
- GIVEN a mixed LTR/RTL paragraph WHEN opened THEN each run flows in its correct direction.

## Edge cases & failure handling
- Unknown/mislabeled charset → detect (BOM / heuristic) then best-effort decode; replacement chars over crash.
- Double-encoded UTF-8 (already-mojibake at source) → detect common patterns and repair where safe;
  otherwise show as received (don't guess wildly).
- Emoji ZWJ sequences / skin-tone modifiers → render as the single intended glyph.
- Very long RTL lines → wrap correctly within the R01 container.
- Fonts: ensure the email container font stack includes Unicode coverage fallbacks (not only Inter) so CJK/
  Arabic glyphs have a face (no tofu).
- Multi-tenant: pure rendering/decoding, no per-tenant state.

## Best-in-class bar
- We are **correct for the francophone + Geneva-international reality** by design (accents, FR/AR/multilingual
  RTL), with anti-bidi-spoof on subjects — a concrete trust+fidelity edge for our actual ICP, not an afterthought.
- Decoding is enforced **at capture** (stored clean UTF-8), so every downstream consumer (search, summaries,
  CRM, exports) gets correct text — not just the pane.

## Design sketch
- **Data:** none new; ensures `raw_content`/`metadata.bodyHtml` are clean UTF-8 (INBOX-R13 capture).
- **API/transport:** `mailparser` decodes most charsets/encoded-words; add a charset-detection +
  fallback-decode helper for mislabeled bodies. RFC 2047 header decode verified for subject/From.
- **AI:** none.
- **UI:** the `_email-body.tsx` container sets `dir="auto"` per block (or computes direction), includes a
  Unicode-complete font fallback stack after `--font-sans`, and renders emoji natively. Bidi-control
  stripping for subjects in `_conversation-list.tsx`/pane header. No new shortcut. Light+dark via tokens,
  no emoji-in-UI (email *content* emoji are fine; this rule is about our chrome), no provider name, cited.
- **Security:** strip Unicode bidi-override/control chars from display strings (anti-spoof, INBOX-P02).

## Tasks (ordered)
1. `lib/inbox/text-decode.ts` — pure: detect+decode charset/transfer to UTF-8; decode RFC 2047; strip
   dangerous bidi controls from display strings. (verify: unit across charsets/encoded-words/bidi) (test:
   `text-decode.test.ts`)
2. Apply decode at capture so storage is clean UTF-8 (INBOX-R13). (verify: stored é/Arabic correct) (test:
   capture decode)
3. `_email-body.tsx` bidi `dir="auto"` + Unicode font fallback + native emoji. (verify: browser AR/FR/emoji)
   (test: render direction)
4. Bidi-strip subjects/sender names in list + pane. (verify: spoofed subject neutralized) (test: render)

## Current-state notes (VERIFY before building)
- Bodies flow through as text today (`_conversation-pane.tsx:471`); correctness depends on capture decode +
  the font stack — VERIFY `globals.css` font fallbacks cover CJK/Arabic (Inter does not).
- `mailparser` (`imap.ts:17,113`) handles many charsets/encoded-words; the gap is mislabeled charsets +
  explicit bidi handling + anti-spoof — none exist yet.
- No `text-decode` helper exists in `lib/inbox/`. Ties to INBOX-R09 (decode), R13 (clean storage), P02 (spoof).
