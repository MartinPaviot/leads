# Apollo — selectable categories (study), 2026-06-16

Grounded in Apollo's live API contract (the `apollo_mixed_companies_search` and
`apollo_organizations_enrich` MCP tool schemas), **not** memory. This is the
authoritative list of what Apollo lets you *select on / filter by* for
organizations, plus what enrichment returns. Used to (a) make the accounts
"Categories" picker honest and (b) strip provider names from the UI.

## 1. Organization Search — selectable filter categories (the real catalog)

Every category Apollo's Organization Search exposes today:

| Category | Apollo filter param | Notes |
|---|---|---|
| Name | `q_organization_name` | single name |
| Domains | `q_organization_domains_list` | array of domains |
| Apollo org IDs | `organization_ids` | direct lookup |
| HQ location (incl. exclude) | `organization_locations`, `organization_not_locations` | free-text "City, ST" / country |
| Employee size bands | `organization_num_employees_ranges` | e.g. `['1,10','11,50','51,200']` |
| Headcount **by department** | `organization_department_or_subdepartment_counts` | 14 depts: c_suite, product_management, master_engineering_technical, design, education, master_finance, master_human_resources, master_information_technology, master_legal, master_marketing, medical_health, master_operations, master_sales, consulting |
| Headcount **growth %** | `organization_headcount_growth_range` + `organization_headcount_growth_past_n_months` | growth signal over a window |
| Revenue range | `revenue_range` {min,max} | |
| Founded year range | `organization_founded_year_range` (+ `organization_include_unknown_founded_year`) | |
| Industry — NAICS | `organization_naics_codes`, `not_organization_naics_codes` | 2–5 digit |
| Industry — SIC | `organization_sic_codes`, `not_organization_sic_codes` | 4 digit |
| Market segments | `market_segments` | matched vs tags + name (e.g. B2B, Enterprise) |
| Keyword tags | `q_organization_keyword_tags` | e.g. SaaS, fintech |
| Technologies in use | `currently_using_any_of_technology_uids` | tech UIDs (salesforce, wordpress_org…) |
| Funding — latest amount | `latest_funding_amount_range` {min,max} | |
| Funding — latest date | `latest_funding_date_range` {min,max} | |
| Funding — total raised | `total_funding_range` {min,max} | |
| Hiring — job titles posted | `q_organization_job_titles` | titles in active postings |
| Hiring — job locations | `organization_job_locations` | |
| Hiring — job posted date | `organization_job_posted_at_range` {min,max} | |
| Hiring — number of jobs | `organization_num_jobs_range` {min,max} | |

## 2. Organization Enrich — returned fields

Per the enrich tool: **industry, revenue, employee counts, funding round
details, corporate phone numbers, locations.** (1 credit if found, 0 if not.)
No live enrich call was spent for this study — the search-filter schema above is
the authoritative "what can be selected" surface and needs no credit.

## 3. Mapping to our accounts "Categories" picker

The picker exposes a *subset* of the above as account **columns**, each backed by
a real fetch path (enrichment criterion or signal detector). What we surface:

**Firmographic extras** (`listExtraCriteria()` → enrichment waterfall):
- Founded year ← Apollo `founded_year` / founded-year filter
- Tech stack ← Apollo technologies
- Funding (stage / total / investors) ← Apollo funding fields
- Keywords ← Apollo keyword tags

**Signals** (detectors over the enriched org):
- Common investor — set-intersection of the org's investors with the tenant's own
- Recent funding — `latest_funding_raised_at` within 180 days
- Funding (Crunchbase) — richer rounds via Crunchbase **(NOT CONNECTED — greyed)**
- Hiring — `num_current_job_openings` > 0
- YC — heuristic scan of description/keywords for Y Combinator mentions

Apollo offers more selectable *filters* (department headcounts, headcount-growth,
NAICS/SIC, market segments, num-jobs) — these are **sourcing/ICP filters**, not
per-account columns, and already belong to the targeting surface
(`onboarding-confirmation-card` mirrors "the full pushable Apollo org-search
surface"). They are intentionally not added as picker columns: a column with no
backing per-account fetch would render empty (no-orphan-data rule).

## 4. Decisions applied (this change)

1. **Crunchbase greyed out.** `CRUNCHBASE_API_KEY` is empty in `.env.example`;
   the `funding_crunchbase` detector already no-ops without it. The picker row is
   now `available: false` → rendered disabled/greyed with a "Soon" tag, and the
   page strips it from persisted visibility so it can never become an empty column.

2. **No provider names in the UI.** Every `source` line in the picker is now a
   vendor-neutral description of what the column *holds*, never where it came from
   (CLAUDE.md `feedback_no-provider-names-ui`). Specifically:
   - "Apollo investors vs your cap table" → "Shares an investor with your company"
   - "Apollo latest-funding date" → "Raised funding in the last 180 days"
   - "Apollo company profile / tech detection / keywords" → each criterion's own
     neutral `hint` ("Year the company was founded", "Detected technologies in
     use", "Latest stage, total raised and investors", "Descriptive keywords / tags")
   - "Crunchbase funding rounds" → "Not available yet" (row greyed)
   The only place a provider name remains is the greyed **label** "Funding
   (Crunchbase)" — kept deliberately so the user can see *which* integration is
   pending (a "connect this" affordance, not a data-provenance claim).

   A regression test (`column-categories.test.ts`) now fails the build if any
   `source` line contains apollo/crunchbase/lusha/sirene/zeliq/pappers/datagma.

Note: the legal `/security` page still names Apollo on purpose (subprocessor
transparency: "Datagma + Pappers (FR) instead of Apollo") — out of scope, correct.
