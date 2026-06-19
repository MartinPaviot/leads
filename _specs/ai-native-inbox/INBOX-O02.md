# INBOX-O02 — AI memory / standing instructions
> Theme: T12 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing / P5 GTM moat (grounding the inbox AI)

## User story
As a user, I want to give the inbox AI a small set of standing instructions and facts about me
and my company — "always sign as Martin", "we sell to Suisse-romande foundations", "never
promise a discount", "CC ops@ on contracts" — so every summary, draft and reply respects them
without me repeating myself each time.

## Why (audit anchor)
Superhuman ships two overlapping memory surfaces: **Knowledge Base [BETA]** ("Add to the
Knowledge Base" — user-fed standing knowledge Ask AI uses) and **Personalization → About Me**
(location, key coworkers, company context, plus its own knowledge base)
(`teardown-superhuman/findings.md` §E; `ai-feature-deep-dive.md` "Personalization"; feature
inventory "Knowledge Base [BETA]"). This is AI memory / standing instructions. We already have
a richer, GTM-grounded equivalent — the **Knowledge/stages system** (company identity, ICP,
objections, curated per consumer) — but it is organized for the GTM machine (sourcing, cold
call, outreach…), not exposed as "standing instructions the inbox AI obeys". O02 adds the thin
personal layer (per-user standing instructions) and wires the existing tenant Knowledge into the
inbox AI's context so the moat (cited GTM memory) shows up in the mailbox.

## Requirements (EARS)
- The system SHALL let a user write short, free-text **standing instructions** for the inbox AI,
  stored per-user (`user_preferences`, resource `inbox`, key `standingInstructions`).
- The system SHALL let a user record a few **About-me / company facts** (name, role, sign-off
  name, company one-liner, key colleagues, default CC) as discrete, editable items — not one
  opaque blob — so each can be cited and turned off.
- WHEN the inbox AI summarizes, drafts, replies or rewrites, the system SHALL inject the user's
  standing instructions + about-me facts AND the relevant tenant **Knowledge** (via the existing
  stages: `outreach` for drafting, `global` everywhere) into the prompt.
- The system SHALL treat tenant Knowledge as the company-level memory (shared) and
  `user_preferences:inbox` as the personal layer (private to the user); the two compose, personal
  taking precedence on conflict (e.g. personal sign-off overrides a generic one).
- The system SHALL show, on any AI output that was shaped by a standing instruction, a "why"
  affordance naming the instruction that applied ("Signed 'Martin' — your standing instruction").
- The system SHALL cap the personal memory (a small item count + per-item length) and warn at the
  cap rather than silently truncating the prompt.
- The system SHALL never apply another user's or another tenant's memory; injection is scoped to
  the viewer (`authCtx.userId` + `tenantId`).
- The system SHALL let the user edit or delete any item, taking effect on the next AI action (no
  stale cache of a deleted instruction).
- The system SHALL keep AI memory subject to the zero-retention / data-handling option
  (INBOX-P03): instructions are sent to the model only for the user's own actions.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a standing instruction "always sign as Martin" WHEN the AI drafts any reply THEN the
  draft is signed "Martin" and a "why" names the instruction.
- GIVEN an about-me fact "we sell to Suisse-romande foundations" WHEN the AI drafts a cold reply
  THEN the value proposition reflects that context (grounded, not generic).
- GIVEN a personal sign-off "Martin" and a tenant Knowledge signature "The Pilae team" WHEN the
  AI drafts THEN the personal sign-off wins (personal precedence).
- GIVEN an instruction is deleted WHEN the AI next drafts THEN the instruction no longer applies.
- GIVEN the memory is at its item cap WHEN the user adds another THEN the UI blocks it with a
  "you've reached the limit" note, never silently dropping an existing one.
- GIVEN user A's instructions WHEN user B drafts THEN A's instructions are not in B's prompt.
- GIVEN the zero-retention option is on WHEN the AI uses memory THEN the memory is used in-flight
  only and not retained by the provider (per INBOX-P03).

## Edge cases & failure handling
- Empty memory → AI behaves as today (no injection), no error; drafts still use `writing-profile`
  voice (INBOX-O03) and tenant Knowledge.
- Contradictory instructions ("be very formal" + "keep it casual") → both injected; the model
  resolves, and the "why" shows both applied (we don't silently pick one). Surface a soft hint
  to the user that two conflict.
- Oversized free-text → enforce per-item length; truncate the *input* at save with a visible
  counter, never the prompt mid-action.
- Instruction that asks for a disallowed action ("auto-send without asking") → memory cannot
  override the never-auto-send guarantee (INBOX-T11); such an instruction is noted as not applied.
- Non-English instructions → honored verbatim; the model follows them in the mail's language.
- Multi-tenant/per-user: hard scope; deleting a user wipes their `user_preferences` rows (FK
  cascade on `auth_user`).

## Best-in-class bar
- Ours composes a **personal layer** (`user_preferences`) with the **company GTM memory** (tenant
  Knowledge — ICP, objections, product, all curated by consumer stage) that we already own;
  Superhuman's Knowledge Base is a flat user-fed blob with no CRM grounding. So our inbox AI
  knows *who you sell to and how you handle objections*, cited, not just "facts about me".
- Every memory-shaped output carries a **"why"** naming the instruction — auditable trust, the
  Lightfield human-in-the-loop spine, where Superhuman's memory is invisible once applied.
- Personal-over-company **precedence** is explicit and testable, so a rep's own sign-off/CC always
  wins over a workspace default.

## Design sketch
- **Data:** personal layer = `user_preferences` (`db/schema/auth.ts`, resource `inbox`): key
  `standingInstructions` (string[] of short items) + key `aboutMe` (object: `{ signOffName,
  companyLine, keyColleagues[], defaultCc[] }`). Company layer = the existing `knowledge_entries`
  + `lib/knowledge/stages.ts` (no migration; reuse). Voice = `lib/writing-profile.ts` (O03).
- **API:** reuse `GET/PUT /api/user-preferences` (resource `inbox`) for the personal layer — no
  new table, no migration. A shared `lib/inbox/ai-memory.ts` `loadInboxMemory(authCtx)` that
  returns `{ standingInstructions, aboutMe, knowledge }` (knowledge pulled via the stage helpers,
  `effectiveStages`/`entryMatchesStage`, `outreach`+`global`) and `buildMemoryPrompt(...)` that
  the compose/summarize endpoints prepend (alongside `buildWritingStylePrompt`).
- **UI:** a "Memory" section on `/settings/mail-calendar` (or a focused `/settings/inbox` page).
  Surface = `Card`/`CardBody`, `SettingsHeader`; standing instructions = a simple add/edit/remove
  list (reuse the `Tag`/`Input` add-row idiom already on the mail-calendar page, lines ~743-754);
  about-me = a few `LabeledField` inputs. Tokens (`--color-bg-card`, `--color-text-secondary`,
  `--color-accent`). lucide: `Brain` or `Sparkles` (section), `Plus`, `Trash2`. The "why" on AI
  output reuses `components/ai-ui/confidence-state` styling + a popover. No keyboard shortcut.
  Light + dark via tokens, no emoji, no provider name, every applied instruction cited.
- **AI:** model role = none new; memory is *injected context* for the existing inbox AI
  (summaries S0x, drafts C0x/G08). Grounding source for the "why" = the specific instruction/
  Knowledge entry id that matched. Autonomy: passive store; it only *shapes* other features.
- **Security/perf:** per-user + tenant scope; small caps keep prompt size bounded; respects
  zero-retention (INBOX-P03); personal memory never shared across users.

## Tasks (ordered, each with a verify step + test to write)
1. `lib/inbox/ai-memory.ts` `loadInboxMemory` (personal via `user_preferences:inbox` + company via
   stage helpers `outreach`+`global`) + `buildMemoryPrompt`. (verify: returns composed memory,
   personal precedence) (test: `ai-memory.test.ts` — precedence, scope, empty case)
2. Settings "Memory" UI: standing-instructions list + about-me fields, persisted via
   `/api/user-preferences` (resource `inbox`). (verify: add/edit/remove persists) (test: render +
   PUT shape)
3. Inject `buildMemoryPrompt` into the inbox compose/summarize prompts next to
   `buildWritingStylePrompt`. (verify: a sign-off instruction shows in a draft) (test: prompt
   includes the instruction)
4. "Why" affordance on memory-shaped output naming the instruction/entry. (verify: browser — draft
   shows "Signed 'Martin' — your instruction") (test: why-source mapping)
5. Caps + conflict hint + never-override-auto-send guard. (verify: at cap → blocked; auto-send
   instruction → not applied) (test: cap + guard tests)

## Current-state notes (VERIFY before building — code moves)
- `user_preferences` table + `GET/PUT /api/user-preferences` exist and are JSONB per
  `(userId, resource, key)` with a unique index (`db/schema/auth.ts:141-164`;
  `app/api/user-preferences/route.ts`). **No migration needed** for the personal layer — reuse
  resource `inbox`.
- No standing-instructions / AI-memory store exists for the inbox today (grep `standing
  instruction|aiMemory|custom instruction` → none). This is greenfield on top of `user_preferences`.
- The company memory already exists: `lib/knowledge/stages.ts` (`KNOWLEDGE_STAGES`,
  `effectiveStages`, `entryMatchesStage`; `outreach` feeds email drafting, `global` everywhere)
  + curated `knowledge_entries`; the chat already injects a Knowledge Index every turn
  (MEMORY: company-intake-knowledge). Reuse these — do NOT build a second knowledge store.
- Voice is handled separately by `lib/writing-profile.ts` (O03); O02 is *instructions/facts*, O03
  is *style*. They compose in the same prompt.
- The never-auto-send guarantee lives in INBOX-T11 (`lib/inbox/autonomy.ts`); memory must not
  override it.
