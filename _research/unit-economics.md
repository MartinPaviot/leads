# Unit Economics Model: Autonomous GTM/Sales Engine

**Date:** 2026-03-30
**Status:** Complete
**Assumptions:** All costs are based on published API pricing as of March 2026. Costs assume optimized usage (prompt caching, batch processing, model routing) unless otherwise stated.

---

## Table of Contents

1. [Cost Per Enriched Company Record](#1-cost-per-enriched-company-record)
2. [Cost Per AI-Generated Email](#2-cost-per-ai-generated-email)
3. [Cost Per Email Sent](#3-cost-per-email-sent)
4. [Cost Per Meeting Transcription/Summary](#4-cost-per-meeting-transcriptionsummary)
5. [Cost Per Natural Language Query](#5-cost-per-natural-language-query)
6. [Storage Costs Per Customer](#6-storage-costs-per-customer)
7. [Monthly COGS Model (10, 100, 1000 Customers)](#7-monthly-cogs-model)
8. [Pricing Strategy Comparison](#8-pricing-strategy-comparison)
9. [Break-Even Analysis](#9-break-even-analysis)

---

## 1. Cost Per Enriched Company Record

Enrichment involves multiple API calls to build a complete company + contact profile: company firmographics, technographics, employee count, funding, key contacts, email addresses, and email verification.

### Per-Record Cost Breakdown

| Component | Provider | Cost | Notes |
|-----------|----------|------|-------|
| **Company firmographics** | Apollo (included in plan) | ~$0.02-0.05 | Depends on plan tier; Apollo Pro at $49/mo includes credits |
| **Contact email lookup** | Apollo / People Data Labs | $0.01-0.05 | PDL is cheapest at $0.01-0.05/record |
| **Email verification** | NeverBounce | $0.008 | $8 per 1,000 emails |
| **Company technographics** | BuiltWith / Wappalyzer API | $0.01-0.03 | Or scrape for free |
| **LinkedIn profile data** | Proxycurl / Apollo | $0.01-0.03 | Job title validation |
| **Company news/signals** | Google News API / RSS | ~$0.00 | Free or near-free |
| **LLM enrichment** (ICP fit scoring, signal analysis) | GPT-4.1 Nano | $0.0002-0.001 | ~500 input / 100 output tokens per record |

### Total Cost Per Enriched Record

| Enrichment Depth | Cost Per Record | Notes |
|------------------|----------------|-------|
| **Basic** (company + email + verification) | **$0.03-0.08** | Minimum viable for cold outreach |
| **Standard** (basic + technographics + LinkedIn + ICP scoring) | **$0.06-0.15** | Recommended for quality outreach |
| **Deep** (standard + news signals + competitor analysis + custom research) | **$0.10-0.25** | For high-value enterprise prospects |

### At Scale

| Records Enriched | Basic Cost | Standard Cost | Deep Cost |
|-----------------|------------|---------------|-----------|
| 100 records | $3-8 | $6-15 | $10-25 |
| 1,000 records | $30-80 | $60-150 | $100-250 |
| 10,000 records | $300-800 | $600-1,500 | $1,000-2,500 |

### Cost Optimization Strategies

- **Cache everything:** Enrichment data for a company doesn't change daily. Cache for 60-90 days.
- **Waterfall enrichment:** Try cheapest provider first (People Data Labs at $0.01-0.05). Fall back to premium providers only for missing fields.
- **Batch processing:** Most providers offer batch discounts (10-30% savings at 10K+ records).
- **Share enrichment across customers:** If two customers target the same company, enrich once (with appropriate data isolation).

---

## 2. Cost Per AI-Generated Email

Email generation is the highest-quality LLM task -- it requires the best model to produce natural, personalized copy that drives replies.

### Token Estimation Per Email

| Component | Input Tokens | Output Tokens | Notes |
|-----------|-------------|---------------|-------|
| System prompt (persona, style, rules) | 800-1,200 | -- | Cacheable (90% discount after first call) |
| Enrichment context (company, contact, signals) | 500-1,000 | -- | Unique per prospect |
| Previous email thread (for follow-ups) | 200-800 | -- | Only for follow-up emails |
| Generated email body | -- | 150-300 | Short, punchy cold emails |
| Subject line | -- | 10-20 | Separate or included |
| **Total (initial email)** | **1,500-2,200** | **160-320** | |
| **Total (follow-up email)** | **1,700-3,000** | **160-320** | |

### Cost Per Email by Model

| Model | Input Cost | Output Cost | Total Per Email | Quality |
|-------|-----------|-------------|-----------------|---------|
| **Claude Sonnet 4.6** | $0.0045-0.0066 | $0.0024-0.0048 | **$0.007-0.011** | 9.3/10 |
| **Claude Sonnet 4.6 (cached)** | $0.0005-0.0007 | $0.0024-0.0048 | **$0.003-0.006** | 9.3/10 |
| **GPT-4.1** | $0.003-0.0044 | $0.0013-0.0026 | **$0.004-0.007** | 7.5/10 |
| **GPT-4.1 Mini** | $0.0006-0.0009 | $0.00026-0.00051 | **$0.001-0.001** | 6.5/10 |
| **Claude Haiku 4.5** | $0.0015-0.0022 | $0.0008-0.0016 | **$0.002-0.004** | 7.0/10 |
| **Gemini 2.5 Flash** | $0.00045-0.00066 | $0.0004-0.0008 | **$0.001-0.002** | 6.8/10 |

### Recommended: Claude Sonnet 4.6 with Prompt Caching

**Cost per email: $0.003-0.006** (with system prompt caching)

At 50 emails/day per customer (1,500/month):
- Monthly LLM cost for email generation: **$4.50-9.00 per customer**

### A/B Variant Generation (Optional)

If generating 2-3 variants per email for A/B testing, use a cheaper model for variants:
- Primary email: Claude Sonnet 4.6 ($0.003-0.006)
- 2 variants: GPT-4.1 Mini ($0.001 each)
- **Total per prospect with A/B: $0.005-0.008**

---

## 3. Cost Per Email Sent

Sending infrastructure includes the mailbox cost, email sending service, warming service, and email verification.

### Infrastructure Cost Breakdown

| Component | Provider | Cost | Notes |
|-----------|----------|------|-------|
| **Mailbox** | Google Workspace | $7/month per mailbox | Business Starter. Each mailbox sends 30-50 cold/day |
| **Mailbox** | Microsoft 365 | $6/month per mailbox | Business Basic |
| **Email sending** (if using separate SMTP) | Amazon SES | $0.0001/email | $0.10 per 1,000 emails |
| **Domain registration** | Namecheap/Cloudflare | ~$10-12/year per domain | Need 3-5 domains per customer |
| **Email warming** | TrulyInbox | $29/month unlimited mailboxes | Or Warmbox at $15-69/inbox/month |
| **Email verification** | NeverBounce | $0.008/email | Pre-send verification |
| **DNS/Authentication** | Cloudflare | Free | SPF/DKIM/DMARC setup |

### Per-Email Marginal Cost

For Google Workspace sending (recommended for cold outreach):

| Component | Cost Per Email |
|-----------|---------------|
| Mailbox amortized (1 mailbox, 1,000 emails/month) | $0.007 |
| Email verification | $0.008 |
| Domain amortized (1 domain, 3,000 emails/month) | $0.0003 |
| Warming amortized | $0.002-0.005 |
| **Total marginal cost per email sent** | **$0.017-0.020** |

### Monthly Infrastructure Cost Per Customer

Assuming 3 mailboxes, 1 domain, warming service, 1,500 emails/month:

| Component | Monthly Cost |
|-----------|-------------|
| 3x Google Workspace mailboxes | $21 |
| Domain (amortized) | $1 |
| Email warming | $29 (TrulyInbox unlimited) or $45-90 (per-inbox) |
| Email verification (1,500 emails) | $12 |
| **Total sending infrastructure** | **$63-124/month** |

### Important Note on Customer-Owned vs. Platform-Owned Infrastructure

Two models are possible:

1. **Customer-owned:** Customer provides their own Google Workspace/M365 mailboxes and domains. We provide the sending intelligence. Customer bears mailbox and domain costs. Our cost: $0 + verification.
2. **Platform-managed:** We provision and manage mailboxes and domains for the customer. Higher cost but better experience. Our cost: $63-124/month.

**Recommendation:** Start with customer-owned (lower COGS, faster to market). Offer platform-managed as a premium add-on.

---

## 4. Cost Per Meeting Transcription/Summary

### Transcription Costs

| Provider | Cost Per Minute | Cost Per Hour | Key Feature |
|----------|----------------|---------------|-------------|
| **OpenAI GPT-4o Transcribe** | $0.006 | $0.36 | Built-in diarization |
| **OpenAI GPT-4o Mini Transcribe** | $0.003 | $0.18 | Budget option |
| **Deepgram** | $0.0043-0.0125 | $0.26-0.75 | Real-time streaming, per-second billing |
| **AssemblyAI** | $0.0025+ | $0.15+ | Rich audio intelligence add-ons |

### Summarization Costs (Post-Transcription)

A 30-minute meeting produces approximately 5,000-8,000 words of transcript (~7,000-11,000 tokens).

| Task | Model | Input Tokens | Output Tokens | Cost |
|------|-------|-------------|---------------|------|
| Meeting summary | Claude Sonnet 4.6 | 8,000-12,000 | 500-1,000 | $0.03-0.05 |
| Action items extraction | Claude Haiku 4.5 | 8,000-12,000 | 200-400 | $0.01-0.02 |
| Deal coaching insights | Claude Sonnet 4.6 | 8,000-12,000 | 500-1,500 | $0.03-0.06 |
| CRM update generation | GPT-4.1 Nano | 8,000-12,000 | 200-500 | $0.001-0.002 |

### Total Cost Per 30-Minute Meeting

| Component | Cost (Budget) | Cost (Premium) |
|-----------|--------------|----------------|
| Transcription | $0.09 (GPT-4o Mini) | $0.18 (GPT-4o) |
| Summary | $0.01 (Haiku) | $0.05 (Sonnet) |
| Action items | $0.01 (Haiku) | $0.02 (Haiku) |
| Deal coaching | $0.00 (skip) | $0.06 (Sonnet) |
| CRM update | $0.001 | $0.002 |
| **Total per meeting** | **$0.11** | **$0.31** |

### Monthly Cost Per Customer

Assuming 15-30 meetings/month for an active founder:

| Usage Level | Budget Approach | Premium Approach |
|-------------|----------------|------------------|
| Light (15 meetings/month) | $1.65 | $4.65 |
| Standard (30 meetings/month) | $3.30 | $9.30 |
| Heavy (60 meetings/month) | $6.60 | $18.60 |

Meeting intelligence is a cost-efficient feature -- high perceived value at low marginal cost.

---

## 5. Cost Per Natural Language Query

NL queries involve embedding the query, searching the vector database, retrieving context, and generating a cited response.

### Per-Query Cost Breakdown

| Component | Provider/Model | Cost | Notes |
|-----------|---------------|------|-------|
| **Query embedding** | OpenAI text-embedding-3-small | $0.000002 | ~100 tokens per query at $0.02/M tokens |
| **Vector search** | Supabase pgvector (included) | ~$0.00 | Negligible at query time; cost is in storage |
| **Context retrieval** | Database read | ~$0.00 | Negligible |
| **Response generation** | Claude Haiku 4.5 | $0.003-0.008 | 1,000-2,000 input (query + context), 300-500 output |
| **Response generation** | Claude Sonnet 4.6 (complex queries) | $0.008-0.020 | For multi-hop or analytical queries |
| **Citation generation** | Included in response | $0.00 | Part of the prompt template |

### Total Cost Per Query

| Query Complexity | Model | Cost Per Query |
|-----------------|-------|----------------|
| Simple (e.g., "How many deals in pipeline?") | Haiku 4.5 | **$0.003-0.005** |
| Standard (e.g., "Which deals are at risk and why?") | Haiku 4.5 | **$0.005-0.008** |
| Complex (e.g., "Compare Q1 performance to Q4 and identify trends across all deals") | Sonnet 4.6 | **$0.010-0.020** |

### Monthly Cost Per Customer

Assuming 10-30 queries/day per active user:

| Usage Level | Monthly Queries | Monthly Cost |
|-------------|----------------|-------------|
| Light (10/day) | 300 | $0.90-1.50 |
| Standard (20/day) | 600 | $1.80-3.00 |
| Heavy (30/day) | 900 | $2.70-7.20 |

NL queries are extremely cost-efficient. This is a high-value, low-cost feature.

---

## 6. Storage Costs Per Customer

### Data Volume Estimates Per Customer (Monthly)

| Data Type | Volume Per Month | Size Estimate | Notes |
|-----------|-----------------|--------------|-------|
| **Email messages** (sent + received) | 2,000-5,000 emails | 5-15 MB | Includes headers, body, metadata |
| **Email attachments** | 200-500 attachments | 50-200 MB | PDFs, docs, images |
| **Meeting recordings** (audio) | 15-30 recordings | 500 MB - 2 GB | ~30 min avg, compressed |
| **Meeting transcripts** | 15-30 transcripts | 2-5 MB | Text only |
| **CRM records** (leads, deals, contacts) | 500-5,000 records | 1-5 MB | Structured data |
| **Enrichment data** | 500-5,000 records | 2-10 MB | Company + contact profiles |
| **Vector embeddings** | 5,000-20,000 vectors | 50-200 MB | 1536-dim float32, ~6KB per vector |
| **Activity logs / audit trail** | 10,000-50,000 events | 5-20 MB | Compliance requirement |

### Monthly Storage Growth Per Customer

| Component | Monthly Growth | Notes |
|-----------|---------------|-------|
| Structured data (DB) | 10-40 MB | PostgreSQL |
| Files (recordings, attachments) | 500 MB - 2 GB | Object storage (S3/R2) |
| Vectors | 50-200 MB | pgvector (included in Supabase) |
| **Total monthly growth** | **560 MB - 2.2 GB** | |

### Storage Cost Per Customer

| Provider | Component | Cost/GB/Month | Monthly Cost (1 GB avg) | Notes |
|----------|-----------|--------------|------------------------|-------|
| **Supabase Pro** | Database (Postgres + pgvector) | Included (8 GB base) | $0 up to 8 GB | $0.125/GB overage |
| **Cloudflare R2** | Object storage (recordings, attachments) | $0.015/GB | $0.015-0.03 | No egress fees |
| **AWS S3** | Object storage (alternative) | $0.023/GB | $0.023-0.05 | Plus egress fees |
| **Supabase** | File storage (included) | Included (100 GB base on Pro) | $0 up to 100 GB | $0.021/GB overage |

### Monthly Storage Cost Per Customer

| Timeframe | Cumulative Storage | Monthly Cost (Cloudflare R2) | Monthly Cost (Supabase included) |
|-----------|-------------------|------|------|
| Month 1 | 1-2 GB | $0.02-0.03 | $0 (within limits) |
| Month 6 | 4-13 GB | $0.06-0.20 | $0-0.60 |
| Month 12 | 7-26 GB | $0.11-0.39 | $0-2.25 |
| Month 24 | 14-53 GB | $0.21-0.80 | $0.75-5.63 |

**Storage is negligible in the cost structure.** Even at 24 months, storage costs per customer are under $6/month. The dominant cost drivers are LLM APIs and data enrichment.

### Data Retention Policy Impact

Implementing GDPR-compliant data retention (delete inactive prospect data after 3 years, archive meeting recordings after 12 months) keeps storage bounded and reduces long-term costs.

---

## 7. Monthly COGS Model

### Per-Customer Unit Costs (Standard Usage Profile)

**Standard customer profile:** Solo founder, 1,000 leads in TAM, 50 emails/day (1,500/month), 20 meetings/month, 15 NL queries/day, customer-owned mailboxes.

| Cost Component | Monthly Cost | % of Total | Notes |
|----------------|-------------|------------|-------|
| **LLM: Email generation** | $6.75 | 13% | 1,500 emails x $0.0045 avg (Sonnet cached) |
| **LLM: Lead scoring/classification** | $1.50 | 3% | 5,000 classifications x $0.0003 (GPT-4.1 Nano) |
| **LLM: Pipeline queries** | $2.25 | 4% | 450 queries x $0.005 avg (Haiku) |
| **LLM: Meeting summaries + coaching** | $4.20 | 8% | 20 meetings x $0.21 avg |
| **LLM: Data extraction** | $2.00 | 4% | 2,000 extractions x $0.001 (GPT-4.1 Mini) |
| **LLM: Signal detection** | $1.50 | 3% | 10,000 signals x $0.00015 (Flash-Lite) |
| **LLM: Deal coaching** | $1.20 | 2% | 200 coaching interactions x $0.006 (Sonnet) |
| **Data: Enrichment** | $10.00 | 19% | 100 new records/month x $0.10 avg (standard depth) |
| **Data: Email verification** | $12.00 | 23% | 1,500 verifications x $0.008 (NeverBounce) |
| **Data: Re-enrichment** | $3.00 | 6% | 300 records re-verified x $0.01 |
| **Transcription** | $3.60 | 7% | 20 meetings x 30 min x $0.006/min (GPT-4o) |
| **Embeddings** | $0.10 | 0% | Negligible |
| **Storage** | $0.10 | 0% | Negligible |
| **Infrastructure overhead** (Supabase, Vercel, monitoring) | $4.00 | 8% | Amortized platform costs per customer |
| **TOTAL COGS PER CUSTOMER** | **$52.20** | 100% | |

### COGS Scenarios by Usage Level

| Usage Level | Leads | Emails/Month | Meetings/Month | Monthly COGS |
|-------------|-------|-------------|----------------|-------------|
| **Light** (exploring) | 200 | 300 | 5 | **$18** |
| **Standard** (active founder) | 1,000 | 1,500 | 20 | **$52** |
| **Growth** (scaling founder) | 5,000 | 5,000 | 40 | **$145** |
| **Power** (small sales team, 3 seats) | 10,000 | 10,000 | 80 | **$310** |

### Monthly COGS at 10, 100, 1,000 Customers

**Assuming a mix:** 30% Light, 50% Standard, 15% Growth, 5% Power users.

**Weighted average COGS per customer: $58**

| Customers | Weighted Avg COGS/Customer | Total COGS | Platform Fixed Costs | Total Monthly Cost |
|-----------|---------------------------|------------|---------------------|--------------------|
| **10** | $58 | $580 | $500 | **$1,080** |
| **100** | $52* | $5,200 | $2,000 | **$7,200** |
| **1,000** | $45** | $45,000 | $10,000 | **$55,000** |

*At 100 customers, volume discounts on data providers kick in (~10% savings).*
**At 1,000 customers, volume discounts + fine-tuned models for classification reduce per-customer cost (~22% savings).*

### Platform Fixed Costs

| Component | 10 Customers | 100 Customers | 1,000 Customers |
|-----------|-------------|--------------|-----------------|
| Supabase Pro/Team | $25-599 | $599 | $599 + compute overage |
| Vercel Pro | $20 | $20-100 | $100-500 |
| Monitoring (Sentry, LogRocket) | $29 | $79 | $299 |
| Domain costs (platform) | $50 | $50 | $50 |
| Background jobs (Inngest/Trigger.dev) | $0 (free tier) | $50 | $500 |
| Email infrastructure (warming, deliverability monitoring) | $100 | $500 | $3,000 |
| Customer support tools | $0 | $100 | $1,000 |
| Engineering salaries (amortized) | N/A* | N/A* | N/A* |
| **Total fixed** | **$224-$798** | **$1,398-$2,098** | **$5,548-$5,948** |

*Engineering salaries are excluded from COGS -- they're operating expenses. Rounded estimates used in the model above.*

---

## 8. Pricing Strategy Comparison

### Competitor Pricing Landscape (March 2026)

| Product | Pricing Model | Price Range | What's Included |
|---------|--------------|-------------|-----------------|
| **Monaco** | Flat fee (beta pricing, undisclosed) | Est. $300-1,000/month* | AI-native revenue engine: TAM building, ML scoring, AI sequences, deal coaching |
| **Lightfield** | Per-seat + AI usage | $40/seller/month + AI costs | Zero-entry CRM, auto-capture, NL queries, meeting intelligence |
| **Attio** | Per-seat | $29-119/user/month | Modern CRM, custom objects, automations, enrichment |
| **Clay** | Platform + credits | $185-495/month | Data enrichment, workflow automation |
| **Apollo** | Per-seat + credits | $49-79/user/month | Contact database, sequences, dialer |
| **HubSpot** (Starter) | Per-seat | $20-50/seat/month | CRM + basic marketing/sales |
| **Outreach** | Per-seat (enterprise) | $100-150/seat/month | Sales engagement, conversation intelligence |
| **Salesforce** (Starter) | Per-seat | $25-165/user/month | Full CRM platform |

*Monaco pricing estimated based on "premium flat fee" positioning and $35M funding -- likely $500-1,000/month to justify economics.*

### Total Cost of Replacement

Our product replaces multiple tools. The combined cost for a founder-led sales team today:

| Current Stack | Monthly Cost | What It Does |
|---------------|-------------|--------------|
| Attio or HubSpot (CRM) | $29-50 | Pipeline management |
| Apollo or Clay (enrichment + sequences) | $49-495 | Lead data + outbound |
| Gong or Fathom (meeting intelligence) | $0-100 | Transcription + coaching |
| Warmbox or TrulyInbox (warming) | $29-69 | Domain warm-up |
| NeverBounce (verification) | $50 | Email verification |
| **Total current stack** | **$157-764/month** | |

### Pricing Strategy Options

#### Option A: Simple Flat Rate

| Tier | Price | Target Customer | Included | Gross Margin |
|------|-------|----------------|----------|-------------|
| Starter | $99/month | Solo founder, exploring | 500 leads, 500 emails/month, 10 meetings | 82% ($18 COGS) |
| Growth | $299/month | Active founder-led sales | 5,000 leads, 5,000 emails/month, 40 meetings | 52% ($145 COGS) |
| Scale | $999/month | Small sales team (3-5 seats) | Unlimited leads, 20,000 emails/month, unlimited meetings | 69% ($310 COGS) |

**Problem:** Growth tier margin is thin (52%). Power users on Growth will cost more to serve than they pay.

#### Option B: Platform Fee + Usage (Recommended)

| Component | Pricing |
|-----------|---------|
| Platform fee | $79/month (includes CRM, meeting intelligence, NL queries, 500 leads, 500 emails) |
| Additional leads enriched | $0.15/lead (covers enrichment + verification at $0.10-0.12 cost) |
| Additional emails generated | $0.02/email (covers LLM at $0.005 + overhead) |
| Additional seats | $29/seat/month |
| Annual discount | 20% |

**Example bills at different usage levels:**

| Profile | Platform | Leads | Emails | Seats | Total | COGS | Margin |
|---------|----------|-------|--------|-------|-------|------|--------|
| Light founder | $79 | $0 (within 500) | $0 (within 500) | 1 (included) | **$79** | $18 | **77%** |
| Active founder | $79 | $75 (500 add'l) | $20 (1,000 add'l) | 1 | **$174** | $52 | **70%** |
| Growth founder | $79 | $675 (4,500 add'l) | $90 (4,500 add'l) | 1 | **$844** | $145 | **83%** |
| Small team (3) | $79 | $1,425 (9,500 add'l) | $190 (9,500 add'l) | $58 (2 add'l) | **$1,752** | $310 | **82%** |

**This model achieves 70-83% gross margins across all usage levels.** Heavy users pay proportionally more, light users aren't overcharged.

#### Option C: Outcome-Based Pricing (Premium Positioning)

| Component | Pricing |
|-----------|---------|
| Platform fee | $199/month |
| Per meeting booked | $5-15/meeting (first 10 included) |
| Per qualified lead generated | $1-3/lead (first 100 included) |

This model aligns price with value but is harder to predict and sell. Better suited for a later stage when outcome data exists.

### Recommended Approach: Option B (Platform + Usage)

- Predictable base revenue ($79/customer/month minimum)
- Margins scale with usage (heavy users subsidize themselves)
- Competitive positioning: cheaper than the combined stack ($157-764) even at high usage
- Clear upsell path as customers grow

---

## 9. Break-Even Analysis

### Assumptions

| Parameter | Value | Notes |
|-----------|-------|-------|
| Founding team | 2 founders | No salary initially (equity only) |
| First hire (engineer) | Month 6, $120K/year | $10K/month |
| Infrastructure (fixed) | $500-2,000/month | Scales with customers |
| Customer acquisition cost (blended) | $200 | Organic/community-focused |
| Monthly churn rate | 5% | High initially, improving to 3% |
| Weighted avg COGS/customer | $52 | Standard usage profile |
| Platform fixed costs | See Section 7 | Scales with customer count |

### Break-Even at $99/month (Flat Rate)

| Metric | Value |
|--------|-------|
| Revenue per customer | $99/month |
| COGS per customer (weighted avg) | $52/month |
| Gross profit per customer | $47/month |
| Fixed monthly costs (2 founders + infra) | $2,000 initially, $12,000 at month 6 |
| Customers needed to cover fixed costs | 43 (initially) / 256 (at month 6) |
| At 5% monthly churn, net new needed/month | 5% of base + growth |
| **Time to break-even (pre-hire):** | ~4-6 months at 10 customers/month |
| **Time to break-even (post-hire):** | 12-18 months (churn makes this very hard) |

**Verdict: $99/month is extremely difficult.** COGS eat 53% of revenue, leaving $47/customer for everything else. With an engineer hire, you need 256 customers at $99/month just to cover costs. At 5% churn, this requires constant aggressive acquisition.

### Break-Even at $299/month (Flat Rate)

| Metric | Value |
|--------|-------|
| Revenue per customer | $299/month |
| COGS per customer (weighted avg) | $58/month (higher usage at this price point) |
| Gross profit per customer | $241/month |
| Fixed monthly costs (2 founders + infra) | $2,000 initially, $12,000 at month 6 |
| Customers needed to cover fixed costs | 9 (initially) / 50 (at month 6) |
| **Time to break-even (pre-hire):** | ~1-2 months at 5+ customers/month |
| **Time to break-even (post-hire):** | ~5-7 months |

**Verdict: $299/month is viable.** 50 customers at $299 covers a lean team. Gross margin of 81% is healthy SaaS territory. This price point also filters for serious users who will actually use the product (reducing support load).

### Break-Even at $999/month (Flat Rate, Small Teams)

| Metric | Value |
|--------|-------|
| Revenue per customer | $999/month |
| COGS per customer (weighted avg) | $200/month (team usage, higher volume) |
| Gross profit per customer | $799/month |
| Fixed monthly costs (at scale) | $25,000 (small team of 4) |
| Customers needed to cover fixed costs | 32 |
| **Time to break-even:** | 3-5 months |

**Verdict: $999/month is the most attractive from a unit economics perspective.** But it requires selling to teams, not solo founders. The TAM is smaller and the sales cycle is longer.

### Break-Even at Option B Pricing (Platform + Usage)

Assuming weighted average revenue per customer of $200/month (mix of light and active users):

| Metric | Value |
|--------|-------|
| Avg revenue per customer | $200/month |
| Avg COGS per customer | $52/month |
| Gross profit per customer | $148/month |
| Fixed monthly costs (at month 6) | $12,000 |
| Customers needed to cover fixed costs | 82 |
| At $200 CAC, acquisition investment for 82 customers | $16,400 |
| **Time to break-even:** | ~6-9 months |

### Revenue Milestones

| Milestone | Customers (at $200 avg) | MRR | ARR | What It Means |
|-----------|------------------------|-----|-----|---------------|
| Ramen profitable (2 founders) | 15 | $3,000 | $36K | Covers minimal expenses |
| First hire viable | 82 | $16,400 | $197K | Can afford 1 engineer |
| Seed-stage metrics | 200 | $40,000 | $480K | Attractive for $1-2M seed |
| Series A metrics | 500-1,000 | $100K-200K | $1.2M-2.4M | Growing at 15%+ MoM |

### Sensitivity Analysis: Impact of COGS Optimization

| Scenario | Avg COGS/Customer | Gross Margin (at $200 avg rev) | Customers to Break-Even |
|----------|-------------------|------|---|
| **Current (no optimization)** | $58 | 71% | 85 |
| **With prompt caching (40% LLM savings)** | $48 | 76% | 79 |
| **With fine-tuned classification models** | $42 | 79% | 76 |
| **With volume data provider discounts** | $38 | 81% | 74 |
| **Fully optimized** | $32 | 84% | 72 |

Optimizing COGS from $58 to $32 per customer (a 45% reduction) saves $26/customer/month. At 100 customers, that's $2,600/month -- meaningful but not transformative. **Revenue growth matters more than COGS optimization at the early stage.**

---

## Summary: Key Unit Economics Insights

### Cost Structure (Ranked by Impact)

1. **Data enrichment + verification: ~42% of COGS** -- The largest single cost driver. Email verification ($0.008/email) and multi-provider enrichment ($0.10-0.15/lead) add up fast at volume.
2. **LLM API costs: ~37% of COGS** -- Dominated by email generation (Claude Sonnet 4.6). Prompt caching reduces this significantly.
3. **Transcription: ~7% of COGS** -- Cost-efficient relative to perceived value.
4. **Infrastructure: ~8% of COGS** -- Amortized platform costs.
5. **Storage + embeddings: ~0.4% of COGS** -- Negligible.

### Pricing Sweet Spot

- **Minimum viable price: $199/month** (achieves ~72% gross margin at standard usage)
- **Optimal price: $79 platform + usage-based** (achieves 70-83% gross margins across all usage levels)
- **Avoid: $99/month flat rate** (COGS risk, thin margins, attracts tire-kickers)

### Critical Path to Profitability

1. Launch at $79 platform + usage pricing
2. Acquire first 15 paying customers through community/organic (ramen profitability)
3. Optimize COGS through prompt caching and model routing (target $40/customer)
4. Reach 82 customers for first hire viability
5. Grow to 200 customers ($40K MRR) for seed-stage metrics

### Biggest Leverage Points

- **Prompt caching:** Single largest cost reduction lever (40% LLM savings)
- **Email verification batching:** Verify in bulk rather than per-send (20-30% savings)
- **Enrichment caching:** Don't re-enrich the same company for multiple customers
- **Model routing:** Use $0.05-0.10/M token models for 80% of tasks, premium models only for email generation and coaching

---

## Sources

- [Amazon SES Pricing](https://aws.amazon.com/ses/pricing/)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [AssemblyAI Pricing](https://costbench.com/software/ai-transcription-apis/assemblyai/)
- [Deepgram Speech-to-Text Pricing](https://deepgram.com/learn/speech-to-text-api-pricing-breakdown-2025)
- [OpenAI Whisper Pricing](https://costbench.com/software/ai-transcription-apis/openai-whisper/)
- [NeverBounce Pricing](https://www.neverbounce.com/pricing)
- [ZeroBounce Pricing](https://www.zerobounce.net/email-validation-pricing)
- [Data Enrichment Cost Guide](https://www.cleanlist.ai/learn/how-much-does-data-enrichment-cost)
- [ZoomInfo vs Apollo vs Clearbit Comparison](https://www.cleanlist.ai/blog/zoominfo-apollo-clearbit-data-provider-comparison-2026)
- [Google Workspace Pricing](https://workspace.google.com/pricing.html)
- [Supabase Pricing](https://supabase.com/pricing)
- [Pinecone Pricing](https://www.pinecone.io/pricing/estimate/)
- [Weaviate Pricing](https://weaviate.io/pricing)
- [Lightfield CRM Pricing](https://lightfield.app/pricing)
- [Attio CRM Pricing](https://attio.com/pricing)
- [Clay Pricing 2026](https://www.cleanlist.ai/blog/2026-03-12-clay-pricing-changes-2026)
- [Monaco AI Sales Platform](https://www.monaco.com)
- [Vector Database Pricing Comparison](https://ranksquire.com/2026/03/04/vector-database-pricing-comparison-2026/)
