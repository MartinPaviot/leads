# Lightfield Interaction Patterns — Extracted 2026-04-01

## Navigation

### Sidebar Navigation
- Click on nav item → **instant page transition** (no animation, no loading bar)
- Active item bg changes immediately to `oklch(0 0 0 / 0.04)`
- Hover: likely subtle bg highlight (transition: all)
- Sidebar is resizable via drag handle (cursor: col-resize, 8px wide)
- Collapse button (chevrons ‹‹) shrinks sidebar

### Page Transitions
- **Instant** — no fade, no slide, no loading bar
- URL updates immediately
- Content appears without skeleton or spinner

### Settings Navigation
- Back arrow (← Settings) returns to main CRM
- Settings sidebar items work same as main sidebar

## Record Operations

### Creating a Record
- "Create [entity]" button in header → **modal/form** (not full page)
- Kanban: "+ Create opportunity" button within column
- Chat: AI can create records inline via command

### Viewing a Record (Detail)
- Click row in table → **slide-over panel from right** (388px)
- Panel has expand button (↗) → presumably opens full page
- Panel has link button (🔗) → copy link
- Panel has close button (×)
- Animation: likely slide-in from right

### Editing a Field
- Click on field value in detail panel → inline edit (inferred from layout)
- Properties are key-value pairs, values appear editable on click

### Deleting
- "..." menu on records → delete option (inferred)
- Likely confirmation dialog

## Table Interactions

### Sorting
- Column headers are clickable
- Sort indicator (↓ arrow) shows active sort
- Click cycles: ascending → descending → none

### Filtering
- "Filter" button → filter chip builder
- Filter chips show: field + operator + value + dismiss (×)
- Multiple filters stackable in filter bar

### Display Settings
- "Display" button → dropdown/panel for:
  - Column visibility
  - Column ordering
  - Grouping
  - Sorting configuration

### Column Footer Operations
- "X count" shows aggregation
- "+ Add operation" allows sum, avg, min, max on columns

### Row Hover
- Cursor: pointer on clickable rows
- Likely subtle background highlight

## Kanban Interactions

### Drag and Drop
- Cards in kanban columns are draggable (inferred from kanban pattern)
- Stage progression by dragging card between columns
- Drop zone highlighting likely present

### Card Click
- Opens record detail (slide-over or full page)

## Chat Interactions

### Input
- Contenteditable div (not textarea) → supports rich text
- "Ask Lightfield" placeholder
- Tools available via toolbar icons:
  - History (clock icon): access previous conversations
  - Tools (settings icon): available commands
  - Microphone: voice input
  - Chat mode toggle: switch between modes

### AI Responses
- Text streams in (real-time)
- "Retrieved CRM data" label appears before inline data cards
- Data cards show actual CRM records (tasks, contacts, etc.) inline
- AI can ask clarifying questions before taking actions

### Thread Management
- Recent threads listed in sidebar under "Chats"
- "New chat" button creates fresh thread
- Thread title derived from first message
- "More" expands full thread list

## Search

### Global Search
- Search icon in sidebar top area
- Opens search overlay (not inspected — would need to click)
- Likely searches across all entities

## Scroll Behavior

### Sidebar
- Scrolls independently (overflow visible)
- "More" button for overflow items

### Main Content
- Table/list scrolls vertically within content area
- Kanban scrolls horizontally
- Header bar stays fixed at top
- Chat: messages scroll up, input stays at bottom

### Sticky Elements
- Header bar: sticky at top
- Filter bar: likely sticky below header
- Chat input: fixed at bottom

## Keyboard Navigation

### Observed
- Tab navigation likely works (buttons have cursor states)
- No explicit keyboard shortcuts observed

### Inferred
- Form fields: standard tab order
- Modals: focus trap likely
- Escape: close detail panel/modal

## Micro-Interactions

### Button States
- All buttons use `transition: all` for smooth state changes
- Hover: bg color change (subtle)
- Active: slightly darker bg
- Focus: border-focused ring (`oklch(0.6 0.14 251 / 0.4)` — blue at 40%)

### Checkbox
- Unchecked → checked: bg transitions from transparent to blue
- Checkmark appears (likely animated)

### Sidebar Resize
- Drag handle appears on hover at sidebar right edge
- Cursor changes to col-resize
- Real-time resize as user drags

### Filter Chips
- Add: filter chip appears in bar
- Remove: click × dismiss button, chip disappears
- Each part of filter is independently clickable (field, operator, value)

## Empty States

### Table Pages (Meetings with no data)
- Centered within content area
- "No meetings" title (bold)
- Description text (muted)
- CTA link: "Go to settings →" with arrow icon
- No illustration or icon

### Task Groups (Today with no tasks)
- Inline: "No tasks today" text in muted color
- Not centered — appears at group position

### Up Next Sections
- "No meetings" / "No tasks" inline text
- Muted color, no action buttons

## Performance Observations

1. **No loading states visible** — pages load instantly (likely SSR or fast SPA)
2. **No skeleton screens observed** (may appear with slow network)
3. **No spinners visible** anywhere in the UI
4. **Transitions are minimal** — instant page changes, subtle hover effects
5. **System fonts** mean zero font loading time
6. **Sub-pixel borders** suggest high-DPI display optimization
