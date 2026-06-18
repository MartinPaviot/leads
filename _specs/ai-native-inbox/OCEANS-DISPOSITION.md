# AI-native inbox — ocean disposition (the items that need a decision/apply)

Status as of 2026-06-18, branch `feat/ai-native-inbox-rendering`.

Everything buildable to the bar (tsc + vitest, no prod migration, no
write-pipeline-on-sync, no live-Inngest, personal-inbox model) **is shipped** —
see `_EXECUTION-LOG.md`. The four items below are genuine **oceans**: each needs
a prod migration on the broken drizzle journal, a write-pipeline change that
can't be runtime-verified from this session, an embeddings backfill, or a
multi-feature architectural rewrite. They are designed here, file-level, so the
work is a decision + an apply — not a discovery.

These were assessed by an 8-agent design workflow (wf_64d06c0f) cross-checked
against the live code. No blind/untested change to a prod migration, the mail
ingestion pipeline, or the 7 scope routes was committed — that is the point of
flagging them.

---

## P05 — DB-level RLS strict mode (tenant isolation as defense-in-depth)

**Why ocean:** the app-layer scope (`getInboxScope` + `scopeConversationRows`)
already ships and is the live enforcement. `drizzle/0074_rls_enforced.sql`
already enables RLS on every `tenant_id` table with a **fallback-allow** policy
(when no `app.tenant_id` context is set, everything is visible — so the 49
Inngest workers and non-context routes keep working). P05's deliverable is
**dropping that fallback** so the database returns zero rows on an unscoped read.
That flip is only safe once **every inbox read runs inside `withTenantTx`**
(`src/db/rls.ts` — `SET LOCAL`, the only form that survives the Supavisor
transaction pooler), and must be staged shadow-mode first. It is coupled to the
org-wide R-08b rollout. = prod migration on the broken journal.

**Foundation to ship first (in-bar, do before the flip):**
- Route every inbox read through `withTenantTx`: `lib/inbox/load.ts` and the
  callers `app/api/inbox/conversations/route.ts`, `.../conversations/detail`,
  `app/api/inbox/route.ts`, `app/api/home/up-next`, `.../conversations/ask`,
  `app/api/inbox/ask-inbox`, `app/api/inbox/rsvp`. Behavior-neutral under the
  live 0074 fallback (no context → still allow), so it's regression-safe **but
  must be runtime-verified** (each route still returns the owner's rows).
- A tripwire test asserting that, with a tenant context set, a cross-tenant read
  returns zero rows; and that `getInboxScope` returns a non-null, owner-narrowed
  scope (fail-closed on a null userId).

**The strict migration (apply only after the foundation + a shadow-mode soak).**
Mirror 0074's proven `DO $$` shape but scope to the inbox-read tables and drop
the fallback predicate:

```sql
-- 0078 (PROPOSAL — DO NOT APPLY until every inbox read uses withTenantTx and a
-- shadow-mode soak shows zero unintended row drops). Strict tenant isolation:
-- remove 0074's fallback-allow for the inbox-read tables, so an unscoped read
-- returns zero rows at the database. Keep NULL tenant_id (global) rows visible.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['outbound_emails','activities','contacts','companies']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON public.%I AS PERMISSIVE FOR ALL TO public
         USING (tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))',
      t, t);
  END LOOP;
END $$;
```

**Decision for Martin:** confirm the inbox-read table list (above is the core
four), apply the foundation, run shadow-mode, then apply 0078 via the custom
runner (`db:migrate:apply`). Do NOT `db:migrate` (journal stops at idx 12).

---

## R04 — store + render inbound attachment bytes

**Metadata half (would be in-bar) is blocked by the ingestion boundary:**
attachment filename/MIME/size/contentId/inline-vs-attachment is **not captured
today** — adding it means editing the sync write-path (`lib/integrations/gmail.ts`,
`imap.ts`, `lib/capture/email-capture.ts`, `inngest/sync-functions.ts`). That's
the live Inngest mail pipeline; it can't be runtime-verified from here, so it
was NOT changed blind (a regression there silently breaks mail ingestion).

**Bytes half is a hard ocean:** `@vercel/blob` is **not installed** (absent from
package.json / lockfile / node_modules); no S3/`@aws-sdk`, no Supabase storage
client. And capture runs inside an Inngest `step.run` that JSON-round-trips its
result, so multi-MB binary can't cross the step boundary in `SyncedEmail`.

**Design when greenlit:** (a) capture metadata into `activities.metadata` JSONB
on sync (mirrors the existing `bodyHtml`/`calendar` plumbing), render an
attachment strip in the pane distinguishing `cid:`-inline from true attachments;
(b) for bytes, provision a Vercel Blob token (a prod resource) and either store
on sync or re-fetch on demand from the provider via the connected mailbox.
**Decision for Martin:** provision Blob (or accept metadata-only), and confirm
it's OK to touch the sync pipeline (needs a runtime smoke-test of ingestion).

---

## Q01 — natural-language SEMANTIC inbox search

**Why ocean:** `lib/ai/embeddings.ts` ships a production `searchHybrid`
(pgvector + BM25 + RRF, HNSW/GIN indexes from migration 0029), but it only
embeds **contacts + activities** — **emails are not embedded** and there is no
`semanticSearchEmails` tool. True meaning-ranked email search needs an
**email-embedding pipeline**: embed on ingest (sync write-path) + an Inngest
backfill for existing mail + an `embeddings` source_type for email. = write
pipeline (+ likely a migration). The shipped inbox search (Q04) is keyword over
the loaded slice; the whole-inbox **keyword** Ask (Q02) shipped this session.

**Partial foundation considered + rejected for now:** a `GET /api/inbox/search`
that runs `searchHybrid` would rank **contacts/activities** related to the query
and map them to threads — NOT email-content search. Shipping that under the name
"semantic search" would misrepresent it (it can't find an email by its body), so
it was flagged rather than faked.
**Decision for Martin:** greenlight the email-embedding pipeline (the only way to
make mailbox content meaning-searchable), or accept keyword (Q04 + Q02) as the
inbox-search story.

---

## TEAM cluster — X01 assignment, X03 presence, X04 shared labels (+ X05 tenant-share, X06 handoff)

**Why ocean:** the shipped inbox is strictly **personal** — `getInboxScope`
filters `connected_mailboxes.user_id = authCtx.userId`, consumed by 7 read
routes; `scopeConversationRows` narrows every conversation to the owner; the
empty state literally promises *"other members can't see it."* Every feature here
**inverts** that to widen visibility to teammates — the spec itself calls it "the
first opt-in widening." It needs a prod migration on the broken journal (a
`connected_mailboxes.shared` column readable inside the scope SQL — JSONB can't
carry it), up to 4 tenant-shared tables (presence with TTL, shared labels,
label-application, snippets), a 7-route scope audit, a presence write-loop, and
depends on the unbuilt X02. = multi-feature architectural rewrite.

**Smallest real foundation (deferred — speculative until the decision is made):**
a `resolveInboxScope` that takes an injectable shared-mailbox set (default-empty
→ byte-identical to today, regression-locked) + assignment compute over
`activities.metadata` + a userId↔users.id map. This was **not** committed: it is
unused scaffolding with no user-visible payoff until the team-inbox decision is
taken, and adding dead abstraction violates "boil lakes, flag oceans."

**Decision for Martin:** decide whether the inbox becomes shared/team-visible.
That single product decision unblocks X01/X03/X04 + X05-tenant-share +
X06-handoff (the personal subsets of X05 snippets and X06 notes already shipped).

---

## Summary

| Item | Class | Blocker | Martin's decision |
|------|-------|---------|-------------------|
| P05 RLS strict | Ocean | prod migration on broken journal + needs all reads under withTenantTx + shadow soak | apply foundation, soak, then 0078 |
| R04 attachments | Ocean | sync-pipeline change (unverifiable here) + @vercel/blob not installed | provision Blob; OK to touch sync |
| Q01 semantic | Ocean | emails not embedded; needs embed pipeline + backfill | greenlight pipeline, or keep keyword |
| TEAM (X01/03/04…) | Ocean | personal→shared inbox rewrite + migration + 4 tables | decide: shared/team inbox? |
