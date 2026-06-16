# Requirements — Network activation

## User story
As a founder doing founder-led sales, I want to upload my LinkedIn
`Connections.csv` so that my own network is scored against my ICP, the best fits
are enriched with a mobile, and I can call them — turning a dead export into a
warm call list.

## Acceptance criteria (EARS / GIVEN-WHEN-THEN)

### R1 — Parse the LinkedIn export robustly
- GIVEN a real LinkedIn `Connections.csv` with the "Notes:" preamble and a UTF-8
  BOM, WHEN parsed, THEN the header row is located, the preamble is skipped, and
  every data row becomes a connection.
- GIVEN a row whose `Email Address` is empty (LinkedIn redacted it), WHEN parsed,
  THEN the connection is KEPT (the profile URL is the handle), with `email = null`.
- GIVEN a file with no LinkedIn-shaped header, WHEN parsed, THEN `headerFound`
  is false and no connections are emitted (no garbage rows).

### R2 — Dedup within the file
- GIVEN the same person appears twice with URL variants (trailing slash, `http`
  vs `https`, a tracking query), WHEN parsed, THEN they collapse to ONE connection
  and `duplicates` is incremented.

### R3 — Import is tenant-scoped and idempotent-ish
- GIVEN an authenticated tenant uploads connections, WHEN imported, THEN contacts
  are created under that tenant only, tagged `properties.network = true` with the
  `Connected On` date, and contacts already present (same LinkedIn URL or email
  in this tenant) are NOT duplicated.
- GIVEN a company name on a row, WHEN imported, THEN the contact links to an
  existing company of that name in the tenant, or a new company is created.

### R4 — Score to ICP using the existing engine
- GIVEN imported network contacts, WHEN scoring runs, THEN each gets
  `contacts.score` + `properties.icp_fit` via `scoreContactIcpBatch` — the same
  path as every other contact (no parallel scorer).

### R5 — Surface the cohort
- GIVEN network contacts exist, WHEN I open Contacts, THEN I can filter to
  "Mon réseau" (`?fNetwork=true`) and sort by ICP fit.
- GIVEN network contacts exist, WHEN I open Call Mode lists, THEN "Mon réseau" is
  selectable as a call list, AND-combinable with the existing ICP/sector facets.

### R6 — Enrich the top of ICP
- GIVEN the in-ICP slice of my network lacks a mobile, WHEN I trigger enrich,
  THEN the existing `enqueueFullEnrichForContacts` runs (cap 100, eligibility =
  name + company OR LinkedIn URL), and results land on the existing webhook.

### R7 — Provenance honesty (house rule)
- The UI labels this cohort "Mon réseau" / "Importé depuis LinkedIn" — never a
  third-party provider name (no "Apollo"/"Lusha"/etc.), per the no-provider-names
  rule. No emojis in any added UI.

## Edge cases
- BOM present / absent; CRLF vs LF line endings.
- Preamble of 2 vs 3 lines; export with NO preamble (header on line 1).
- Quoted fields containing commas (company "Acme, Inc.") and quoted dates.
- `Connected On` in "DD Mon YYYY" and "Mon DD, YYYY"; unparseable date → kept raw.
- Row with neither URL nor email → skipped and counted, not crashed.
- Empty file / header-only file / non-LinkedIn CSV.
- A connection whose company is blank (still scorable on the person dimension).

## Evaluation steps (Phase 6)
1. Unit: feed the fixtures above to `parseLinkedInConnections`, assert counts +
   field-level correctness (the pure lake — must be green before anything else).
2. API: POST a small real export to `/api/network/import`, assert tenant-scoped
   inserts, the `network` tag, company linkage, dedup against a pre-seeded contact.
3. Scoring: assert imported ids get a non-null `score`.
4. Surface: `GET /api/contacts?fNetwork=true` returns only the cohort; a "Mon
   réseau" call list returns the same people.
5. Regression: full `vitest run` + `tsc --noEmit` green.
