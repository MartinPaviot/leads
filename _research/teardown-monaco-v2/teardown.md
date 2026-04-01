# Monaco Teardown v2 — Surgical Pixel-Level Analysis

**Date**: 2026-03-31
**Analyst**: Claude (autonomous)
**Method**: Playwright browser + ffmpeg frame extraction + manual review

---

## STEP M1: Site Images — monaco.com/product

### [002] Build TAM — Account Table View
- Screenshot: 002-build-tam-product-image.png
- Element type: table/spreadsheet
- Position: main content area, below section tab navigation
- Size/prominence: full-width, 11 rows visible, dominant UI element
- Color: dark theme (#0a0a0a background), rows with subtle border separation
- **Columns observed (left to right)**:
  1. **Checkbox** — row selection, unchecked by default
  2. **Account** — company name + small colored icon/logo (Judgment Labs, Bluenote, Nowadays, Parley, Backops, Flowline Health, Solve Intelligence, Juicebox, Delve, Sphinx, Casca)
  3. **Status** — pill badge: "New" (dark grey text, muted) or "Prospecting" (bright green background #22c55e)
  4. **Score** — letter grade "A" + flame emoji 🔥 + "Burning" text (orange/red). All 11 accounts show "A 🔥 Burning" — top-tier score
  5. **Industries** — pill badges: "Artificial Intelli..." (purple/indigo), "Software dev..." (olive/green). Truncated with ellipsis
  6. **Connected to** — team member names with colored letter-avatar circles: Sam Blond (pink "F"), Malay Desai, Shek Viswanathan (teal), Tommy Hung (purple "P"), Stan Rapp (green "Ir"). Multiple people per row possible
  7. **Common Investor?** — boolean: "Yes" (green text) or "No" (grey text)
  8. **Sales-led growth?** — boolean: "Yes" (green text) or "No" (grey text)
- **Data schema implied**:
  - Account: {name, logo/icon, status (enum: New|Prospecting|...), score (letter A-F + heat: Burning|Warm|Cold?), industries (multi-tag), connected_team_members (multi-select), custom_signal_columns (boolean)}
- **Key design details**:
  - Column headers have sort icons (↕) — sortable on every column
  - Row height is compact (~36px), maximizes data density
  - Industry badges use distinct colors per category
  - "Connected to" shows the actual team member who has a relationship — social selling feature
  - Custom boolean signal columns (Common Investor, Sales-led growth) are configurable per workspace
- **Color system**: Dark bg #0a0a0a, green for positive signals, purple/indigo for AI/tech industries, orange for high scores, grey for neutral/no
- **Comparison note**: Our TAM table has similar columns but lacks: (1) the "Connected to" relationship mapping, (2) custom boolean signal columns, (3) the heat/flame score visualization, (4) the compact row density

### [003] Overlay Signals — AI Reasoning Panel
- Screenshot: 003-overlay-signals-product-image.png
- Element type: popover/overlay panel on table cell
- Position: appears over the table, anchored to a cell value (e.g., "Yes" in Common Investor column)
- Size/prominence: medium popover (~300px wide), floats above the table
- Color: dark card (#1a1a1a), white text, subtle border
- **Panel structure**:
  - **Two tabs**: "Reasoning" (active, underlined) | "Sources"
  - **Reasoning text**: "Judgment Labs common investors with Monaco include Founders Fund."
  - **Source cards** (3 visible):
    1. Site icon + "Judgment | abc.com" — "Judgment Labs Announces Serie..." (truncated)
    2. Red icon + "blog.ycombinatordot.com" — "AI Assistant Startups funded..." (truncated)
    3. Blue icon + "newsbw.com" — "The State of Generative AI in..." (truncated)
- **Additional column revealed**: "Yc Co..." — likely "YC Company?" — another custom boolean signal
- **Data schema implied**:
  - Signal reasoning: {explanation_text, sources: [{url, title, favicon}]}
  - Each boolean signal has AI-generated reasoning with citations
- **Key design details**:
  - Reasoning is CLICKABLE — appears on hover/click on any signal cell
  - Sources are real URLs with favicons — builds trust, verifiable
  - Two-tab design (Reasoning vs Sources) separates the "why" from the "proof"
  - This is the trust-building mechanism — users can verify AI claims
- **Comparison note**: We have AI scoring explanations but NOT per-signal reasoning with source citations. This is a significant gap. Each "Yes/No" signal can be drilled into for WHY.

### [004] Execute Sequences — Outbound Workflow + Gift Integration
- Screenshot: 004-execute-sequences-product-image.png
- Element type: workflow/sequence builder + detail panel (split view)
- Position: main content, two-panel layout (left: sequence steps, right: step details)
- Size/prominence: full-width, split ~40/60 left/right
- Color: dark theme, step indicators in numbered grey circles, green accent on step 1
- **Left panel — Sequence steps**:
  1. Step 1: "Fundraise gifting" — "Today, Feb 11" (green active indicator)
  2. "Wait 3 business days" (connecting dotted line)
  3. Step 2: "Gift reminder"
  4. "Wait 3 business days"
  5. Step 3: "Final message"
- **Right panel — Step 1 detail**:
  - Header: "Fundraise gifting" (bold)
  - **Recipient**: "Alex Shan"
  - **Subject**: "Congrats on the fundraise!"
  - **Gift**: Product image of Veuve Clicquot Yellow Label Brut 750ml (champagne bottle image, full product photo)
  - **Message preview**: "Hi Alex - congrats on the recent fundrais..." / "Sending a bottle of Veuve your way as a..." / "I'm one of the founders of Monaco - we[...] platform replacing CRM and all the dispa..."
- **Data schema implied**:
  - Sequence: {name, steps: [{type: email|gift|wait, delay_days, delay_type: business|calendar, recipient, subject, gift_product?, message_body}]}
- **CRITICAL FINDING**: Physical gift sending (Veuve Clicquot champagne) is integrated directly into outbound sequences. This is NOT just email. Monaco has logistics/gifting built in — likely via Sendoso, Postal.io, or custom integration.
- **Key design details**:
  - Steps are vertically stacked with connecting lines — classic workflow UI
  - "Wait X business days" shows awareness of business calendar
  - Detail panel shows full message preview with gift image embedded
  - Personalization: message references specific event (fundraise)
- **Comparison note**: We have sequences but NO physical gift integration. This is a unique differentiator for high-touch startup sales. We should evaluate Sendoso/Postal.io APIs.

### [005] Capture Activity — Meeting Recording + AI Notes
- Screenshot: 005-capture-activity-product-image.png
- Element type: video call recording with AI meeting notes overlay
- Position: split view — left: video feed (large), right: structured meeting notes card
- Size/prominence: video dominates ~60% width, notes card ~40%
- Color: video has light/natural background, notes card is dark (#1a1a1a) with white text
- **Video feed**:
  - Shows an actual video call with a person (young man in blue hoodie, glasses)
  - Small PiP (picture-in-picture) of second participant in top-right corner
  - Appears to be a real or simulated Zoom/Google Meet call
- **Meeting Notes card**:
  - Label: "Meeting Notes" (grey small text)
  - Title: "**Virtual Meeting with Alex Shan**"
  - **Summary**: "Great first call with Alex at Judgment Labs. Strong interest in Monaco's agent capabilities for generating demand and increasing conversion rates to grow revenue faster. Engaged, asked detailed technical questions about integrations."
  - **Key Points** (bulleted):
    - "Current CRM is Hubspot"
    - "Point solutions are Apollo and Fireflies"
  - **Budget and Team Size** (bulleted):
    - "Current budget is $30,000"
    - "Sales team size is 4"
- **Data schema implied**:
  - MeetingNote: {title, summary, key_points: string[], structured_fields: {budget?, team_size?, current_tools?, pain_points?}}
  - Auto-extracts: competitor tools (Hubspot, Apollo, Fireflies), budget numbers, team size
- **CRITICAL FINDING**: Monaco auto-extracts structured data from meeting recordings — not just a transcript, but STRUCTURED fields like budget, team size, competitor tools. This is deal intelligence extracted automatically.
- **Key design details**:
  - Summary is concise (~2 sentences), not a raw transcript
  - Key Points are categorized (general vs budget/team)
  - Data is immediately actionable — can feed into scoring, risk detection, deal coaching
- **Comparison note**: We have basic meeting notes but lack STRUCTURED EXTRACTION of deal-relevant fields (budget, team size, competitor tools). This auto-extraction is a major gap.

### [006] Track Pipeline — Kanban Board + Deal Overview
- Screenshot: 006-track-pipeline-product-image.png
- Element type: kanban/pipeline board with deal detail panel
- Position: split view — left: kanban column (deal cards), right: deal overview panel
- Size/prominence: kanban column ~35% width, overview ~65%
- Color: dark theme, deal cards are dark grey (#1a1a1a) with white text
- **Left panel — Kanban column** (one stage visible):
  - Deal cards stacked vertically:
    1. **Dust** — $55,000 (small icon/logo)
    2. **Judgment Labs** — $30,000 (highlighted with blue left border, lightning bolt icon ⚡) — SELECTED
    3. **Vellum AI** — $45,000
    4. **LangSmith** — $40,000
    5. **Nango** — $35,000
  - All are real AI/tech companies (Dust, Vellum, LangSmith, Nango)
- **Right panel — Deal Overview**:
  - Tab: "Overview" (selected)
  - **Summary section**:
    - "Judgment Labs in active evaluation stag..." (truncated)
    - "demo completed and follow-up sessions..."
    - "Slack channel opened and product mate..."
    - "next step is deeper walkthrough with br..."
    - "stakeholder group. Owner Sam Blond. E..."
    - "Date: November 30, 2025"
  - **Timeline entries** (bulleted with dates):
    - "**October 27, 2025**: Monaco <> Judg... up session scheduled to go over o... sequences, and pipeline workflows w... platform size."
    - "**October 23, 2025**: Slack channel ope... Monaco and Judgment Labs; product... workflows shared; Provisioned acces... implementation tasks."
- **Data schema implied**:
  - Deal: {name, value (USD), stage, company_logo, summary, owner, expected_close_date, timeline: [{date, event_description}]}
  - Timeline is auto-generated from interactions (meetings, Slack, emails)
- **Key design details**:
  - Deal cards show only name + value — minimal, clean
  - Selected deal has blue/accent left border indicator
  - Lightning bolt ⚡ icon on Judgment Labs — likely indicates high activity or momentum
  - Timeline shows actual interaction history with dates — fully automatic
  - Owner (Sam Blond) assigned to deal
  - Expected close date visible
- **Comparison note**: Our kanban exists but lacks: (1) auto-generated deal timeline from interactions, (2) momentum/activity indicators (⚡), (3) rich deal summary with owner and dates auto-populated

### [007] Ask Monaco — CRO Copilot AI Chat
- Screenshot: 007-ask-monaco-product-image.png
- Element type: AI chat overlay/modal
- Position: floating panel over the main product view, bottom-right area
- Size/prominence: medium chat panel (~400px wide x 350px tall)
- Color: dark panel (#1a1a1a), white text, green accent on "Ask AI" header
- **Chat interface**:
  - Header: "✨ Ask AI" with sparkle icon + minimize/copy/close buttons (□ ✕)
  - Background shows a table with partial data: "Brex" (all 86), "CashApp" (84), "Corporate card for..." (71), "Instant peer-to-per..." (672)
  - **User query**: "How could I have done a better job on the Judgment Labs demo?"
  - **AI response**:
    - Bold heading: "**You Lost Control - This Demo Was About You, Not Their Pain**"
    - Bullet points:
      1. "You let the intro linger, and waited too long to set agenda or show the product, wasting Alex's attention."
      2. "Demo focused on Monaco's features, not Judgment Labs' pain. Alex mentioned frustration with his existing set of tools and you never asked why."
      3. "Ended without a time confirmed calendar invite sent for the onboarding call. This introduces risk that the opportunity will be delayed and time kills all deals."
  - **Follow-up input**: "Ask follow-up" placeholder text + send button (↑ arrow)
- **CRITICAL FINDING**: Monaco provides SALES COACHING from AI. Not just data queries, but behavioral feedback on demo performance. The tone is direct and prescriptive ("You Lost Control"). This is the "CRO Copilot" — an AI that coaches like a sales leader.
- **Key design details**:
  - Response is structured with bold heading + bullets, not wall of text
  - Coaching is specific to the actual demo (references Alex by name, specific behaviors)
  - Actionable: each bullet is something the user can fix
  - Tone: direct, slightly confrontational ("About You, Not Their Pain") — mimics a tough sales manager
  - Chat appears as overlay, not a separate page — available from any context
  - Background partially visible — user can see their pipeline/data behind the chat
- **Data schema implied**:
  - ChatQuery: {question, context: current_page_data}
  - ChatResponse: {heading, bullets: string[], follow_up_prompt}
  - The AI has access to meeting recordings, deal data, and behavioral context
- **Comparison note**: We have NL chat but NOT sales coaching. Our chat answers data queries; Monaco's also provides behavioral coaching on sales technique. This is a differentiation gap.

### [008] Section 6 Full Viewport — Layout Context
- Screenshot: 008-testimonials-section.png
- Shows the full viewport with section 6 active
- **Top navigation bar**: "Product" | "Company" | MONACO logo (centered) | "Log in" | "Request demo" (green button)
- **Left side**: Section label "6 Ask Monaco • Increase Conversion" + heading "Your CRO Copilot" + description + 3 feature bullets with icons:
  1. Phone icon + "Prioritized actions" — "Monaco tells you the most important actions you can take to close more revenue."
  2. Chart icon + "Ask Monaco" — "Chat with Monaco to receive sales feedback and uncover trends across the business."
  3. Grid dots icon + "Proactive insights" — "Monaco gives you information about your business proactively."
- **Right side**: Ask AI chat panel (documented in [007])
- **Layout**: clean split, text left, product demo right. Consistent pattern across all 6 sections.

---

## STEP M2: Hero Video Frame Analysis (116 frames at 1fps, 1:56 duration)

### Video Structure Overview
- **Frames 1-19**: Sam Blond (Co-Founder & CEO) talking to camera. Dark office setting, grey hoodie. Name card appears at frame 2.
- **Frame 20**: Black transition frame
- **Frames 21-38**: TAM/Account table view — the same table from product page but shown in context with cursor interactions
- **Frames 39-51**: Outbound sequence builder + gift integration + Start/Reject UI
- **Frames 52-58**: Email thread — response from prospect + suggested reply composing
- **Frames 59-67**: Video call recording with AI meeting notes panel
- **Frames 68-72**: Structured data extraction card from meeting
- **Frames 73-77**: Pipeline kanban board + auto-generated follow-up email
- **Frames 78-92**: Ask AI coaching + DAILY DASHBOARD with priorities + meetings + nudges
- **Frames 93-105**: Testimonial cards from customers
- **Frames 106-112**: Sam Blond closing remarks
- **Frames 113-116**: Monaco logo end card

### Key Product Screens Discovered in Video (not on product page)

#### [036] TAM Table — Contact Expansion Under Account
- Screenshot: hero-0036.png
- Judgment Labs row expanded to show **suggested contacts**:
  - **Enyu Rao** — "Founding Ops & Growth" — Status: "Suggested" (green text)
  - **Andrew Li** — "Co-founder" — Status: "Suggested"
  - **Alex Shan** — "Co-founder" — Status: "Suggested"
- Cursor clicking on Alex Shan to select him
- **CRITICAL FINDING**: Monaco auto-discovers contacts at target accounts and suggests them for outreach. These are "Suggested" status — not manually added. The system finds decision-makers automatically.
- **Data schema**: Contact: {name, title, suggested_status, linked_account}
- **Comparison note**: We don't auto-suggest contacts under accounts. This is a significant feature gap.

#### [040] Sequence Builder — Header Context
- Screenshot: hero-0040.png
- Header: "**Sam Blond to Alex Shan (Co-Founder)**" — shows WHO is sending TO WHOM with title
- Sequence steps clearly laid out with step numbers, connecting lines, wait periods
- **Design detail**: The header establishes personal context — this sequence is FROM a specific person TO a specific person. Not anonymous bulk email.

#### [045] Gift Detail — Veuve Clicquot with Message
- Screenshot: hero-0045.png
- Right panel detail view showing:
  - Recipient: Alex Shan
  - Subject: "Congrats on the fundraise!"
  - Gift: Veuve Clicquot Yellow Label Brut 750ml (product image with bottle + box)
  - Message: "Hi Alex - congrats on the recent fundraise! Sending a bottle of Veuve your way as a quick congrats. I'm one of the founders of Monaco - we're an end to end..."
- **Key detail**: Gift image is a high-quality product photo, not a link. The email IS the gift notification.

#### [050] Sequence Start/Reject UI
- Screenshot: hero-0050.png
- Bottom of sequence: two buttons — thumbs-down icon (dark, reject) and "**Start**" (white, prominent, cursor hovering)
- **CRITICAL FINDING**: Autopilot suggests sequences but requires human approval. The "Start" button is the approval gate. Thumbs-down rejects the suggestion. This is the "guardrails" they mention — AI proposes, human approves.
- **Comparison note**: We need this approve/reject pattern for autonomous sequences.

#### [055] Email Thread — Response + Suggested Reply
- Screenshot: hero-0055.png
- Email thread view:
  - **Incoming**: "Response from Alex Shan" — "Thanks for the Veuve! I'm interested in learning more. Here's my calendar, please book whatever time works for you." — "2 hrs ago" — "✉️ Email" badge
  - Small avatar for Alex Shan
  - **Suggested reply box** below: "Let's meet Tuesday at 1pm," with cursor typing
  - Formatting toolbar: B I (bold/italic) + list icons
  - "Sent from sam@monaco.com" label
- **CRITICAL FINDING**: Monaco shows AI-suggested replies to incoming emails. The reply is pre-drafted, the user just edits and sends. This is the reply acceleration feature.
- **Data schema**: EmailThread: {messages: [{sender, body, timestamp, channel}], suggested_reply}

#### [058] Email Thread — Sent Reply
- Screenshot: hero-0058.png
- Completed thread:
  - Alex Shan's original: same as above
  - Sam's reply: "Let's meet Tuesday at 1pm, I'll give you a walkthrough!" — "1 minute ago" — "✉️ Email" badge
  - Empty "Suggested reply" box ready for next message
- Shows the complete flow: gift → response → suggested reply → sent

#### [062] Meeting Recording — Video Call UI
- Screenshot: hero-0062.png
- Video call recording interface:
  - Name label: "Alex Shan" (top-left, grey pill)
  - Video shows the same person from the product page screenshot (blue hoodie, glasses)
  - Recording indicator: red dot (top-right)
  - Playback controls: ⏸ pause, "2:59 / 33:00" timestamp, 🔊 volume, 📹 camera toggle, ⋮ menu
  - Progress bar showing playback position
- **Key detail**: 33 minutes total — this is a full demo call recording, not a snippet

#### [067] Meeting Recording + AI Notes Panel
- Screenshot: hero-0067.png
- Same video call but now with Meeting Notes panel appearing on right:
  - "Meeting Notes" label
  - "Virtual Meeting with Alex Shan"
  - Summary + Key Points (same content as product page)
  - Notes appear DURING playback at 3:02 mark
- **Design detail**: Notes panel slides in alongside the video, not replacing it

#### [072] Structured Data Extraction Card — CRITICAL
- Screenshot: hero-0072.png
- Clean card view for **Judgment Labs** (with company icon):
  - 👥 Size of Sales Team: **4**
  - 📋 Current CRM: **Hubspot**
  - 🔧 Point Solutions: **Apollo, Fireflies**
  - 💰 Budget: **$30,000**
- **CRITICAL FINDING**: Monaco auto-extracts STRUCTURED deal intelligence from meeting recordings and populates them as account/deal fields. This is not just a transcript summary — it's structured data that feeds the CRM automatically.
- **Comparison note**: MAJOR GAP. We don't extract structured fields (budget, team size, competitor tools) from conversations and auto-populate deal records.

#### [074] Pipeline Kanban — Multiple Stages with AI Companies
- Screenshot: hero-0074.png
- Kanban board showing deal cards across columns:
  - **Judgment Labs** — $30,000 (selected, blue accent, ⚡ icon)
  - **Vellum AI** — $45,000
  - **Nango** — $35,000
  - **Adept AI** — $40,000
  - **Log10** — $35,000 (different column)
  - **Dust** — $55,000 (different column)
  - **LangSmith** — $40,000 (partially visible)
- Each card has company icon/logo
- Multiple columns visible — at least 2-3 pipeline stages

#### [077] Auto-Generated Follow-Up Email
- Screenshot: hero-0077.png
- Email composition modal:
  - Header icon: ✉️ "Follow-up email"
  - Recipient: Alex Shan
  - Subject: "Judgment Labs + Monaco - Next Steps"
  - Body:
    - "Hey Alex!"
    - "Excited to migrate you over to Monaco! Here are the next steps we discussed on our call:"
    - Bullet points:
      - "Sam to setup a shared Slack channel with the Judgment Labs team"
      - "Alex to confirm availability for onboarding call"
      - "Alex to send over any sales collateral to start t[raining]"
  - Bottom: formatting toolbar + "**Send**" button (green)
- **CRITICAL FINDING**: Monaco auto-generates follow-up emails from meeting content. The action items from the call are automatically extracted and formatted into a follow-up email ready to send.

#### [089-090] DAILY DASHBOARD — The Home Screen (MOST IMPORTANT NEW DISCOVERY)
- Screenshots: hero-0089.png, hero-0090.png
- **Top greeting**: "Good morning, Sam"
- **Weekly summary banner**: "This week, we've launched **45 sequences**, received **12 responses**, booked **2 meetings**, and closed **8 opportunities**."
- **Left panel — "Your priorities today"** (with "See All" link):
  1. 🔔 **"Nudge Alex Shan"** — Judgment Labs · Opportunity Qualification · $30,000 — **"Stalled 3 days"** (red) — "Alex hasn't responded to your meeting follow up email"
  2. ↩️ **"Respond to Gabriel Hubert"** — Dust · Opportunity Qualification · $55,000 — "Received 5 days ago" — "Nicholas asked if last Wednesday works for the follow-up session"
  3. 🔗 **"Set up shared Slack channel"** — Judgment Labs · $30,000 — Due Feb 15 — "Send Slack channel invite to Alex Shan"
  4. ✅ **"Send collateral"** — Composite · Opportunity Discovery · $45,000 — Due Feb 16 — "Send sales collateral as discussed in demo to James Chan and Kyle Jordan"
- **Right panel — "Your 2 meetings today"**:
  - "Remotely Demo 2" — upcoming
  - "Philip (AirPay) & Sam" — 8:30 AM - 9:00 AM
- **Bottom toolbar**: Navigation icons (home, arrows, inbox, settings, grid view, chat, contacts, alerts)
- **Frame 90 expanded**: Clicking "Nudge Alex Shan" shows:
  - Right panel: Email thread with the original follow-up + an AI-drafted nudge:
    - "Hey Alex - I'm following up on my message from Tuesday."
    - "Can you confirm a time that works for you to schedule our onboarding call? Alternatively, pick anytime here on my calendar."
  - "Sent from sam@monaco.com"
  - Button: "Respond from inbox"
- **CRITICAL FINDING**: This dashboard is the DAILY OPERATING SURFACE. It combines:
  1. AI-generated weekly performance summary (sequences, responses, meetings, closes)
  2. Prioritized daily tasks linked to specific deals with stall detection
  3. Today's calendar
  4. Inline email preview + AI-drafted follow-ups
  5. One-click actions (nudge, respond, setup, send)
- **Comparison note**: WE DO NOT HAVE A DAILY DASHBOARD. This is arguably Monaco's most important screen — the "home" that tells founders exactly what to do today. Our app has no equivalent. THIS IS THE BIGGEST GAP.

---

## STEP M3: Feature Videos (9 webm clips from homepage)

(Carried forward from v1 analysis — 9 videos already downloaded and analyzed at 5 frames each. Key findings incorporated here.)

### Theme 1: "Everything you need, all in one place"
- **1-1**: Accounts table skeleton/loading state — floating card design on dark bg
- **1-2**: Email response card — "Thanks for the demo!" with timestamp "1 hr ago", "Email" badge, blue thread line
- **1-3**: Account lifecycle stages — 7 color-coded pills: New (gray), Prospecting (navy), Opportunity (purple), Customer (green), Disqualified (red), Inbound (gold), Nurture (pink)

### Theme 2: "Time to value"
- **2-1**: Pre-built TAM cards (5 accounts all rated "A 🔥 Burning" with real company logos)
- **2-2**: Forward-deployed AE video call — "Monaco Expert" label on video feed, integrated into product UI
- **2-3**: KPI card — "Meetings Booked" = **11** this week, **+175%** growth (green badge)

### Theme 3: "Agents working for you"
- **3-1**: Auto-scoring table with "About" column auto-generating descriptions from enrichment
- **3-2**: Pipeline kanban — **Discovery (20 deals, $817,214)** and **Proposal (8 deals, $327,036)** columns with company logos + deal values
- **3-3**: Ask AI quick-action menu — hybrid menu+chat: pre-built actions (Overview, Outbound Sequences, Summary, Opportunities) + freeform chat input ("best strategy for my TAM?")

### Key Design Patterns from Feature Videos
- Score format: "A | 🔥 Burning" — letter grade + fire emoji + status word
- Pipeline columns show deal count + total dollar value in headers
- Ask AI has BOTH preset actions AND freeform — important hybrid pattern
- 7 account lifecycle stages (vs typical 3-4) — more granular tracking

---

---

## STEP M4: YouTube Search

**Search queries**: "Monaco sales platform demo", "sam blond monaco sales", "Monaco CRM walkthrough 2026"

### Results Found
1. **"Monaco raises $35m to reinvent AI-powered sales software"** — BrieflyBuzzed World, 106 views, ~Feb 2026. News recap, no product UI.
2. **"The AI CRM wars are officially on (Monaco vs Salesforce)"** — Raised and Confused, 118 views, ~Feb 2026. Commentary with Sam Blond's launch tweet shown.
3. **"Weekly Startup News - 2/13/2026"** — SparkLaunchOfficial, 144 views. Founder briefing mentioning Monaco launch.
4. **"Is Something Big Happening? JOBS BEAT!!!"** — TBPN, 6.5k views. Moment at 2:53:21 referencing Sam Blond/Monaco.

### Conclusion
- **No official Monaco product demo video exists on YouTube** (confirmed from v1 research)
- All product footage is hosted on cdn.monaco.com (hero-video.mp4 + 9 feature webms)
- Sam Blond's launch was shared primarily via X and LinkedIn, not YouTube
- No third-party reviewers have uploaded product walkthroughs
- **Information gap**: Without a public demo, our hero video analysis (116 frames) is the primary source of product UI intelligence

---

---

## STEP M5: Community Screenshots (X/Twitter)

X requires login for image search. Google Image search results for "site:x.com monaco sales platform" found:
- @MonacoGTM official posts with investor slides (Garry Tan, Peter Thiel, Ryan Petersen)
- Sam Blond launch announcement tweet with embedded hero video
- No user-generated product screenshots found beyond official marketing

**Key finding**: Monaco's product is demo-gated with no self-serve signup. Users can't take their own screenshots because they don't have public access. All product imagery comes exclusively from Monaco's marketing team. This means our hero video frame analysis is the ONLY source of actual product UI detail beyond the 6 product page screenshots.

---

## STEP M6: Job Listings (jobs.ashbyhq.com/monaco)

Screenshot: 016-ashby-jobs.png
**Status**: Same 8 positions as v1 analysis (unchanged since Mar 30)

### Positions (8 total, all SF on-site, full-time)
**Design (1)**: AI Product Designer — non-deterministic AI-driven UX
**Engineering (4)**:
- AI Engineer — LLMs (OpenAI+Anthropic), RAG, vector DBs, agentic systems, Python
- Frontend Engineer — React+TypeScript, chat UIs, LLM streaming, non-deterministic UI
- Product Backend Engineer — Go/TypeScript/Python, APIs, cloud infra
- Senior Platform Engineer — event-driven systems, ML infra, streaming, distributed systems
**Sales (3)**: Client Operations, Forward-Deployed AE ($25K-$100K ACV), Founding AM

### Inferred Tech Stack (from v1 deep analysis)
| Layer | Technology | Confidence |
|-------|-----------|------------|
| Frontend | React + TypeScript | Confirmed |
| Marketing | Next.js + Turbopack → Vercel | Confirmed |
| Backend | Go, TypeScript, Python | Confirmed |
| AI Models | OpenAI + Anthropic (multi-model) | Confirmed |
| AI Pattern | RAG + Agentic workflows + Memory | Confirmed |
| Data Arch | Event-driven, streaming, warehouse | Confirmed |
| Observability | Datadog RUM + full suite | Confirmed |
| Cloud | Likely AWS (CloudFront CDN) | High |
| Visitor ID | Snitcher + RB2B (own marketing) | Confirmed |
| ATS | Ashby | Confirmed |

**Full technical analysis**: See `_research/teardown-monaco/technical-and-community.md`

---

### Page-Level Observations
- **Navigation**: Fixed top bar with "Product" | "Company" links, centered MONACO logo, right-side "Log in" and "Request demo" (green pill button)
- **Section navigation**: Horizontal tab bar below hero, showing all 6 steps with numbers and category labels ("Drive Demand" for 1-3, "Increase Conversion" for 4-6)
- **Color palette**: Pure dark (#000000 or very close), green accent (#22c55e) for CTAs and positive values, white text (#ffffff), grey for secondary text
- **Typography**: Clean sans-serif (likely Inter or custom), large headings, compact body text
- **Testimonials**: Horizontal scrolling carousel with 10 unique testimonials from startup founders (Alex Berkovic/Sphinx, Fatima Sabar/Bluenote, Sean McCarthy/BackOps, Phillip Smart/Parley, Graham Cummings/Datawizz, Alex Shan/Judgment Labs, Catheryn Li/Simple AI, Amy Yan/Nowadays, Hari Raghavan/Autograph, Ben Dopfner/Vesto)
- **Footer CTA**: Monaco logo + "Start growing your revenue faster" + "Request demo" button

