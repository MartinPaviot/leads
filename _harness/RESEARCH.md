# Research instructions

Read this file at the start of Phase 1. It contains detailed protocols for all 14 investigations.

---

## INVESTIGATION 1: Monaco teardown (NO product access)

Monaco is gated behind a demo request. You cannot use the product. Reconstruct every detail from public sources. Output: `_research/teardown-monaco/`

### A. Site extraction
- Navigate to monaco.com and monaco.com/product via Playwright
- Extract every image URL from the page HTML (format `/_next/image?url=...`)
- Download each image at max quality
- For each image: describe every UI element visible — buttons, labels, icons, data displayed, layout, color usage, states

### B. Video extraction
- Find ALL videos on monaco.com (homepage, product page, embedded)
- Search YouTube for "Monaco sales platform demo", "Monaco CRM demo", "Sam Blond Monaco demo", "Sam Blond product walkthrough"
- Search for podcast interviews where Sam Blond demos the product live
- For each video: download with `wget`/`curl`, extract frames every 2 seconds: `ffmpeg -i video.mp4 -vf "fps=0.5" frame_%04d.png`
- Analyze every frame sequentially. For each new screen:
  - What page/section of the product is this?
  - What data is on screen? (accounts, contacts, emails, pipeline, scores)
  - What UI elements are visible? (buttons, tabs, filters, search bars, sidebars, modals)
  - What actions can the user take?
  - What is the information hierarchy? (prominent vs secondary)
  - What microcopy is visible? (tooltips, labels, empty state messages, CTA text)
- Recompose the complete user flow from the video frames

### C. Community intelligence
- Twitter/X: search "monaco.com" OR "monaco sales" OR "monaco CRM" — filter for tweets WITH images. Real users post dashboard screenshots, sequence results, TAM scores. Each screenshot is product intelligence.
- LinkedIn: posts mentioning Monaco with images
- Reddit r/sales r/startups r/SaaS: Monaco mentions with detail
- Read every detailed review: MarketBetter, folk.app, ColdIQ, SaaStr, SourceForge, TechCrunch, VentureBeat

### D. Technical intelligence
- Playwright network tab: what API domains does monaco.com call? What frameworks? What cookies/headers?
- Monaco job listings on LinkedIn/Greenhouse/Lever — descriptions reveal architecture, tools, priorities
- BuiltWith or Wappalyzer stack analysis

### E. Gap analysis
Document what Monaco does NOT do (per reviews): no phone dialer, no chatbot, no inbound visitor identification, no LinkedIn outreach. These are our opportunities.

### F. The WHY for every feature
Don't document QUOI. Document POURQUOI. What pain does it solve? What moment does it create? What would the founder do without it?

### Monaco's 6 product steps (from their site — document each in exhaustive detail):

**Step 1: Build TAM**
- Pre-built from "world database of billions of data points" + ICP + existing customers + email history
- ML scoring using firmographics and signals
- Clear "why this account" explanations for each score
- Stack-ranked list of target accounts
- TAM auto-updates as company grows
- KEY BEHAVIOR: account is pre-built on Day 1. Not "you build it" — it's done for you at onboarding
- EMOTIONAL MOMENT: founder logs in, sees entire market scored and ranked with explanations. No manual work.

**Step 2: Overlay signals**
- AI semantic search: natural language queries like "crypto companies", "B2B companies manufacturing fasteners", "companies hiring RAG engineers"
- Custom signals: common investors, job postings, current tech stack, "anything else you can imagine"
- Inbound signals: website visitors, demo requests, high-signal inputs
- KEY BEHAVIOR: you can describe your ideal target in plain English and Monaco filters your TAM to match

**Step 3: Execute sequences**
- Pre-built opinionated templates you customize quickly
- Autopilot: Monaco decides who to enroll, when to start, how to follow up — without blasting whole TAM
- Contextual relevance: messages adapt to business context and intent signals
- KEY BEHAVIOR: it's not "here's a template, fill in the blanks." Monaco chooses the recipient, the timing, and adapts the message to what it knows about that specific prospect

**Step 4: Capture activity**
- Every interaction captured, summarized, attached to right account + contact + opportunity
- Accounts and contacts stay complete and up to date automatically (auto-enrichment)
- Trusted history: what happened, when, who was involved, what changed
- Built-in meeting recorder: captures calls, summarizes, generates CRM updates + action items
- KEY BEHAVIOR: zero manual CRM entry. Ever. It captures everything.

**Step 5: Track pipeline**
- Signal-based stages: meetings, email threads, call momentum, stakeholder engagement DRIVE pipeline changes (not manual logging)
- Risk detection: ghosting, stalls, weak engagement flagged EARLY with clear REASONS
- Auto-filled fields: call count, stakeholders involved, usage signals, "why now" — all pulled from real interactions
- KEY BEHAVIOR: the pipeline reflects reality, not what someone remembered to log. Risks surface before the deal dies.

**Step 6: Ask Monaco (CRO Copilot)**
- Prioritized actions: tells you the most important things to close more revenue
- Chat interface: ask Monaco for sales feedback, uncover trends
- Proactive insights: gives information about your business before you ask
- KEY BEHAVIOR: it's not just analytics. It's coaching. It tells you WHAT to do and WHY.

**Plus: Forward-deployed AE**
- Each customer is paired with a human sales executive
- Not fully autonomous AI — human expertise embedded
- "Monaco is more than technology. The forward deployed AE is like having a sales exec on our team."
- WE REPLACE THIS WITH: fully autonomous AI that does what the human AE does — coaching, prioritization, strategy. Our thesis is that AI can do this job.

---

## INVESTIGATION 2: Lightfield teardown (FULL product access)

Sign up and live the complete customer experience. Output: `_research/teardown-lightfield/`

### A. Onboarding flow
- Sign up via Playwright (use autonomy tools for email/captcha if needed)
- Screenshot EVERY step. Document: what questions, in what order, what assumptions, how long
- Connect a real email inbox
- Upload a CSV of ~50 realistic test contacts
- Time how long until CRM is populated. Document what appears and how.

### B. Auto-capture deep test
- Send test emails to/from the connected inbox. How fast does Lightfield capture? Does it attach to right contact? Summarize correctly?
- Simulate calendar events / meetings if possible. Does it capture?
- Test the 2-year backfill claim — does it import historical emails?

### C. Customer memory test (CORE DIFFERENTIATOR)
Test NL queries with increasing complexity:
- **Simple factual**: "How many contacts do I have?" "What's in my pipeline?"
- **Relational**: "When did I last talk to [contact]?" "What did [contact] say about pricing?"
- **Analytical**: "What objections come up most often?" "How has my ICP changed?"
- **Predictive**: "Which deals are at risk?" "Who haven't I followed up with?"
- **Cross-referencing**: "Which contacts mentioned [keyword] in the last 3 months?"
- **Action-oriented**: "Draft a follow-up to [contact] based on our last conversation"
- For EACH query: document the response verbatim, quality score 0-10, whether it includes citations, response time, what's missing or wrong

### D. Agent action test
- Draft follow-up emails — evaluate quality, tone, context relevance
- Create a report or proposal — what comes out?
- Update pipeline stages — accurate?
- "Who haven't I followed up with?" — the killer feature. Test it.

### E. Edge cases
- Duplicate contacts — how handled?
- Contacts with no email
- Very long email threads (20+ messages)
- Conversations in French
- Names with special characters (accents, Chinese, Arabic, emoji)
- Ask about something that doesn't exist — hallucinate or "I don't know"?
- Delete a contact, re-add it — what happens to history?

### F. Performance
- Query response times at different data volumes
- UI feel: snappy or laggy?
- Concurrent operations?

### G. Information architecture
- Map every page/screen. What's in the nav? What's the hierarchy?
- Default landing page? What's above the fold?
- How does chat relate to pipeline? How do you switch?
- Where is customer memory vs pipeline vs analytics? How connected?

### H. Design language
- Color palette, typography, spacing, component patterns
- Empty state, error state, loading state — screenshot each
- Tone of microcopy: professional? Casual? Technical?
- Screenshot every unique UI component

### I. What Lightfield doesn't do
- Can it generate outbound? Build TAM? Score accounts?
- Does it have sequences / automated outreach?
- What integrations available vs missing?
- This is where our product fills the gap.

### J. Emotional moments
- For each feature: "holy shit" or "meh"?
- Single most impressive thing?
- Most frustrating?
- Where magic, where just software?

---

## INVESTIGATION 3: Community & user intelligence

Not what companies SAY — what real users say.
- Twitter/X: Lightfield AND Monaco mentions with screenshots, complaints, praise
- Reddit r/sales r/startups r/SaaS r/coldemail: founder threads about outbound/CRM pain
- Indie Hackers, YC HN: "outbound", "cold email", "CRM", "sales tools" threads
- Classify every pain point by frequency and severity
- Output: `_research/user-pain.md`

## INVESTIGATION 4: attio.com, clay.com
Lighter teardown. Browse site, document key differentiators vs Monaco/Lightfield.
→ `_research/teardown-attio.md`, `_research/teardown-clay.md`

## INVESTIGATION 5: Compliance
CAN-SPAM, GDPR, CASL, Google/Microsoft 2025-2026 bulk sender rules, spam complaint thresholds (0.1% Gmail).
→ `_research/compliance.md`

## INVESTIGATION 6: Deliverability
Warming, SPF/DKIM/DMARC, IP rotation, volume ramp-up, mailbox rotation, 2026 best practices.
→ `_research/deliverability.md`

## INVESTIGATION 7: Data providers
Sign up for free tiers, test REAL API calls. For each: actual response shape, coverage %, accuracy %, cost per record, rate limits (real vs documented).
→ `_research/data-providers.md`

## INVESTIGATION 8: Email sending
Sign up, test real sends, measure deliverability.
→ `_research/email-providers.md`

## INVESTIGATION 9: LLM providers
Price per million tokens, quality for cold email writing (test real generation), latency.
→ `_research/llm-providers.md`

## INVESTIGATION 10: Framework & infra
Best stack for chat-first SaaS 2026.
→ `_research/framework-infra.md`

## INVESTIGATION 11: Unit economics
Real cost per operation from actual signups. Model COGS at 10, 100, 1000 clients.
→ `_research/unit-economics.md`

## INVESTIGATION 12: Risks
What kills this product + mitigations.
→ `_research/risks.md`

## INVESTIGATION 13: Data architecture
Entity relationships, multi-tenancy, customer memory storage, embedding/RAG strategy.
→ `_research/data-architecture.md`

## INVESTIGATION 14: Security & privacy
Tenant isolation, credential storage, OAuth management, contact privacy.
→ `_research/security-privacy.md`

---

## Final outputs

- `_research/stack-decision.md` — every technical decision with evidence + completeness score
- `_research/complete.md` — summary of all findings, key insights, strategic implications
