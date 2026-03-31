# Monaco Feature Video Frame Analysis

**Date**: 2026-03-30
**Source**: 9 feature .webm videos from cdn.monaco.com, 45 frames total (5 per video)

---

## Theme 1: "Everything you need, all in one place"

### Feature 1-1: Unified Platform (Database view)
- Frame shows: Accounts table with skeleton/loading state
- "Accounts" header with grid icon and "+" add button
- Table has ~6 columns, ~7 rows of placeholder content
- Dark theme, subtle borders, floating card design
- **UI pattern**: The table card floats on a dark background — not full-bleed. This is a MODAL or PREVIEW style, not the main app layout.

### Feature 1-2: Every Interaction Catalogued (Auto-capture)
- Frame shows: Email response card
- Label: "Response" (gray header)
- Body: "Thanks for the demo! I'm really interested in signing up for a trial. Let me know how I get started."
- Metadata: "1 hr ago" | "Email" badge
- **Key finding**: Every captured email becomes a structured card with: type label, body text, timestamp, channel badge
- The blue line on the left suggests this is part of a timeline/thread view
- **Design pattern**: Card with rounded corners, dark background, type label in muted text

### Feature 1-3: Demand Gen to Pipeline (Account stages)
- Frame shows: 7 account lifecycle stages as color-coded pills:
  1. **New** — gray (muted)
  2. **Prospecting** — dark blue/navy
  3. **Opportunity** — purple
  4. **Customer** — green (highlighted with background)
  5. **Disqualified** — dark red
  6. **Inbound** — gold/amber
  7. **Nurture** — pink/magenta
- "Customer" stage is highlighted (active/selected) with a subtle background
- **Key finding**: Monaco's account taxonomy has 7 stages, NOT the typical lead→opp→customer. They separate Inbound and Nurture as distinct stages.
- **Design**: Rounded pill badges, each ~180px wide, vertically stacked with spacing

---

## Theme 2: "Time to value"

### Feature 2-1: Effortless Onboarding (Pre-built TAM)
- Frame shows: 5 account cards stacked vertically:
  - Judgment Labs — logo | A | 🔥 Burning
  - Bluenote — logo | A | 🔥 Burning
  - Nowadays — logo | A | 🔥 Burning
  - Parley — logo | A | 🔥 Burning
  - Backops — logo | A | 🔥 Burning
- Each card: company logo (20x20), company name, score badge ("A"), fire emoji, "Burning" label
- All companies are real Monaco customers (from testimonials)
- **Key finding**: The "pre-built TAM" on Day 1 shows real company logos with scores and status. The 🔥 Burning status = highest priority.
- **Design**: Cards are full-width, subtle border, dark background, horizontally laid out (logo | name | score | status)

### Feature 2-2: White-Glove Activation (Forward-Deployed AE)
- Frame shows: Video call with a woman labeled "Monaco Expert"
- Office setting (NYC-style loft with arched windows)
- Dark card/modal overlaying the video feed
- **Key finding**: The forward-deployed AE is shown IN the product as a video call. Not separate — integrated.
- **Design**: Video feed is the main content, with dark overlay cards for notes/actions

### Feature 2-3: Value in Days (Metrics Dashboard)
- Frame shows: KPI card "Meetings Booked"
- "This week" dropdown filter
- **11** meetings booked (large hero number)
- **+11 • 175%** growth badge (green, with trend arrow icon)
- **Key finding**: Monaco tracks "Meetings Booked" as the primary value metric. +175% growth in one week.
- **Design**: Dark card, large number (~48px), green growth badge with percentage + absolute change, time period dropdown

---

## Theme 3: "Agents working for you"

### Feature 3-1: TAM Builds Itself (Auto-scoring)
- Frame shows: Table with columns visible:
  - "Score" column: "A | 🔥 Burning" for all rows
  - "About" column: "Artificial In..." (truncated — "Artificial Intelligence" industry)
- Mouse cursor visible hovering over a row
- All accounts scored A/Burning — this is the top-of-TAM view
- **Key finding**: The "About" column auto-generates a description from enrichment data

### Feature 3-2: System Runs Itself (Pipeline kanban)
- Frame shows: Pipeline kanban board with two visible columns:
  - **Discovery** (20 deals): $817,214 total
    - Delve — $80,000
    - (empty card placeholder)
    - Backops — $36,000
    - Serval — $15,000
    - Vellum AI — $45,000
  - **Proposal** (8 deals): $327,036 total
    - LangSmith — $40,000
    - Log 10 — $35,000
    - Sphinx — $30,000
    - Parestisa — $12,000
    - (partially visible: Nono...)
- Each deal card: company logo (small), company name, deal value
- Column header: Stage name, deal count badge, total dollar value
- **Key finding**: Pipeline stages have total value aggregation in headers. Deal cards are compact (logo + name + value only). The "Discovery" stage has 20 deals worth $817K total.
- **Design**: Dark kanban cards, subtle borders, compact deal cards (~80px tall), column headers with count badges and dollar totals

### Feature 3-3: CRO Copilot (Ask AI Interface)
- Frame shows: "Ask AI" panel with sparkle icon header
- **Quick-action menu items** (partially visible, truncated on left):
  - "...iew" → likely "Overview"
  - "...d Sequences" → likely "Outbound Sequences"
  - "...mmary" → likely "Summary"
  - "...tunities" → likely "Opportunities"
- **Chat input at bottom**: "...est strategy for my TAM?" with send button (arrow icon)
- Blue accent line showing the selected/active menu item
- **Key finding**: Ask Monaco has BOTH pre-built quick actions (overview, sequences, summary, opportunities) AND freeform chat input. It's a hybrid menu+chat interface, not pure chat.
- **Design**: Dark panel, menu items as full-width rows, chat input at bottom with placeholder question, sparkle icon for AI branding

---

## Cross-cutting Design Observations from Feature Videos

### Visual Language
- **Theme**: Exclusively dark mode (#0a0b0f background)
- **Cards**: Rounded corners (~12px), subtle borders, floating on dark bg
- **Score badges**: "A | 🔥 Burning" pattern — letter grade + fire emoji + status word
- **Account stages**: Color-coded pills (gray, blue, purple, green, red, gold, pink)
- **Pipeline**: Kanban with deal cards showing logo + name + dollar value
- **Typography**: Clean sans-serif, ~14px for body, ~12px for meta, ~18px for headers
- **Icons**: Company logos auto-fetched from domains (real logos for real companies)
- **Animations**: Videos suggest smooth transitions and loading states (skeleton UI)

### Information Hierarchy
1. **Primary**: Company name + score (always visible)
2. **Secondary**: Stage/status, deal value, industry
3. **Tertiary**: Timestamps, channel badges, metadata

### Monaco vs Lightfield Design Comparison
| Aspect | Monaco | Lightfield |
|--------|--------|------------|
| Theme | Dark only | Light (dark available) |
| Density | High (more data per row) | Medium (more whitespace) |
| Pipeline | Kanban with dollar totals | Kanban with stage names |
| Scoring | A-F grades + 🔥 Burning | No scoring |
| Account stages | 7 color-coded stages | No lifecycle stages |
| Logo treatment | Small inline (20px) | Small inline with colored bg |
| Cards | Floating on dark bg | Full-width, minimal borders |
| Overall feel | Bloomberg terminal for sales | Notion for CRM |
