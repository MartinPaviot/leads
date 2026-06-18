# INBOX-S09 — "Why this matters" rationale line (replaces cryptic badge)
> Theme: T3 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading / P4 triage

## User story
As a user triaging my inbox, I want each surfaced message to tell me *why* it's in front of me —
in one plain, cited line — so I can trust the prioritization instead of decoding a cryptic label.

## Why (audit anchor)
The audit's "design rule": ship every AI feature with "a visible 'why' (citations / rule that
fired) so the user can audit and escalate trust" (audit §1). Today the only "why" is `conv.reason`,
a sales label that's wrong on general mail and falls back to "Replied" (`conversations.ts:297`) —
Martin: "je comprends pas ce que ça veut dire" (INBOX-T08). Superhuman's Auto Labels ("Pitch") and
priority are opaque chips with no rationale (`findings.md` §B). Our edge: the "why" is a **grounded,
cited sentence** — "Reply to your sequence, asked about pricing" / "Login code, no action" / "Open
deal at Proposal, went quiet 6 days" — drawn from our lanes + GTM graph, the human-in-the-loop spine.

## Requirements (EARS)
- WHEN a conversation is shown in a lane or digest, the system SHALL render a one-line **rationale**
  explaining why it's there / why it's prioritized, in plain language, "via Elevay".
- The rationale SHALL be **grounded and cited**: it names the signal(s) that drove it — the general
  intent (INBOX-S06), whether it's a matched sequence reply (`outbound_emails`), lane membership
  (`conversations.ts` lanes), and any GTM context (open deal stage, last-interaction gap, signal) —
  each linking to its source.
- The rationale SHALL NOT use the sales taxonomy on non-sales mail and SHALL NEVER emit the literal
  "Replied" / "Forwarded internally" on automated/general mail (it supersedes the `reason` fallback).
- For automated/handled mail, the rationale SHALL say so plainly ("Automated sender — no reply
  needed", reusing the existing handled note `conversations.ts:271`), not a guessed reason.
- The rationale SHALL be **cached** (derived from already-persisted labels + the S02 line; no
  per-render LLM call) and SHALL update when the conversation's labels change.
- WHEN no grounded rationale is available, the badge SHALL be the neutral S02 summary line, and if
  that too is missing, the badge SHALL be **empty** — never a fabricated reason (per INBOX-T08).
- The rationale SHALL carry a tooltip/popover exposing the exact signals + citations that produced it
  (auditable trust).
- The system SHALL respect per-user/tenant scope.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a sequence reply asking about pricing WHEN listed THEN the line reads "Reply to your sequence · asked about pricing", linking to the matched outbound + the message.
- GIVEN an open deal at Proposal that went quiet 6 days WHEN surfaced THEN the line reads "Open deal (Proposal) · no reply in 6 days", citing the deal + last interaction (`lib/accounts/last-interaction.ts`).
- GIVEN a login-code email WHEN listed THEN the line reads a neutral S02 summary ("Verification code, expires soon"), never "Replied".
- GIVEN I hover the line WHEN the popover opens THEN it shows the signals that fired (intent, lane, deal stage, freshness) each cited.
- GIVEN a conversation with no grounded signals and no summary WHEN listed THEN the badge is empty, not "Replied".
- GIVEN a stale signal past its TTL WHEN building the rationale THEN it is excluded (per signal-freshness TTL), so the "why" never cites dead data.
- GIVEN another user's conversation WHEN my list renders THEN it never appears (scope).

## Edge cases & failure handling
- Conflicting signals (positive sentiment + objection intent) → state the most actionable, cite both in the popover; never average into a vague line.
- Signal/role data past freshness TTL (`lib/signals/freshness.ts`) or stale role (role-status SSOT) → excluded from the rationale; never asserted.
- Deal context missing (no contact/account resolved) → fall back to the message-level rationale (intent + S02), no fabricated deal.
- Automated/handled mail → the handled note is the rationale; no GTM framing.
- Citation target deleted → mark stale in the popover, never dangle (mirror INBOX-G01).
- Multi-tenant/user scope on every signal read.

## Best-in-class bar
- The "why" is **cited and auditable** — hover to see exactly which signal fired and from where — turning prioritization from a black box (Superhuman's opaque "Pitch") into something the user can trust and correct (Lightfield's approve-the-evidence ethos).
- It composes the **GTM graph** (deal stage + last-interaction gap + fresh signals) into the rationale — competitors can't, because they have no deal graph; ours explains *revenue relevance*, not just "unread".

## Design sketch
- **Data:** no new store — derive from already-persisted `intent`/`sentiment` (S06), `metadata.aiSummaryLine` (S02), `outbound_emails.reply_classification` (matched reply), lane/priority (`conversations.ts`), plus the GTM graph (deals, `lib/accounts/last-interaction.ts`, `lib/signals/freshness.ts`, role-status SSOT). Cache the assembled line on `Conversation.reason` (repurposed) + a `reasonSignals[]` for the popover.
- **API:** a pure `buildRationale(conversation, gtmContext)` in `lib/inbox/conversations.ts` replacing the current `reason` derivation (`conversations.ts:284–298`): drop the "Replied" fallback, prefer (1) cited GTM line, (2) sequence-reply label (gated to outbound, per T08), (3) S02 summary, (4) empty. GTM context comes from INBOX-G01's `GET /api/inbox/context` (reuse, don't refetch). Signal/role freshness filters applied before citing.
- **UI:** the existing badge slot — `_conversation-list.tsx:113` (row) and `_conversation-pane.tsx:277` (pane) — now renders the rationale line + a hover popover of cited signals. Surface = inline text `text-[12px] text-[var(--color-text-secondary)]`; popover = `--color-bg-card` + `--shadow-floating` `rounded-lg` listing signals via `cited-claim.tsx`/`source-link.tsx`; lucide `Info`/`Sparkles` for the popover trigger (sober, no jewelry). Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** mostly **assembly over cached signals** (deterministic templating) so it's instant and auditable; an optional 1-line phrasing pass may smooth the template, grounded only in the cited signals (no new facts). Autonomy = helper. Fail-closed to S02, then empty.
- **Security/perf:** zero per-render LLM call (assembly); freshness-filtered citations; tenant+user scope; reuses G01's context (no duplicate GTM query).

## Tasks (ordered, each with a verify step + test to write)
1. Pure `buildRationale` replacing the `reason` derivation in `conversations.ts` — drop "Replied"; precedence GTM→sequence-reply(gated)→S02→empty; emit `reasonSignals[]`. (verify: unit) (test: `rationale.test.ts` — automated mail → S02/empty; sequence reply → cited reply line; quiet deal → "no reply in N days"; never "Replied")
2. Compose GTM context (reuse INBOX-G01 `/api/inbox/context`) + freshness/role filters into the rationale. (verify: stale signal excluded; deleted citation marked stale) (test: freshness exclusion)
3. Rationale line + cited-signals popover in list row + pane. (verify: browser — line + hover popover with citations on a real deal thread and on automated mail) (test: dom + popover)
4. Backfill `reason`/`reasonSignals` for existing rows. (verify: live inbox — no "Replied"/"Forwarded internally" on automated mail; deal threads show a cited why) (test: backfill compat)

## Current-state notes (VERIFY before building)
- `conversations.ts:284–298` is the current `reason` derivation with the misleading "Replied"/sentiment fallback — THIS is what S09 replaces (line numbers approximate; the real fallback is at `:297`). VERIFY.
- Badge rendered at `_conversation-list.tsx:113` and `_conversation-pane.tsx:277` (per codebase notes) — same slots S09 fills.
- Reuses **INBOX-S02** (summary line), **INBOX-S06** (general intent), **INBOX-G01** (cited GTM context endpoint), `lib/accounts/last-interaction.ts`, `lib/signals/freshness.ts`, role-status SSOT. Closely related to **INBOX-T08** (S09 is the read-pane/row rationale; T08 is the badge-honesty rule — same slots, build together).
- No "why this matters" rationale exists today beyond the sales `reason` label.
