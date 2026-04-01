# Monaco Product Intelligence v2

**Date**: 2026-03-31
**Sources**: 6 product page screenshots, 116 hero video frames, 9 feature video clips, 8 job listings, v1 teardown data

---

## Monaco's 6 Steps — What EXACTLY the UI Looks Like

### Step 1: Build TAM
**Screen**: Full-width data table on dark background (#0a0a0a)
**Columns**: Checkbox | Account (name + logo) | Status (pill: New/Prospecting) | Score (letter A-F + 🔥 Burning/Warm/Cold) | Industries (multi-tag pills) | Connected to (team members with avatars) | Custom boolean signals (Yes/No, color-coded green/grey)
**Data density**: ~36px row height, 11+ rows visible without scrolling
**Key interactions**:
- Every column is sortable (↕ icons)
- Click a signal cell → reasoning panel with AI explanation + source citations
- Click an account → expand to show **Suggested Contacts** with names, titles, and "Suggested" status
- Custom signal columns are configurable per workspace (Common Investor?, Sales-led growth?, YC Company?)
**What makes it feel premium**: The combination of real company logos, flame-score visualization, color-coded signals, and inline AI reasoning creates a "Bloomberg terminal for sales" feel. High data density signals professionalism.

### Step 2: Overlay Signals
**Screen**: Same table + floating reasoning popover (~300px)
**Popover**: Two tabs — "Reasoning" (AI explanation text) | "Sources" (linked URLs with favicons and titles)
**Key interaction**: Click any signal value → see WHY that signal is true/false, with verifiable citations
**What makes it feel premium**: The citations to real sources (YC blog, news articles, company websites) build trust. Users can verify AI claims. The two-tab pattern separates explanation from proof.

### Step 3: Execute Sequences
**Screen**: Split view — left: vertical workflow steps, right: step detail panel
**Workflow**: Numbered steps with connecting lines and wait periods ("Wait 3 business days")
**Detail panel**: Recipient name, subject line, **physical gift image** (Veuve Clicquot), personalized message body
**Key interactions**:
- "Start" button (white, prominent) + thumbs-down reject button — human approval gate
- Sequence header shows "Sam Blond to Alex Shan (Co-Founder)" — personal context
**What makes it feel premium**: Physical gift integration is a jaw-drop moment. The approve/reject flow gives confidence without removing control. Personalization references specific events (fundraise).

### Step 4: Capture Activity
**Screen**: Split view — left: video call recording (60%), right: Meeting Notes card (40%)
**Meeting Notes**: Title, summary (2-3 sentences), Key Points (bulleted), structured sections (Budget and Team Size)
**Structured extraction**: Auto-populates — Size of Sales Team: 4, Current CRM: Hubspot, Point Solutions: Apollo + Fireflies, Budget: $30,000
**Follow-up email**: Auto-generated from meeting content with extracted action items
**What makes it feel premium**: The jump from raw video to STRUCTURED DEAL DATA (budget, team size, competitor tools) is the magic moment. It's not a transcript — it's intelligence.

### Step 5: Track Pipeline
**Screen**: Kanban board with deal cards + deal overview panel
**Kanban columns**: Show stage name + deal count badge + total dollar value in header
**Deal cards**: Company logo + name + value (compact, ~80px)
**Overview panel**: Summary text, owner, expected close date, auto-generated timeline with dated interaction entries
**Pipeline stages**: Discovery (20 deals, $817K), Proposal (8 deals, $327K), + more
**What makes it feel premium**: The auto-generated timeline turns the pipeline from a manually-updated spreadsheet into a living record. The ⚡ momentum indicator and stage-level dollar totals give instant context.

### Step 6: Ask Monaco (CRO Copilot)
**Screen**: Floating chat panel (~400x350px) overlaying current view
**Header**: ✨ Ask AI with minimize/copy/close buttons
**Quick actions**: Pre-built options (Overview, Outbound Sequences, Summary, Opportunities)
**Chat**: Freeform questions with structured responses (bold headings + bullets)
**Sales coaching**: Direct behavioral feedback — "You Lost Control - This Demo Was About You, Not Their Pain" with specific, actionable critique
**What makes it feel premium**: The tone is a TOUGH SALES MANAGER, not a polite assistant. It references specific behaviors from actual meetings. The hybrid menu+chat design means both novice (click presets) and power (type anything) users are served.

### BONUS: Daily Dashboard (discovered in hero video, NOT on product page)
**Screen**: Full-page dashboard with greeting, summary, priorities, and calendar
**Weekly summary**: "This week, we've launched 45 sequences, received 12 responses, booked 2 meetings, and closed 8 opportunities."
**Priorities**: Actionable task cards linked to deals with stall detection ("Stalled 3 days"), one-click actions (nudge, respond, setup, send)
**Meetings**: Today's calendar with attendee names and times
**Inline email**: Click a priority → see the email thread + AI-drafted follow-up
**Bottom toolbar**: Navigation icons for home, inbox, settings, grid, chat, contacts, alerts
**What makes it feel premium**: THIS IS THE OPERATING SURFACE. A founder opens Monaco in the morning and immediately knows what to do today. No digging through tabs, no inbox triage. AI has already prioritized and drafted responses.

---

## What We Still Don't Know (Information Gaps)

1. **Account detail page** — We've never seen a single-account view (contacts, activity feed, enrichment data, linked opportunities). Only table/list view and kanban.
2. **Contact management UI** — No screenshots of how individual contacts are managed, edited, or enriched.
3. **Settings/configuration** — No visibility into how workspaces are configured, integrations set up, or custom fields created.
4. **Mobile experience** — No evidence of mobile app or responsive design.
5. **Notification system** — Bottom toolbar shows an alerts icon but we've never seen the notification experience.
6. **Import/export** — No visibility into data import/export workflows.
7. **Team collaboration** — "Connected to" suggests multi-user, but we haven't seen role-based access, shared views, or collaboration features.
8. **Pricing page** — No public pricing. Job listing reveals $25K-$100K ACV range.
9. **Actual AI model behavior** — We see outputs (coaching, summaries, signals) but don't know failure modes, hallucination rates, or edge case handling.
10. **Sequence analytics** — We see weekly summary stats but not detailed sequence performance dashboards.

---

## What We Should Replicate vs Do Differently

### MUST REPLICATE (core competitive parity)
1. **Daily dashboard** — The "what should I do today" operating surface
2. **Per-signal AI reasoning with citations** — Trust-building mechanism
3. **Structured data extraction from meetings** — Budget, team size, competitor tools auto-populated
4. **Auto-generated follow-up emails** — From meeting content with extracted action items
5. **Sequence approve/reject flow** — Human-in-the-loop for autonomous outreach
6. **Pipeline auto-timeline** — Deal history generated from interactions, not manual logging
7. **Stall detection with nudges** — "Stalled 3 days" + AI-drafted follow-up
8. **Contact auto-suggestion** — Discover decision-makers at target accounts automatically
9. **Score visualization** — Letter grade + heat indicator (Burning/Warm/Cold)
10. **7 account lifecycle stages** — More granular than typical New/Opp/Customer

### SHOULD DIFFERENTIATE (do better or differently)
1. **Self-serve onboarding** — Monaco is demo-gated; we should be instant-access
2. **No forward-deployed AE dependency** — Full autonomy without human sales support
3. **Open pricing** — Transparency vs Monaco's $25K+ ACV opacity
4. **Visitor identification built-in** — Monaco uses Snitcher+RB2B for their own site but doesn't offer it as a feature
5. **Schema-less memory** — Lightfield-style natural language data model vs Monaco's structured CRM
6. **Multi-language support** — Monaco is English-only
7. **Export/portability** — Make data exportable, not locked in
8. **Real-time signals** — Website visitor alerts, social mentions, news — more signal sources than Monaco

### SKIP (not relevant for our target)
1. **Physical gift integration** — Complex logistics, not essential for MVP
2. **Forward-deployed AE model** — Requires human headcount, antithetical to our "fully autonomous" mission
3. **Custom fonts/branding** — SeasonSerif is nice but not a differentiator
