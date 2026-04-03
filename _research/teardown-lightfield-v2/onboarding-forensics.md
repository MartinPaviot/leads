# Lightfield Onboarding Forensic Teardown

**Date**: 2026-04-02
**Account**: onboarding-test@elevay.dev
**Trial expires**: 2026-04-16 (14 days)
**Cost**: $0 today, $79/mo (€71.21/mo) after trial

---

## STEP O1: Pre-signup — Homepage

**URL**: https://lightfield.app
**Page title**: "Lightfield | AI-native CRM"
**Screenshot**: `onboarding/001-homepage-full.png`

### Hero
- **H1**: "CRM that remembers everything and does the work for you."
- **Two CTAs**: "Try for free" (→ crm.lightfield.app/signup) + "Book a demo" (→ /book-demo)
- **Nav**: Logo, Resources, Pricing, Docs, Company, Log in, "Try free" button

### Value props (Foundations section)
1. "Every customer interaction in context"
2. "A world model for your business"
3. "Schema-less foundation"

### Features carousel (7 items)
1. Prep, capture, and summarize meetings
2. Answer questions about your business
3. Send personalized emails at scale
4. Give engineers stronger customer signal
5. Build and edit your pipeline in bulk
6. Bring stale deals back to life
7. Fill in missing data across your entire CRM

### Social proof
- 5 testimonials from founders/co-founders (14.ai, ScaleAgentic, Underflow, CashQ, Reeva)
- Security badges: SOC II Type II, HIPAA, ISO 27001 (coming soon)
- Bottom CTA: "Join thousands of companies using Lightfield."

### Footer
- Blog, Changelog, Pricing, Company, Careers, Twitter, LinkedIn

---

## STEP O2: Signup Form

**URL**: https://crm.lightfield.app/signup
**Screenshot**: `onboarding/002-signup-page.png`

### Layout
- Lightfield logo (abstract X mark)
- **Headline**: "Lightfield"
- **Subheadline**: "Sign up or log in to continue"
- Same page serves BOTH signup and login

### Auth methods
- **Google OAuth**: "Continue with Google" (via Stytch — `api.stytch.lightfield.app`)
- **Magic link**: email field with "Enter your work email..." placeholder
- **NO Microsoft OAuth** on signup (despite having it on mail sync step)
- **NO password** — magic link only
- **NO name, company, or other fields** at signup — just email

### Fields
| Field | Type | Placeholder | Required |
|-------|------|-------------|----------|
| Email | textbox | "Enter your work email..." | Yes |

### Social proof on signup page
- None. Zero logos, testimonials, or trust signals.

### Legal
- "By continuing, you acknowledge that you understand and agree to the Terms & Conditions and Privacy Policy."
- Footer: Terms, Privacy, Support links

### Key observation
- "Continue with email" button is **disabled** until email is entered
- The button arrow (→) appears only when enabled
- EXTREMELY minimal — only email. No friction.

---

## STEP O3: Email Verification (Magic Link)

**Screenshot**: `onboarding/003-magic-link-sent.png`

### "Check your inbox" page
- **URL**: crm.lightfield.app/email?email=onboarding-test@elevay.dev
- **Headline**: "Check your inbox"
- **Subheadline**: "To continue, head over to your inbox and click on the verification link we just sent you."
- **Buttons**: "Open Gmail", "Open Outlook", "Resend email"
- Shows email address in top-right corner + "Log out" link

### Email content
- **From**: "Lightfield" <notifications@lightfield.app>
- **Subject**: "Your login link for Lightfield"
- **Sent via**: SendGrid (u17391058.ct.sendgrid.net)
- **Magic link domain**: stytch.com/v1/magic_links/redirect
- Contains Lightfield logo (cdn.mcauto-images-production.sendgrid.net)
- Links to tome.app and lightfield.app in footer

### Verification flow
- Click magic link → Stytch redirects → crm.lightfield.app/create-profile
- No intermediate "email verified" confirmation page — goes straight to onboarding

---

## STEP O4: First Screen After Signup

**URL**: crm.lightfield.app/create-profile
**Screenshot**: `onboarding/004-magic-link-redirect.png`

- First thing a new user sees: **Create your profile** form (Step 1 of 8)
- It's a **wizard** with 8 progress dots at the top
- Progress indicator: colored dots, filled = completed, outlined = remaining
- No welcome modal, no empty dashboard — straight into structured onboarding

---

## STEP O5: Every Onboarding Step — Surgical Documentation

### 8-Step Flow
1. Create Profile
2. Create Workspace (or Join Existing)
3. Pricing
4. Book Walkthrough
5. Mail & Calendar Sync
6. Meeting (skipped if no email connected)
7. About Work
8. All Set

---

### Step 1: Create Profile (1/8)
**URL**: /create-profile
**Screenshot**: `onboarding/005-role-dropdown-options.png`, `onboarding/006-step1-founder-selected.png`

**Headline**: "Create your profile"
**Progress**: Dot 1 of 8 (filled blue)

| Field | Type | Placeholder | Required | Options |
|-------|------|-------------|----------|---------|
| First name | textbox | "First" | Yes | - |
| Last name | textbox | "Last" | Yes | - |
| Role | dropdown | "Select..." | Yes | Founder, Sales & Growth, Marketing & Brand, Partnerships & BizDev, Product & Engineering, Customer Success, Operations, Other |

**Buttons**: "Continue" (single button, no back, no skip)
**Back navigation**: No
**Skip**: No

---

### Step 2: Create Workspace (2/8)
**URL**: /join-workspace → /create-workspace
**Screenshots**: `onboarding/008-step2-join-or-create-workspace.png`, `onboarding/009-step2-create-workspace-form.png`

**Two sub-flows**:

#### 2a: Join Existing Workspace (if domain has existing workspaces)
- **Headline**: "Join an existing workspace"
- **Subheadline**: "A workspace is a shared space for your team to collaborate on sales and growth."
- Shows existing workspaces with workspace name + creator name + "Join" button
- **Bottom**: "Create new workspace" button
- **Key insight**: Lightfield auto-detects workspaces from the same email domain

#### 2b: Create New Workspace
- **Headline**: "Create your workspace"
- **Subheadline**: "Set up a workspace for your team to sync and manage records of customer interactions."

| Field | Type | Placeholder | Required |
|-------|------|-------------|----------|
| Workspace name | textbox | "Enter workspace name" | Yes |

**Buttons**: "Continue" only
**Back**: No
**Skip**: No

---

### Step 3: Pricing (3/8)
**URL**: /pricing
**Screenshot**: `onboarding/010-step3-pricing.png`

**Headline**: "Your new CRM, working in minutes."
**Subheadline**: "Try free for 14 days. Plans start at $79 per month. Cancel anytime."

**Value bullets** (4 items with icons):
1. Natural language queries and actions on your data
2. Built-in call recording and transcription
3. Automated record updates after every interaction
4. AI-suggested follow-ups and next steps

**Buttons**:
- "Activate free trial →" (primary) → Opens Stripe Checkout
- "Questions? Connect with our team" (secondary link → /book-demo)

**Footer**: "Usage limits are defined in our terms of service."

**Skip**: NO. Payment is required to continue.

#### Stripe Checkout Details
**Screenshot**: `onboarding/011-step4-book-walkthrough.png` (actually Stripe)

- **Headline**: "Essayez Lightfield" (localized to French based on browser locale)
- **Trial**: "14 jours gratuits" (14 days free)
- **Price after trial**: €71.21/month (~$79 USD)
- **Annual option**: €681.41/year (save €173)
- **Total due today**: €0.00
- **Payment methods**: Card (Visa, MC, Amex, Discover, JCB, Diners, UnionPay), Link (Stripe)
- **Fields**: Card number, expiry, CVC, cardholder name, billing address (country, address, city, zip)
- **Promo code field**: Yes
- **Submit button**: "Démarrer la période d'essai" (Start trial)
- **No back button within Stripe** — only "Retour à Lightfield" link in header

**Key finding**: Credit card required upfront for free trial. This is a friction point but common in B2B SaaS.

---

### Step 4: Book Walkthrough (4/8)
**URL**: /book-walkthrough
**Screenshots**: `onboarding/013-step4-book-walkthrough.png`, `onboarding/014-step4-full-with-skip.png`

**Headline**: "Book a guided setup"
**Subheadline**: "Schedule time with our team to get Lightfield configured quickly."

- Embedded calendar picker (Calendly-style)
- Shows current month, today highlighted in blue
- Weekends disabled (Su, Sa greyed out)
- Right panel: "Thu, April 2" → "No available times" (for today)
- Past dates disabled

**Buttons**: "Skip for now" (at bottom — ONLY skippable step so far besides mail sync)
**Back**: No

**Key insight**: This is a human-touch onboarding step. They want to schedule a call to help configure. Smart for high-ACV B2B.

---

### Step 5: Mail & Calendar Sync (5/8)
**URL**: /mail-and-calendar-sync
**Screenshots**: `onboarding/015-step5-mail-calendar-sync.png`, `onboarding/016-step5-mail-sync-full.png`, `onboarding/017-step5-account-creation-dropdown.png`, `onboarding/018-step5-backsync-dropdown.png`

**Headline**: "Mail and Calendar sync"
**Subheadline**: "Configure how mail and calendar data is synced to Lightfield and used to create records."

**4 Configuration sections**:

#### 1. Account & contact creation
| Setting | Type | Default | Options |
|---------|------|---------|---------|
| Mode | dropdown | Selective | Disabled ("No records are created from emails or meetings"), Selective ("Records are created only from emails you sent and meetings you organized or attended"), Always ("Records are always created from emails and meetings") |
| Personal emails | checkbox | unchecked | "Create contacts from personal email addresses (eg. @gmail.com, @outlook.com)" |

#### 2. Backsync range
| Setting | Type | Default | Options |
|---------|------|---------|---------|
| Range | dropdown | 1 month | 1 month (Mar 2, 2026), 3 months (Jan 2, 2026), 6 months (Oct 2, 2025), 12 months (Apr 2, 2025), 24 months (Apr 2, 2024) |

Each option shows the computed start date — smart UX.

#### 3. Visibility settings
| Setting | Type | Default | Options |
|---------|------|---------|---------|
| Visibility | dropdown | Full access | Metadata only ("Show only participants and timestamps to others"), Full access ("Share all email and meeting content with others including subject, body, and attachments") |

#### 4. Do not track (optional)
| Setting | Type | Placeholder |
|---------|------|-------------|
| Exclusions | textbox | "Emails or domains you do not want to sync..." |

**Buttons** (3):
- "Continue with Google" (Google OAuth for mail sync)
- "Continue with Microsoft" (Microsoft OAuth for mail sync)
- "Skip for now"

**Back**: No
**Skip**: Yes — "Skip for now"

**Key insight**: This is the MOST configurable step. They give users granular control over data sync BEFORE connecting. This reduces anxiety about connecting email. The backsync range with computed dates is particularly well-done.

---

### Step 6: Meeting (6/8)
**Skipped** — This step was automatically skipped because we didn't connect email/calendar in Step 5. Likely shows meeting recording setup (Lightfield has built-in call recording per their homepage).

---

### Step 7: About Work (7/8)
**URL**: /about-work
**Screenshots**: `onboarding/019-step7-about-work.png`, `onboarding/020-step7-employee-count-dropdown.png`, `onboarding/021-step7-hdyhau-dropdown.png`

**Headline**: "Tell us about your company"

| Field | Type | Placeholder/Default | Required | Options |
|-------|------|---------------------|----------|---------|
| Company website | textbox | "example.com" (auto-filled from email domain: "elevay.dev") | Likely yes | - |
| Country | dropdown | "United States" (auto-detected) | Yes | Full country list |
| Employee count | dropdown | "Select..." | Yes | 1-3, 4-10, 11-20, 21-50, 51-100, 101-500, 501-1000, 1001-10k, 10k+ |
| How did you hear about us? | multi-select dropdown | "Select..." | Likely yes | Friends/Coworkers, Google Search, AI Search, Event, LinkedIn, X (Twitter), Reddit, Saw your meeting bot, Podcasts/Blogs/Newsletters, Instagram/TikTok, YouTube, Billboard/Bus Advertisement, Other |

**Buttons**: "Continue" only
**Back**: No
**Skip**: No

**Key insights**:
- Company website auto-filled from email domain — zero friction
- Country auto-detected
- HDYHAU is multi-select (checkboxes) — can select multiple channels
- "Saw your meeting bot" is a unique HDYHAU option — implies their meeting bot is a growth channel
- "AI Search" as a HDYHAU option — they track AI referral as a distinct channel
- "Billboard / Bus Advertisement" — they're doing OOH advertising

---

### Step 8: All Set (8/8)
**URL**: /all-set
**Screenshot**: `onboarding/022-step8-all-set.png`

**Headline**: "You're all set"
**Subheadline**: "You'll receive an email invitation to a direct slack channel with the Lightfield team. Message us anytime with questions or feedback."

**4 help links** (external, open in new tab):
1. "Getting started with Lightfield" → support.lightfield.app
2. "Customizing your CRM data model" → support.lightfield.app
3. "Giving Lightfield context about your business" → support.lightfield.app
4. "Syncing additional mail and calendar accounts" → support.lightfield.app

**CTA**: "Continue to Lightfield →" (blue filled button — first colored CTA in the entire onboarding)

**Key insight**: They set up a dedicated Slack channel per customer. This is a high-touch move for a $79/mo product — signals they're in early growth / product-market fit phase.

---

## STEP O6: Data Collected During Onboarding

| Data | Step | Required | Purpose |
|------|------|----------|---------|
| Email | Signup | Yes | Auth, workspace, tenant |
| First name | 1 | Yes | Personalization, display |
| Last name | 1 | Yes | Personalization, display |
| Role | 1 | Yes | Likely influences AI behavior, feature emphasis |
| Workspace name | 2 | Yes | Multi-tenant setup, branding |
| Payment info | 3 | Yes | Billing |
| Guided setup booking | 4 | No (skippable) | Sales/success call |
| Mail sync config | 5 | No (skippable) | Email/calendar data ingestion |
| Company website | 7 | Yes | Auto-enrichment, CRM seed |
| Country | 7 | Yes | Localization, compliance |
| Employee count | 7 | Yes | Plan recommendation, segmentation |
| HDYHAU | 7 | Yes | Marketing attribution |

**Total required fields**: 9 (email, first name, last name, role, workspace name, payment, website, country, employee count)
**Total optional**: 2 (guided setup, mail sync)
**Total skippable steps**: 3 (Book walkthrough, Mail sync, Meeting)

---

## STEP O7: Connection Steps

### Email connection
- **When**: Step 5 of 8
- **Providers**: Google ("Continue with Google") + Microsoft ("Continue with Microsoft")
- **Presentation**: Two buttons at bottom of configuration form
- **Skippable**: Yes — "Skip for now"
- **Can use product without it**: Yes, but the CRM will be empty (no auto-capture)
- **Configuration BEFORE connecting**: Sync mode, backsync range, visibility, exclusions

### Calendar connection
- Bundled with email — same OAuth grants both email and calendar access
- No separate calendar step

### Other integrations during onboarding
- None. No Slack connect, no CSV import, no CRM migration during onboarding.
- Migration is mentioned on homepage ("Agentic data import — Migrate your CRM in under an hour") but not surfaced during onboarding

### Import
- No CSV import during onboarding
- No CRM migration wizard during onboarding
- These are available post-onboarding

---

## STEP O8: First-Run Experience After Onboarding

**URL**: /crm/up-next
**Screenshots**: `onboarding/023-first-run-up-next.png`, `onboarding/024-first-run-agent-chat.png`

### Dashboard ("Up next")
- **Date**: "Thu, Apr 2"
- **Meetings section**: "No meetings" (empty, disabled button)
- **Tasks section**: "No tasks" (empty, disabled button)
- **Toggle**: "Just me" / "My team" tabs
- **"+ Create" button** in top-right
- **"Ask Lightfield"** text input at bottom of page (persistent across views)

### Sidebar navigation
- Up next, Notifications
- Records: Accounts, Opportunities, Contacts
- Resources: Tasks, Meetings, Notes
- Lists: + New list
- Chats: + New chat
- Help icon (?) at bottom

### Agent chat page (/crm/agent)
- **Heading**: "Some ideas..." (not visible in screenshot but from earlier snapshot)
- **8 pre-populated suggestions**:
  1. Enrich my new accounts using the web
  2. Summarize my active opportunities
  3. Which of my opportunities need updating?
  4. What's the deal value in my active opportunities?
  5. Draft an email to customers I need to follow up with today
  6. Prep me for my meetings today
  7. Generate tasks from my last meeting
  8. Research my accounts to determine my ICP

### Is the product populated?
- **No**. Completely empty. No meetings, no tasks, no accounts, no contacts.
- No emails syncing (we skipped connection)
- No getting-started checklist visible in the product
- No onboarding tour or tooltip walkthrough

### Time from signup to "product knows my customers"
- Without email: Never — product stays empty
- With email connected: Would depend on backsync range (1-24 months), probably minutes to hours
- From signup to inside the product: ~3-4 minutes (if you fill quickly and skip walkthrough)

---

## STEP O9: What They DON'T Ask

Things Lightfield could ask but doesn't:

| Not Asked | Why They Might Skip It |
|-----------|----------------------|
| Sales methodology | Inferred from behavior, or not relevant for a CRM |
| Outbound preferences | Lightfield is primarily inbound/relationship CRM, not outbound engine |
| Pricing model | Not needed for CRM functionality |
| Competitor names | Not relevant to CRM — might ask in chat later |
| Target geography | Can be inferred from contacts/accounts |
| Industry / vertical | Can be inferred from company website (they have it) |
| What do you sell? | Could be useful but adds friction — they let the AI figure it out from emails |
| ICP definition | Not asked — their chat suggestions include "Research my accounts to determine my ICP" |
| Team members / invites | Not asked during onboarding — can invite later |
| Existing CRM / tools | Not asked — they have a separate migration page |
| Deal stages / pipeline config | Not asked — "schema-less" approach means no upfront config |
| Sending mailbox | Not applicable — Lightfield is not an outbound tool |
| AI tone preference | Not asked — inferred from user's own writing style |

**Key insight**: Lightfield's philosophy is "zero upfront configuration." They'd rather ingest your data and let the AI figure out the context than ask you to configure it manually. This is directly aligned with their "schema-less foundation" value prop.

---

## STEP O10: Emotional Arc

### "This is easy" moment
- Step 1 (Create Profile): Just name + role dropdown. 5 seconds.
- The entire signup → first form transition is seamless. Magic link → instantly in onboarding.

### "This product gets me" moment
- Step 5 (Mail Sync): The configuration options show they understand data sensitivity. Giving users control over sync granularity BEFORE connecting is thoughtful.
- Step 7: Company website auto-filled from email domain. Small but delightful.
- Agent chat suggestions: "Research my accounts to determine my ICP" and "Prep me for my meetings today" feel like they understand what a founder needs.

### Friction / confusion points
- **Step 3 (Pricing/Stripe)**: Having to enter a credit card for a "free" trial is the biggest friction point. The Stripe checkout is long (card + full billing address). This is where most dropoffs likely happen.
- **Step 6 (Meeting) was silently skipped**: No explanation of what was skipped or why. User might wonder what step 6 was.
- **No back button on any step**: Can't go back to change a previous answer. If you made a mistake, tough luck.

### Single best moment
The **Mail & Calendar sync configuration** (Step 5). It's the most thoughtful screen — gives you control before asking for access, shows computed dates for backsync, has a "do not track" exclusion list. It says "we respect your data."

### Weakest moment
The **empty product after onboarding** (Step O8). You complete 8 steps and arrive at... nothing. No data, no guidance, no getting-started checklist. Just an empty dashboard. The agent chat has good suggestions but they're on a separate page. The "Up next" view showing "No meetings" and "No tasks" is anticlimactic.

### Would a founder doing founder-led sales feel it's worth $79/mo in 5 minutes?
**Probably not** — because after 5 minutes, the product is empty. The value proposition depends entirely on connecting email and waiting for data to sync. If the founder connects Gmail during onboarding and has 3+ months of customer emails, they might see value within 30-60 minutes. But in the first 5 minutes? The product feels like an empty shell. The chat suggestions are promising but without data, they have nothing to work with.

---

## Summary: Lightfield Onboarding Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Speed (signup → product) | 8/10 | ~3 min if you skip optional steps. Payment is the bottleneck. |
| Friction | 6/10 | Credit card required. 8 steps is a lot. No back buttons. |
| Data collection | 7/10 | Minimal asks, smart auto-fills (website from domain, country auto-detect) |
| Personalization from data | 3/10 | Role is collected but doesn't visibly change anything. Website doesn't seed the CRM. |
| First-run experience | 4/10 | Empty dashboard. No guided tour. No sample data. Chat suggestions help but aren't prominent. |
| Email/calendar setup | 9/10 | Best-in-class. Pre-connection config is excellent. Both Google + Microsoft. |
| Trust signals | 7/10 | SOC2, HIPAA on homepage. Slack channel per customer. Granular sync controls. |
| Emotional payoff | 5/10 | No "aha" moment until data syncs. The empty state undermines the promise. |
| **Overall** | **6.1/10** | Solid mechanics, poor first-run payoff. The value is delayed until data syncs. |
