# INBOX-X05 — Shared snippets & AI prompts
> Theme: T8 · Autonomy rung: helper · Priority: P2
> Pillar: cross (P3 writing + collaboration)

## User story
As a team that answers the same questions repeatedly, I want shared reply snippets and
shared AI rewrite prompts that any member can insert or run from the composer, so we reply
consistently and teach the AI our team's best phrasings once — not one private copy per person.

## Why (audit anchor)
Superhuman ships **Snippets** with variables + CC/BCC + attachments (`feature-inventory.md`
Writing/Snippets; audit:41), and Missive ships **shared prompts** + semantic canned-response
search (`audit:73`). Shortwave shares **snippets/prompts** across the team (`audit:51`). We have
**no snippet store at all** — the only templated text in the codebase is per-sequence-step
`subject_template`/`body_template` (`outbound.ts:76`) and Call Mode `call-scripts.ts`, neither
reusable from the inbox composer. We beat them because a shared snippet/prompt can be **grounded
in the CRM graph** — variables resolve from the real contact/company/deal (Lightfield recall),
and a shared rewrite prompt can be a GTM one ("propose the next step", "tie to their pain") that
respects the deal stage, not a generic "make it shorter".

## Requirements (EARS)
- The system SHALL let a member create a **tenant-shared snippet** (name + body, with optional
  `{{variable}}` placeholders) visible to every member/admin in the tenant.
- The system SHALL let a member insert a shared snippet into the reply composer, resolving any
  `{{variable}}` from the conversation's CRM context (contact/company/deal) where available, and
  leaving an explicit unresolved marker (never a silent blank) where it is not.
- The system SHALL let a member create a **tenant-shared AI prompt** (a named rewrite/compose
  instruction) that any member can run from the composer's AI rewrite control.
- WHEN a shared AI prompt is run, the system SHALL apply it to the current draft (or generate from
  it), grounded in the conversation + CRM context, and SHALL return the result for approval (never
  auto-send) — consistent with the composer AI-rewrite flow.
- The system SHALL scope snippets + prompts to `authCtx.tenantId`; neither SHALL resolve cross-tenant.
- A **viewer** SHALL be able to READ shared snippets/prompts but SHALL NOT create, edit, or delete
  them (write-gated centrally); inserting a snippet/running a prompt are composer actions a viewer
  has no access to anyway (viewers don't send).
- The system SHALL let the author edit/delete their own snippet/prompt; an admin SHALL be able to
  edit/delete any in the tenant.
- The system SHALL NOT show provider names anywhere in the snippet/prompt UI ("via Elevay" for any
  AI provenance), and snippet bodies SHALL be plain text / safe formatting only.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a tenant with no snippets WHEN a member creates "Pricing FAQ" THEN every member sees it in the
  composer snippet picker.
- GIVEN a snippet "Hi {{firstName}}, thanks for…" WHEN inserted on a thread with a known contact THEN
  `{{firstName}}` resolves to the contact's first name from the CRM graph.
- GIVEN the same snippet WHEN the sender is unknown (no contact) THEN `{{firstName}}` renders as an
  explicit unresolved marker (e.g. a highlighted `[firstName?]`), never a silent blank.
- GIVEN a shared AI prompt "propose the next step based on the deal stage" WHEN run on a thread with an
  open deal THEN the rewrite reflects the deal stage and is returned for approval, not sent.
- GIVEN a viewer WHEN they open the snippet manager THEN create/edit/delete controls are absent and a
  POST is rejected (403); they can still read the snippet list.
- GIVEN my own snippet WHEN I edit it THEN the change is visible to all members; GIVEN another member's
  snippet WHEN I am a plain member THEN I cannot edit it, but an admin can.
- GIVEN two tenants WHEN tenant A lists snippets/prompts THEN tenant B's never appear.

## Edge cases & failure handling
- Unknown/empty variable → explicit unresolved marker in the inserted text (forces the writer to fill it),
  never a blank or a fabricated value.
- Variable that maps to a sensitive/absent field → render the marker; never guess; respect role-freshness
  (a stale title resolves to the "to confirm" form per the role-freshness guardrail, not an asserted title).
- Snippet/prompt name collision within a tenant → de-duplicate by normalized name (return existing).
- Very long snippet / pasted HTML → stored as plain text / sanitized safe formatting; no script execution.
- Shared AI prompt that asks for something ungrounded → the rewrite is fail-closed (no fabricated CRM
  facts); if context is missing it says so rather than inventing it (the Call-Mode-brief discipline).
- Author deactivated → snippet/prompt persists, attribution shows the name (deactivated members stay named).
- Offline / AI provider error on a prompt run → the draft is untouched and a toast explains; no half-applied
  rewrite.
- Multi-tenant: every snippet/prompt read + write carries the tenant clause.

## Best-in-class bar
- Snippet variables resolve from the **real CRM graph** (contact/company/deal), not a manual fill-in, and
  **fail loud** (explicit marker) instead of silently blanking — Superhuman's snippet variables are static
  placeholders with no data behind them.
- Shared **AI prompts can be GTM-aware** ("propose the next step", "tie to their pain", "add the case
  study") and respect the **deal stage**, because we own the pipeline — a category of team prompt
  Superhuman/Missive can't ground.
- One **tenant-shared library** (not per-person copies) with author + admin governance, so the team's best
  phrasings are curated once and stay consistent — and it's sovereign (your own store, "via Elevay"
  provenance, zero-retention AI option).

## Design sketch
- **Data:** `inbox_snippet(id, tenant_id, name, normalized_name, body_text, variables text[], created_by,
  deleted_at)` and `inbox_ai_prompt(id, tenant_id, name, normalized_name, instruction, scope
  (rewrite|compose), created_by, deleted_at)`, each `unique(tenant_id, normalized_name)`. Variables are a
  small known set resolved from the conversation's contact/company/deal (the same entities the INBOX-G01
  sidebar resolves). No new template engine — simple `{{var}}` substitution with explicit-marker fallback.
- **API:** `GET/POST /api/inbox/snippets`, `PATCH/DELETE /api/inbox/snippets/[id]`; `GET/POST
  /api/inbox/ai-prompts`, `PATCH/DELETE /api/inbox/ai-prompts/[id]` — create/edit member+ (author) and
  admin (`requireAdmin`, `auth-utils.ts:109`), tenant-scoped, viewer-blocked (`viewer-guard.ts:37`).
  Snippet insertion resolves variables server-side or in the composer from the INBOX-G01 context bundle.
  Running a shared AI prompt routes through the composer AI-rewrite path (INBOX-C04) with the conversation
  + CRM grounding; returns the candidate for approval (no send).
- **UI:** a snippet picker + an AI-prompt menu in the reply composer (in `_conversation-pane.tsx`'s reply
  affordance / the prepared-draft path ~`:140-168`), plus a small shared-library manager reachable from the
  inbox (create/edit). Reuse the existing `Button`/`MoreMenu` primitives. Surface = composer popovers +
  a manager dialog; tokens `--color-bg-card`, `--shadow-floating` (popover), `--color-accent` (run prompt),
  unresolved-marker uses `--color-warning-soft`; lucide `FileText` (snippet) / `Sparkles` (AI prompt —
  a sober single glyph, no emoji); shortcut `;` opens the snippet picker in the composer (Superhuman's
  Snippets convention), AI-prompt menu via the composer's existing AI control. Light + dark via tokens, no
  emoji, no provider name, cited ("via Elevay" on any AI provenance; resolved variables traceable to the
  CRM source). 
- **AI:** shared prompts reuse the composer rewrite/compose model (INBOX-C04 / the agentic-compose path),
  grounded + fail-closed; no separate model.
- **Security/perf:** plain-text/safe bodies (no `dangerouslySetInnerHTML`); tenant clause everywhere;
  variable resolution reuses the cached INBOX-G01 context (no extra per-insert CRM scan); AI runs are
  approval-gated.

## Tasks (ordered)
1. Migration: `inbox_snippet` + `inbox_ai_prompt` (+ unique indexes). (verify: drizzle apply clean) (test:
   schema-shape + normalized-name uniqueness)
2. CRUD routes for both — member+ author + admin governance, tenant-scoped, viewer-blocked. (verify:
   create/edit round-trip; viewer POST → 403; cross-tenant rejected) (test: route test)
3. `{{variable}}` resolver against the INBOX-G01 context bundle with explicit-marker fallback + role-
   freshness respect. (verify: known contact resolves firstName; unknown → marker) (test: resolver unit
   incl. the fail-loud path)
4. Composer snippet picker (`;`) + shared-AI-prompt menu routed through INBOX-C04, approval-gated. (verify:
   browser — insert a snippet, run a shared prompt, result staged not sent) (test: dom test + an assertion
   that running a prompt never enqueues an `outbound_emails` send)
5. Shared-library manager (create/edit/delete) reusing `Button`/`MoreMenu`. (verify: manage, reload
   persists, viewer sees read-only) (test: dom test for viewer-hidden controls)

## Current-state notes (VERIFY before building — code moves)
- NO snippet/template store usable from the inbox exists today: the only templated text is per-sequence-
  step `subject_template`/`body_template` (`db/schema/outbound.ts:76`) and Call Mode `call-scripts.ts` —
  neither is a reusable composer snippet. This is a NEW shared store.
- The reply composer / prepared-draft path lives in `_conversation-pane.tsx` (~`:140-168`); compose/rewrite
  is INBOX-C01/C04 — shared prompts plug into that path, not a new compose engine.
- Variable resolution reuses the INBOX-G01 context bundle (contact/company/deal) — DON'T add a second CRM
  lookup; the sidebar already assembles cited context (Call Mode brief, jsonb-cached, fail-closed).
- Role-freshness guardrail (role-status SSOT) governs how a `{{title}}`-type variable renders (the
  "to confirm" form when stale) — respect it; never assert a stale title.
- Viewer write-gate central (`middleware.ts:152` → `viewer-guard.ts:37`); `requireAdmin` at
  `auth-utils.ts:109`.
- `Button`/`MoreMenu` primitives + `--color-badge-*`/`--shadow-floating` tokens are the UI DNA — reuse;
  AI provenance is "via Elevay", never a provider name.
