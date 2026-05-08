# Company Brain — requirements

> Mnemosyne (Μνημοσύνη) — sans mémoire, pas de chant. Sans capture
> unifiée + requête citée, le founder reconstruit le contexte de
> chaque compte à chaque rendez-vous. Le brain est l'instanciation
> du tellurisme grec dont la GTM Elevay tire sa thèse.

## User story

GIVEN a company in the TAM (resolved or in-progress),
WHEN the founder needs "everything we know about this company —
sources, freshness, derived insights, citations" in one place to
answer either a chat question or a meeting prep,
THEN one query against `getCompanyBrain(companyId)` returns a
unified, cited, freshness-tagged view of every artifact + every
derived property the system has accumulated, **with no manual
data assembly required**.

## Why this isn't already done

Elevay has 80% of the *primitives* (activities, transcripts,
signals, memories, context graph, dossier, deal properties,
knowledge entries) but they live in 8-10 distinct tables, each
with its own ingestion worker, its own embedding strategy, its
own query path. A founder asking "what do we know about AcmeCorp?"
today triggers a chat that pulls some context from RAG, some from
entities, some from memories — but no single API materialises the
brain. Each surface (account page, deal page, chat, dossier)
consumes a different slice.

**The Company brain is not new data — it's a unifying read API
over data that already exists**, with the option to consolidate
the schema later.

## Definition of "passes"

A `CompanyBrain` object returned by `getCompanyBrain(companyId,
opts)` MUST satisfy :

1. **Joinable** — single function call returns the full brain ;
   callers don't compose 8 queries themselves.
2. **Cited** — every derived property carries `{value, source,
   date, confidence}` tracking back to the source artifact.
3. **Freshness-tagged** — each layer (activities, signals,
   transcripts, dossier) reports its `lastRefreshedAt` so the
   consumer knows what's stale.
4. **Bounded** — opts let the caller cap how much to load
   (recent activities cap, transcript chunks cap, etc.) so the
   brain doesn't blow up on a 5-year-old account with 10K
   activities.
5. **Multi-tenant safe** — every join filters by tenantId via
   the existing schema's tenantId columns. No cross-tenant leak.
6. **Tested** — unit tests pin the shape + the multi-tenant
   filter + the freshness tags.
7. **Stub-safe when data is partial** — a company with only
   external dossier (no activities yet) returns a brain with
   `activities: []` and `freshness.activities: null`. Never
   throws.

## Out of scope (Phase 1)

Phase 1 is **read-only aggregation over existing tables**. NOT in
scope for Phase 1 :

- New tables / migrations (Phase 2)
- A unified embedding index across artifact types (Phase 2)
- A "Brain page" UI (Phase 3)
- Chat panel integration to call `getCompanyBrain` for the active
  entity (Phase 3 ; cheap once the helper exists)
- Streaming brain updates (Phase 4 if ever)
- Cross-company "tell me about my pipeline" — that's `chat`'s
  remit, not the brain's.

## Edge cases the brain must handle

1. **Company with no contacts** → `contacts: []`, no throw.
2. **Company with deal but contact deleted** → deal still surfaces,
   contact list shows the remaining contacts (no orphan).
3. **Activities older than the cap** → silently truncated, with a
   `truncated: true` flag at the layer level.
4. **Dossier still building** → `dossier: null` rather than wait.
5. **Signal that no longer applies** (>30d, dispositioned) →
   excluded from default `signals[]` ; included only when
   `opts.includeStaleSignals === true`.
6. **No transcript chunks yet** → `meetings: []`,
   `transcriptChunks: []`. No throw.
7. **Tenant access mismatch** — caller's `authCtx.tenantId` differs
   from the company's `tenantId` → returns `null` (caller's
   responsibility to 404).

## Future vs now (Phase fences)

| Phase | Scope | Effort | Reversibility |
|---|---|---|---|
| **1** (this spec) | Read API + types + tests + `/api/brain/[companyId]` route | S (3-5h) | Trivial — pure read helper, no schema |
| 2 | Schema consolidation : optional unified `entity_brain_snapshot` cache table for materialised joins ; cross-artifact embedding index | L (2-3w) | Medium — additive migration, can roll back |
| 3 | Brain page UI (`/accounts/[id]/brain` or merged into account detail page) ; chat tool `getCompanyBrain` for the active deal | M (1-2w) | Easy — UI surface, no schema |

Phase 1 unlocks the chat to reference "the brain" semantically
without touching schema. If Phase 1 surfaces a real friction
("8 queries × 5ms is slow"), Phase 2 caches via the snapshot
table. If Phase 1 reveals a UX gap, Phase 3 builds the page.
**No phase commits to the next.**
