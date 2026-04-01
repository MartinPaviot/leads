# Apollo.io API — Tools Available

## Account
- Email: apollo-signup@elevay.dev
- Plan: Free (75 credits/month, 10 export credits)
- API Key: stored in .env.local as APOLLO_API_KEY
- Developer portal: developer.apollo.io

## Endpoints Used

### 1. Organization Enrich
`GET /v1/organizations/enrich?domain={domain}`
- Returns: industry, employee_count, revenue, funding, technologies, location
- Cost: 1 export credit
- Used by: `/api/enrich` route

### 2. People Match (Enrich)
`POST /v1/people/match`
- Body: `{ email?, first_name?, last_name?, domain? }`
- Returns: title, seniority, departments, linkedin_url, phone, email_status
- Cost: 1 email credit + 1 export credit
- Used by: `/api/enrich-contacts` route

### 3. People Search
`POST /v1/mixed_people/search`
- Body: `{ q_organization_domains, person_seniorities, per_page }`
- Returns: people list (no emails — use People Match for contact info)
- Cost: 1 export credit
- Used by: `/api/accounts/[id]/suggested-contacts` route

### 4. Organization Search
`POST /api/v1/mixed_companies/search`
- Body: `{ q_organization_keyword_tags, organization_num_employees_ranges, organization_locations }`
- Returns: organizations list with basic info
- Cost: 1 export credit
- Used by: `/api/tam` route

## Client Library
`app/apps/web/src/lib/apollo-client.ts`

Exports:
- `enrichOrganization(domain)` → ApolloOrganization | null
- `enrichPerson(params)` → ApolloPerson | null
- `searchPeople(params)` → PeopleSearchResult
- `searchOrganizations(params)` → OrgSearchResult
- `employeeCountToRange(count)` → string
- `revenueToRange(revenue)` → string
- `isApolloAvailable()` → boolean

## Rate Limits (Free Plan)
- ~50 requests/minute
- ~100 requests/hour
- ~300 requests/day
- Check response headers: x-minute-usage, x-hourly-usage, x-daily-usage

## Auth Header
`X-Api-Key: {api_key}` (NOT in URL params — deprecated)
