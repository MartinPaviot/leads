# Sales-Navigator filter vocabulary — authoritative (live-verified 2026-06-30)

Source: the live Unipile `POST /linkedin/search` 400-error embeds the **full OpenAPI
schema** of every search variant. Captured against martin@elevay.dev's connected
Sales-Nav seat (account_id `0vB-DJ46TbOqW80oiA9Z2Q`). This corrects two earlier
claims and is the basis for `icp-to-salesnav.ts`.

## Variants exposed by the schema
`Classic - People | Classic - Companies | Classic - POSTS | Classic - JOBS |
Sales Navigator - People | Sales Navigator - Companies | Recruiter - People |
Search from URL | Cursor`

## Sales Navigator — People (exact field shapes)

| Field | Shape | Resolver type (`/search/parameters`) |
|---|---|---|
| `keywords` | string | — |
| `location` | `{include:[id],exclude:[id]}` | **REGION** (≡ LOCATION on SN, same ids — verified) |
| `industry` | `{include:[id]}` | **SALES_INDUSTRY** (≡ INDUSTRY on SN, same ids — verified) |
| `role` | `{include:[id OR plain text]}` | JOB_TITLE — **accepts plain text**, more precise than keyword fold |
| `past_role` | `{include:[id]}` | JOB_TITLE |
| `function` | `{include:[id]}` | **DEPARTMENT** (e.g. Engineering=8) |
| `company` | `{include:[id OR plain text]}` | COMPANY (e.g. Google=1441) |
| `past_company` | `{include:[id OR text]}` | COMPANY |
| `company_type` | `[enum]` | enum: `public_company, privately_held, non_profit, educational_institution, partnership, self_employed, self_owned, government_agency` |
| `company_location` | `{include:[id]}` | REGION |
| `company_headcount` | `[{min,max}]` | min∈{1,11,51,201,501,1001,5001,10001} max∈{1,10,50,200,500,1000,5000,10000} |
| `school` | `{include:[id]}` | SCHOOL |
| `seniority` | `{include:[enum],exclude:[enum]}` | enum: `owner/partner, cxo, vice_president, director, experienced_manager, entry_level_manager, strategic, senior, entry_level, in_training` |
| `tenure` | `[{min,max}]` | min∈{0,1,3,6,10} max∈{1,2,5,10} (years of experience) |
| `tenure_at_company` | `[{min,max}]` | same buckets (years in current company) |
| `tenure_at_role` | `[{min,max}]` | same buckets (years in current position) |
| `profile_language` | `[ISO-639-1 2-char]` | — |
| `groups` | `[id]` | GROUPS |
| `persona` | `[id]` | PERSONA (saved buyer personas) |
| `network_distance` | `[1\|2\|3\|"GROUP"]` | — |
| `connections_of` | `[member id]` | PEOPLE |
| `lead_lists` | `{include:[id OR "ALL"]}` | **LEAD_LISTS** (saved lead lists) |
| `account_lists` | `{include:[id OR "ALL"]}` | **ACCOUNT_LISTS** (saved account lists) |
| `saved_search_id` | string id — **overrides all other params** | SAVED_SEARCHES |
| `recent_search_id` | string id | RECENT_SEARCHES |
| `include_saved_leads` / `include_saved_accounts` | boolean | — |
| `save_search` | boolean (persist this search in SN) | — |
| **Spotlights (intent booleans)** | boolean | `changed_jobs, posted_on_linkedin, mentionned_in_news, following_your_company, viewed_your_profile_recently, viewed_profile_recently, messaged_recently, past_colleague, shared_experiences` |
| `first_name` / `last_name` | string | — |

## Sales Navigator — Companies (exact field shapes)

| Field | Shape | Notes |
|---|---|---|
| `keywords` | string | — |
| `industry` | `{include:[id]}` | SALES_INDUSTRY |
| `location` | `{include:[id]}` | LOCATION (HQ) |
| `headcount` | `[{min,max}]` | same buckets as company_headcount |
| `headcount_growth` | `{min,max}` | percent |
| `department_headcount` | `{department:[DEPARTMENT id], min, max}` | — |
| `annual_revenue` | `{currency(ISO4217), min, max}` | use max=1001 for "1000+" |
| `followers_count` | `[{min,max}]` | min∈{1,51,101,1001,5001} max∈{50,100,1000,5000} |
| `fortune` | `[{min,max}]` | min∈{0,51,101,251} max∈{50,100,250,500} |
| `technologies` | `[id]` | TECHNOLOGIES |
| `has_job_offers` | boolean | hiring on LinkedIn |
| `recent_activities` | `[enum]` | `senior_leadership_changes, funding_events` (buying signals) |
| `account_lists` | `{include:[id OR "ALL"]}` | ACCOUNT_LISTS |
| `saved_accounts` | — | SAVED_ACCOUNTS |

## `/search/parameters` resolvable `type` enum (live)
Common: `LOCATION, PEOPLE, CONNECTIONS, COMPANY, SCHOOL, INDUSTRY, SERVICE,
JOB_FUNCTION, JOB_TITLE, EMPLOYMENT_TYPE, SKILL`.
SN-specific: `GROUPS, SALES_INDUSTRY, DEPARTMENT, PERSONA, ACCOUNT_LISTS,
LEAD_LISTS, TECHNOLOGIES, SAVED_ACCOUNTS, SAVED_SEARCHES, RECENT_SEARCHES,
REGION, POSTAL_CODE`.
Recruiter: `GROUPS, DEPARTMENT, HIRING_PROJECTS, SAVED_SEARCHES, SAVED_FILTERS, DEGREE`.

## Live totals (seat-scoped, sanity)
- `function:{include:["8"]}` (Engineering) → 33.9M
- `role:{include:["VP of Sales"]}` → 224 428 vs keyword `("VP of Sales")` → 251 541 → **role is tighter**
- `company:{include:["1441"]}` (Google) → 183 278
- `seniority:{include:["vice_president","cxo"]}` → 12.5M
- `changed_jobs:true + industry:4` → 397 284 ; `posted_on_linkedin:true + industry:4` → 932 598
- `lead_lists:{include:["<list id>"]}` → 200 OK (shape valid)

## Corrections to earlier audit
1. **Lead lists / account lists / saved searches / personas ARE reachable** —
   via `/search/parameters?type=LEAD_LISTS|ACCOUNT_LISTS|SAVED_SEARCHES|PERSONA`
   (returns ids) and the search body filters by them. Earlier "not in the API"
   was from guessing wrong REST paths.
2. **INDUSTRY≡SALES_INDUSTRY and LOCATION≡REGION** on the SALES_NAVIGATOR service
   (identical ids/totals) — so the prior `INDUSTRY`/`LOCATION` resolution was not
   a latent bug, but we now resolve with the schema-named type for correctness.
