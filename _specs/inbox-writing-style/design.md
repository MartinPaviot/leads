# B2 — inbox-writing-style — Design

Anchored on the real Elevay files. B2 is the voice engine behind B1's draft
quality: it turns the already-shipped per-user tone (`voice-prefs.ts`) + about-me
memory (`ai-memory.ts`) into a transparent, editable, per-audience Writing Style
record, and feeds it into the existing draft join point.

## 1. Architecture diff vs existing

Already there (REUSE, do not rebuild):
- `user_preferences` JSONB store + unique (`userId`,`resource`,`key`)
  (`db/schema/auth.ts:141-164`). Same get/upsert pattern as
  `voice-prefs.ts:72-99`, `ai-memory.ts:102-132`, `ai-profile.ts:50-76`.
- The draft join point: `compose/reply/route.ts:49-51` builds
  `instructions = [voice, memory].join("\n\n")` and passes it to
  `composeReply(messages, { instructions })`; `compose-reply.ts:31`
  `buildReplyPrompt` prepends it. THIS is where the writing-style block attaches.
- `aiEnabled(getAiProfile)` gate (`compose/reply/route.ts:32`, `ai-profile.ts:39`)
  — fail-closed when AI is off.
- The never-auto-send guard `AUTO_SEND_RE` / `isAutoSendInstruction`
  (`ai-memory.ts:46-51`) — reused to scrub the editable prompt.
- The sent-mail corpus `outboundEmails` (`db/schema/outbound.ts:286-332`:
  `bodyText`, `subject`, `mailboxId`, `contactId`, `sentAt`) for derive.
- `tracedGenerateObject` + `anthropic("claude-haiku-4-5...")`/`openai` selection
  (`compose-reply.ts:50-68`) — same generator seam for the derive LLM call.
- The Inngest client + serve registry (`inngest/client.ts`,
  `app/api/inngest/route.ts:94-285`).
- The settings shell + nav (`settings/settings-sidebar.tsx:57-117`,
  `settings/layout.tsx`); the inbox token system + Button/Badge for F1.

Added (new files, all `[NEW]`):
- `lib/inbox/writing-style.ts` — the `WritingStyle` type, `DEFAULT_PROMPT`
  (verbatim Upstream), `clampWritingStyle`, `getWritingStyle`/`saveWritingStyle`
  (resource="inbox" key="writing_style"), `buildWritingStylePrompt`,
  `selectAudience`, `normalizeSchedulingLink`. Pure helpers + the store.
- `lib/inbox/derive-style.ts` — pure `buildDerivePrompt(sentBodies)` +
  `sanitizeDerivedStyle(text)` (the no-PII/no-hallucination filter, R5.5).
- `inngest/inbox-style-derive.ts` — the `deriveWritingStyle` Inngest fn.
- `app/api/inbox/writing-style/route.ts` — GET/PUT the record.
- `app/api/inbox/writing-style/derive/route.ts` — POST enqueue + GET poll the
  proposal (status: idle|pending|ready|rejected|insufficient).
- `app/api/inbox/writing-style/audience-preview/route.ts` — POST a test recipient
  -> resolved audience (R4.5).
- `app/(dashboard)/settings/writing-style/page.tsx` — the unified surface (R6).
- `lib/evals/fixtures/inbox/inbox-derive-style.golden.jsonl` + a no-PII grader
  in the C1 `inbox-draft` suite (R7.2).

Changed (existing files):
- `compose/reply/route.ts:49-51` — prepend `buildWritingStylePrompt(style, aud)`
  resolved via `selectAudience(style, recipient)` from the conversation
  counterparty; instructions become `[style, voice, memory].filter(Boolean)
  .join("\n\n")`.
- `settings/settings-sidebar.tsx` — add the Writing Style nav item under Workspace.
- C1 `inbox-draft` suite — re-run after the prompt change to re-green the voice
  judge (R7.1); add the derive no-PII fixture set (R7.2).

NOT touched: per-mailbox signature/from (A3); the generate-draft button/refine
(B1); the tone preset storage (`key="voice"`, left intact, folded into the same
page UI but read from its own record — additive, R1.5).

## 2. Data model diff

No Drizzle CREATE/ALTER, no migration. Reuses `user_preferences`
(`db/schema/auth.ts:141`) with a NEW key under the existing resource="inbox":

| resource | key | owner | shape | spec |
|---|---|---|---|---|
| inbox | voice | user | `{ tone, customGuidance? }` | `[DONE]` O03 |
| inbox | memory | user | `{ standingInstructions[], aboutMe }` | `[DONE]` O02 |
| inbox | ai_profile | user | `{ profile }` | `[DONE]` P03 |
| inbox | **writing_style** | user | `WritingStyle` (below) | **`[NEW]` B2** |

```ts
// lib/inbox/writing-style.ts
export interface AudienceMatch {
  kind: "domain" | "title" | "contact_tag" | "all";
  value?: string;            // e.g. "acme.com", "investor", "vip"; absent for "all"
}
export interface Audience {
  id: string;                // crypto.randomUUID()
  label: string;             // "Investors", "Customers"
  match: AudienceMatch;
  prompt: string;            // replaces the base style prompt when matched (R4.3)
}
export interface WritingStyle {
  aboutMe: string;           // free text, <=600
  role: string;              // "Founder at Acme", <=120
  schedulingLink: string;    // normalized URL or "", <=120
  signOff: string;           // "Best", "Thanks", <=120
  prompt: string;            // the editable base style prompt, <=2000
  audiences: Audience[];     // <=8, first-match wins (R4.2)
  derivedAt?: string;        // ISO when last accepted from a derive proposal
}
```

The derive PROPOSAL is a separate transient record so it never overwrites the live
prompt until accepted (R5.4): resource="inbox", key="writing_style_proposal",
shape `{ status: "pending"|"ready"|"rejected"|"insufficient", prompt?, aboutMe?,
signOff?, reason?, at }`. The UI polls it; "Accept" copies the fields into
`writing_style` + sets `derivedAt` and clears the proposal.

Recipient segment for audience routing (R4.2) reads existing tables only: the
conversation counterparty address (already on `Conversation` from
`conversations.ts`, the last-inbound-from / last-outbound-to), its email domain,
and a `contacts` lookup by email for `title` (`db/schema/core.ts:160,170`). No new
column.

## 3. The prompt assembly (the load-bearing change)

`buildWritingStylePrompt(style, audienceId?)` (pure) emits, in order:
1. The base style prompt — OR the matched audience's prompt when `audienceId` is
   set (R4.3, replace not append).
2. `The user is {role}.` + `About the user: {aboutMe}` when set.
3. `Sign off with "{signOff}".` when set (composes with memory `signOffName`, R3.4).
4. `When proposing a meeting or call, offer this booking link: {schedulingLink}.
   Never invent a link.` when set (R3.3).
All four pass through `isAutoSendInstruction` scrubbing (R2.4); any auto-send
phrase is dropped and reported via the same `ignored` channel as `buildMemoryPrompt`.

At the route (`compose/reply/route.ts`):
```
const style = await getWritingStyle(userId);
const audienceId = selectAudience(style, recipientOfConversation)?.id;
const stylePrompt = buildWritingStylePrompt(style, audienceId);
const voice = buildVoicePrompt(await getVoicePrefs(userId));     // [DONE]
const { prompt: memory } = buildMemoryPrompt(await getInboxMemory(userId)); // [DONE]
const instructions = [stylePrompt, voice, memory].filter(Boolean).join("\n\n");
```
Order matters: writing-style leads (it carries the seeded house style + audience
variant), tone refines, memory adds standing facts. Backward-compatible — an empty
`writing_style` yields the default prompt, so existing behavior only improves.

## 4. Orchestration (Inngest)

| Fn | id | Trigger | Job |
|---|---|---|---|
| `deriveWritingStyle` | `inbox-writing-style-derive` | event `inbox/writing-style.derive` `{ userId, tenantId }` | Load <=50 human-authored sent `outboundEmails.bodyText` for the user's mailboxes (exclude sequence/campaign sends), `sentAt` desc. If <5 -> write proposal `{status:"insufficient"}` (R5.3). Else `tracedGenerateObject` with `buildDerivePrompt(bodies)` (agentId "inbox-derive-style") -> a STYLE-ONLY prompt. Run `sanitizeDerivedStyle` (R5.5): reject (status "rejected") if it leaks PII or unsupported directives, else write `{status:"ready", prompt, aboutMe?, signOff?}`. Idempotent on `{userId}` via Inngest concurrency key (R5.6). |

Registered in `app/api/inngest/route.ts` serve list (one import + one array
entry, matching the 100+ existing fns). No cron; purely user-triggered.

Eligibility filter for "human-authored": exclude rows that have a non-null
sequence/campaign linkage (outbound created by `sendSequenceStep` /
`sequenceDraftToOutbound` carry that provenance) — derive learns the user's 1:1
voice, not templates (R5.2).

## 5. "Fill it up for me!" — the derive pipeline (end to end)

1. UI POSTs `/api/inbox/writing-style/derive`; route writes proposal
   `{status:"pending"}` and `inngest.send("inbox/writing-style.derive", {userId,
   tenantId})`. A second POST while pending is a no-op (R5.6).
2. `deriveWritingStyle` runs (section 4), writing the proposal to "ready" /
   "rejected" / "insufficient".
3. UI polls GET `/api/inbox/writing-style/derive`. On "ready" it shows the proposed
   prompt diffed against the current one with Accept / Dismiss. Accept -> PUT the
   record with the proposed fields + `derivedAt` (R5.4); Dismiss clears the proposal.
4. The live `prompt` is never mutated by the job — only by an explicit Accept or
   manual edit. This is the transparency contract (R2.1, R5.4).

`sanitizeDerivedStyle(text)` (pure, R5.5) rejects when the text contains:
- an email address, a URL/domain, a person/company proper noun echoed from a source
  body, a currency/number token, or quoted source content; or
- a non-style directive (anything that is not a tone/length/phrasing rule).
It is the deterministic floor of the C1 gate (R7.2) and runs with no LLM key.

## 6. Integrations — vs the locked stack

- Store: Drizzle + Postgres `user_preferences` (`[LOCKED]`, no migration).
- LLM: AI-SDK v6 + `@anthropic-ai/sdk` via `tracedGenerateObject`
  (`compose-reply.ts:50`) (`[LOCKED]`; no new provider).
- Background: Inngest (`[LOCKED]`).
- Evals: Vitest `pnpm eval:run` reusing the C1 `inbox-draft` suite (`[LOCKED]`).
- UI: Next 15 + Tailwind 4 tokens + shared Button/Badge (`[LOCKED]`).
- NO new dependency. PII detection is a local pure fn (Layer-3, keeps the offline
  floor dependency-free, mirrors C1 `inbox-metrics.ts`).

## 7. G-design acceptance gate (F1 12-item, copied per inbox-design-system/design.md:85)

The settings surface passes when ALL hold (record one-line PASS/FAIL each in
tasks.md B12):
1. Tokens only — every color a `var(--color-*)`; no raw hex/rgb (matches
   `inbox-voice/page.tsx` which already uses tokens).
2. One accent gradient — at most one `--gradient-brand` CTA ("Fill it up for me!"
   is the single gradient CTA; Save is the solid Button).
3. One button system — every button is the shared `Button` (Save, Add audience,
   Fill it up, Accept/Dismiss).
4. Type scale snaps — h1 16/600, labels 11/medium-uppercase, body 12-13 (as in
   `inbox-voice/page.tsx:83,126`).
5. Density — 4px rhythm; inputs/cards on the token radii.
6. Radius family — cards rounded-lg, inputs/chips rounded-md, the one CTA 10px.
7. Elevation via `--shadow-*` tokens only.
8. Contrast — body at/above `--color-text-secondary`; state never hue-only
   (the audience-match preview uses text, not color alone).
9. Dark-mode parity via `.dark`.
10. No emoji, lucide only (h1 icon lucide; "Fill it up for me!" no emoji).
11. Focus + motion — `:focus-visible` ring; 100-150ms transitions.
12. State coverage — loading spinner, empty audiences state, saving/saved, derive
    pending/ready/rejected/insufficient, error toast.

## 8. Guardrails (one line each)

- No migration; the record lives in `user_preferences` key="writing_style".
- The editable prompt is shown verbatim and used verbatim — transparency, no black box.
- Never auto-send: the prompt + about-me are scrubbed by `isAutoSendInstruction`.
- Derive is a reviewable PROPOSAL, never a silent overwrite of the live prompt.
- Derive rejects PII / non-style directives (deterministic, no-LLM floor).
- Derive needs >=5 human 1:1 sent messages; templates/sequences excluded.
- Audience match is pure + first-match-wins + order-stable; default prompt when none.
- Fail-closed: AI off -> empty; no record -> default prompt; never a fabricated draft.
- Per-mailbox identity (signature/from) is A3, NOT here.
- No new dependency or provider; reuse the existing AI/Inngest/store seams.
