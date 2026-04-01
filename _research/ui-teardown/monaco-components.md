# Monaco Component Inventory - Extracted from Screenshots

## 1. TAM Table (Total Addressable Market)

**Source**: hero-0022, hero-0025, hero-0027, hero-0030, hero-0032, hero-0035, hero-0037, product screenshot 002

### Table Structure
- **Type**: Full-width data table with fixed headers
- **Background**: Dark (`#1A1A1E` rows on `#0D0D0D` background), alternating row shading barely visible
- **Row height**: ~36-40px (very dense, information-rich)
- **Header row**: Slightly darker, with column header icons + text

### Columns Visible (left to right)
1. **Checkbox**: Small square checkbox for multi-select (~20px)
2. **Account**: Company logo (small rounded square ~24px) + company name in white text
   - Companies visible: Judgment Labs, Bluenote, Nowadays, Parley, Backops, Flowline Health, Solve Intelligence, Juicebox, Delve, Sphinx, Casca, Serval, Campfire, Model ML
3. **Status**: Badge showing current state
   - "New" — plain gray text, no special styling
   - "Prospecting" — purple text (`#A855F7`) on subtle purple background
4. **Score**: Letter grade + fire emoji + text label
   - "A 🔥 Burning" — white "A", orange fire emoji, "Burning" text
   - "B 🔥 Burning" — same pattern with "B"
   - Score is NOT a number — it is a letter grade (A/B/C/D) + a "heat" descriptor
5. **Industries**: Colored pill badge with industry name
   - "Artificial Intell..." (truncated) — green/emerald badge
   - "Software dev..." — pink/magenta badge
   - Each has a single-letter suffix badge (F, P, Ir, C) in a small colored circle — likely a sub-category or source indicator
6. **Connected to**: Names of team members connected to this account
   - Shows 1-2 names: "Sam Blond", "Malay Desai", "Shek Viswanathan", "Tommy Hung", "Stan Rapp"
   - Some show name + second truncated name ("Tom...")
7. **Common Investor?**: Binary signal badge
   - "Yes" in bright green on dark green background
   - "No" in dim/muted styling
8. **Sales-led growth?**: Binary signal badge (same Yes/No styling)
9. **YC Co...** (truncated, likely "YC Company?"): Binary signal badge

### Signal Reasoning Popover
- **Triggered by**: Clicking "Yes" on a signal badge
- **Type**: Popover/tooltip panel
- **Content structure**:
  - Tab bar: "Reasoning" | "Sources" (tabs)
  - Reasoning text: "Judgment Labs common investors with Monaco include Founders Fund."
  - Source cards: 3 horizontal cards showing source articles
    - Each card: favicon + domain + article title (truncated)
    - Sources: "judgment labs.com", "blog.ycombinator.com", "menabar.com"
    - Each card has a colored circle icon (red, orange, purple)
- **Background**: Dark surface (`#2A2A2E`)
- **Border radius**: ~12px

### Expandable Contact Row
- **Visible in**: hero-0037
- **When account row is expanded**: Shows contact list below
- **Format**: Name + Title + Status
  - "Enyu Rao — Founding Ops & Growth — Suggested (green)"
  - "Andrew Li — Co-founder — Suggested (green)"
  - "Alex Shan — Co-founder — Suggested (green)"
- **Indented** under the parent account row

---

## 2. Sequence Builder

**Source**: hero-0040, hero-0042, product screenshot 004

### Layout
- **Type**: Vertical timeline/flowchart
- **Header**: "Sam Blond to Alex Shan (Co-Founder)" — sender → recipient with title
- **Background**: Dark card (`#1A1A1E`) with subtle border, rounded corners (~12px)

### Step Components
Each step is a node in the vertical timeline:

1. **Step node**: Numbered circle (1, 2, 3) + step title + date
   - Circle: Small filled circle with step number, purple/dark tint
   - Title: "Fundraise gifting" in white text
   - Date: "Today, Feb 11" in gray
   - First step has a highlighted/active background (subtle purple tint)

2. **Wait node**: Clock icon + "Wait 3 business days"
   - Icon: Small circle with clock symbol
   - Text: Gray, secondary weight

3. **Connecting lines**: Thin vertical gray lines between steps

### Steps in Demo Sequence
1. "Fundraise gifting" (Today, Feb 11)
   - Wait 3 business days
2. "Gift reminder"
   - Wait 3 business days
3. "Final message"

### Email Preview (Right Panel)
- **Type**: Split-panel detail view next to sequence
- **Fields**:
  - Recipient: "Alex Shan"
  - Subject: "Congrats on the fundraise!"
  - Gift: Product card showing "Veuve Clicquot Yellow Label Brut 750ml" with bottle image (dark card with product photo)
  - Message: Personalized email body text
    - "Hi Alex - congrats on the recent fundraise!"
    - "Sending a bottle of Veuve your way as a quick congrats."
    - "I'm one of the founders of Monaco - we're an end to end revenue platform replacing CRM and all the disparate point solutions that integrate over APIs."
    - "The value prop is: you will grow revenue faster by using Monaco, and I will be a GTM advisor to your business."

---

## 3. Approval Controls (Start/Reject)

**Source**: hero-0050

### Layout
- **Position**: Bottom of the sequence/email preview panel
- **Components**:
  - **Reject button**: Square button with thumbs-down icon, outlined style (gray border on dark bg)
  - **Start button**: Large pill-shaped white button with black text "Start"
    - Fully rounded corners (pill shape)
    - White fill, black text
    - Prominent — clearly the primary CTA
- **Cursor**: Animated cursor pointing at "Start" button (product demo)
- **Human-in-the-loop design**: User must explicitly approve or reject AI-generated sequences

---

## 4. Chat / Email Thread View

**Source**: hero-0055, hero-0057

### Response Bubble
- **Type**: Chat-bubble style message display
- **Header**: "Response from Alex Shan" — small gray label
- **Body**: White text on dark surface
  - "Thanks for the Veuve! I'm interested in learning more. Here's my calendar, please book whatever time works for you."
- **Metadata**: "2 hrs ago" timestamp + "Email" badge (envelope icon + "Email" label on subtle background)
- **Avatar**: Small circular photo of Alex Shan, positioned at bottom-left of the message bubble

### Reply Bubble
- **Type**: Slightly different styling for outgoing messages
- **Body**: "Let's meet Tuesday at 1pm, I'll give you a walkthrough!"
- **Metadata**: "1 minute ago" + "Email" badge
- **Alignment**: Appears on the right (outgoing) vs left (incoming)

### Suggested Reply Input
- **Type**: Input area at bottom of chat
- **Label**: "Suggested reply" in small gray text above
- **Content**: Pre-filled text ("Let's meet Tuesday at 1pm,|" with cursor)
- **Toolbar**: B (bold), I (italic), list icon, numbered list icon — basic rich text formatting
- **Footer**: "Sent from sam@monaco.com" — right-aligned, gray text
- **Send button**: Circular arrow-up icon (send), white

---

## 5. Meeting Recordings Grid

**Source**: hero-0060

### Layout
- **Type**: Card grid (3-4 columns, multiple rows)
- **Each card**:
  - Title: "Monaco Demo Call for [Company Name]" in white text
  - Subtitle: "Video Meeting" in gray text
  - Link: "View more" or similar action text
  - Background: Dark card (`#2A2A2E`)
  - Border radius: ~8-12px
  - Selected card: Blue-teal highlight/glow border (Judgment Labs card is selected)
- **Companies visible**: Delve, Campfire, AgentFlow, Judgment Labs, Galileo AI, Serval, Solve Intelligence, Casca, Singularity Tech, Adept AI

### Toast Notification
- **Position**: Bottom center
- **Content**: "New opportunity created" with green checkmark icon
- **Style**: Dark pill shape with green accent

---

## 6. Meeting Recorder / Video Player

**Source**: hero-0062, hero-0065, hero-0067, product screenshot 005

### Split-Panel Layout
- **Left panel**: Video player (large, ~60% width)
  - Video feed showing meeting participant (Alex Shan)
  - Name tag overlay: "Alex Shan" in a rounded gray badge, top-left
  - Recording indicator: Red dot, top-right
  - Play controls: Pause/play button, timestamp "3:00 / 33:00" or "2:59 / 33:00", volume, fullscreen, more (3-dot menu)
  - Progress bar: Thin white line
- **Right panel**: AI-generated notes (~40% width)
  - **Meeting Notes label**: Small gray text
  - **Title**: "Virtual Meeting with Alex Shan" in white, semibold
  - **Summary**: Paragraph of AI-generated notes
    - "Great first call with Alex at Judgment Labs. Strong interest in Monaco's agent capabilities for generating demand and increasing conversion rates to grow revenue faster. Engaged, asked detailed technical questions about integrations."
  - **Key Points** section (bold header):
    - Bullet list: "Current CRM is Hubspot", "Point solutions are Apollo and Fireflies"
  - **Budget and Team Size** section (bold header, appears as notes progress):
    - "Current budget is $30,000"
    - "Sales team size is 4"
  - Notes are structured into MULTIPLE sections that appear progressively as meeting progresses
  - **Background**: Dark surface

---

## 7. Account Detail Card (Auto-Populated)

**Source**: hero-0070, hero-0072

### Layout
- **Type**: Card/panel with company info
- **Header**: Company logo (rounded square) + company name ("Judgment Labs") in large white text
- **Fields** (icon + label + value format):
  - 👥 Size of Sales Team: "4" (or "Updating..." during loading)
  - 📄 Current CRM: "Hubspot" (or "Updating...")
  - 📧 Point Solutions: "Apollo, Fireflies" (or "Updating...")
  - $ Budget: "$30,000" (or "Updating...")
- **Loading state**: Gray "Updating..." text replaces value, implies real-time data extraction from meeting conversation
- **Border radius**: ~12px
- **Background**: Dark card surface

### Key Design Pattern
The account fields are automatically populated FROM the meeting conversation. The "Updating..." state shows the system is extracting structured data from unstructured conversation in real-time.

---

## 8. Pipeline View

**Source**: hero-0075, product screenshot 006

### Layout
- **Type**: Vertical list of deal cards (NOT a horizontal kanban board)
- **Each card**:
  - Company logo (rounded square, ~40-48px)
  - Company name in white text
  - Deal value below name in gray ("$30,000", "$45,000", "$55,000", etc.)
  - Lightning bolt or sparkle icon on some cards (e.g., Judgment Labs has a small icon)
  - Background: Dark card surface
  - Border radius: ~12px
  - Selected card has a subtle highlight/border

### Companies and Values Visible
| Company | Deal Value |
|---------|-----------|
| Dust | $55,000 |
| Judgment Labs | $30,000 |
| Vellum AI | $45,000 |
| LangSmith | $40,000 |
| Nango | $35,000 |
| Akka | $40,000 |
| Log10 | $35,000 |
| Adept AI | $40,000 |
| Galileo AI | $50,000 |
| Nevara AI | $4,250 |

### Deal Detail Panel (Right Side)
- **Header**: "Overview"
- **Summary section**: AI-generated text
  - "Judgment Labs in active evaluation stage: demo completed and follow-up sessions... Slack channel opened and product matches criteria... next step is deeper walkthrough with broader stakeholder group. Owner Sam Blond. E... Date: November 30, 2025"
- **Timeline entries** (bulleted with dates):
  - "October 27, 2025: Monaco <> Judgment Labs... up session scheduled to go deeper on sequences, and pipeline workflows with... platform size."
  - "October 23, 2025: Slack channel opened... Monaco and Judgment Labs; product workflows shared; Provisioned access... implementation tasks."

---

## 9. Follow-up Email Composer

**Source**: hero-0077

### Layout
- **Type**: Modal/overlay panel
- **Header**: Envelope icon + "Follow-up email" title
- **Fields**:
  - Recipient: "Alex Shan"
  - Subject: "Judgment Labs + Monaco - Next Steps"
- **Body**: Pre-drafted email with AI-generated content
  - "Hey Alex!"
  - "Excited to migrate you over to Monaco! Here are the next steps we discussed on our call:"
  - Bullet list of action items:
    - "Sam to setup a shared Slack channel with the Judgment Labs team"
    - "Alex to confirm availability for onboarding call"
    - "Alex to send over any sales collateral to start t[raining the agents]" (truncated)
  - "Looking forward to working with you."
  - "Sam"
- **Actions**: "Send" button (green/teal `#22C55E` background, white text, bottom-right, small pill shape ~60x28px)
- **Bottom toolbar**: Formatting icons — attachment (paperclip), B (bold), I (italic), unordered list, ordered list
- **Border radius**: ~16px
- **Background**: Dark elevated surface with subtle border

---

## 10. Ask AI / CRO Copilot Chat Panel

**Source**: hero-0082, hero-0085, product screenshot 007

### Panel Structure
- **Type**: Floating modal/panel, centered on screen
- **Header bar**:
  - Monaco logo icon (crosshatch) + "Ask AI" text
  - Right icons: lightbulb icon (suggestions?), copy/expand icon, close (X) button
- **Chat area**: Large dark surface for conversation
- **Input bar**: Bottom of panel
  - Left: Back arrow (←)
  - Center: "Ask follow-up" placeholder text
  - Right: Send button (circular arrow-up icon)
- **Border radius**: ~12-16px
- **Background**: Medium-dark gray (`#2A2A2E` to `#333338`)

### AI Response Content
When a query is submitted (e.g., "How could I have done a better job on the Judgment Labs demo?"):
- **Title**: Bold, assertive headline — "You Lost Control - This Demo Was About You, Not Their Pain"
- **Bullet points**: Specific, actionable coaching feedback
  - "You let the intro linger, and waited too long to set agenda or show the product, wasting Alex's attention."
  - "Demo focused on Monaco's features, not Judgment Labs' pain. Alex mentioned frustration with his existing set of tools and you never asked why."
  - "Ended without a time confirmed calendar invite sent for the onboarding call. This introduces risk that the opportunity will be delayed and time kills all deals."
- **Tone**: Blunt, direct, sales-coach style — not polite pleasantries
- **Style**: White text on dark background, standard body text with bullet formatting

---

## 11. Dashboard / Home View

**Source**: hero-0087, hero-0090, hero-0092

### Layout
- **Type**: Two-column dashboard
- **Header section**:
  - Greeting: "Good morning, Sam" (small text)
  - Summary stats: "This week, we've launched 45 sequences, received 12 responses, booked 2 meetings, and closed 8 opportunities."

### Left Column: "Your priorities today"
- **Header**: "Your priorities today" with "See All" link
- **Task cards** (list format):
  1. **"Nudge Alex Shan"**
     - Subtitle: "Judgment Labs - Opportunity: Qualification - $30,000"
     - Description: "Alex hasn't responded to your meeting follow up email"
     - Status badge: "Stalled 3 days" (red/warning)
  2. **"Respond to Gabriel Hubert"**
     - Subtitle: "Dust - Opportunity: Qualification - $55,000"
     - Description: "Monroe asked if next Wednesday works for the follow up session"
     - Status: "Received 5 days ago"
  3. **"Set up shared Slack channel"**
     - Subtitle: "Judgment Labs - Opportunity: Qualification - $30,000"
     - Description: "Send Slack channel invite to Alex Shan"
     - Due date: "Due Feb 15"
  4. **"Send collateral"**
     - Subtitle: "Compass - Opportunity: Discovery - $43,000"
     - Description: "Send sales collateral as discussed in demo to James Chan and Kyle Jordan"
     - Due date: "Due Feb 16"
- **Checkmark icons**: Each task has a check circle that can be completed

### Right Column: "Your 2 meetings today" + Email
- **Meetings section**: "Your 2 meetings today" with "See All"
  - "Remotely Demo 2" — time shown
  - "Philip (AfterPay) & Sam" — time shown
- **Email/nudge detail panel** (right side):
  - **Header**: "Nudge Alex Shan (CEO)" + "Respond from Inbox" button (blue)
  - **Thread**: Shows email conversation
    - Subject/context: "Judgment Labs + Monaco - Next Steps"
    - Email body with action items (same follow-up content)
    - Metadata: "3 days ago" + "Email" badge
  - **Draft reply**: Pre-composed follow-up message
    - "Hey Alex - I'm following up on my message from Tuesday."
    - "Can you confirm a time that works for you to schedule our onboarding call? Alternatively, pick anytime here on my calendar."
    - "Sent from sam@monaco.com"

### Bottom Navigation Bar
- **Type**: Fixed bottom toolbar, centered horizontally
- **Background**: Dark bar with subtle top border
- **Icons** (left to right, approximately 8 icons):
  1. Home/dashboard icon (house shape)
  2. Forward arrow / send icon
  3. Play/triangle icon (sequences?)
  4. Clock/calendar icon (meetings?)
  5. Grid icon (pipeline/accounts?)
  6. Chart/bar icon (analytics?)
  7. Gear icon (settings)
  8. Additional icon
- **Style**: White/gray outline icons, ~20px, evenly spaced
- **Active state**: Slightly brighter/white for currently active section

---

## 12. Industry Badge

**Source**: hero-0022, hero-0025, hero-0030

### Design
- **Type**: Colored pill/tag
- **Text**: Industry name, truncated with "..." if too long ("Artificial Intell...", "Software dev...")
- **Colors**: Multiple distinct colors per industry:
  - Green/emerald for "Artificial Intell..."
  - Pink/magenta for "Software dev..."
- **Suffix badge**: Small circular badge with a single letter (F, P, Ir, C) right after the pill
  - Different colors per letter (brown, purple, dark, colored)
  - Purpose unclear — possibly funding stage, source, or sub-category
- **Border radius**: ~4px (small rounded rect)
- **Size**: Compact, fits within table cell

---

## 13. Testimonial Cards

**Source**: hero-0100, product screenshots 008, 009

### Design
- **Type**: Quote card
- **Content**: Customer quote in white text with quotation marks
  - "LOVE LOVE LOVE Monaco, they are awesome and my team and I love the platform. Highly recommend."
- **Attribution**: Avatar photo (circular, ~40px) + Name + Title
  - "Fatima Sabar — CEO & Co-Founder, Bluenote"
- **Background**: Dark card with subtle border
- **Border radius**: ~12px
- **Layout on marketing page**: Multiple cards in a grid, with heading "The results speak for themselves"

---

## 14. Website Navigation

**Source**: product screenshots 001, 008, 009

### Top Nav Bar
- **Left**: Monaco logo (crosshatch icon + "MONACO" text)
- **Center/Left links**: "Product", "Company" — minimal nav items
- **Right**: "Login" (text link), "Request demo" (outlined button or subtle CTA)
- **Style**: Minimal, dark background, white text, no background fill on nav

---

## 15. Ashby Jobs Page

**Source**: product screenshot 016

### Layout
- **Header**: Monaco logo (large, centered)
- **Title**: "Open Positions (8)"
- **Sections** (job departments):
  - **Design**: "AI Product Designer" (Design, San Francisco, Full time, On-site)
  - **Engineering**: "AI Engineer", "Frontend Engineer", "Product Backend Engineer", "Senior Platform Engineer" (all Engineering, SF, Full time, On-site)
  - **Sales**: "Client Operations", "Forward-Deployed Account Executive", "Founding Account Manager" (Sales, SF, Full time, On-site)
- **Style**: Clean, minimal, white/light page (this is Ashby's styling, not Monaco's product)
- **Footer**: "Powered by Ashby" + Privacy Policy, Security, Vulnerability Disclosure links

---

## 16. Toast Notification

**Source**: hero-0060

### Design
- **Type**: Bottom-center toast
- **Content**: Green checkmark icon + "New opportunity created"
- **Style**: Dark pill with green accent
- **Duration**: Temporary, auto-dismiss
- **Position**: Fixed at bottom-center of viewport

---

## 17. "How could I have" Text Animation

**Source**: hero-0080

### Design
- **Type**: Full-screen text overlay (kinetic typography)
- **Content**: "How could I have |" with blinking cursor
- **Background**: Dark charcoal (`#333338`)
- **Typography**: Large display text (~48px), light weight, white
- **Purpose**: Introduces the Ask AI feature — text types out the user's question before showing the AI response
- **Animation**: Typewriter effect, character by character

---

## 18. Contact Avatar Ring

**Source**: hero-0022, hero-0037

### Design
- **Type**: Circular avatar with colored ring
- **Ring colors**: Vary per person — pink, purple, green, brown, orange
- **Size**: Small (~20-24px) when inline in table
- **Purpose**: Visual differentiation of team members in "Connected to" column

---

## 19. Score Display System

**Source**: hero-0022, hero-0025, hero-0027, hero-0030

### Structure
The score is a COMPOSITE display with three parts:
1. **Letter grade**: A, B (possibly C, D — only A and B visible in screenshots)
   - White text, medium weight
2. **Fire emoji**: 🔥 standard emoji (orange/red)
3. **Heat label**: "Burning" text in gray/secondary color

### Color coding
- All visible scores show "A 🔥 Burning" or "B 🔥 Burning"
- The fire emoji provides the color pop (orange)
- No progress bars, gauges, or numeric scores visible
- The system appears to be: Letter grade (fit quality) + Heat level (timing/urgency)

---

## 20. Status Badge

**Source**: hero-0022, hero-0035

### Variants
| Status | Style |
|--------|-------|
| "New" | Plain gray text, minimal styling, no background |
| "Prospecting" | Purple text on subtle purple background, rounded rect |

### Design
- **Border radius**: ~4px
- **Padding**: Compact (~4px vertical, ~8px horizontal)
- **No other statuses visible** in screenshots (likely more exist: Qualified, Closed, etc.)
