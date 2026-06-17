# INBOX-C12 — Inline grammar / autocorrect
> Theme: T4 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing

## User story
As a user typing fast, I want typos auto-corrected and grammar issues flagged inline as I write, so
my replies go out clean without me proofreading every line.

## Why (audit anchor)
Superhuman ships **Autocorrect** (real-time correction, Settings → Superhuman AI) and the in-composer
rewrite includes **Fix spelling and grammar** (`feature-inventory.md` §Autocorrect; `ai-feature-deep-dive.md`
step 4). With Grammarly now owning Superhuman, clean-as-you-type is table stakes (`audit.md` §2 Compose
ergonomics → "autocorrect"). C12 is the lightweight, always-on counterpart to C04's on-demand "Fix
grammar" — inline, per-keystroke-safe, dictionary-aware.

## Requirements (EARS)
- WHILE the user types in the composer, the system SHALL auto-correct obvious typos (common
  misspellings, doubled words, casing of sentence starts) in real time.
- The system SHALL flag (not silently change) grammar issues inline with an unobtrusive underline and a
  suggestion the user can accept or dismiss.
- The system SHALL respect a personal dictionary: names, product terms ("Elevay", "Pilae"), and
  user-added words SHALL NOT be flagged or corrected.
- The system SHALL be language-aware: correct in the composing language (FR/EN at minimum), not force
  English rules onto French text.
- The system SHALL make every auto-correction undoable (one keystroke / Ctrl+Z restores the original).
- The system SHALL NOT alter quoted text, signatures, code blocks, URLs or email addresses.
- The system SHALL be toggleable per user (default on) via the settings hub (INBOX-O06), and SHALL not
  introduce typing lag.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the user types "teh" + space WHEN autocorrect is on THEN it becomes "the", reversible with Ctrl+Z.
- GIVEN a grammar issue ("their is") WHEN typed THEN it is underlined with a suggestion ("there is"),
  applied only if the user accepts.
- GIVEN the user types "Pilae" WHEN it's in the personal dictionary THEN it is never flagged/changed.
- GIVEN French text "je vais te envoyer" WHEN typed THEN French rules apply (elision suggestion "t'envoyer"),
  not English corrections.
- GIVEN a URL or email address in the body WHEN typing around it THEN it is never altered.
- GIVEN autocorrect is toggled off WHEN typing THEN no corrections or flags appear.
- GIVEN any auto-correction WHEN the user presses Ctrl+Z THEN the original characters return.

## Edge cases & failure handling
- IME / non-Latin scripts → suppress Latin autocorrect during composition; never corrupt input.
- Intentional misspelling / stylized brand → personal dictionary + easy "keep original" / "add to dictionary".
- Over-correction risk → only auto-apply high-confidence typo fixes; everything else is a dismissible flag.
- Pasting text → do not aggressively rewrite pasted content; flag only.
- Offline → basic dictionary correction still works client-side; heavier grammar checks degrade gracefully.
- Multi-tenant/personal: the personal dictionary is per-user; never shared across tenants without opt-in.

## Best-in-class bar
- The personal dictionary is **GTM-aware out of the box**: it is seeded from the user's CRM/knowledge
  vocabulary (their company, product names, key accounts) so brand and account names are never "corrected"
  — a generic spellchecker flags exactly the words a founder uses most.
- It shares the **same language detection** as compose/translate (INBOX-C08), so FR/EN correctness is
  consistent across the whole writing surface, not a separate English-only checker.

## Design sketch
- **Data:** a per-user `personal_dictionary` (words) — VERIFY no such store exists before adding; seed
  from knowledge-base/company vocabulary. No change to stored messages (correction is in the composer only).
- **API:** mostly client-side. High-confidence typo correction + dictionary run in the browser for zero
  lag; optional `POST /api/inbox/grammar` for heavier, language-aware grammar suggestions on a debounced
  basis (reuse `tracedGenerateObject` only if a rules engine is insufficient). Keep server calls off the
  hot path.
- **UI:** inline in the composer (`_conversation-pane.tsx`): wavy underline (`--color-warning` for grammar,
  subtle) + a small suggestion popover ("there is" · Dismiss · Add to dictionary). A settings toggle +
  dictionary manager (INBOX-O06). `SpellCheck` lucide icon for the toggle. Light+dark via tokens, no emoji,
  no provider name.
- **AI:** deterministic dictionary/typo rules first; LLM grammar suggestions optional + debounced + cancellable.
- **Security/perf:** never block keystrokes; debounce server checks; skip quoted/sig/code/URL regions;
  per-user dictionary scope; zero-retention → client-only, no keystroke persistence.

## Tasks (ordered, each with verify + test)
1. Client typo-correction engine (high-confidence map + sentence casing + doubled-word) with undo and
   region-skipping (URLs/emails/quotes/code). (verify: "teh"→"the" reversible; URL untouched) (test:
   `autocorrect.test.ts` incl. region-skip + undo).
2. Personal dictionary store + seed from company/knowledge vocabulary; "add to dictionary" / "keep original".
   (verify: "Pilae" never flagged; user word persists) (test: dictionary unit + scope).
3. Language-aware grammar flags (FR/EN) inline with accept/dismiss; shared detection with INBOX-C08.
   (verify: French elision suggested; English rules not forced on FR) (test: language-rule unit).
4. Per-user toggle + IME/paste suppression + zero-retention/offline degrade. (verify: off → silent; IME safe;
   offline basic correction) (test: toggle/composition/offline test).

## Current-state notes (VERIFY before building — code moves)
- No inline autocorrect/grammar exists in the composer today (`_conversation-pane.tsx` composer is a plain
  controlled field). C12 is the always-on counterpart to INBOX-C04's on-demand "Fix grammar".
- VERIFY whether any personal-dictionary or spellcheck store exists before adding `personal_dictionary`.
- Language detection is shared with INBOX-C08 (build once). AI provider/rate-limit infra EXISTS
  (`lib/ai/ai-provider.ts`, `lib/ai/traced-ai.ts`, `lib/infra/rate-limit.ts`) for the optional grammar pass;
  keep it off the typing hot path.
