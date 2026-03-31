# B2B Data Providers Research Report

**Date:** 2026-03-30
**Status:** Complete
**Purpose:** Evaluate B2B data providers for automated TAM building in a founder-led sales GTM engine

---

## Table of Contents

1. [Apollo.io](#1-apolloio)
2. [People Data Labs (PDL)](#2-people-data-labs-pdl)
3. [Hunter.io](#3-hunterio)
4. [Clearbit / Breeze Intelligence](#4-clearbit--breeze-intelligence-by-hubspot)
5. [Crunchbase](#5-crunchbase)
6. [Proxycurl (DEFUNCT)](#6-proxycurl-defunct)
7. [BuiltWith](#7-builtwith)
8. [ZoomInfo](#8-zoominfo)
9. [Waterfall Enrichment Strategy](#9-waterfall-enrichment-strategy)
10. [Cost Modeling](#10-cost-modeling)
11. [Recommendation for Our Stack](#11-recommendation-for-our-stack)

---

## 1. Apollo.io

**Category:** All-in-one sales intelligence + engagement platform
**Website:** https://www.apollo.io
**API Docs:** https://docs.apollo.io

### Pricing (2026)

| Plan | Monthly | Annual (per month) | Email Credits | Mobile Credits | Export Credits |
|------|---------|-------------------|---------------|----------------|----------------|
| Free | $0 | $0 | 10,000/mo (corporate domain) or 100/mo | 5/mo | 10/mo |
| Basic | $59/user | $49/user | Unlimited* | 75/mo | 1,000/mo |
| Professional | $99/user | $79/user | Unlimited* | 100/mo | 2,000/mo |
| Organization | $149/user | $119/user (3-user min) | Unlimited* | 200/mo | 4,000/mo |

*Unlimited email credits are subject to fair-use caps: lesser of (annual spend / $0.025) or 1M credits/year.

**Additional credits:** $0.20 each (minimum purchase 250/month or 2,500/year). Credits do NOT roll over.

### API Access

- All plans have basic API access
- Advanced API access requires Professional or Organization plan
- Credit consumption: ~1 credit per basic enrichment call, ~8 credits for mobile phone reveal
- People enrichment endpoint: `/v1/people/match` -- 1 credit per successful match
- Organization enrichment: `/v1/organizations/enrich` -- 1 credit per call
- Full enrichment (email + phone + firmographics) estimated at ~6 credits per contact

### Rate Limits

- Fixed-window rate limiting strategy
- Exact limits vary by plan (not publicly documented -- must query API endpoint)
- Community reports suggest: ~200 requests/minute for paid plans, lower for free

### Key Data Fields

- Person: name, email (work/personal), phone (direct/mobile), job title, seniority, department
- Company: name, domain, industry, employee count, revenue range, location, technology stack
- Signals: job changes, funding events, hiring intent
- 270M+ contact records, 60M+ company profiles

### Accuracy Reputation

- **Apollo's claim:** 91% email accuracy
- **Independent testing (2025-2026):** 65-80% real-world email accuracy
- **Email bounce rates:** 15-25% reported across G2 and Trustpilot reviews; some users report 32-38% bounce on "verified" emails
- **Phone accuracy:** ~60% for direct dials
- **December 2025 update:** Waterfall enrichment became default (Apollo first, then third-party fallback). Internal claims: ~5% more emails, ~7% more phones, 45% fewer bounces. Too new for independent verification.
- **Geographic weakness:** EMEA and APAC data significantly less accurate than US data

### Suitability for Automated TAM Building

**Score: 8/10**
- Best free tier in the industry (10K email credits/month)
- Excellent for US-focused prospecting
- API is functional but credit-hungry for full enrichment
- Good company and contact coverage
- Phone data is expensive (8x email credits) and less reliable
- Strong for email-first workflows; weak for phone-first

---

## 2. People Data Labs (PDL)

**Category:** Raw data API / enrichment infrastructure
**Website:** https://www.peopledatalabs.com
**API Docs:** https://docs.peopledatalabs.com

### Pricing (2026)

| Plan | Monthly Cost | Records/Month | Cost per Record |
|------|-------------|---------------|-----------------|
| Free | $0 | 100 person + 100 company + 25 IP | N/A (contact data obfuscated) |
| Pro | $98/mo ($940/yr) | 350 person enrichments | ~$0.28/record |
| Enterprise | Custom (~$2,500+/mo) | Custom volume | ~$0.004-0.20/record at scale |

- Annual plan saves 20% (Pro: $940/year vs $1,176/year monthly)
- Volume discounts kick in above 1M records/month
- 1 credit = 1 successful API response (no charge on misses on some endpoints)

### API Access

- RESTful API with consistent endpoint patterns
- Person Enrichment, Company Enrichment, IP Enrichment, Search, Autocomplete
- Bulk enrichment API available for batch processing
- SDKs: Python, Node.js, Ruby, Go

### Rate Limits

- Per-key fixed-window rate limiting
- Minute-based limits tracked via `x-ratelimit-remaining.minute` header
- Default limits vary by plan (not publicly listed -- need Help Center article)
- Community reports: throttle on people search can be restrictive

### Key Data Fields (Person Schema)

- **Identity:** full_name, first_name, last_name, name_aliases, id
- **Contact:** work_email, personal_emails, recommended_personal_email, mobile_phone, phone_numbers
- **Employment:** job_title, job_title_levels, job_title_role, job_company_name, job_company_industry, job_company_size, job_start_date, inferred_salary
- **Location:** location_name, location_locality, location_region, location_country, street_addresses, location_geo
- **Education:** school, degree, major, dates
- **Social:** linkedin_url, linkedin_id, facebook_url, twitter_url, github_url, profiles array
- **History:** experience array (full work history), certifications
- **Demographics:** birth_year, sex, languages
- **Coverage:** 3B+ person profiles, extensive company data

**Critical limitation on Free plan:** Contact fields (emails, phones, addresses) are returned as boolean (true/false for existence) not actual values. Must upgrade to Pro to get real contact data.

### Accuracy Reputation

- 78% satisfaction among enterprise users (500+ employees) per survey of 89 users
- Dataset updated monthly from aggregated sources -- can lag 2-4 weeks behind reality
- **October 2025 initiative:** Began validating deliverability of top-level email fields, removing non-deliverable emails. Rolling out in phases through 2026.
- Mixed reviews: Some users call it "unmatched," others say "not great for contact data"
- Best for: firmographic enrichment, work history, social profiles
- Weaker for: direct phone numbers, real-time email accuracy

### Suitability for Automated TAM Building

**Score: 9/10**
- Best raw API for programmatic enrichment at scale
- Lowest cost per record at volume ($0.004/record at enterprise scale)
- Richest data schema (150+ fields per person)
- Excellent for building initial TAM: search by company size, industry, location, tech stack
- Free tier too limited for production (100 records, obfuscated contacts)
- Pro tier ($98/mo) is viable for early-stage with 350 enrichments/month

---

## 3. Hunter.io

**Category:** Email finding and verification specialist
**Website:** https://hunter.io
**API Docs:** https://hunter.io/api-documentation

### Pricing (2026)

| Plan | Monthly (EUR) | Annual (EUR/mo) | Search Credits | Verification |
|------|--------------|-----------------|----------------|-------------|
| Free | 0 | 0 | 50/mo | Included (0.5 credit each) |
| Starter | 49 | 34 | 2,000/mo (24K/yr) | Included + auto-verify |
| Growth | 149 | 104 | 10,000/mo (120K/yr) | Included + auto-verify |
| Scale | 299 | 209 | 25,000/mo (300K/yr) | Included + auto-verify |
| Enterprise | Custom | Custom | Custom | Custom |

**Note:** Prices are in EUR (roughly 1:1 with USD as of March 2026).

### Credit System

- 1 credit = 1 email search (Email Finder or Domain Search)
- 0.5 credits = 1 email verification
- Bulk Domain Search: 1 credit per up to 10 emails returned
- Same email lookups counted only once per billing period (deduplication)
- Annual plans: credits last 12 months with no monthly resets (major advantage)

### API Access

- Included on ALL plans (including Free)
- Domain Search: find all emails for a domain
- Email Finder: find specific person's email given name + domain
- Email Verifier: verify deliverability of an email address
- Email Count: count emails for a domain without consuming credits

### Rate Limits

- Domain Search & Email Finder: 15 requests/second, 500/minute
- Email Verifier: 10 requests/second, 300/minute
- Discover API: 5 requests/second, 50/minute

### Key Data Fields

- Email addresses (work)
- Email format patterns per domain
- Confidence score (0-100) for each email
- Sources where email was found (with URLs)
- Verification status: valid, invalid, accept_all, webmail, disposable, unknown
- Department classification
- Position/title (when available from sources)
- **Does NOT provide:** phone numbers, company firmographics, social profiles

### Accuracy Reputation

- **Verification accuracy:** Bounce rates under 1% for emails marked as "Valid"
- **Email finding success rate:** 35-45% (industry average is 50-65%)
- **Strength:** Extremely reliable verification -- if Hunter says an email is valid, it almost certainly is
- **Weakness:** Lower find rate than competitors -- misses many emails entirely
- **Best for:** Validating emails found by other providers, domain pattern detection

### Suitability for Automated TAM Building

**Score: 6/10**
- Excellent as a verification layer (secondary provider in waterfall)
- Too narrow for primary enrichment (email only, no phones/firmographics)
- Good API design with generous rate limits
- Annual credit rollover is unique advantage for batch processing
- Cost-effective for email-specific workflows

---

## 4. Clearbit / Breeze Intelligence (by HubSpot)

**Category:** Enrichment API (formerly standalone, now HubSpot-locked)
**Website:** https://clearbit.com (redirects to HubSpot)
**Status:** EFFECTIVELY DEPRECATED FOR STANDALONE USE

### What Happened

- **December 2023:** HubSpot acquired Clearbit
- **2024:** Rebranded as "Breeze Intelligence" within HubSpot's AI suite
- **April 30, 2024:** All free Clearbit tools shut down (Connect, TAM Calculator, Weekly Visitor Report, Slack integration)
- **2025 onwards:** Standalone API access progressively restricted. Existing API keys still work with limited support but no new features, no new plans, and eventual sunset planned.

### Current Pricing (Breeze Intelligence, 2026)

Requires paid HubSpot subscription as prerequisite:

| Credit Pack | Monthly Cost | Per-Record Cost |
|-------------|-------------|-----------------|
| 100 credits | $30-50/mo | $0.30-0.50 |
| 1,000 credits | $150/mo | $0.15 |
| 10,000 credits | $700/mo | $0.07 |

**Minimum viable cost:** $75/month ($30 HubSpot Starter + $45 for 100 Breeze credits)
**Mid-market reality:** $1,000-5,000+/month (HubSpot Professional + adequate credits)

### API Availability

- **For new customers:** No standalone API. Must use through HubSpot.
- **For legacy customers:** Existing API keys work with diminishing support
- **Sunset timeline:** Not publicly announced but direction is clear -- HubSpot-only

### Key Data Fields (Legacy / Breeze)

- Company: name, domain, industry, sector, employee count, revenue, tech stack, social profiles, location, description, logo
- Person: name, email, job title, seniority, employment history, social profiles, location
- Was considered gold standard for company enrichment quality

### Accuracy Reputation

- Historically rated ~85% accuracy (one of the best)
- Quality perception declining post-acquisition as team focus shifted to HubSpot integration
- No independent accuracy testing post-Breeze transition

### Suitability for Automated TAM Building

**Score: 2/10**
- **DO NOT USE for our stack.** HubSpot lock-in is a dealbreaker.
- No standalone API for new customers
- Credit-based pricing is expensive at scale
- Legacy API will be sunset
- Was excellent, is now a dead end for independent products

---

## 5. Crunchbase

**Category:** Company data, funding intelligence, private market data
**Website:** https://www.crunchbase.com
**API Docs:** https://data.crunchbase.com/docs

### Pricing (2026)

| Plan | Monthly | Annual (per month) | API Access |
|------|---------|-------------------|------------|
| Pro | $99/mo | $49/mo ($588/yr) | No API |
| Business | $199/mo | $199/mo ($2,388/yr) | Limited (5K exports/month) |
| Enterprise/API | Custom | Custom ($50,000+/yr) | Full API (200 calls/min) |

**Key issue:** Real API access requires Enterprise, which starts at $50,000+/year.

### Free / Basic API

- Basic API: Free upon registration, limited access
- Covers: company name, type, status, industry, location, employee count
- Does NOT include: detailed funding data, financials, advanced firmographics
- Suitable for small-scale projects and testing only

### Rate Limits

- 200 API requests per minute (Enterprise)
- Lower limits for Basic API (not publicly specified)

### Key Data Fields

- **Company:** name, domain, description, industry, employee count, founded date, status, location, revenue range
- **Funding:** rounds (type, date, amount, investors, lead investor), total funding, last funding date, funding stage
- **People:** founders, executives, board members, advisors
- **Events:** acquisitions, IPOs, news articles
- **Predictions:** AI-generated funding predictions (84% validation rate)
- **Coverage:** Millions of companies, 30M+ verified data updates/year

### Accuracy Reputation

- Best-in-class for funding data and private company intelligence
- Maintained through AI grading + human analyst team
- 84% of funding predictions validated against real outcomes
- Weaker for: smaller/international startups, real-time accuracy
- Excellent for: VC-backed companies, US tech ecosystem

### Suitability for Automated TAM Building

**Score: 5/10 (as primary) / 8/10 (as funding supplement)**
- Unbeatable for funding signals and investor intelligence
- Way too expensive for primary TAM building ($50K+/year for API)
- Pro plan ($49/mo annual) useful for manual research but no API
- **Workaround:** Use Crunchbase Basic API (free) for company existence checks, supplement with PDL/Apollo for contact data
- Best used as a signal layer: "company just raised Series A" triggers outreach

---

## 6. Proxycurl (DEFUNCT)

**Category:** LinkedIn profile data API
**Website:** https://nubela.co/proxycurl (shutdown)

### Status: SHUT DOWN

- **January 2025:** LinkedIn (Microsoft) filed federal lawsuit against Proxycurl
- **July 4, 2025:** Proxycurl officially shut down
- **Reason:** LinkedIn accused Proxycurl of "unauthorized creation of hundreds of thousands of fake accounts and scraping of millions of LinkedIn member profiles"
- **Founder's response:** "There is no winning in fighting this" given LinkedIn's resources and the American Rule (no legal fee recovery even if you win)

### Historical Pricing (for reference)

- $49/month for 1,000-2,500 API calls
- $199/month for 10,000 calls
- ~$0.01-0.05 per request depending on volume
- Pay-as-you-go from $10 (credits never expired)

### Successor: NinjaPear

- The Proxycurl team pivoted to NinjaPear (competitive intelligence data)
- Not a direct replacement for LinkedIn data API
- Different product category entirely

### Viable Alternatives for LinkedIn Data (2026)

| Provider | Per-Request Cost | Status | Risk |
|----------|-----------------|--------|------|
| Netrows | ~EUR 0.005 | Active (launched Oct 2025) | New, unproven at scale |
| Bright Data | Varies | Active, court-validated | Enterprise pricing, complex setup |
| RapidAPI scrapers | $0-varies | Mixed quality | Unreliable, some stale data |
| People Data Labs | $0.004-0.28 | Active | Aggregated data, not real-time LinkedIn |
| Apollo.io | ~$0.005 | Active | Secondary to main platform |

**Legal risk warning:** Any service that scrapes LinkedIn profiles via fake accounts or authenticated sessions faces the same lawsuit risk as Proxycurl. Only use providers that scrape publicly visible data without authentication (Bright Data model) or aggregate from non-LinkedIn sources (PDL model).

### Suitability for Automated TAM Building

**Score: 0/10 (defunct)**
- Cannot use Proxycurl -- it no longer exists
- LinkedIn data must come from aggregated sources (PDL, Apollo) or compliant scraping (Bright Data)
- Direct LinkedIn API is invite-only and limited to authenticated user's own data

---

## 7. BuiltWith

**Category:** Technographic intelligence (what tech stack websites use)
**Website:** https://builtwith.com
**API Docs:** https://api.builtwith.com

### Pricing (2026)

| Plan | Monthly Cost | Includes |
|------|-------------|----------|
| Basic | $295/mo | 2 technology filters, basic lookups |
| Pro | $495/mo | Full features, more filters |
| Team | $995/mo | Multi-user, advanced features |

**Annual cost range:** $3,500-12,000/year before any API usage.

### API Details

- Separate credit-based system on top of subscription
- Credits consumed per API call (varies by endpoint complexity)
- **Endpoints:** Domain API, Lists API, Relationships API, Trends API, Redirects API, Free API
- **Free API:** Limited functionality -- basic technology group counts only
- **Rate limits:** Max 8 concurrent requests, max 10 requests/second. 429 errors on exceeding.
- **Response formats:** JSON, XML, CSV

### Key Data Fields

- Complete technology profile per domain (CMS, analytics, frameworks, hosting, CDN, etc.)
- 250M+ websites tracked
- Technology adoption trends over time
- Site relationships and linked properties
- Historical technology usage data

### Accuracy Reputation

- Gold standard for technographic data
- Periodic recrawl model (not real-time)
- Very accurate for detecting major technologies
- Can miss newer/obscure tools or client-side-only tech
- Trusted by enterprise sales teams for ICP targeting

### Cheaper Alternatives

| Alternative | Cost | Notes |
|-------------|------|-------|
| Wappalyzer | Free (50 lookups/mo), $250/mo paid | Real-time detection, API in Business plan |
| WhatRuns | Free | Basic lookups, Chrome extension |
| Open Tech Explorer | Free | Community-driven, no limits |
| Datablist | $25/mo | Uses Wappalyzer engine + enrichment tools |

### Suitability for Automated TAM Building

**Score: 4/10 (BuiltWith) / 7/10 (Wappalyzer alternative)**
- Technographic data is valuable for ICP filtering ("uses Stripe" = potential customer)
- BuiltWith is too expensive for a startup ($295+/month minimum)
- **Recommendation:** Use Wappalyzer free tier (50/mo) for validation, or build a lightweight tech detection script using HTTP headers + HTML parsing for the most common technologies
- For TAM building at scale: Wappalyzer API ($250/mo) or Datablist ($25/mo)

---

## 8. ZoomInfo

**Category:** Enterprise sales intelligence platform
**Website:** https://www.zoominfo.com
**Pricing:** https://www.zoominfo.com/pricing (opaque -- custom quotes only)

### Why ZoomInfo is Too Expensive for Startups

#### Pricing Reality (2026)

| Team Size | Annual Cost | Per-Seat Estimate |
|-----------|------------|-------------------|
| 1 seat (starter) | ~$3,000/yr | $250/mo |
| 1-3 seats | $15,000-25,000/yr | $400-700/mo |
| 5-10 seats | $25,000-35,000/yr | $200-350/mo |
| 10-25 seats | $30,000-60,000/yr | $200-300/mo |
| 25+ seats (enterprise) | $60,000-100,000+/yr | Varies |

#### Startup-Hostile Practices

1. **Opaque pricing:** No public pricing page. Every quote is custom, creating information asymmetry.
2. **Mandatory annual contracts:** No month-to-month option. Locked in for 12 months minimum.
3. **Credit exhaustion:** Starter plans include ~2,500 annual credits. Active prospecting teams burn through this in weeks.
4. **Expensive overages:** Additional credits are costly and often required mid-contract.
5. **Feature upselling:** Core features (Intent data, ABM, Chorus call recording) are add-ons that push costs to $60K+.
6. **Cancellation difficulty:** Widely reported difficulty cancelling contracts (numerous complaints on G2, Trustpilot, Reddit).
7. **ROI impossible at early stage:** A pre-revenue startup spending $15K+ on data before generating pipeline is burning runway.

#### Data Quality (for context)

- ~85% email accuracy (better than Apollo, worse than Cognism)
- Best direct-dial phone database in the industry
- 321M+ professional profiles, 104M+ company profiles
- Real-time intent data (Bidstream) is genuinely differentiated
- But none of this matters if you can't afford it

### Suitability for Automated TAM Building

**Score: 1/10**
- Excellent data quality, completely unaffordable for early-stage
- No API access without enterprise contract
- Annual lock-in is unacceptable for a startup iterating on ICP
- **Verdict:** Skip entirely. Revisit only after $10M+ ARR when enterprise pricing makes sense.

---

## 9. Waterfall Enrichment Strategy

### What is Waterfall Enrichment?

Query multiple data providers in sequence until target information is found. Instead of relying on one source (40-60% coverage), cascade through 3-5 providers to reach 80%+ coverage.

### Coverage Reality

| Providers Used | Expected Coverage | Marginal Gain |
|---------------|-------------------|---------------|
| 1 provider | 35-52% | Baseline |
| 2 providers | 55-70% | +15-25% |
| 3 providers | 70-80% | +10-15% |
| 4 providers | 78-85% | +5-8% |
| 5+ providers | 80-88% | +2-3% (diminishing returns) |

**Law of diminishing returns:** Providers 4-5 find significantly less than providers 1-3. Beyond 5, complexity and cost increase without meaningful coverage gain.

### Recommended Provider Ordering

#### For Email Discovery

```
Position 1: Apollo.io (cheapest, 10K free credits, ~45% find rate)
    |
    v  [if no email found]
Position 2: Hunter.io (email specialist, strong pattern matching, ~40% find rate)
    |
    v  [if no email found]
Position 3: People Data Labs (3B profiles, ~35% find rate, different data sources)
    |
    v  [if still no email found]
Position 4: (optional) Domain pattern guessing + verification
```

**Rationale:** Start with cheapest (Apollo free tier), then email specialist (Hunter), then broadest database (PDL). Each source has different underlying data, maximizing incremental coverage.

#### For Phone Numbers

```
Position 1: Apollo.io (costs 8 credits per mobile reveal)
    |
    v  [if no phone found]
Position 2: People Data Labs (mobile_phone field)
    |
    v  [if still no phone]
Position 3: Skip -- phone data is unreliable and expensive across all providers
```

**Rationale:** Phone data accuracy is 50-60% across all providers. Don't over-invest. Email-first outreach is more effective for founder-led sales anyway.

#### For Company Enrichment

```
Position 1: Apollo.io (free tier, good company data)
    |
    v  [supplement with]
Position 2: People Data Labs (richer firmographics, 150+ company fields)
    |
    v  [for funding signals]
Position 3: Crunchbase Basic API (free, funding data)
    |
    v  [for tech stack]
Position 4: Wappalyzer free tier or custom HTTP detection
```

### Key Design Principles

1. **Cheapest first:** Route easy lookups through free/cheap providers. Escalate to premium only on miss.
2. **Separate email vs. phone waterfalls:** Different providers excel at different data types.
3. **Verify everything:** Always run found emails through Hunter.io verification (0.5 credits) before using them.
4. **Cache aggressively:** Store enrichment results. Never pay twice for the same record.
5. **Measure per-provider hit rates:** After 1,000 lookups, drop any provider contributing <5% incremental coverage.
6. **Geographic routing:** If targeting EU, consider providers with stronger EU data. Apollo and PDL skew US.

---

## 10. Cost Modeling

### Cost Per Fully Enriched Company Record

A "fully enriched" company record includes: name, domain, industry, employee count, revenue range, location, founding date, tech stack, funding history.

| Strategy | Cost per Record | Notes |
|----------|----------------|-------|
| Apollo free tier only | $0.00 | Good for first 10K/month, limited fields |
| PDL Pro | ~$0.28 | Richest data, 350 records/month limit |
| PDL Enterprise | ~$0.004-0.01 | Best at scale (1M+ records) |
| Apollo + Crunchbase Basic (free) | $0.00-0.005 | Solid combo for funded companies |
| Full waterfall (Apollo + PDL + Crunchbase) | $0.01-0.05 | Most complete, depends on volume |

### Cost Per Fully Enriched Contact Record

A "fully enriched" contact record includes: name, verified work email, job title, seniority, company, phone (optional), LinkedIn URL, location.

| Strategy | Cost per Record | Notes |
|----------|----------------|-------|
| Apollo free tier only | $0.00 | 10K/month but ~65-80% email accuracy |
| Apollo + Hunter verification | ~$0.02-0.05 | Better accuracy, adds verification cost |
| PDL Pro | ~$0.28 | Rich data but limited volume |
| Full waterfall (Apollo -> Hunter -> PDL) | $0.03-0.15 | 80%+ coverage, verified emails |
| PDL Enterprise + Hunter verification | ~$0.01-0.02 | Best at scale |

### Monthly Cost Scenarios for Founder-Led Sales

| Scenario | Records/Month | Provider Mix | Monthly Cost |
|----------|--------------|-------------|-------------|
| Bootstrapped MVP | 500 contacts | Apollo free + Hunter free | $0 |
| Early traction | 2,000 contacts | Apollo free + Hunter Starter | ~$49/mo |
| Growth mode | 5,000 contacts | Apollo Basic + Hunter Growth + PDL Pro | ~$300/mo |
| Scale | 20,000 contacts | Apollo Pro + PDL Enterprise + Hunter Scale | ~$800-1,500/mo |

### Hidden Costs to Budget For

1. **Email verification:** Always verify before sending. Budget 0.5 Hunter credits per email.
2. **Bounce penalties:** Bad emails damage sender reputation. Cost of NOT verifying >> cost of verifying.
3. **Data decay:** B2B contact data decays at ~30% per year. Re-enrichment cycles needed quarterly.
4. **Phone credits:** Mobile numbers cost 8x email credits on Apollo. Budget separately if needed.
5. **Overage charges:** Apollo charges $0.20/credit for overages. Set hard limits.

---

## 11. Recommendation for Our Stack

### Primary Stack (Month 1-3, $0-49/month)

| Layer | Provider | Cost | Purpose |
|-------|----------|------|---------|
| Company discovery | Apollo.io (free) | $0 | Initial TAM build, company search |
| Contact enrichment | Apollo.io (free) | $0 | Email discovery (10K credits/mo) |
| Email verification | Hunter.io (free) | $0 | Verify before sending (50 searches + verifications/mo) |
| Funding signals | Crunchbase Basic API (free) | $0 | Company funding stage detection |
| Tech stack | Custom HTTP header detection | $0 | Basic technographic filtering |

**Total: $0/month** for up to ~500 fully enriched + verified contacts.

### Growth Stack (Month 3-6, $150-350/month)

| Layer | Provider | Cost | Purpose |
|-------|----------|------|---------|
| Company + contact | Apollo.io (Basic) | $59/mo | Primary enrichment, 1K exports |
| Enrichment fallback | People Data Labs (Pro) | $98/mo | Secondary enrichment, rich data |
| Email verification | Hunter.io (Starter) | EUR 49/mo | Verify all emails, 2K searches |
| Funding signals | Crunchbase Basic API (free) | $0 | Funding triggers |
| Tech stack | Wappalyzer (free) | $0 | 50 lookups/month |

**Total: ~$210/month** for ~2,000 fully enriched + verified contacts.

### Architecture Decision

Build the enrichment layer as a **provider-agnostic waterfall engine:**

```
EnrichmentRequest
    -> ProviderRouter (ordered by cost, then accuracy, then coverage)
        -> Apollo adapter
        -> Hunter adapter
        -> PDL adapter
        -> Crunchbase adapter
        -> Wappalyzer adapter
    -> ResultMerger (combine fields from multiple sources)
    -> VerificationStep (Hunter email verify)
    -> Cache (never pay twice)
    -> EnrichedRecord
```

Each provider is a pluggable adapter. Add/remove/reorder without code changes. Measure hit rates per provider per field per geography. Self-optimizing over time.

### What NOT to Use

| Provider | Reason |
|----------|--------|
| ZoomInfo | $15K+ minimum, annual lock-in, startup-hostile |
| Clearbit/Breeze | HubSpot lock-in, no standalone API for new customers |
| Proxycurl | Shut down (July 2025), LinkedIn lawsuit |
| BuiltWith | $295+/month for technographics alone, use Wappalyzer instead |

---

## Sources

- [Apollo.io Pricing](https://www.apollo.io/pricing)
- [Apollo.io API Documentation](https://docs.apollo.io)
- [Apollo.io API Rate Limits](https://docs.apollo.io/reference/rate-limits)
- [Apollo Pricing 2026 Breakdown (Warmly)](https://www.warmly.ai/p/blog/apollo-pricing)
- [Apollo.io Accuracy: Real Data vs. 91% Claims](https://prospeo.io/s/apollo-io-accuracy)
- [Apollo.io Review 2026 (SyncGTM)](https://syncgtm.com/blog/apollo-io-review)
- [People Data Labs Person Pricing](https://www.peopledatalabs.com/pricing/person)
- [People Data Labs Person Schema](https://docs.peopledatalabs.com/docs/fields)
- [People Data Labs Usage Limits](https://docs.peopledatalabs.com/docs/usage-limits)
- [People Data Labs Review 2026 (SyncGTM)](https://syncgtm.com/blog/people-data-labs-review)
- [People Data Labs October 2025 Release Notes](https://docs.peopledatalabs.com/changelog/october-2025-release-notes-v320)
- [Hunter.io Pricing](https://hunter.io/pricing)
- [Hunter.io API Documentation](https://hunter.io/api-documentation)
- [Hunter.io Rate Limits](https://help.hunter.io/en/articles/1971004-is-there-a-request-per-second-limit)
- [Clearbit Pricing 2026 (Cognism)](https://www.cognism.com/blog/clearbit-pricing)
- [Clearbit Alternatives After HubSpot Acquisition (Salesmotion)](https://salesmotion.io/blog/clearbit-alternatives-hubspot-acquisition)
- [Breeze Intelligence Pricing 2026 (Derrick)](https://derrick-app.com/en/pricing-breeze-intelligence-2/)
- [Crunchbase API Guide (Nubela)](https://nubela.co/blog/crunchbase-api-guide/)
- [Crunchbase API Documentation](https://data.crunchbase.com/docs/using-the-api)
- [Crunchbase Pricing (Vendr)](https://www.vendr.com/marketplace/crunchbase)
- [Proxycurl Shutdown Announcement](https://nubela.co/blog/goodbye-proxycurl/)
- [Proxycurl Alternatives (Bright Data)](https://brightdata.com/blog/web-data/proxycurl-alternatives)
- [LinkedIn Data API Providers Compared 2026 (Netrows)](https://www.netrows.com/blog/best-linkedin-data-api-providers-2026)
- [BuiltWith API Guide (Galadon)](https://galadon.com/builtwith-api)
- [BuiltWith Plans](https://builtwith.com/plans)
- [Wappalyzer vs BuiltWith](https://www.wappalyzer.com/articles/builtwith-alternative/)
- [ZoomInfo Pricing 2026 (Factors.ai)](https://www.factors.ai/blog/zoominfo-pricing)
- [ZoomInfo Pricing Review (Salesmotion)](https://salesmotion.io/blog/zoominfo-pricing)
- [ZoomInfo Pricing Explained (Smarte)](https://www.smarte.pro/blog/zoominfo-pricing)
- [Waterfall Enrichment Guide (FullEnrich)](https://fullenrich.com/blog/waterfall-enrichment)
- [Waterfall Enrichment 2026 (BetterContact)](https://bettercontact.rocks/blog/waterfall-enrichment/)
- [B2B Waterfall Enrichment Guide (Derrick)](https://derrick-app.com/en/waterfall-enrichment/)
- [B2B Data Enrichment Tools Pricing Comparison 2026 (Derrick)](https://derrick-app.com/en/pricing-data-enrichment-tools/)
- [15 Best B2B Data Enrichment Providers 2026 (Cleanlist)](https://www.cleanlist.ai/blog/15-best-b2b-data-enrichment-providers-in-2025-ranked)
