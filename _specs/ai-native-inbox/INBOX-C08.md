# INBOX-C08 — Translate / multi-language compose
> Theme: T4 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing

## User story
As a founder selling across French- and English-speaking markets, I want to write or reply in any
language — and translate a draft or an inbound message — without leaving the composer, so language
is never a barrier to a fast, on-brand reply.

## Why (audit anchor)
**Translate** is in the master writing taxonomy (`audit.md` §2 Writing) and is table stakes for an
AI-native inbox serving non-English mail. For Elevay it is also a **wedge**: the francophone GTM
motion (`MEMORY` Elevay GTM philosophy; Pilae = Suisse romande) means many threads are FR/EN-mixed.
Composing and replying natively in the counterparty's language, in the user's voice, is a
differentiator a US-English-default inbox handles poorly.

## Requirements (EARS)
- WHEN the user requests translation of the composer draft to a target language, the system SHALL
  return the draft in that language, preserving meaning, the user's voice and any CTAs.
- WHEN an inbound message is in a language other than the user's UI language, the system SHALL offer a
  one-click "Translate message" that shows the translation without altering the stored original.
- The system SHALL auto-detect the inbound/draft language and default replies/drafts (C01/C02/C04/C07)
  to the thread's language unless the user overrides.
- The system SHALL preserve formatting, names, links and untranslatable tokens (product names,
  placeholders) exactly during translation.
- The system SHALL clearly mark machine-translated text as such (a "translated" affordance) so the user
  knows what to proofread before sending.
- The system SHALL be tenant/user-scoped, rate-limited, and honour zero-retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an English draft WHEN "Translate → French" is clicked THEN the body becomes idiomatic French,
  voice preserved, CTAs intact, with an Undo to restore the English.
- GIVEN a French inbound WHEN "Translate message" is clicked THEN an English rendering appears inline;
  the stored original message is unchanged.
- GIVEN a reply on a French thread WHEN the user invokes Draft (C01) THEN the draft is produced in
  French by default (thread language), overridable to English.
- GIVEN a draft containing "Elevay" and a URL WHEN translated THEN the product name and URL are left
  exactly as-is.
- GIVEN any translation WHEN shown/inserted THEN a "translated" marker is visible so the user proofreads.
- GIVEN translation fails THEN the original text is untouched and a non-blocking toast shows.

## Edge cases & failure handling
- Mixed-language input → translate the dominant language; flag mixed content so the user reviews.
- RTL target (e.g. Arabic) → render correctly (ties to INBOX-R10 RTL correctness); preserve direction.
- Idioms / formality → keep the register the user/thread implies (tu/vous correctness in French).
- Very long message → translate fully; offer Shorten (C04) if needed.
- Zero-retention → original + translation not persisted beyond the request.
- Multi-tenant: never translate or expose another user's message.

## Best-in-class bar
- Translation is **voice-preserving** and **register-aware** (e.g. French tu/vous matched to the
  relationship), reusing the user's sent-mail few-shot — generic "Translate" buttons flatten tone.
- Replies **default to the thread's language**, so a francophone prospect always gets French without
  the user toggling anything — aligned with our francophone GTM wedge, which US inboxes don't optimize for.

## Design sketch
- **Data:** none new. The stored message original is never mutated; translations are render-time only
  (optionally cached on the conversation in non-zero-retention mode).
- **API:** `POST /api/inbox/translate` `{ text, targetLang, mode: "draft"|"message", conversationKey? }`
  → `{ text, detectedSourceLang }`. Language default for C01/C02/C04/C07 derived from detected thread
  language. Reuse `buildWritingStylePrompt` for draft translation to keep voice.
- **UI:** composer toolbar "Translate" control (`Languages` lucide icon) with a target-language menu;
  reading-pane "Translate message" affordance under the body in `_conversation-pane.tsx`. A small
  "translated" badge (`--color-info-soft`) marks machine output; Undo restores the original draft.
  Light+dark via tokens, no emoji, no provider name, original preserved.
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject`/text generation; instruction set to preserve
  names/links/placeholders, match register, keep voice; `_trace.agentId="translate"`.
- **Security/perf:** rate-limited; zero-retention → no persistence; scope on every lookup; detection
  cached per message to avoid repeat calls.

## Tasks (ordered, each with verify + test)
1. `POST /api/inbox/translate` (draft + message modes, voice-preserving for drafts, detect source lang,
   preserve tokens). (verify: FR↔EN both modes; "Elevay"/URLs untouched) (test: `translate.test.ts` incl.
   token-preservation + register).
2. Composer Translate control + reading-pane Translate-message affordance + "translated" marker. (verify:
   browser — draft translates with Undo; inbound shows inline translation, original intact) (test: UI test).
3. Thread-language default wired into C01/C02/C04/C07. (verify: French thread → French draft by default)
   (test: language-default unit).
4. Zero-retention + scope + RTL. (verify: P03 → nothing stored; RTL renders correctly) (test: retention/scope/RTL).

## Current-state notes (VERIFY before building — code moves)
- No translate path exists in the inbox today. The reading-pane body renders plain text at
  `_conversation-pane.tsx:471` (will be HTML post-INBOX-R01) — the Translate affordance attaches there.
- Voice few-shot EXISTS (`lib/writing-profile.ts`); reuse for voice-preserving draft translation.
- RTL correctness is owned by INBOX-R10; coordinate so translated RTL output renders right.
- AI provider EXISTS: `lib/ai/ai-provider.ts` (`anthropic`), `lib/ai/traced-ai.ts` (`tracedGenerateObject`),
  rate-limit `lib/infra/rate-limit.ts`.
