# INBOX-Q08 — Web-grounded fresh-fact answers (gated, zero-retention)
> Theme: T5 · Autonomy rung: helper (agentic) · Priority: P2
> Pillar: P2 reading / P5 GTM moat / trust

## User story
As a user, I want Ask-AI to optionally check the live web for a fresh fact my mailbox doesn't hold
("did this company just raise a round?", "is this person still the CTO?", "what's their latest
news?") and answer with a **dated, linked source** — but only when I allow it, and without my mail
ever being retained by a third party — so I get current facts on demand without leaking the inbox.

## Why (audit anchor)
Shortwave ships **AI web browsing** for fresh facts (audit §2 Context, §3). Superhuman gates external
context tightly (it's a closed CRM/calendar world). The differentiator we must hold is **trust**:
our edge is sovereignty (self-hostable, EU/CH residency, **zero-retention AI option** — audit §H4,
README conventions). So web grounding can't be an always-on leak; it must be an **explicit, gated,
zero-retention** capability that cites a dated source and never ships mail content to the web by
default. We have **no web-search/grounding tool today** (verified: nothing in the LLM tool surface),
so this is net-new — but it composes onto the existing agentic loop + SSRF guard
(`lib/infra/ssrf-guard.ts`) and the GTM graph (so a "fresh fact" updates the right deal/contact).

## Requirements (EARS)
- The system SHALL NOT perform any web fetch unless web grounding is explicitly enabled for the
  tenant (and, where required, for the user) via a setting (policy home: INBOX-P03).
- WHEN web grounding is enabled and the user's question needs a current external fact, the agent
  SHALL issue a **query string only** to the web tool — never the email body, attachment contents,
  or PII — and SHALL answer with the retrieved fact plus a **dated, clickable source link**.
- The system SHALL run all web fetches through the SSRF guard (`lib/infra/ssrf-guard.ts`) and an
  allowlist/denylist, and SHALL NOT fetch internal/private addresses.
- The system SHALL operate the web tool in **zero-retention** mode: no inbox content is sent to the
  provider, results are not persisted beyond the answer unless the user saves them, and the provider
  is configured for no-training/no-retention (or a self-hostable search backend is used for sovereign
  tenants — INBOX-P04).
- The system SHALL clearly mark web-sourced claims as **external** and dated ("as of <date>, via the
  web"), visually distinct from inbox/CRM citations ("via Elevay"), so the user can tell internal
  truth from external lookup.
- WHEN web grounding is disabled, the system SHALL answer from inbox + CRM only and SHALL say a fresh
  external check is available if enabled — never silently browse.
- The system SHALL rate-limit and budget web calls (per user/tenant) and SHALL degrade to
  inbox/CRM-only on web failure, marking the answer "no live source".
- WHEN a fetched fact updates a known entity (e.g. a funding signal), the system MAY offer to capture
  it to the CRM (approval-gated, INBOX-G02 / signal surfacing INBOX-G04) — it SHALL NOT auto-write.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN web grounding is **disabled** WHEN I ask "did they just raise?" THEN the assistant answers
  from inbox/CRM only and notes a live web check is available if I enable it; no fetch occurs.
- GIVEN web grounding is **enabled** WHEN I ask the same THEN the agent searches the web with a query
  string (no mail content), returns the funding fact with a dated source link, marked "external".
- GIVEN any web answer WHEN rendered THEN web sources are visually distinct from "via Elevay"
  citations and carry an "as of <date>".
- GIVEN a question the web can't confirm WHEN asked THEN the assistant says it couldn't find a live
  source and falls back to inbox/CRM, never fabricating a citation.
- GIVEN a sovereign tenant (Pilae) with residency on WHEN web grounding runs THEN it uses the
  approved/self-hostable backend and no inbox content leaves the boundary.
- GIVEN a fetched funding fact about a known company WHEN shown THEN the assistant offers to capture
  it as a signal (approval-gated), and does not write it automatically.
- GIVEN a malicious/internal URL in a result WHEN the agent tries to fetch it THEN the SSRF guard
  blocks it.

## Edge cases & failure handling
- Web provider down / rate-limited → degrade to inbox+CRM, mark "no live source", offer retry later.
- Result contradicts CRM (role/funding) → present both, dated, and offer to update via the
  freshness-aware capture path (role-status SSOT / signal-freshness), never silently overwrite.
- Prompt-injection in a fetched page trying to exfiltrate mail → the tool only ever sends a query
  string out; fetched content is treated as untrusted data, never as instructions (sandboxed reasoning).
- Stale/cached web result → always show the fetch date; don't imply real-time if cached.
- User pastes a URL and asks to read it → same gating + SSRF guard; honor zero-retention.
- Cross-tenant: the web tool is stateless and content-free, but the *capture* of any fact is tenant-
  + mailbox-scoped and approval-gated.
- Cost: cap web calls per user/tenant; never loop the agent into repeated fetches (bounded by
  `stepCountIs`).

## Best-in-class bar
- **Gated + zero-retention + dated external citations** — Shortwave browses the web; we browse the
  web *on the user's terms*, never leaking the inbox, with a self-hostable backend for sovereign
  tenants. The trust posture (a setting, a content-free query, a dated external badge) is the product,
  not an afterthought — a class of customer the US incumbents can't satisfy.
- Fresh facts **flow into the GTM graph** (approval-gated capture as a signal), so a web lookup can
  *update the deal* — not just answer a question — with full provenance and human-in-the-loop.

## Design sketch
- **Data:** a tenant/user setting `webGroundingEnabled` (+ residency/backend choice) in tenant settings
  (`lib/config/tenant-settings.ts`); policy + copy owned by INBOX-P03/P04. No mail content persisted by
  the web path. Captured facts → existing signal/CRM tables via INBOX-G02/G04 (approval-gated).
- **API:** a new chat tool `webLookup` in `lib/chat/tools/` (gated on `webGroundingEnabled`): input
  `{ query: string }` (string only), fetches via a pluggable backend (hosted zero-retention search
  for default tenants; self-hostable backend for sovereign), all egress through
  `lib/infra/ssrf-guard.ts` + allow/denylist; returns `{ answer, sources:[{title,url,fetchedAt}] }`.
  Surfaced through the agentic `/api/chat` loop (Q02/Q07). Per-user/tenant rate + budget caps.
- **UI:** in the chat dock, web-sourced claims render with a distinct **external** citation style
  (a different token, e.g. `--color-text-tertiary` + a `lucide-react` `Globe` glyph + "as of <date>")
  vs the accent "via Elevay" record links; a settings toggle (INBOX-O06/P03) controls availability;
  an "Add as signal" approval card when a fact updates an entity. Light+dark via tokens, no emoji,
  no provider name (the *search provider* is never named; the *web source* domain is shown as the
  citation), cited + dated.
- **AI:** the orchestrator routes "is this current / latest / just …" intents to `webLookup` *only
  when enabled*; fetched content is untrusted (injection-resistant prompting); Sonnet composes the
  dated, sourced answer.
- **Security:** SSRF guard on every fetch; content-free egress (query string only); zero-retention
  provider config / self-host; allow/denylist; rate + cost caps; capture stays approval-gated.

## Tasks (ordered, each with a verify step + test to write)
1. `webGroundingEnabled` setting (+ residency/backend) in tenant settings; default OFF. (verify:
   setting persists; default off) (test: `web-grounding-setting.test.ts`)
2. `webLookup` tool: gated, string-only egress, SSRF-guarded, pluggable backend, dated sources.
   (verify: disabled → no fetch; enabled → dated source returned; internal URL blocked) (test:
   `web-lookup-tool.test.ts` incl. gating, SSRF block, content-free egress, failure→degrade)
3. Route fresh-fact intents to `webLookup` only when enabled. (verify: "did they just raise?" routes
   to web only with the flag on) (test: routing + gating test)
4. Distinct external/dated citation rendering in the dock + "Add as signal" approval card. (verify:
   web claim shows "as of <date>" external badge, capture is approval-gated, in the live app) (test:
   external-citation render + capture-gate test)
5. Rate/cost caps + zero-retention assertion (no mail content in egress; nothing persisted unsaved).
   (verify: egress payload contains only the query; cap enforced) (test: egress-shape + cap test)

## Current-state notes (VERIFY before building)
- **No web-search / web-grounding / browsing tool exists today** in the LLM tool surface (verified
  across `lib/chat/tools` + `app/api`). This is net-new — the agentic loop, orchestrator, and tool-
  router (`chat/route.ts:624`, `lib/agents/orchestrator`, `lib/chat/tool-router`) host it; only the
  tool + gating + citation style are new.
- `lib/infra/ssrf-guard.ts` exists (used by the sandbox/website paths) — reuse it for every web fetch.
- No `webGroundingEnabled`/zero-retention flag exists in tenant settings today
  (`lib/config/tenant-settings.ts`) — add it; the policy/copy lives in INBOX-P03 (AI data handling /
  zero-retention) and INBOX-P04 (residency / sovereign hosting). VERIFY those specs for the canonical
  flag name so this reuses, not duplicates, the setting.
- Capture of a fetched fact must reuse the approval-gated signal/CRM path (INBOX-G02 capture, INBOX-G04
  signal surfacing) + freshness SSOTs (`lib/signals/freshness.ts`, role-status) — never a new writer.
- HONEST SCOPE NOTE (boil-lakes-flag-oceans): the *gated tool + citations + capture* is a boilable
  lake on existing infra. A **self-hostable search backend for sovereign tenants** is closer to an
  ocean (a separate provider/integration) — ship the hosted zero-retention path first, flag the
  self-host backend as a follow-up under INBOX-P04.
