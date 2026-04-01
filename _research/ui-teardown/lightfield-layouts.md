# Lightfield Page Layouts — Deep Extraction 2026-04-01

All values verified via Playwright DOM inspection + getComputedStyle().

## Global Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ ┌────────────┐ ┌──────────────────────────────────────┐  │
│ │  Sidebar   │ │  Main Content                        │  │
│ │  250px     │ │                                      │  │
│ │            │ │  ┌── Header Bar (44px) ──────────┐   │  │
│ │  Account   │ │  │ Icon  Title  Views    Actions │   │  │
│ │  Search ‹‹ │ │  ├── Filter Bar (~41px) ────────┤   │  │
│ │            │ │  │ Filter chips      Display    │   │  │
│ │  Up next   │ │  ├── Content Area ──────────────┤   │  │
│ │  Notifs    │ │  │                              │   │  │
│ │            │ │  │                              │   │  │
│ │  Records   │ │  │    (varies by page type)     │   │  │
│ │  Resources │ │  │                              │   │  │
│ │  Lists     │ │  │                              │   │  │
│ │  Chats     │ │  └──────────────────────────────┘   │  │
│ │            │ │                                      │  │
│ │  ? Help    │ └──────────────────────────────────────┘  │
│ └────────────┘                                           │
└──────────────────────────────────────────────────────────┘
```

### Sidebar (250px, resizable)
- **Width**: 250px (resizable via drag handle, cursor: col-resize)
- **Background**: transparent — inherits page bg, no visual boundary
- **Border right**: none (0px)
- **Sections** (top to bottom):
  1. User account button (avatar "MP" + "Martin Paviot") + search icon + collapse ‹‹
  2. **Up next** + **Notifications** (standalone nav items)
  3. **Records** section label → Accounts, Opportunities, Contacts
  4. **Resources** section label → Tasks, Meetings, Notes
  5. **Lists** section label → + New list
  6. **Chats** section label → + New chat + recent threads
  7. **More** button (overflow)
  8. **?** Help button (bottom-left)
- **Section labels**: 12px, weight 500, color oklch(0 0 0 / 0.6)
- **Nav items**: 13px, weight 425, height 32px, padding 6px, radius 6px
- **Active item**: bg oklch(0 0 0 / 0.04), color oklch(0 0 0 / 0.85)
- **Inactive item**: bg transparent, color oklch(0 0 0 / 0.75)

### Main Content Area
- Starts at x=250px (after sidebar)
- **Full remaining width** — no max-width constraint
- **Background**: oklch(0.9851 0 0) — warm off-white
- **Left padding**: 30px from sidebar edge
- **Right padding**: 14px

---

## Page: Accounts List
**URL**: `/crm/accounts`
**Screenshot**: 002-accounts-list.png

### Header Bar
- Height: 44px, padding: 10px 14px 10px 30px
- Icon (folder) + "Accounts" title + view toggle "All" (active) + "+" + "Import / Export" dropdown + "+ Create account" CTA

### Filter Bar
- Height: ~41px, padding: 8px 14px 8px 30px
- "Filter" button + active filter chips + spacer + "Display" button
- Border bottom: 0.666667px solid oklch(0 0 0 / 0.12)

### Content: Full-Width Table
- Columns: Account (icon+name), Industry (badges), Last interaction (sortable), Revenue, Headcount, Last funding, LinkedIn, Website, Owner
- **Header**: 13px, weight 425, color oklch(0 0 0 / 0.6), height 46.67px, border-bottom
- **Rows**: height 44px, no visible row borders, transparent bg
- **Cells**: 13px, weight 425, color oklch(0 0 0 / 0.85)
- **Footer**: "6 count" + "+ Add operation" per column
- **Click on row** → navigates to full account detail page
- Horizontal scrollbar at bottom (columns overflow)

---

## Page: Account Detail (Full Page)
**URL**: `/crm/account/[id]#overview`
**Screenshot**: 011-account-detail-full.png

### Layout: Two-Column
- **Left column**: ~550px, contains account summary content
- **Right column**: Account details properties panel

### Header Bar
- Account icon + "Test Corp v2" + "..." menu + tabs: "Overview" (active, 12px/500), "Contacts" (13px/425), "+4" more + link icon + "+ Create" CTA

### Left Column Content
- **Account logo**: 46.67 x 46.67px, square (borderRadius 0px)
- **Account name**: 24px, weight 500, color oklch(0 0 0 / 0.85), letter-spacing -0.3px
- **Section headers** ("Account summary", "About their business", "Upcoming meetings"):
  - 13px, weight 425, color oklch(0 0 0 / 0.5)
- **Body text**: 13px, weight 425, color oklch(0 0 0 / 0.85)
- **Chat composer**: embedded at bottom, 606px wide, 103px tall, white bg, 10px radius

### Right Column: Account Details
- **Panel header** "Account details": 13px, weight 500, color oklch(0 0 0 / 0.85)
- **Property labels** (Name, Owner, Industry, etc.): 12px, weight 425, color oklch(0 0 0 / 0.5)
- **Property values**: 13px, weight 425, color oklch(0 0 0 / 0.85)
- **Link values** (website): brand color
- **Empty values** ("Set opportunities", "Set owner"): muted placeholder color
- **"See more" expand**: accordion with chevron

### Key Insight
Account detail is a **FULL PAGE**, NOT a slide-over panel. This is different from what we assumed. The two-column layout with embedded chat composer makes it a rich, immersive detail view.

---

## Page: Contacts List
**URL**: `/crm/contacts`
**Screenshot**: 006-contacts-list.png

### Identical structure to Accounts list
- Columns: Name (person icon), Account (colored icon + name), Last interaction (sortable, ↓), Job title, Email address, LinkedIn
- Same header bar pattern, filter bar, display button
- Footer: "5 count" + "+ Add operation"
- Supports Arabic/RTL text in job titles (observed "مدير المبيعات")

---

## Page: Opportunities (Kanban)
**URL**: `/crm/opportunities`
**Screenshot**: 003-opportunities-kanban.png

### Same header/filter bar pattern

### Content: Kanban Board
- **Horizontal scrolling columns**
- **Column width**: 246px (6px horizontal padding → 234px card width)
- **Stages**: Lead, Qualification, Demo, Trial, Proposal (+ more off-screen)
- **Stage header**: colored dot + name (12px, 500) + count
- **"+ Create opportunity"** button per column: 234x36px, 12px/500, muted color
- **Column footer**: diamond icon + total value "$0" (13px, 425, muted)

### Kanban Card
- Width: 234px, padding 6px, gap 1px
- Background: oklch(0.9925 0 0) — slightly whiter than page
- Border: 0.666667px solid oklch(0 0 0 / 0.12)
- Border radius: 8px
- Shadow: oklch(0 0 0 / 0.04) 0px 1px 3px 0px
- Contains: account icon+name, opportunity name, owner, metadata lines

---

## Page: Up Next
**URL**: `/crm/up-next`
**Screenshot**: 005-up-next.png

### Header Bar
- "Up next" title + toggle: "Just me" (active) / "My team" (inactive) + "+ Create"
- Toggle active: 12px/500, bg oklch(0 0 0 / 0.04), border oklch(0 0 0 / 0.12)
- Toggle inactive: 12px/500, color oklch(0 0 0 / 0.5), transparent bg/border

### Content: Sections
- **Date header**: "Wed, Apr 1" — 24px, weight 500, letter-spacing -0.3px
- **"Meetings" section**: 15px, weight 500, color oklch(0 0 0 / 0.85) + "Today ∨" dropdown
- **Empty state**: "No meetings" — 13px, weight 425, color oklch(0 0 0 / 0.25)
- **"Tasks" section**: same pattern + filter icon
- **Chat composer at bottom**: 740px wide, persistent

---

## Page: Tasks
**URL**: `/crm/tasks`
**Screenshot**: 007-tasks.png

### Content: Grouped List
- **Group headers**: "Today", "This Week" — styled in **brand blue** color
- **Empty group**: "No tasks today" in muted text
- **Task rows**: checkbox + task title (13px) + spacer + account badge + date icon + date + avatar + "..." menu
- **Filter bar**: has active filter chip "Status is any of 2 values ×"
- Full width rows, no explicit card/border around task items

---

## Page: Meetings
**URL**: `/crm/meetings`
**Screenshot**: 008-meetings.png

### Same table structure as Accounts/Contacts (when populated)
- Active filter: "Meeting date after 1 day ago ×"
- **Empty state** (centered in content area):
  - "No meetings" title (bold text)
  - "Lightfield automatically syncs meetings from your calendar activity." description (muted)
  - "Go to settings →" CTA link with arrow icon

---

## Page: Notes
**URL**: `/crm/notes`
**Screenshot**: 001-notes-page-initial.png

### Content: Grouped List
- **Grouped by account**: account icon + account name as section header
  - "Meridian Labs" header + notes underneath
  - "NovaTech" header + notes underneath
- **Note rows**: note title (13px) + spacer + avatar + "..." menu
- Minimal styling — no extra metadata visible per note

---

## Page: Chat Thread
**URL**: `/crm/thread/[threadId]`
**Screenshot**: 009-chat-thread.png

### Header Bar
- Chat icon + thread title (truncated, clickable) + "..." menu + link icon + "+ New chat" CTA

### Content: Message Thread
- **Message container**: width ~619px, padding 12px
- **User messages**: right-aligned bubbles
  - 15px, weight 450, oklch(0 0 0 / 0.85)
  - bg oklch(0 0 0 / 0.04), radius 10px, padding 8px 12px
- **AI responses**: left-aligned, full width, no bg bubble
  - "Lightfield" label with sparkle icon above
  - "Retrieved CRM data" label: 13px, weight 425, oklch(0 0 0 / 0.5)
  - Inline CRM data cards (white, bordered, 8px radius)
- **Chat composer at bottom**: 740px wide, floating with shadow

---

## Page: Settings
**URL**: `/crm/settings/profile` (redirects from `/crm/settings`)
**Screenshot**: 004-settings-profile.png

### Layout Change
- **Sidebar completely replaced** with Settings navigation
- "← Settings" back link at top (brand color link)
- **Account section**: Settings, Mail and Calendar, Notifications, Recording, Agent, Connectors
- **Workspace section**: General, Members, Meetings, Knowledge, Data model, Opportunity stages, Tasks, Workflows (Beta), Import history, Billing, Integrations, API keys (Beta)

### Content Area
- **Page title**: "Profile" — font size not captured via h1 query but visually ~24px, weight 500
- **Page description**: "Manage settings for your personal profile." — 13px, weight 425, oklch(0 0 0 / 0.5)
- **Form layout**: labels above inputs, max width ~738px
- **Labels**: 13px, weight 425, oklch(0 0 0 / 0.6)
- **Inputs**: height 32px, 13px/425, padding 8px 12px, border oklch(0 0 0 / 0.06)
- **Disabled input**: bg oklch(0 0 0 / 0.02), color oklch(0 0 0 / 0.25)
- **Submit button** ("Update"): height 32px, disabled appearance when no changes

---

## Page: Error / 404
**URL**: `/crm/notifications` (returns 404)
**Screenshot**: 010-notifications.png

### Layout: Centered, No Sidebar
- Sparkle/X icon (matches brand)
- **Title**: "Nothing to see here" — 21px, weight 500, oklch(0 0 0 / 0.85)
- **Description**: "This page either does not exist..." — 15px, weight 425, oklch(0 0 0 / 0.5)
- **CTA**: "Back to Lightfield" — 15px, weight 500, full-width white button

---

## Key Layout Patterns

1. **Consistent 30px left padding** in content area from sidebar edge
2. **44px header bar** on every page with consistent icon + title + views + actions
3. **Filter bar** appears on list/table/kanban pages only
4. **No max-width** on main content — tables/lists stretch to fill viewport
5. **Account detail is a full page**, not a slide-over — two-column with embedded chat
6. **Chat input persists** across pages (Up Next, Chat threads, Account detail)
7. **Settings replaces sidebar** entirely — complete navigation swap
8. **Grouping by parent** — Notes group by account, Tasks group by time period
9. **Kanban is horizontal scroll** — fixed-width columns, card widths fill columns
10. **Two layout paradigms**: table (Accounts/Contacts/Meetings) and grouped list (Tasks/Notes)
11. **Empty states are minimal** — text only, no illustrations, optional CTA link
12. **Chat composer width varies** by context: 740px (standalone), 606px (embedded in detail)
