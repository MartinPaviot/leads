# A3 — inbox-mailbox-rail-identity · Design

Anchored on live code (file:line verified 2026-06-19). A3 is **reuse-first**: the rail,
its data, the From selector, attribution, and the writing-style draft pipeline already
exist. A3 adds (a) a pure color helper, (b) a user_preferences identity store + clamp,
(c) the wiring that injects the per-box signature/display-name/voice into the surfaces
that already know the mailbox. No migration. No new dependency.

## 1. Architecture diff vs existing

Already there (NOT rebuilt — A3 only feeds them):
- `MailboxRail` (`src/app/(dashboard)/inbox/_mailbox-rail.tsx:13-58`) — All + per-box rows,
  attention badges, active state. A3 adds a color dot + the display-name override.
- The rail data: `mailboxes[]` with `{ id, address, label, attention }`
  (`src/app/api/inbox/conversations/route.ts:83-88`). Shape unchanged; A3 reads it as-is.
- `selectedMailbox` + `&mailbox=` filter (`page.tsx:92,143`). Unchanged.
- From selector + `pickDefaultFrom` (`email-composer-panel.tsx:200,505-560`). A3 feeds it
  display-name + signature; it stays A2-owned.
- The reply draft pipeline: `getWritingStyle` -> `buildWritingStylePrompt` -> instructions
  (`compose/reply/route.ts:88-94`). A3 appends one voice block.
- `user_preferences` store + the writing-style get/save/clamp idiom
  (`writing-style.ts:128-255`, `auth.ts:141-164`). A3's identity store is the same shape.

Added (new files):
- `src/lib/inbox/mailbox-color.ts` — pure `colorForMailbox` + the `MAILBOX_PALETTE`.
- `src/lib/inbox/mailbox-identity.ts` — `MailboxIdentity`, `clampMailboxIdentity`,
  `getMailboxIdentities`, `saveMailboxIdentity`, `buildMailboxVoiceBlock`, `applySignature`.
- `src/app/api/inbox/mailbox-identity/route.ts` — GET (all in-scope identities) + PATCH
  (save one, scope-gated).
- `src/app/(dashboard)/settings/mailbox-identity/page.tsx` — the per-mailbox editor (R4),
  linked from the settings sidebar next to Writing Style.
- Unit tests (see §7).

Changed (existing files, surgical):
- `_mailbox-rail.tsx` — render a `colorForMailbox(m.id)` dot; use `m.label` already carrying
  the override (override applied server-side, see §3) (R1.3, R6.1).
- `conversations/route.ts:83-88` — overlay the identity display-name onto each
  `mailboxes[].label` (and the per-conversation `mailboxLabel`) before returning (R6.1).
- `email-composer-panel.tsx` — on open + on From change, apply the From box's signature to
  the body via `applySignature` (R5.1, R5.3); From option label uses the override (R6.2).
- `_conversation-pane.tsx:189-207` — the sendable-mailbox fetch overlays the identity
  display-name onto each `label` so the selector shows it (R6.2).
- `compose/reply/route.ts:88-94` — resolve the thread's mailbox identity and append
  `buildMailboxVoiceBlock` to the instructions (R7.1-R7.5).
- `settings/settings-sidebar.tsx` — add the "Mailbox identity" nav entry.

## 2. Data model diff

**None.** No Drizzle CREATE/ALTER, no migration (R-LOCK-1, R3 / N5).

Storage reuses `user_preferences` (`src/db/schema/auth.ts:141-164`):
- resource = "inbox", key = "mailboxIdentity"
- value (JSONB) = a map: `{ [mailboxId: string]: { displayName?, signature?, voice? } }`

Confirmed there is **no signature/voice/identity column** on `connected_mailboxes`
(`src/db/schema/outbound.ts:224-284` — only displayName, emailAddress, provider, status,
plus warmup/health fields). A column is NOT warranted: identity is owner-scoped + per-user
(a shared mailbox can have a different signature per reader), which a single column on the
tenant-shared row cannot express, while a per-(user,mailbox) JSONB map can — and it needs
no migration on the broken journal (CLAUDE.md: db:migrate disabled at idx 12).

## 3. Where the override is resolved (display-name precedence)

The display-name override resolves **server-side** so every consumer (rail label,
per-conversation `mailboxLabel`, From selector) reads one already-overridden value and the
rule cannot drift:

- In `conversations/route.ts`, after building `mailboxes` (route.ts:83-88), load the user's
  identities once (`getMailboxIdentities(authCtx.userId)`) and overlay:
  `label = identity[m.id]?.displayName?.trim() || m.label`. Apply the same overlay to the
  per-conversation `mailboxLabel` (route.ts:244).
- The composer's sendable list comes from `/api/settings/mailboxes`
  (`_conversation-pane.tsx:193-201`); A3 overlays the override there in the pane's `.map`
  (cheapest seam; no new endpoint), so the From option shows the override (R6.2).
- Precedence (R6.4): identity.displayName -> connected_mailboxes.display_name -> address.

This keeps the rail component dumb (R1.3 is just "render `m.label` + a dot") and means a
forged id can never inject a name (the overlay only runs over in-scope `mailboxes`).

## 4. Module contracts (pure, DB-free — R-LOCK-2)

### `mailbox-color.ts`
```
export const MAILBOX_PALETTE: string[]            // 8 var(--color-*) token strings
export function colorForMailbox(id: string | null | undefined): string
```
- Stable FNV-1a-style hash of the id mod palette length (R2.2, R2.4); empty/nullish -> the
  fixed fallback slot (R2.3). Returns a token string only (R2.5). No imports, no state.

### `mailbox-identity.ts`
```
export interface MailboxIdentity { displayName?: string; signature?: string; voice?: string }
export function clampMailboxIdentity(input): MailboxIdentity | null   // null = fully empty
export function applySignature(body: string, signature: string | undefined): string
export function stripSignature(body: string): string                 // removes the marker block
export function buildMailboxVoiceBlock(identity: MailboxIdentity | undefined): string
export async function getMailboxIdentities(userId): Promise<Record<string, MailboxIdentity>>
export async function saveMailboxIdentity(userId, mailboxId, patch): Promise<MailboxIdentity>
```
- `clampMailboxIdentity` mirrors `clampWritingStyle` (writing-style.ts:128-142): trim, cap
  (120/2000/2000), drop blanks; returns null when nothing remains (R3.2, R4.3).
- `applySignature`/`stripSignature` use the `\n\n-- \n` marker (R5.5): strip any existing
  marker block first, then append once if a signature is given — idempotent, swap-safe
  (R5.1-R5.4). Pure string ops; unit-tested.
- `buildMailboxVoiceBlock` returns `""` when no voice, else a short additive directive
  ("For this mailbox, also write in this voice:\n<voice>") scrubbed via the existing
  `scrubAutoSend` import from writing-style (R7.4, R7.5).
- `saveMailboxIdentity` reads the current map, merges the (clamped) patch at `mailboxId`,
  drops the key when the merge clamps to null, upserts the whole map (writing-style.ts:245-255).

## 5. Orchestration (Inngest)

**None.** A3 ships no background job. All work is request-time (route handlers) or pure
client/lib code. (No `src/inngest/*` function added.)

## 6. Integrations

**None added.** Confirmed against the locked stack (CLAUDE.md): Next 15 App Router,
React 19, Tailwind 4, Drizzle, lucide-react. No SDK, no provider, no dependency (N5).
Persistence is the existing Drizzle `user_preferences` upsert.

## 7. Tests (what each new unit verifies)

- `mailbox-color.test.ts` — determinism (same id -> same color across calls), totality
  (random + empty + unicode ids), stability (removing an id never recolors others),
  tokens-only (every palette entry starts with `var(--color`). (R2.1-R2.5)
- `mailbox-identity.test.ts` — clamp caps + blank-drop + null-on-empty; merge leaves other
  ids untouched; `applySignature` appends once, swaps on second call, strips on empty;
  `stripSignature` idempotent; `buildMailboxVoiceBlock` empty-when-absent + scrubs
  auto-send phrasing. (R3.2-R3.5, R5.1-R5.5, R7.4-R7.5)
- `mailbox-identity.scope.test.ts` (route-level) — PATCH with an out-of-scope mailboxId is
  rejected; GET returns only in-scope ids. (R3.6, E6)
- eval fixture (`pnpm eval:run`, B2 voice judge) — a thread whose box has a voice override
  yields a draft the judge scores as adhering to that voice, with zero auto-send leakage. (R7, G-eval)

## 8. G-design acceptance (F1 checklist, reused inline)

F1 is not built; A3 conforms to the existing inline token pattern in `page.tsx` /
`_mailbox-rail.tsx` (which already pass these). The rail dot + identity editor must hold:

1. Tokens only — color dot + editor use var(--color-*) / MAILBOX_PALETTE tokens, no hex.
2. One accent gradient — editor Save is the shared gradient Button; no second gradient.
3. One button system — editor uses the shared Button (`@/components/ui/button`).
4. Type scale snaps — labels 11/uppercase, inputs 12-13, mirroring writing-style page.
5. Density — rail rows keep their current padding; editor sections on the 4px rhythm.
6. Radius family — inputs/cards rounded-md/lg per the writing-style page idiom.
7. Elevation via tokens — any menu uses --shadow-*; the dot has none.
8. Contrast — the dot is decorative (never the sole carrier of which box); name + address
   always present (a11y: state not by hue alone).
9. Dark-mode parity — palette tokens resolve via .dark; no hard-coded light value.
10. No emoji, lucide only — Mail/Inbox/PenLine icons; zero emoji.
11. Focus + motion — inputs use :focus-visible ring; transitions 100-150ms.
12. State coverage — editor has loading (skeleton/spinner), empty (no mailboxes), saved states.

Recorded as a 12/12 PASS line in tasks.md at the design-review task.

## 9. Guardrails (one line each)

- No migration, no column on connected_mailboxes — identity lives in user_preferences JSONB.
- Color/clamp/voice/signature helpers are pure + DB-free + unit-tested (no I/O in lib).
- Display-name override is presentation-only; never mutates display_name / from_address / attribution.
- Signature uses one "-- " marker; strip-then-append keeps it idempotent (never duplicated on send).
- Identity is only ever resolved/saved for mailboxIds inside getInboxScope (no widening).
- Per-mailbox voice is scrubbed through isAutoSendInstruction — never re-opens never-auto-send.
- No second gradient, no new dependency, no new icon set; dot tokens resolve in dark mode.
- A3 does not touch A1 connect, A2 From-selector ownership, or A4 sync — strictly identity + rail.
