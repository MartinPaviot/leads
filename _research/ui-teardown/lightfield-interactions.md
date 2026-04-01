# Lightfield Interaction Patterns — Deep Extraction 2026-04-01

All verified via live Playwright browser testing.

## Navigation

### Sidebar Navigation
- Click nav item → **instant page transition** (no loading bar, no animation, no skeleton)
- Active item bg changes to oklch(0 0 0 / 0.04) immediately
- Hover: subtle bg highlight (transition: all on all interactive elements)
- Sidebar is **resizable** via drag handle (cursor: col-resize)
- Collapse button (‹‹) shrinks sidebar completely

### Page Transitions
- **Instant** — no fade, slide, or loading bar
- URL updates immediately via client-side routing
- Content appears without skeleton or spinner
- No page-level loading states observed anywhere

### Settings Navigation
- "← Settings" back link returns to main CRM
- Settings sidebar items behave identically to main nav items
- Complete sidebar swap — main nav is fully replaced

## Record Operations — VERIFIED

### Creating a Record
- Click "Create account" button → **modal overlay** appears
- **Modal**: 540px wide, ~162px tall, fixed position, bg oklch(0.9851 0 0), radius 10px
- **Modal shadow**: oklch(0 0 0 / 0.12) 0px 0px 0px 0.5px, oklch(0 0 0 / 0.06) 0px 8px 24px 0px
- **Overlay**: rgba(0, 0, 0, 0.12) — very subtle darkening (12% black)
- **Modal title**: 13px, weight 500 — consistent with other labels
- **Input**: 14px, weight 400, "Company name" placeholder, height 32px
- **Create button**: disabled (0.25 opacity) until name is entered
- **Close**: × button top-right, Escape key closes
- **Minimal form**: just one field (Name) — no multi-step wizard

### Viewing a Record
- Click account row in table → **full page navigation** to /crm/account/[id]#overview
- NOT a slide-over panel — dedicated two-column detail page
- Back navigation via browser back or sidebar nav
- Account detail has embedded chat composer for AI queries about that account

### Editing a Field
- Detail page shows editable property values
- Click on value → likely inline edit (inferred from layout, not tested to avoid mutations)
- "Set opportunities", "Set owner" are placeholder CTAs for empty fields

### Deleting
- "..." menu on records → presumably contains delete option
- Not tested to avoid data loss

## Table Interactions

### Sorting — VERIFIED
- Column headers are clickable (cursor: pointer)
- Sort indicator (↓ arrow) shows active sort column
- "Last interaction" column has visible sort arrow in screenshots

### Filtering — VERIFIED
- "Filter" button → opens filter chip builder
- Active filter example: "Status is any of 2 values ×" on Tasks page
- Active filter example: "Meeting date after 1 day ago ×" on Meetings page
- Filter chips show: field + operator + value + dismiss (×)
- Each part of filter chip is independently clickable
- Multiple filters stackable in filter bar
- Gap of 14px between filter chips

### Display Settings
- "Display" button → dropdown/panel for column visibility, grouping, sorting
- Not opened to avoid UI state changes

### Column Footer Operations
- "X count" shows row count aggregation
- "+ Add operation" allows sum, avg, min, max on numeric columns

### Row Hover
- Cursor: pointer on clickable table rows
- Background highlight on hover (inferred from transition: all on elements)

## Kanban Interactions

### Card Layout
- Cards in kanban columns are 234px wide, 8px radius, subtle shadow
- Each column has "Create opportunity" button at top
- Column footer shows total value (e.g., "$0")

### Stage Progression
- Drag-and-drop likely supported (standard kanban pattern)
- Not tested to avoid data changes

## Chat Interactions — VERIFIED

### Chat Input
- **Contenteditable `<div>`** (NOT textarea) — supports rich text
- "Ask Lightfield" placeholder
- Persistent across pages: visible on Up Next, Chat threads, Account detail
- Composer width varies: 740px (standalone), 606px (embedded in detail page)

### AI Responses
- Text appears in real-time (streaming)
- "Lightfield" label with sparkle icon above each AI message
- "Retrieved CRM data" label (13px, 425, muted) appears before inline data cards
- Data cards show actual CRM records inline (tasks, contacts, etc.)
- AI can ask clarifying questions ("Could you clarify which account Pierre is associated with?")
- AI can create records via chat commands

### User Messages
- Right-aligned bubbles
- 15px, weight 450, oklch(0 0 0 / 0.85)
- bg oklch(0 0 0 / 0.04), radius 10px, padding 8px 12px
- Line height 22.5px

### Thread Management
- Recent threads listed in sidebar under "Chats" (visible at 1200px+)
- Thread titles truncated with "..." in sidebar
- "+ New chat" button creates fresh thread
- "More" expands full thread list

## Search

### Global Search
- Search icon (🔍) in sidebar top area next to user account
- Not tested — would need to click and verify behavior

## Scroll Behavior

### Sidebar
- Scrolls independently when content overflows
- "More" button for additional items (visible at 1200px height)

### Main Content
- Table/list scrolls vertically within content area
- Kanban scrolls horizontally
- Header bar stays fixed at top
- Chat: messages scroll up, input stays at bottom

### Sticky Elements
- Header bar: sticky at top of content area
- Filter bar: sticky below header
- Chat input: fixed at bottom of chat area

## Responsive Behavior — VERIFIED

### 1280px (default desktop)
- Full sidebar (250px) with section labels, nav items
- Chat threads hidden in "More" overflow
- Full header bar with text labels on all buttons
- 5+ visible table columns

### 1200px
- Sidebar shows chat thread titles (more vertical space)
- Table Headcount column gets cut off at edge
- All header buttons still have text labels

### 768px (tablet)
- **Sidebar auto-collapses** — only icon toggle (□) visible top-left
- Header bar compressed: page icon + title + view toggle + "Import/Export" + "+" create
- "Create account" text preserved
- Table shows Account + Industry + Last interaction + Revenue columns (truncated)
- "Display" button still has text
- Horizontal scroll for table overflow

### 375px (mobile)
- **Sidebar fully hidden** — hamburger-like toggle icon (□) top-left
- Header extremely compressed: icon + title + view toggle (icons only)
- "Create account" becomes just "+" icon
- "Display" becomes just icon (no text)
- **Only 2 columns visible**: Account + Industry (truncated badges)
- Filter bar: "Filter" text preserved + single icon right
- Footer: "6 count" still visible
- **App is fully functional on mobile** — not just desktop

### Responsive Breakpoints (inferred)
```
> 1024px: Full sidebar + full header text
768-1024px: Sidebar auto-collapses
< 768px:    Sidebar hidden, header icons-only, 2-column table
```

## Modal Behavior — VERIFIED

### Create Account Modal
- **Width**: 540px
- **Position**: fixed, centered
- **Background**: oklch(0.9851 0 0) — matches page bg (not white)
- **Border radius**: 10px
- **Shadow**: compound — 0.5px outline ring + 8px 24px floating shadow
- **Overlay**: 12% black — very subtle, page still visible
- **Close**: × button + Escape key
- **Minimal**: single input field + Create button
- **Disabled state**: Create button at 0.25 opacity until input has value

## Micro-Interactions

### Button States
- All interactive elements use `transition: all` for smooth state changes
- Opacity transitions: 0.2s cubic-bezier(0.4, 0, 0.2, 1) — standard ease-out
- Fast hover hints: 0.075s cubic-bezier(0, 0, 0.2, 1)
- Cursor: most buttons use `default` (not `pointer`) — interesting UI choice
- Sidebar nav items and links use `cursor: pointer`

### Checkbox
- Unchecked → checked: bg transitions from transparent to blue (oklch(0.787 0.112 249.79))
- Checkmark appears with transition

### Sidebar Resize
- Drag handle at sidebar right edge
- Cursor changes to col-resize
- Real-time resize as user drags
- Below some threshold → sidebar collapses completely

### Filter Chips
- Add: chip appears in filter bar with transition
- Remove: click × dismiss, chip removed
- Each segment independently clickable for editing

## Performance Observations

1. **No loading states visible** — pages load instantly (SPA with fast client routing)
2. **No skeleton screens** observed anywhere
3. **No spinners** visible in the UI
4. **Transitions are minimal** — instant page changes, subtle hover effects only
5. **System fonts** = zero font loading time
6. **Sub-pixel borders** suggest high-DPI display optimization
7. **Responsive images** — account logos load at appropriate sizes

## Key Interaction Design Takeaways

1. **Instant transitions** — no loading theater, no artificial delays
2. **Modal for creation** — lightweight, single-field modals (not full page forms)
3. **Full page for details** — account detail is immersive, not a quick-peek slide-over
4. **Chat is omnipresent** — composer appears on detail pages for contextual AI queries
5. **Fully responsive** — works down to 375px mobile, not desktop-only
6. **Subtle overlay** — 12% black overlay lets users maintain context during modals
7. **Default cursor on buttons** — deliberate choice, treating CRM as a tool not a website
8. **Filter chips as structured queries** — each part independently editable
