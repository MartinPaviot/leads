# Lightfield Teardown v2 — Exhaustive Feature Testing

**Date**: 2026-03-31
**Analyst**: Claude (autonomous)
**Method**: Playwright browser, pixel-level analysis, 35 NL chat queries
**Trial expires**: 2026-04-13 (13 days remaining)

---

## STEP L1: Global UI

### [001] Full Page After Login — Accounts List View
- Screenshot: 001-global-ui-full-page.png
- HTML source: _research/raw/lightfield-dashboard-v2.html

#### Sidebar (left, ~230px width)
- **Top section**:
  - User avatar (purple "MP" initials circle) + "Martin Paviot" name
  - Search button (🔍)
  - Collapse button (« chevrons)
- **Navigation — unnamed top**:
  - 🕐 "Up next" — (clock icon, likely priority/task view)
  - 🔔 "Notifications"
- **Records section** (label: "Records"):
  - 🏢 "Accounts" (active — highlighted with light bg)
  - 💼 "Opportunities"
  - 👤 "Contacts"
- **Resources section** (label: "Resources"):
  - ☑️ "Tasks"
  - 📅 "Meetings"
  - 📝 "Notes"
- **Lists section** (label: "Lists"):
  - ➕ "New list" button
- **Chats section** (label: "Chats"):
  - ➕ "New chat" button
  - Multiple chat history items visible (truncated titles)
  - Combobox at bottom for chat input
- **Bottom**: ? help icon
- **Sidebar background**: White (#ffffff), clean minimal design
- **Active item**: Accounts — light orange/peach background highlight

#### Top Bar (main content area)
- Left: 🏢 "Accounts" page title + "All" view toggle (grid icon) + "+" add button
- Right: "Import / Export" button (with refresh icon) + "+ Create account" button (outlined)
- Below: Filter bar — "Filter" button (left) + "Display" button (right)

#### Main Content Area
- **Table view** with 5 accounts visible:
  1. Dublin Software — IT & Services + Software — $10M to $... — last interaction...
  2. GulfTech — Machinery Manufacturing + Leasing + Manufa... — Less tha...
  3. TechFlow — Technology Services — $10M to $...
  4. NovaTech — IT And Services — $50M to $...
  5. Meridian Labs — Artificial Intelligence + FinTech — Less tha...
- **Footer row**: "5 count" + "+ Add operation" buttons for each column
- **Visible columns**: Account | Industry | Last interacti... | Reven...
- **Column headers** have sort icons (↓ on Last interaction)

#### Color Palette
- Background: White (#ffffff) for sidebar and content
- Active sidebar item: Light peach/orange (#FFF5EE or similar)
- Industry badges: Colored pills — green, grey, blue tones
- Text: Dark grey (#1a1a1a) for primary, medium grey for secondary
- Accent: Orange/amber for active states and highlights
- Borders: Very subtle light grey (#e5e7eb)

#### Typography
- Font: Sans-serif (likely Inter or system font stack)
- Sidebar labels: ~11px, uppercase tracking, medium grey
- Table headers: ~13px, medium weight
- Body text: ~14px, regular weight

#### Overall Layout
- Sidebar width: ~230px, collapsible
- No bottom bar/persistent chat input visible on this page
- Clean, minimal, lots of whitespace — "Notion for CRM" aesthetic
- Light theme only visible (no dark mode toggle observed)

---

## STEP L2: Accounts List Page

### [002] Accounts List View
- Screenshot: 002-accounts-list-view.png
- **Columns (9 total)**: Account | Industry | Last interaction | Revenue | Headcount | Last funding | LinkedIn | Website | Owner
- **5 accounts visible**: Dublin Software, GulfTech, TechFlow, NovaTech, Meridian Labs
- **Row height**: ~44px, each row shows account name + colored icon/logo
- **Industry tags**: Colored pill badges (green, grey, blue variants)
- **Revenue**: Range format ("$10M to $...", "$50M to $...", "Less tha...")
- **LinkedIn/Website**: Direct text links (gulftech-it, novatech.dev, meridianlabs.io)
- **Owner**: "Martin Paviot" with avatar for all — single user
- **Footer**: "5 count" + "+ Add operation" buttons per column (aggregation)
- **No bulk select checkbox** visible
- **No right-click context menu** — right-click shows browser default

### [003] Filter Dropdown
- Screenshot: 003-accounts-filter-dropdown.png
- **Filter fields (13)**: Industry, Last interaction, Next interaction, Created at, Revenue, Headcount, Last funding, Owner, Opportunity count, Facebook, Instagram, LinkedIn, Twitter
- **Search box**: "Search filters..." at top
- **Each filter has a chevron** → implies sub-menu with operators
- **Missing filters**: No filter for Account name, Website, Score/Priority, Tags, Custom fields

---

## STEP L3: Create Account via UI

### [005-006] Create Account Modal
- Screenshot: 005-create-account-form.png, 006-create-account-filled.png
- **Two-step process**:
  1. First modal: just "Name" field (text input, placeholder "Company name"). Create button disabled until name entered.
  2. After typing: autocomplete dropdown appears — "+ Create 'Test Corp v2' manually" option. Clicking it reveals second step.
  3. Second step: Name (pre-filled) + Website (text input, "Add domain and press Enter")
- **Warning message**: "Accounts created manually will not be automatically enriched." — implies Lightfield auto-enriches accounts created via other methods (import, API)
- **Fields available**: Only Name and Website. No Industry, Headcount, Revenue, Owner fields at creation time.
- **UX pattern**: Search-first with autocomplete — likely tries to match existing accounts or enrichment database before manual creation
- **After creation**: Redirects to account detail page (URL: /crm/account/{id}#overview)

---

## STEP L4: Account Detail Page

### [009] Account Detail — Test Corp v2 (newly created, empty)
- Screenshot: 009-account-detail-test-corp.png
- **Page URL**: /crm/account/{id}#overview

#### Header
- Auto-generated company logo (blue square with "TestCorp" text)
- Large company name: "Test Corp v2"
- Top bar: logo icon + "..." menu + 🔗 link button + "+" add button

#### Left Panel — Main Content
- **Account summary**: "Account summary not generated yet" (greyed placeholder)
- **About their business**: "About their business not generated yet" (greyed placeholder)
- **Upcoming meetings**: "No upcoming meetings" section with "See all" link
- **Chat section at bottom**:
  - Pill badge: "🟦 Test Corp v2" (context indicator — chat is scoped to this account)
  - Input: "Ask Lightfield" placeholder text
  - Bottom toolbar: 🕐 clock icon + ⚙️ settings icon + 🎤 microphone + 💬 chat bubble
  - This is the NL chat interface, scoped to the current account

#### Right Panel — Account Details Sidebar
- **Editable fields**:
  - 📋 Name: Test Corp v2
  - 💼 Opportunities: "Set opportunities" (clickable, empty)
  - 👤 Owner: "Set owner" (clickable, empty)
  - 🏭 Industry: "Set industry" (clickable, empty)
  - 👥 Headcount: "Set headcount" (clickable, empty)
  - 💰 Revenue: "Set revenue" (clickable, empty)
  - 🌐 Website: testcorp.com (pre-filled from creation)
  - 📅 Last interaction: "No past interactions"
  - 📅 Next interaction: "No upcoming interactions"
  - "See more ∨" — expandable, implies more fields
- **Opportunities section**: "No opportunities" below the details

#### Key Observations
- All fields are inline-editable (click to set)
- AI summary is auto-generated but needs data first ("not generated yet")
- Chat is SCOPED to the account — NL queries will be about this specific account
- Layout: 60/40 split — main content (left) / details sidebar (right)

