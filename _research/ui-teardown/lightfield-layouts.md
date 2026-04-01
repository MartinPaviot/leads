# Lightfield Page Layouts — Extracted 2026-04-01

## Global Layout Structure

```
┌──────────────────────────────────────────────┐
│ ┌─────────┐ ┌──────────────────────────────┐ │
│ │ Sidebar  │ │ Main Content Area            │ │
│ │ 250px    │ │                              │ │
│ │          │ │ ┌──── Header Bar (44px) ────┐ │ │
│ │ Account  │ │ │ Icon Title Views  Actions │ │ │
│ │ Search   │ │ ├──── Filter Bar (~41px) ──┤ │ │
│ │ Collapse │ │ │ Filter chips    Display  │ │ │
│ │          │ │ ├──── Content Area ────────┤ │ │
│ │ Records  │ │ │                          │ │ │
│ │ Resources│ │ │                          │ │ │
│ │ Lists    │ │ │                          │ │ │
│ │ Chats    │ │ │                          │ │ │
│ │          │ │ │                          │ │ │
│ │ ?Help    │ │ └──────────────────────────┘ │ │
│ └─────────┘ └──────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Sidebar (250px, resizable)
- No explicit background color (transparent, inherits page bg)
- No right border (seamless blend with content)
- Sections from top to bottom:
  1. User account button (avatar + name) + search + collapse
  2. **Up next** + **Notifications** (standalone items)
  3. **Records** section: Accounts, Opportunities, Contacts
  4. **Resources** section: Tasks, Meetings, Notes
  5. **Lists** section: + New list
  6. **Chats** section: + New chat + recent chat threads
  7. **More** button at bottom (expands overflow)
  8. **?** Help button (bottom-left corner)

### Main Content Area
- Starts at x=250px
- Full remaining width
- Background: `oklch(0.9851 0 0)` (off-white)
- No max-width constraint (fills viewport)
- Content padding: **30px left**, **14px right**

---

## Page: Accounts List
**URL**: `/crm/accounts`

### Header Bar
- Icon: folder icon
- Title: "Accounts"
- View toggle: pill button "All" (active)
- "+" button: add new view
- Actions (right): "Import / Export" dropdown, "+ Create account" button

### Filter Bar
- "Filter" button (left)
- Active filters: field-based filter chips
- "Display" button (right): column visibility, grouping, sorting

### Content: Table
- Full-width table
- Columns: Account (with icon), Industry (badges), Last interaction (with sort), Revenue
- Column headers: icon + label, 12px, weight 500
- Row height: ~44px
- Account column: colored icon + text
- Industry column: 1-3 colored badge pills per row
- Footer: "X count" + "+ Add operation" per column
- Click on row → opens detail slide-over panel on right (388px wide)

### Horizontal scrollbar at bottom (columns overflow)

---

## Page: Account Detail (Slide-over Panel)
**URL**: `/crm/accounts?hsot=a&hsid=[id]`

- NOT a separate page — slide-over panel from right
- Panel width: **388px**
- White background, 10px border-radius, subtle shadow
- Header: entity icon (large) + name + "..." + link + expand + close
- Large entity display: ~40px icon + entity name in 20px text
- Property list: key-value pairs
  - Label width: 128px, icon + text, 13px
  - Value: 12px, weight 500
- Properties: Name, Opportunities (links), Owner, Industry (badges), Headcount, Revenue, Website, Last interaction

---

## Page: Contacts List
**URL**: `/crm/contacts`

### Identical structure to Accounts list
- Columns: Name (person icon), Account (colored icon + name), Last interaction, Job title, Email
- Same filter bar, display button, create button pattern
- Footer: "X count" + "+ Add operation"

---

## Page: Opportunities (Kanban)
**URL**: `/crm/opportunities`

### Header Bar
- Same pattern: icon + "Opportunities" + "All" view + "+" + Import/Export + Create opportunity

### Filter Bar
- Same as accounts

### Content: Kanban Board
- Horizontal columns, each **246px wide**, padding `0px 6px`
- Stage columns: Lead, Qualification, Demo, Proposal, Negotiation, Closed Won, Closed Lost
- Each column has:
  - Header: colored dot + stage name (12px, 500) + count
  - "+ Create opportunity" button (36px height, dashed border feel)
  - Cards stacked vertically
- Column footer: diamond icon + total value ($0)
- Stage dot colors (OKLCH):
  - Lead: neutral gray `oklch(0 0 0 / 0.25)`
  - Qualification: neutral gray (same)
  - Demo: copper `oklch(0.694 0.092 69.1)`
  - Proposal: yellow `oklch(0.843 0.158 87.5)`
  - Negotiation: green `oklch(0.659 0.184 143.5)`
  - Closed Won: blue `oklch(0.654 0.145 251.0)`
  - Closed Lost: red `oklch(0.617 0.191 33.3)`

### Kanban Card
- Width: fills column (~234px)
- Background: transparent (within column)
- Contains:
  - Account icon + account name (13px, 500)
  - Opportunity icon + opportunity name (13px)
  - Owner icon + owner name
  - Last interaction (muted)
  - Amount (muted)
  - Close date (muted)

---

## Page: Up Next
**URL**: `/crm/up-next`

### Header Bar
- "Up next" + "Just me" / "My team" toggle + "+ Create" button
- Toggle uses pill/tab pattern

### Content: Sections
- Large date header: "Wed, Apr 1" (~24px, weight 500)
- **Meetings** section:
  - "Meetings" header + "Today v" dropdown (right)
  - Content or "No meetings" empty state
- **Tasks** section:
  - "Tasks" header + "Today v" dropdown + filter icon (right)
  - Content or "No tasks" empty state
- **Chat input bar** at bottom (persistent)

---

## Page: Tasks
**URL**: `/crm/tasks`

### Content: Grouped List
- Group headers: "Today", "This Week" — styled in **brand blue** color
- Empty group: "No tasks today" in muted text
- Task rows:
  - Checkbox + task title (13px) + spacer + account badge + date + avatar + "..." menu
  - Full width within content area
  - No explicit card/border around rows

---

## Page: Notes
**URL**: `/crm/notes`

### Content: Grouped List
- Grouped by account: account icon + account name as section header
- Note rows:
  - Note title (13px) + spacer + avatar + "..." menu
  - Simple, minimal — no extra metadata visible

---

## Page: Meetings
**URL**: `/crm/meetings`

### Same table structure as Accounts/Contacts
- Filter bar with date filter
- Empty state: "No meetings" + description + "Go to settings →" link

---

## Page: Chat Thread
**URL**: `/crm/thread/[threadId]`

### Header Bar
- Chat icon + thread title (truncated) + "..." menu + link icon + "+ New chat" button

### Content: Message Thread
- Full width, vertically scrollable
- Messages alternate between user (right) and AI (left)
- No explicit card containers for messages
- User messages: subtle gray bg bubble, right-aligned
- AI messages: full-width, no bg, with "Lightfield" label + sparkle icon above
- AI can embed CRM data cards inline (white bordered cards)

### Chat Input (bottom-fixed)
- "Ask Lightfield" placeholder
- Toolbar: history, tools, mic, chat mode
- Spans full content width minus padding

---

## Page: Settings
**URL**: `/crm/settings/[section]`

### Layout Change
- Sidebar REPLACES main sidebar (not stacked)
- "← Settings" back navigation at top
- Account section: Settings, Mail and Calendar, Notifications, Recording, Agent, Connectors
- Workspace section: General, Members, Meetings, Knowledge, Data model, Opportunity stages, Integrations, API Keys

### Content Area
- Page title: **24px**, weight 500, letter-spacing **-0.3px**
- Page description: **13px**, weight 425, **50% opacity**
- Content: form elements, cards, toggles arranged vertically
- Max content width: ~738px (not full width)

---

## Page: Error / 404
- Centered content, no sidebar
- Icon (sparkle/X)
- "Nothing to see here" title
- Description text
- "Back to Lightfield" full-width button

---

## Responsive Behavior
- Desktop-first design
- Sidebar collapses via chevron button
- No mobile breakpoints observed (desktop CRM)
- Minimum viewport: ~1024px functional

## Key Layout Patterns

1. **Consistent 30px left padding** in content area
2. **44px header bar** on every page
3. **Filter bar** appears on list/table pages only
4. **No max-width** on main content — tables stretch to fill
5. **Slide-over detail panels** instead of full page navigation for entity details
6. **Chat input persists** across pages (visible on Up Next, Chat)
7. **Settings uses its own sidebar** — complete navigation replacement
8. **Grouping by parent entity** — Notes and Tasks group by account
