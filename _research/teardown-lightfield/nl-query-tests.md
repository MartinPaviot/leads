# Lightfield NL Query Test Results

**Date**: 2026-03-30
**Data in CRM**: 5 accounts, 5 contacts (Sarah Chen, James Park, Pierre Dubois, محمد العلي, Liam O'Brien)

---

## Test 1: Simple factual — "How many contacts do I have?"

**Response**: "You have **5 contacts** in your CRM."
**Method**: Executed Python code: `client.contact.list(limit=1)` → `page.total_count` = 5
**Quality**: 10/10
**Citations**: N/A (factual count)
**Response time**: ~10s
**Notable**: Uses code execution, not just LLM inference. Shows its work.

## Test 2: Relational — "What do you know about Sarah Chen? What company is she from and what were we discussing?"

**Response**: Multi-paragraph with:
- Contact details: Sarah Chen, CTO at Meridian Labs, sarah@meridianlabs.io
- Found linked note: "Sarah Chen - SaaStr 2025"
- Recalled context: "Met at SaaStr 2025, interested in API product"
- Correctly noted: no meetings, emails, or follow-up history
- Inline clickable links to contact record, account record, and note

**Quality**: 9/10 (accurate, comprehensive, linked entities; slightly verbose — could be more concise)
**Citations**: Yes — inline links to original note and records
**Response time**: ~15s
**Notable**: The inline entity references (contact avatar + name, account logo + name) are clickable and open in-context. This is the "citations" feature working.

## Test 3: Hallucination test — "What did we discuss with the CEO of Acme Corp in our last meeting?"

**Response**: "I couldn't find any account called 'Acme Corp' in your CRM. It's possible the company is listed under a different name. Could you double-check the name or provide any additional details?"
**Quality**: 10/10
**Citations**: N/A
**Response time**: ~15s
**Notable**: **Does NOT hallucinate.** This is a critical pass. The AI grounds all answers in CRM data and admits when it doesn't know. This is the behavior we must replicate.

## Test 4+5: Analytical + Action-oriented (combined query)

**Prompt**: "Which of my contacts are CTOs or CEOs? Also, draft a follow-up email to Sarah Chen about the API product she was interested in at SaaStr."

**Part 1 — Analytical: "CTOs or CEOs?"**
- Returned clean table: Sarah Chen (CTO), James Park (CEO), Liam O'Brien (CEO)
- Correctly EXCLUDED Pierre Dubois (Directeur Commercial) and محمد العلي (مدير المبيعات)
- All names are clickable entity links
- **Quality: 10/10** — correct semantic filtering (understood "Directeur Commercial" ≠ CTO/CEO), well-formatted table

**Part 2 — Action: "Draft follow-up email"**
- Opened a FULL EMAIL COMPOSER in a side panel:
  - To: sarah@meridianlabs.io (pre-filled, editable, with X to remove)
  - Cc/Bcc: available
  - From: "No email account connected" (correctly flags limitation)
  - Subject: "Following up on our conversation at SaaStr"
  - Body (4 paragraphs):
    - "Hi Sarah, It was great connecting with you at SaaStr 2025!"
    - "I wanted to follow up on our conversation about Elevay's API product."
    - "I'd love to set up some time to walk you through what it can do and explore how it might be a fit for Meridian Labs."
    - "Would you have 30 minutes in the coming weeks for a quick call?"
    - Signed "Martin" (my name, auto-detected from profile)
  - Green "Send" button
- **Quality: 9/10** — properly personalized (SaaStr, API product, Meridian Labs, Martin). Natural tone. Good CTA. Only ding: slightly formulaic structure.
- **Response time**: ~20s for both parts
- **Notable**: Lightfield correctly identified "Elevay" as my company (from the domain elevay.dev). It also knew Sarah's role (CTO) and company (Meridian Labs). The email composer is a slide-in panel, not a new page.

**Critical finding**: Email composer is built-in but requires connected email to send. Without OAuth connection, it's draft-only. This is the "system of action" testimonial customers reference.

## Test 6: Pipeline value + contacts this week (combined)

**Prompt**: "What's the total value of my pipeline? Also show me contacts I added this week."

**Pipeline answer**:
- Found 1 opportunity: "Meridian Labs - API Product Deal" at Lead stage (with inline entity links)
- Correctly noted: "No deal value has been set on it yet, so I can't calculate a dollar total"
- Suggested action: "You can add a deal value directly on the opportunity"
- AI auto-generated opportunity summary in the CSV: "Martin met Sarah Chen (CTO) at SaaStr 2025, where she expressed interest in Elevay's API product. The specific pain points...are not yet documented."
- **Quality: 9/10** — honest about missing data, suggested next action, rich entity linking

**Contacts answer**:
- Clean table: 5 contacts with Name, Title, Email (all clickable)
- Arabic name/title correct in table
- BUT: stated "None are currently linked to an account" — **WRONG**. They ARE linked (verified in Contacts table view).
- Root cause: The CSV export the AI worked from showed empty Account columns, causing incorrect inference.
- **Quality: 7/10** — correct count but incorrect relational claim

**Technical**: AI ran `pandas` code (`pd.read_csv`, `df[['Opportunity', 'Account', 'Stage']].to_string()`) to analyze pipeline data. Checked for deal value column. This confirms Lightfield's "code execution" approach to data queries — it exports data as CSV then runs Python analysis on it. This is powerful but has edge cases when CSV exports don't include all relational data.

**Response time**: ~20s

---

**Auto-enrichment discovery**: When retrieving contacts as CSV, محمد العلي had been auto-enriched with:
- Department: "Accounting" (I never provided this — Lightfield added it)
- LinkedIn: "linkedin.com/in/mohammed-sarafndy-8b564386/" (I never provided this)
This means Lightfield auto-enriches contacts in the background after creation. The LinkedIn URL suggests it uses some enrichment API to match names to profiles (though accuracy is questionable — "sarafndy" doesn't match "العلي").

---

## Agent Action Tests

### Create contacts via chat
**Prompt**: "Create the following contacts with their accounts: [5 contacts with details]"
**Result**:
1. AI searched for all 5 accounts simultaneously (parallel lookup)
2. Found none exist → proposed creating all 5
3. Showed human-in-the-loop approval cards for accounts (Approve/Dismiss per account, or "Create all 5")
4. After approval, created contacts with same approval pattern
5. Auto-linked contacts to accounts
6. Auto-created notes from the context I provided ("Met at SaaStr 2025...")
7. Total time: ~30s for 10 records + 2 notes

**Quality**: 9/10 — Excellent. Parallel operations, proper linking, auto-note creation, human-in-the-loop.
**Notable findings**:
- Human-in-the-loop is the default ("Ask every time" toggle)
- Each proposed record is editable before approval
- Batch operations available ("Create all 5" / "Dismiss all")
- AI auto-generates a title for the batch ("SaaStr & new leads")
- Records show inline in chat with rich formatting (avatar, company logo, email, opportunity link)

### Special character handling
- **Arabic**: محمد العلي — displayed correctly, initials "ما" correctly extracted from Arabic characters
- **Apostrophe**: Liam O'Brien — handled correctly
- **French title**: "Directeur Commercial" — preserved as-is
- **Accents**: Not tested directly in creation, but CSV import showed Müller, Geschäftsführerin rendered correctly

---

## CSV Import Test

**Tool**: OneSchema (third-party embedded importer)
**Steps**: 3-step wizard: header selection → column mapping → review & finalize
**Auto-mapping**: 8/8 columns mapped correctly (First Name → Contact First Name, Email → Contact Emails, Company → Account Name, etc.)
**Auto-generated field**: "Contact Full Name" = First + Last
**AI features**: "Correction par IA" (AI correction) available in review step
**Blocker**: Account Name validation requires existing accounts — can't import contacts for new accounts via CSV
**Verdict**: Good for migrating existing CRM data, not for bootstrapping from scratch. Use chat for initial data creation.
**Max rows**: 10,000

---

## Design Language Observations (from live product)

### Theme
- **Light mode** by default (white/off-white backgrounds)
- Dark mode available (added Jan 2026)
- Clean, minimal, Notion-like aesthetic

### Typography
- Sans-serif (Inter or similar)
- Chat messages: 14px base
- Section headers: 12px, uppercase, muted gray
- Entity names: slightly larger, semibold

### Colors
- **Primary text**: Near-black (#1a1a1a)
- **Secondary text**: Muted gray (~#6b7280)
- **Accent**: Warm amber/brown for highlights, links
- **Entity avatars**: Colored circles with initials (two letters)
- **Account logos**: Auto-generated from domain (tiny icons, colored backgrounds)
- **Success**: Green checkmark badges
- **Error/problem**: Red/orange highlights (seen in CSV import)

### Components
- **Chat bubbles**: User right-aligned (subtle bg), AI left-aligned (full width)
- **Entity cards**: Compact horizontal layouts with avatar, name, metadata, action buttons
- **Approval cards**: Dismiss (X) and Approve (checkmark) patterns, individually or batch
- **Expandable sections**: "Retrieved CRM data" collapsible with code execution details
- **Code blocks**: Shown in collapsible sections with "Output" display
- **Tables**: Clean, minimal borders, clickable entity cells

### Information Architecture
- **Sidebar**: Fixed left, 220px, collapsible
- **Main content**: Full width, responsive
- **Chat input**: Fixed at bottom of main content area
- **Thread title**: In top bar, auto-generated from first message
- **Entity references**: Inline clickable links throughout chat responses

### Empty States
- Helpful text explaining what will appear
- Clear CTA ("Go to settings →" for email sync)
- Suggestion prompts in new chat (8 pre-built prompts)

### Microcopy Tone
- Professional but warm
- Conversational: "Let me look up Sarah Chen for you"
- Transparent about process: "I'll look up all the accounts simultaneously"
- Honest about limitations: "I couldn't find any account called..."
- Uses markdown formatting (bold, lists, links) in responses

---

## Emotional Moments

| Feature | Reaction | Notes |
|---------|----------|-------|
| Human-in-the-loop approval cards | Holy shit | This is elegant. AI proposes, human approves. Inline, fast, batch-able. |
| Code execution for queries | Holy shit | Not just LLM guessing — actually runs code against the API. Shows work. |
| Auto-note creation from chat context | Impressive | I said "Met at SaaStr" and it created a titled note automatically. |
| Entity links in chat | Impressive | Clickable contact/account references inline. Rich formatting. |
| No hallucination on Acme Corp | Impressive | Critical trust builder. "I don't know" > making stuff up. |
| CSV import blocking on Account Name | Frustrating | Can't bootstrap contacts for new accounts via CSV. Must create accounts first. |
| 15s response times | Meh | Acceptable but noticeable. Monaco's marketing makes it feel instant. |
| No automated sequences | Missing | Can draft emails but no multi-step sequences. Big gap. |
| Suggestion prompts | Nice | "Enrich my new accounts using the web" — good onboarding nudge. |

**Single most impressive thing**: The human-in-the-loop approval pattern. It's not just "AI does stuff" — it's "AI proposes, shows you exactly what it will do, you approve or edit, then it executes." This builds trust.

**Most frustrating thing**: No way to do automated outbound. Lightfield is purely reactive — it helps you manage what you already have, but doesn't go out and get new business for you.

**Where magic**: NL queries that actually run code and return grounded answers with citations.

**Where just software**: Settings, CSV import, table views. Standard SaaS.
