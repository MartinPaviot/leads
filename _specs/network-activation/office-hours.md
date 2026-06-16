# Office hours — Network activation (founder's LinkedIn export)

## Problem statement (one sentence)
A founder's own LinkedIn network is the highest-trust, most in-ICP audience they
own, yet it sits dead in a `Connections.csv` export — never scored, never
enriched, never surfaced as people to call.

## Premise challenge
- *"Isn't this the connection-graph infra (PR #213)?"* — No. That infra is the
  ambitious, dormant version (Unipile/Sales-Nav, warm-path graph, RGPD spike).
  This is the cheap cousin that needs **zero new dependency**: a CSV the founder
  already has → our existing ICP scoring → our existing FullEnrich → a call list.
  It ships now; it does not wait on the graph.
- *"Do we even need a parser? Use /api/import."* — The generic importer chokes on
  LinkedIn's export: a "Notes:" preamble before the header, a UTF-8 BOM, and
  mostly-empty `Email Address` columns. The net-new is a small, pure parser; the
  rest is reuse.
- *"Is the network really in-ICP?"* — For Pilae (Suisse romande, narrow ICP, ~88%
  of cold stock off-ICP per the ICP memo) the founder's connections skew far more
  in-ICP than cold sourcing. Worst case we score them and the non-fits fall out
  the same ICP gate everything else passes through.

## Alternatives explored
1. **Live LinkedIn scrape (Unipile)** — richer, continuous, but needs Sales Nav
   (~100€) + Unipile wiring + RGPD review. That is the connection-graph océan.
   Rejected for v1: dependency + cost + latency.
2. **CSV import as a generic contact list** — works, but loses the three things
   that make this valuable: the "network" provenance, the `Connected On` recency,
   and a one-click path into scoring + a dedicated call list. Rejected: under-uses
   the asset.
3. **CSV → dedicated network pipeline (chosen)** — pure parser → upsert tagged
   `network` → ICP score → "Mon réseau" filter + call list → enrich top-N. All
   reuse except the parser. Highest completeness for the least new surface.

## Layer check
- Layer 1 (tried & true): PapaParse for CSV field parsing (already the importer's
  engine) — do not hand-roll quoting.
- Layer 2 (new/popular): n/a.
- Layer 3 (first principles): the LinkedIn-specific preamble/BOM/empty-email
  handling and the dedup identity key — prized, because no library knows LinkedIn's
  export shape.

## Completeness target: 9/10
- 10 would also: re-merge across multiple exports over time, and feed a warm-intro
  graph (that is connection-graph infra, separate).
- 9 delivers: robust parser (all export quirks, dedup), tenant-scoped import,
  ICP scoring, a "Mon réseau" contacts filter + call list, and bulk enrich of the
  top-of-ICP slice — end to end, behind existing tenant/credit guards.
