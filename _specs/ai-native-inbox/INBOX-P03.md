# INBOX-P03 — AI data handling & opt-out (zero-retention)
> Theme: T11 · Autonomy rung: passive (governs all AI rungs) · Priority: P0
> Pillar: cross (trust) — governs P2 reading / P3 writing / P5 moat

## User story
As a sovereignty-sensitive founder, I want to know exactly what leaves my inbox to an AI model,
choose a zero-retention / EU-sovereign processing profile, and turn AI off entirely — so I can sell
to public-sector and regulated buyers without my prospects' emails training a US model or being
retained by a sub-processor.

## Why (audit anchor)
Every AI-native client sends email content to a model to summarize/draft/classify (the whole audit
taxonomy). Superhuman is a US SaaS whose AI runs on Google/MS + its own stack — it offers no
zero-retention, EU-resident, model-off profile, and its "Recent Opens/Read Statuses" defaults reveal
its data posture (`feature-inventory.md`, `findings.md` §F). This is the moat: we already route LLM
calls to **Anthropic's EU endpoint by default** (`ai-provider.ts:43`, `eu.anthropic.com/v1`) with a
**Mistral (FR) sovereign router** (`ai-provider.ts:160`, `LLM_PROVIDER=mistral`), and the `/security`
page already promises an EU-sovereign profile (`app/(legal)/security/page.tsx:218-240`). What's
missing is the **per-tenant control surface + the per-AI-feature transparency + a true off switch +
the zero-retention header** so the promise is enforceable and visible inside the inbox, not just on a
marketing page.

## Requirements (EARS)
- The system SHALL send to an AI model ONLY the content required for the requested feature (the open
  thread for a summary, the draft for a rewrite), and SHALL wrap untrusted email/note content in
  tagged sections to mitigate prompt injection (already a documented control, `/security` §4
  `:150-152`).
- The system SHALL support a per-tenant **AI processing profile**: `standard` (Anthropic EU),
  `sovereign` (Mistral FR / EU embeddings), or `off` (no inbox AI features run at all).
- WHEN the profile is `sovereign`, the system SHALL route every inbox LLM call through the EU-sovereign
  provider (`LLM_PROVIDER=mistral` path) and EU embeddings, and SHALL never fall back to a non-EU
  provider for inbox features (fail rather than silently cross the border).
- WHEN the profile is `off`, the system SHALL disable all inbox AI (summaries, drafts, classify,
  ask-AI) and render the inbox as a faithful mailbox with no model calls — the fidelity layer (P1) and
  triage lanes still work.
- The system SHALL request **zero-retention / no-training** processing from the model provider where
  the provider supports it (send the no-retention header/flag; record the provider's data-handling
  commitment), and SHALL surface this state to the user.
- The system SHALL record, per inbox AI call, an auditable trace — tenant, surface, versioned prompt id,
  model, provider, outcome — via the existing central wrapper (`llm-call.ts`, `LlmCallTrace` `:27`),
  and SHALL NOT persist the email body in that trace.
- The system SHALL show, for every AI output in the inbox, a "what was sent / which model / retention"
  affordance ("AI details") so the user can audit any single AI action.
- The system SHALL NOT use a customer's email content to train any model and SHALL state this plainly;
  embeddings derived from email content SHALL be purged on contact/data deletion (GDPR erasure already
  loops per-tenant — audit §4 "Verified NON-issues", §6).
- The system SHALL keep the AI profile per-tenant and the off switch effective immediately (no cached
  AI on a disabled tenant).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN profile `off` WHEN a thread is opened THEN no LLM call is made (verify via `llm_calls` /
  network), no summary/draft renders, and the faithful body + lanes still work.
- GIVEN profile `sovereign` WHEN a summary is generated THEN the call routes to the Mistral EU provider
  and `getActiveProvider()`/the trace shows an EU provider; an induced Anthropic outage does NOT cross
  to a US endpoint — the feature degrades or errors instead.
- GIVEN profile `standard` WHEN a draft is generated THEN the call routes to `eu.anthropic.com/v1`
  (not `api.anthropic.com`) and the trace records model + EU provider.
- GIVEN any AI output WHEN the user opens "AI details" THEN it shows: what content was sent (scope, not
  the raw body), the model/provider, EU-residency, and the retention posture — each factual, no hype.
- GIVEN a contact is deleted (GDPR erasure) WHEN the purge runs THEN that contact's email-derived
  embeddings/context-graph rows are removed (no residual PII in the RAG store).
- GIVEN the no-retention flag is sent WHEN an AI call is made THEN the request carries the
  zero-retention header/flag and the trace notes it; if the provider can't honor it, the UI says so
  rather than implying retention is off.
- GIVEN a teammate in the same tenant WHEN the admin sets the profile THEN it applies tenant-wide
  immediately (per-tenant setting), and an admin-only control gates the change (RBAC).

## Edge cases & failure handling
- Provider can't honor zero-retention → surface "Provider retains for N days for abuse monitoring"
  honestly (don't claim zero); let the tenant pick `sovereign`/`off` if that's unacceptable.
- `sovereign` selected but `MISTRAL_API_KEY` unset → the feature is unavailable (fail closed); do NOT
  silently route to Anthropic — show "Sovereign AI not provisioned, contact admin".
- Embedding model has no EU-sovereign equivalent configured → in `sovereign`, use Mistral Embed
  (`ai-provider.ts` MISTRAL_MODEL_MAP `:196`); if unavailable, disable semantic features rather than
  embedding via OpenAI.
- Prompt-injection in a captured email trying to exfiltrate another thread → mitigated by tagged-section
  wrapping + tenant-scoped context (audit §2 "Why 'just ask the LLM' cannot leak"); never relax for AI
  features.
- Off→on toggle mid-session → AI features appear only after toggle; no pre-computed drafts leak from the
  off period.
- Multi-tenant: the profile, traces, and embeddings are tenant-scoped (`withTenantTx`, `db/rls.ts:44`);
  no cross-tenant AI context (audit §2).

## Best-in-class bar
- **A real off switch + a sovereign profile** — Superhuman can't offer "no AI / EU-only / zero-retention"
  because its architecture and sub-processors are US-centric; we already have the EU + Mistral routing
  (`ai-provider.ts`) and the sovereign stack documented (`/security` §8). We turn that into a per-tenant
  product control. A category they cannot serve.
- **Per-action transparency** — "AI details" on every output (what was sent / model / residency /
  retention) makes the data posture auditable at the point of use, grounded in the real trace
  (`llm-call.ts`). Competitors disclose at best in a policy doc.
- **Erasure reaches the RAG store** — email-derived embeddings/context-graph PII are purged on deletion
  (the audit verified per-tenant purge loops); the AI memory doesn't outlive the data.

## Design sketch
- **Data:** per-tenant `ai_processing_profile` (`standard|sovereign|off`) + a `no_training` flag on the
  tenant/workspace settings; the existing `llm_calls` table already stores trace rows (`llm-call.ts`
  writes them) — extend the row with `provider`/`residency`/`retention` if not already present; never
  store the email body. Embeddings/context-graph already tenant-scoped + purged (audit §6).
- **API:** route inbox AI through `llmCall`/`getModelForTask` (`lib/ai/ai-provider.ts`, `lib/ai/llm-call.ts`)
  — gate on the tenant profile before any call; `sovereign` forces `shouldUseMistral()` and blocks the
  non-EU fallback for inbox surfaces; pass the zero-retention header at the provider client. New
  `GET/PUT /api/settings/ai-profile` (admin-gated). An "AI details" payload is derived from the trace
  (surface, promptId, model, provider, residency, retention) — no body.
- **UI:** (1) Settings → Privacy and data (`settings/privacy/page.tsx`) gains an "AI processing" card
  matching the existing card idiom (`:220`): a three-way profile selector (Standard EU / Sovereign /
  Off) + a "No-training" toggle + residency badge (reuse the EU `Badge` pattern at `:254`). (2) Each AI
  output in `_conversation-pane.tsx` carries a small "AI details" affordance opening a popover.
  Tokens: card `--color-bg-card`, success/EU `--color-success(-soft)`, text `--color-text-secondary`;
  lucide `ShieldCheck` (EU/zero-retention), `Cpu`/`Sparkles` (model), `Power` (off); shortcut **`?`**
  on a focused AI output opens "AI details". Light + dark via tokens, no emoji, **no provider name shown
  to the user as a vendor brand** — show "EU-sovereign model" / "EU inference", with the concrete model
  only inside the admin "AI details" debug view (operator-facing), per the no-provider-names rule.
  Citations: the "what was sent" line reads "based on this thread", not a vendor.
- **AI:** this spec governs the model role for all inbox AI (summaries INBOX-S*, drafts INBOX-C*, ask-AI
  INBOX-Q*). It does not add a model; it constrains and discloses every existing one.
- **Security/perf:** profile gate is server-side (a client can't re-enable AI on an `off` tenant);
  tagged-section prompt wrapping retained; trace write is fire-and-forget (`llm-call.ts:17`) so it never
  blocks a call; tenant scope via `withTenantTx`.

## Tasks (ordered, each with verify + test)
1. Per-tenant `ai_processing_profile` + `no_training` storage; `GET/PUT /api/settings/ai-profile`
   (admin-gated). (verify: PUT persists; non-admin 403) (test: route + RBAC test)
2. Gate inbox AI on the profile in the call path (`llmCall` wrapper): `off`→no call; `sovereign`→force
   Mistral EU + block non-EU fallback for inbox surfaces. (verify: profile `off` makes 0 `llm_calls`;
   `sovereign` never hits `api.anthropic.com`) (test: provider-routing unit + integration)
3. Send the zero-retention header/flag at the provider client; record provider/residency/retention on
   the trace row. (verify: request carries the flag; trace shows it; no body persisted) (test: trace
   shape + "no body" assertion)
4. Settings → Privacy "AI processing" card (Standard EU / Sovereign / Off + No-training toggle +
   residency badge). (verify: browser — toggling Off disables inbox AI live) (test: settings integration)
5. "AI details" affordance on each inbox AI output (popover from the trace; no raw body). (verify:
   browser — popover shows scope/model-class/EU/retention) (test: dom + payload test)
6. Confirm email-derived embeddings/context-graph rows purge on contact deletion. (verify: deleted
   contact leaves no embedding/context row) (test: erasure e2e — assert RAG store empty for that contact)

## Current-state notes (VERIFY before building — code moves)
- `lib/ai/ai-provider.ts` already: routes to `eu.anthropic.com/v1` by default (`:43`, `:80-86`),
  SSRF-allowlists the base URL (`:53-78`), and provides a Mistral EU-sovereign provider +
  `shouldUseMistral()` (`:160-179`) with `MISTRAL_MODEL_MAP` (`:196`). This is the routing seam — there
  is NO per-tenant profile gate on it yet; calls are governed only by env vars.
- `lib/ai/llm-call.ts` is the central wrapper; `LlmCallTrace` (`:27-36`) already carries
  `tenantId`/`surfaceId`/versioned `promptId`/`metadata` and writes `llm_calls` fire-and-forget
  (`:17`). It does NOT currently record provider/residency/retention or send a zero-retention header —
  add both. It does not persist the body (keep it that way).
- `/security` page already promises the EU-sovereign profile (`app/(legal)/security/page.tsx:218-240`)
  and lists Mistral/Scaleway/Infomaniak/Brevo as targets — this spec makes that promise a per-tenant,
  enforced, in-product control, keeping the page honest.
- Privacy settings page exists (`settings/privacy/page.tsx`) with DPA-status + data-region + visibility
  cards — add the "AI processing" card in the same idiom (card at `:220`, EU badge at `:254`); a
  `NEXT_PUBLIC_GDPR_REGION` data-region check already exists (`:182`).
- Tenant isolation for AI context is verified safe (audit §2): tools carry `ctx.tenantId`, no tool takes
  a tenant param, prompt-injection can't cross tenants. Don't relax this for inbox AI.
- GDPR purge loops per-tenant with tenant-bound deletes (audit §4 "Verified NON-issues", §6) — verify it
  covers email-derived embeddings/context-graph before claiming erasure reaches the RAG store.
- Embeddings still default to OpenAI `text-embedding-3-small` (`ai-provider.ts:192`); in `sovereign`
  they must use Mistral Embed or semantic features disable — verify before shipping the sovereign claim.
