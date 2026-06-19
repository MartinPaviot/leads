# INBOX-Q05 — Cross-entity search (inbox × CRM)
> Theme: T5 · Autonomy rung: helper · Priority: P0
> Pillar: P5 GTM moat

## User story
As a founder, I want a single search that spans my mail **and** my CRM ("everything about the
Lausanne federation", "what's the status with Marc"), returning the contact, their company, the
open deal, recent signals **and** the related threads together — so one query gives me the whole
picture instead of making me cross-reference inbox and CRM by hand.

## Why (audit anchor)
This is the moat made searchable: Lightfield's cited customer memory + Monaco's deal intelligence,
joined to the inbox. Superhuman's "For Sales" sidebar shows CRM records but its **search doesn't
join mail to deals** — it's an external integration, a sidebar view, not a unified index (deep-dive
"mechanism = a sidebar VIEW + Auto-Bcc", §Superhuman for Sales). We already fuse a **context graph
+ hybrid vector search** for chat answers (`chat/route.ts:466`: `searchContextGraph` ∥ `searchSimilar`,
merged), and our `embeddings` index holds contacts, companies, deals, activities, notes in one place
(`api/embed/route.ts`). So a cross-entity inbox search is a direct surfacing of an engine we run.

## Requirements (EARS)
- WHEN the user runs a cross-entity search, the system SHALL return results grouped by type
  (People · Companies · Deals · Mail · Notes/Meetings), each ranked by relevance, in one response.
- The system SHALL join across types via the CRM graph and the shared embeddings index (a person →
  their company → its open deal → related threads), surfacing the connected cluster, not isolated rows.
- The system SHALL scope CRM results to the tenant and mail results to the viewer's mailbox
  (`getInboxScope`), and SHALL NOT leak another user's threads even when the contact is shared.
- The system SHALL render each result with a citation/deep link to its canonical record
  (`/contacts/:id`, `/accounts/:id`, `/opportunities/:id`, `/inbox?conversation=:key`).
- WHEN a query names an entity, the system SHALL resolve it and lead with that entity's cluster
  (contact + company + deal + recent mail), then list other matches.
- The system SHALL apply freshness rules to surfaced signals/roles (signal-freshness TTL,
  role-freshness guardrail) so stale facts are suppressed or labelled, not asserted.
- The system SHALL fall back gracefully (mail-only or CRM-only) when one index/path is unavailable,
  marking the result partial.
- The system SHALL never show provider names ("via Elevay"); unknown fields render null, never guessed.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a contact "Marc" with a company and an open deal and three threads WHEN I search "Marc"
  THEN the result leads with Marc's cluster (contact + company + deal + recent mail), each cited.
- GIVEN a company name WHEN I search it THEN People/Companies/Deals/Mail groups all populate from
  that company's graph, not just a name match.
- GIVEN a shared contact but a teammate's private thread WHEN I search THEN the contact/company/deal
  show, but the teammate's thread does not (mailbox scope on mail).
- GIVEN a signal older than its TTL WHEN the cluster renders THEN the signal is suppressed (per
  signal-freshness), not shown as current.
- GIVEN the context graph is unavailable WHEN I search THEN vector + structured CRM results still
  return, marked partial.
- GIVEN a result WHEN clicked THEN it deep-links to the canonical record/thread in-app.
- GIVEN two tenants WHEN searching THEN no cross-tenant record appears (SQL tenant scope).

## Edge cases & failure handling
- Entity name collision (two "Marc"s) → show both clusters, disambiguated by company.
- Contact with many deals → lead with the most relevant open deal, list the rest (mirror INBOX-G01).
- Mail exists but contact not yet in CRM → mail group still returns; offer "Add to CRM" (INBOX-G02).
- Graph/vector latency → render the fast groups first (structured CRM), stream the rest; never block.
- Citation target deleted between index and click → mark stale, never dangle.
- Cross-tenant + mailbox: tenant scope in SQL for CRM; mailbox scope in app layer for mail —
  applied independently so a tenant-wide CRM match never pulls a foreign mailbox's thread.

## Best-in-class bar
- **One index, one query, joined by the GTM graph** — mail + deals + signals + last interaction in a
  single cited result cluster. Superhuman's sales search is a CRM-record sidebar bolted onto mail;
  ours *is* the CRM, so the join is native and the citations point at our own truth.
- Freshness-aware (signal TTL + role guardrail already in the codebase) so the cross-entity view
  surfaces *current* facts, not stale enrichment — the difference between intelligence and a dump.

## Design sketch
- **Data:** `embeddings` (all entity types in one table) + `contextGraphNodes`/`contextGraphEdges`
  (`lib/ai/context-graph.ts`) + the CRM tables (contacts/companies/deals/activities/notes). Mail =
  `activities`(email) + `outbound_emails`. Freshness via `lib/signals/freshness.ts` + role-status SSOT.
- **API:** new `GET /api/inbox/search?q=…&scope=all` (or a `?cross=1` mode on the Q01 route) that runs
  `searchContextGraph(q, tenantId)` ∥ `searchHybrid(q, tenantId)` (the same merge as `chat/route.ts:466`),
  groups hits by `entity_type`, applies mailbox scope to mail hits, applies freshness, and resolves
  the lead entity's cluster (reuse Call Mode brief builders + `lib/accounts/last-interaction.ts`).
- **UI:** grouped results under the inbox search (Q01 field): sectioned list (People/Companies/Deals/
  Mail/Notes) with `IndustryBadge`/`TitleBadge` on entities, `lucide-react` section icons
  (`User`, `Building2`, `TrendingUp`, `Mail`, `StickyNote`), citation deep links; or pivot any
  result into Ask-AI (Q02). Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** retrieval + graph traversal only (generation is Q02's job). Entity resolution reuses the
  graph's resolution (`context-graph.ts`).
- **Security/perf:** tenant scope in SQL; mailbox scope on mail in app layer; freshness filter;
  stream groups; cap each group; real counts.

## Tasks (ordered, each with a verify step + test to write)
1. Cross-entity retrieval: graph ∥ hybrid, grouped by type, mailbox-scope on mail, freshness applied.
   (verify: a name query returns all groups) (test: `cross-entity-search.test.ts` incl. tenant +
   mailbox isolation + stale-signal suppression)
2. Lead-entity cluster resolution (contact + company + deal + recent mail), reusing Call Mode brief
   + last-interaction SSOT. (verify: the named entity leads with its cluster) (test: cluster test)
3. Grouped result UI with badges + citation deep links. (verify: searching a company shows
   People/Deals/Mail in the live app) (test: grouped-render test)
4. Partial/degraded handling (graph down → CRM+vector only, marked partial). (verify: disable graph
   locally → groups still render)
5. Freshness integration (TTL suppression, role "to confirm" labelling). (verify: a stale signal is
   hidden; an old role reads "poste à confirmer")

## Current-state notes (VERIFY before building)
- The graph∥vector merge already exists in chat (`chat/route.ts:466`) — lift the same pattern into a
  search route rather than re-implementing retrieval.
- `embeddings` holds contacts/companies/deals/activities/notes in one index (`api/embed/route.ts`),
  so a single `searchHybrid` already spans CRM + mail entity types — grouping is a post-step.
- Call Mode already assembles a cited entity cluster (career timeline + grounded company summary,
  jsonb-cached, fail-closed) and `lib/accounts/last-interaction.ts` is the SSOT — reuse for the lead
  cluster, don't rebuild (mirrors INBOX-G01).
- Freshness SSOTs exist: `lib/signals/freshness.ts`, role-status SSOT — apply them here.
- Mailbox scope (`getInboxScope`) must be applied to mail hits *after* the tenant-scoped retrieval —
  the `embeddings`/graph tables carry no `mailbox_id`. VERIFY no mail hit bypasses the scope.
