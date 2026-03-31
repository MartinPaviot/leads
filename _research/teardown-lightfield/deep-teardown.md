# Lightfield Deep Teardown — Page by Page

**Date**: 2026-03-30
**Version**: Live product (trial account lf-signup@elevay.dev)

---

## ACCOUNTS PAGE

### Table View (List)

**Columns visible by default**: Account (with logo), Industry (multi-tag pills), Last interaction (date), Revenue (range)

**All available columns** (from Display panel, 16 total):
1. Account (always shown, first column)
2. Industry — multi-tag color pills (e.g. "Artificial Intelligence", "FinTech", "Technology Services")
3. Last interaction — date
4. Revenue — range buckets: "Less than $1M", "$10M to $50M", "$50M to $100M"
5. Headcount — range buckets: "11-50", "101-250", "501-1000"
6. Last funding — stage: "Seed", "Undisclosed"
7. LinkedIn — company page URL (e.g. "meridianbioscience")
8. Website — domain link (e.g. meridianlabs.io)
9. Owner — user avatar + name (e.g. "MP Martin Paviot")
10. Created at — timestamp
11. Next interaction — date
12. Opportunity count — number
13. Facebook — page URL
14. Instagram — handle
15. Memo — free text
16. Location — text
17. Twitter — handle

**Table features**:
- Column headers: icon + label, each with sort button (arrow icon)
- Columns are resizable (drag handles on each column border)
- Summary row at bottom: "5 count" + "Add operation" button per column (likely aggregation: sum, avg, etc.)
- Sorting: configurable via Display panel, default is "Last interaction" descending
- Display panel: "Save default for everyone" (workspace-level)

**Filter menu** (searchable, 13 filterable properties):
Industry, Last interaction, Next interaction, Created at, Revenue, Headcount, Last funding, Owner, Opportunity count, Facebook, Instagram, LinkedIn, Twitter
- Search input at top: "Search filters..."
- Each filter: icon + label, click to add as active filter
- Active filters show as pills in sub-bar (e.g. "Status is any of 2 values" on Tasks page)

**Keyboard shortcuts**:
- **Ctrl+K**: Command palette (search + navigate: New chat, Up next, Accounts, Opportunities, Contacts, Tasks, Meetings)
- **Escape**: Close modals/dialogs/palette

**Top bar**: "Accounts" label, "All" view toggle (with + to add views), Import/Export dropdown, "Create account" button
**Sub-bar**: "Filter" button, "Display" button

### Auto-Enrichment (Critical Finding)

All 5 accounts were auto-enriched after creation with ZERO input from me beyond the company name and domain:

| Account | Domain | Industry (enriched) | Revenue (enriched) | Headcount (enriched) | Funding (enriched) | LinkedIn (enriched) | Accuracy |
|---------|--------|--------------------|--------------------|---------------------|--------------------|--------------------|----------|
| Dublin Software | dublinsoft.ie | IT & Services, Software | $10M-$50M | — | — | — | Unknown (can't verify) |
| GulfTech | gulftech.sa | Machinery Mfg, Leasing, Mfg, Client Service, Engineering, Food Processing, Fresh Cut Fruit | <$1M | — | — | gulftech-it | WRONG — matched to different company |
| TechFlow | techflow.fr | Technology Services | $10M-$50M | 101-250 | Undisclosed | techfloworguk | WRONG — matched UK company, not French |
| NovaTech | novatech.dev | IT And Services | $50M-$100M | 501-1000 | Undisclosed | nova-tech-it | WRONG — matched large company, not seed startup |
| Meridian Labs | meridianlabs.io | AI, FinTech | <$1M | 11-50 | Seed | meridianbioscience | PARTIALLY WRONG — industry correct, LinkedIn wrong company |

**Enrichment accuracy: ~20%** for LinkedIn matching, ~40% for industry, ~30% for revenue/headcount. The enrichment system matches domains to known companies but frequently matches the WRONG entity — a common problem with enrichment APIs.

**GulfTech enrichment catastrophe**: "Machinery Manufacturing, Leasing, Manufacturing, Client Service, Engineering, Food Processing, Fresh Cut Fruit" — this is the enrichment data for a Saudi industrial/food processing company called GulfTech, not a tech company. The domain gulftech.sa confused the enrichment API.

### Account Detail Page

**Layout**: Three-column (sidebar | main content | detail panel)

**Main content (left/center)**:
- Company logo (large, from enrichment/domain favicon)
- Company name (editable inline textbox)
- **Account summary** (AI-generated): Synthesizes all known context. Example: "Met Sarah Chen (CTO) at SaaStr 2025; she expressed interest in Elevay's API product. No defined next steps or active opportunities are recorded."
- **About their business** (AI-generated from web): "Meridian Labs develops artificial intelligence solutions for the financial services sector, likely generating revenue by providing AI-powered software and services to fintech and related organizations."
- **Upcoming meetings** section: Shows meetings or "No upcoming meetings"
- **Open tasks** section: Shows tasks or "No open tasks"
- **Activity feed**: Chronological audit trail of all actions:
  - "Martin Paviot created the note Sarah Chen - SaaStr 2025 · 1h ago"
  - "Martin Paviot created the contact Sarah Chen · 1h ago"
  - "Martin Paviot added Sarah Chen to Meridian Labs · 1h ago"
  - "Lightfield set About their business · 1h ago" (system-generated)
  - "Martin Paviot updated 2 fields · 1h ago" (expandable)
  - Each entry has: avatar, actor name (linked), action verb, entity name (linked), relative timestamp, "..." menu
- **Contextual chat**: "Ask Lightfield" with "Meridian Labs" label above input — queries scoped to this account

**Detail panel (right, toggle-able)**:
- Properties in labeled rows, each with icon + label + editable value + copy button:
  - Name, Opportunities, Owner, Industry, Headcount, Revenue, Website, Last interaction, Next interaction
  - "See more" expander for additional fields
- Linked record sections:
  - Opportunities (No opportunities)
  - Lists (No lists)
  - Contacts: Shows linked contacts with initials + name (Sarah Chen)
  - Meetings (No meetings)
  - Tasks (No tasks)
  - Notes: Shows linked notes with title + timestamp ("Sarah Chen - SaaStr 2025 · Edited 1h ago")
- Each section has "See all" link to filtered view

**Top bar**: Account logo/icon, "..." menu button (actions), copy link button, "+" button (quick add)

---

## CSV IMPORT

**Tool**: OneSchema (third-party embedded, cross-origin iframe)
**Step 1**: Header row selection — radio buttons per row, shows all data in table
**Step 2**: Column mapping — auto-maps columns with "Suggest mappings" AI feature
**Step 3**: Review & Finalize — editable spreadsheet (AG Grid), AI correction, search/replace, export
**Blocker**: Account Name column has hard validation — must match existing accounts. Can't create new accounts during contact import.
**Max rows**: 10,000
**Localization**: Detected browser locale (French UI for our machine)

---

## CHAT / AGENT INTERFACE

### Chat Input
- Always present at bottom of every page
- Placeholder: "Ask Lightfield"
- When on account/contact page: shows entity name as context label above input
- Toolbar below input: history button, settings button | microphone button, send button
- "Upload file" button in toolbar
- File drag-and-drop supported

### Suggestion Prompts (new chat page)
8 pre-built suggestions:
1. "Enrich my new accounts using the web"
2. "Summarize my active opportunities"
3. "Which of my opportunities need updating?"
4. "What's the deal value in my active opportunities?"
5. "Draft an email to customers I need to follow up with today"
6. "Prep me for my meetings today"
7. "Generate tasks from my last meeting"
8. "Research my accounts to determine my ICP"

### Chat Thread Features
- Thread title auto-generated from first message (truncated in sidebar)
- "Copy this page link" button
- "New chat" link
- "..." menu on thread title
- Chat history in sidebar under "Chats" section
- Each thread shows icon (in-progress spinner when processing, checkmark when done)

### AI Response Patterns

**Tool use display**: Expandable sections showing what the AI did:
- "Retrieved CRM data" — collapsed by default, expands to show:
  - What was searched ("Retrieved 'Sarah Chen'")
  - What was found (tables of contacts, accounts, opportunities, notes, etc.)
  - "Searched CRM records" with structured results
- "Ran code" — collapsed, shows Python code + output
- "Analyzed data" — collapsed, shows analysis results

**Entity references**: Inline clickable links with rich formatting:
- Contacts: colored circle initials + name (e.g. "SC Sarah Chen")
- Accounts: tiny logo + name (e.g. "🔷 Meridian Labs")
- Notes: icon + title (e.g. "📄 Sarah Chen - SaaStr 2025")
- All clickable, open in slide-over panel

**Email composer**: Opens as right-side slide panel from chat. Fields:
- To (with tags, editable, deletable)
- Cc/Bcc (expandable)
- From (shows "No email account connected" if no OAuth)
- Subject (text input)
- Body (rich text, multi-paragraph)
- Send button (green, prominent)

**Human-in-the-loop approval cards**: For record creation:
- Grouped by entity type with batch title (e.g. "SaaStr & new leads")
- Per-record card: entity details, Dismiss (X) button, Approve (✓) button
- Batch actions: "Create all N" / "Dismiss all"
- "Ask every time" toggle with dropdown
- Each card is editable before approval (click name/email to edit inline)
- After approval: card shows green "Created" badge

---

## INFORMATION ARCHITECTURE

### Navigation Hierarchy

```
Sidebar (220px, collapsible)
├── User button (avatar + name)
├── Search button
├── Settings button
├── Up next (default landing page)
├── Notifications
├── Records
│   ├── Accounts
│   ├── Opportunities
│   └── Contacts
├── Resources
│   ├── Tasks
│   ├── Meetings
│   └── Notes
├── Lists
│   └── + New list
└── Chats
    ├── + New chat
    └── [Thread 1, Thread 2, ...]
```

### Page URLs
- `/crm/up-next` — default landing
- `/crm/accounts` — account list
- `/crm/account/{id}` — account detail (hash: #overview, #contacts, #meetings, #tasks, #notes)
- `/crm/contacts` — contact list
- `/crm/opportunities` — opportunity list
- `/crm/tasks` — task list
- `/crm/meetings` — meeting list
- `/crm/notes` — note list
- `/crm/agent` — new chat
- `/crm/thread/{id}` — chat thread
- `/crm/settings/mail-and-calendar` — mail sync settings
- `/crm/member/{id}` — member profile

### Default Landing: "Up next"
- Date header (today's date)
- Meetings section with "Today" filter dropdown
- Tasks section with "Today" filter dropdown + settings button
- "Just me" / "My team" toggle
- "+ Create" button in top right

---

## DESIGN LANGUAGE (Detailed)

### Color Palette
- **Background**: #FFFFFF (white, light mode)
- **Surface/cards**: #FAFAFA (very light gray)
- **Sidebar**: #FAFAFA with left border
- **Sidebar active item**: Light blue-gray highlight
- **Text primary**: #1A1A2E (near-black)
- **Text secondary**: #6B7280 (muted gray)
- **Text muted**: #9CA3AF (light gray, for timestamps, placeholders)
- **Accent/links**: #B45309 (warm amber/brown) — very distinctive, NOT blue
- **Tags/pills**:
  - Green: for "Artificial Intelligence" industry
  - Blue: for "FinTech" industry
  - Orange: for "Information Technology"
  - Gray: for generic tags
- **Buttons**:
  - Primary: Blue (#3B82F6) — "Send" button
  - Secondary: Light gray border + text
  - Ghost: Text-only, no border
- **Success**: Green checkmarks, "Created" badges
- **Error**: Red/orange highlights (CSV import errors)
- **Chat AI avatar**: Lightfield logo (X mark) with warm tint

### Typography
- **Font**: Inter (or system sans-serif fallback)
- **Account name** (detail page): ~24px, semibold
- **Section headers**: 12px, uppercase, gray (#6B7280), tracked slightly
- **Table headers**: 13px, normal weight, with column icons
- **Table cells**: 14px, normal weight
- **Chat messages**: 14px, line-height ~1.6
- **Entity initials**: 11px, bold, white on colored circles
- **Timestamps**: 12px, light gray, relative ("1h ago")
- **Button text**: 14px, medium weight

### Spacing
- **Sidebar width**: ~220px
- **Detail panel width**: ~320px
- **Table row height**: ~44px
- **Card padding**: 12-16px
- **Section gaps**: 24px between major sections
- **Chat message gap**: 16px between messages

### Component Patterns
- **Entity pills**: Colored circle (14x14px) with 2-letter initials + name text. Clickable.
- **Account logos**: Small (20x20px) auto-generated from domain. Colored background with initial or favicon.
- **Tag pills**: Rounded rectangle, colored background with matching text, 11-12px font
- **Property rows**: Icon (16px, gray) + label (gray, 13px) + value (black, 14px, editable) + copy button (on hover)
- **Activity entries**: Avatar (24px circle) + rich text with linked entities + relative timestamp + "..." menu
- **Approval cards**: Full-width, subtle border, entity details on left, Dismiss/Approve on right
- **Collapsible sections**: Button with title, chevron icon, expands to show content
- **"See more" / "See all"**: Text link buttons at section bottom/header

### Empty States
- **No accounts**: "No accounts. Lightfield automatically creates accounts from your mail and calendar activity." + "Go to settings →"
- **No opportunities**: "No opportunities" (simple text)
- **No upcoming meetings**: "No upcoming meetings" (simple text)
- **No tasks**: "No open tasks" or "No tasks" (simple text)
- Pattern: Bold title + optional subtitle + optional CTA link

### Loading States
- Page transitions: near-instant (SPA navigation)
- Chat thinking: "Thinking..." with animated dots, Lightfield logo
- Record creation: "Creating profile..." / "Preparing your workspace..." with spinner
- Table loading: brief empty state then data appears

### Keyboard Shortcuts
- **Ctrl+K / Cmd+K**: Opens command palette
  - Search input: "Type a command or search..."
  - "Navigate to" section: New chat, Up next, Accounts, Opportunities, Contacts, Tasks, Meetings (at minimum)
  - Searchable — type to filter commands and navigate
  - Screenshot: screenshots/002-command-palette-ctrl-k.png
- **Escape**: Closes modals, dialogs, command palette
- **Enter**: Submits chat input
- No "?" shortcut overlay found

### Microcopy Tone
- Professional but conversational
- First person from AI: "I'll look up..." / "Let me pull that..." / "I couldn't find..."
- Transparent about process: "I'll look up all the accounts simultaneously first, then create everything at once."
- Honest about limitations: "No email account connected" / "I couldn't find any account called..."
- Section headers: Noun-based ("Account summary", "About their business", "Activity")
- Timestamps: Relative ("1h ago"), full date on hover

### Create Account Dialog (UI — NOT chat)
**Fields**: ONLY "Name" (text input, "Company name" placeholder)
**No other fields**: No website, industry, size, or any other field. Just the company name.
**Button**: "Create" (disabled until name entered)
**Design philosophy**: Absolute minimum friction — name only, everything else auto-enriched after creation.
**Comparison**: Lightfield create form (1 field) vs typical CRM (5-10 fields) — radically simpler.
**Post-creation**: Redirects to account detail page where all auto-enriched data populates.
**Screenshot**: screenshots/001-create-account-dialog.png

---

## CONTACTS PAGE

### Table View
**Default columns**: Name (with avatar), Account (logo+name, clickable), Last interaction, Job title, Email addresses, LinkedIn
**Sorting**: Default by Last interaction descending
**Summary row**: "5 count" + "Add operation" per column
**Special character handling**: Arabic (محمد العلي), apostrophe (O'Brien), French (Directeur Commercial) all render correctly
**Auto-enrichment**: LinkedIn auto-filled for محمد العلي (wrong person: mohammed-sarafndy-8b564386)
**Account linking**: Account column shows logo+name as clickable link that filters contacts by account

---

## OPPORTUNITIES PAGE

### Kanban Board (DEFAULT view)
**7 stages**: Lead → Qualification → Demo → Trial → Proposal → Won → Lost
Each column has:
- Colored status dot icon (progressing from empty to filled)
- Stage name label
- "+ Create opportunity" button
- Settings "..." button

### Create Opportunity Dialog
**Fields**:
- Account (required*) — searchable dropdown with account logos
- Opportunity name (required*) — defaults to "New business"
- Stage (required*) — dropdown, defaults to "Lead"
- Contacts (optional) — multi-select

### Opportunity Detail Page
**URL**: `/crm/account/{accountId}/opportunity/{opportunityId}#overview`
**Breadcrumb**: Account logo > Account name / Opportunity name

**Main content**: Opportunity name (editable), Opportunity summary (AI-generated, empty until activity exists), Upcoming meetings, Open tasks, Activity feed, Contextual chat (shows both opportunity + account as context labels)

**Detail panel properties**:
1. Name (editable)
2. Account (linked)
3. Owner (linked)
4. Stage (dropdown)
5. Last interaction
6. Next interaction
7. Close date (date picker)
8. Deal value (number input)
9. Competitors (text input)
10. Next steps (text input)
11. "See more" for additional fields

**Related sections**: Contacts, Lists, Meetings, Tasks, Notes

---

## TASKS PAGE

- Pre-applied filter: Status "is any of" "2 values" (active tasks)
- "Create task" button in top right
- Filter + Display buttons
- Empty state: "No tasks. Tasks associated with accounts and opportunities will appear here." + "Create task" CTA

---

## MEETINGS PAGE

- Pre-applied filter: "Meeting date after 1 day ago"
- **NO "Create meeting" button** — meetings are auto-captured from calendar, NOT manually created
- This is a READ resource, not WRITE — key product decision
- Empty state: "No meetings. Lightfield automatically syncs meetings from your calendar activity." + "Go to settings →"

---

## NOTES PAGE

- Notes **grouped by account** (not flat chronological list)
- Each group: Account logo + name header (clickable)
- Note rows: Title, (date column), Author avatar, "..." menu
- "Create note" button available
- Filter + Display buttons

---

## SETTINGS (17 pages total)

### Account Settings (6 pages)
1. **Profile**: First name, Last name, Email (disabled), Language dropdown, Timezone dropdown, Update button
2. **Mail and Calendar**: Google/Microsoft OAuth, backsync range, visibility, do-not-track, selective/auto contact creation
3. **Notifications**: Notification preferences
4. **Recording**: Meeting recording configuration
5. **Agent**: "Control how the Lightfield agent behaves in chat."
   - **Agent permissions**: "Record creation and updates" — dropdown: "Ask every time" (configurable)
   - THIS IS THE GRADUATED AUTONOMY CONTROL — can presumably set to auto-approve
6. **Connectors**: MCP tool connections (Notion, Linear, Granola per changelog)

### Workspace Settings (11 pages)
7. **General**: Workspace-level settings
8. **Members**: Team member management
9. **Meetings**: Meeting settings
10. **Knowledge**: "Give Lightfield additional context on your business. This context will be included in AI requests for everyone."
    - Add knowledge button
    - Each entry: Topic (text) + Content (text) + Save/Remove
    - THIS IS THE "WORLD MODEL" CONFIGURATION — how you tell the AI about your business
11. **Data model**: Field/schema customization (the "evolve your data model" feature)
12. **Opportunity stages**: Pipeline stage configuration (default: Lead, Qualification, Demo, Trial, Proposal, Won, Lost)
13. **Tasks**: Task settings
14. **Workflows**: Automation builder (Beta)
15. **Import history**: Past import records
16. **Billing**: Stripe redirect (external)
17. **Integrations**: Third-party integrations
18. **API keys**: REST API access (Beta)
