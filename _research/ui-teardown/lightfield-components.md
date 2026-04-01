# Lightfield Component Inventory — Extracted 2026-04-01

## BUTTONS

### Primary Action Button (e.g. "Create account", "Create task")
- Height: **24px**
- Font size: **12px**
- Font weight: **500**
- Color: `oklch(0 0 0 / 0.85)` (85% black)
- Background: `oklch(1 0 0)` (pure white)
- Border: `0.666667px solid oklch(0 0 0 / 0.12)` (sub-pixel, 12% black)
- Border radius: **6px**
- Padding: `2px 7px`
- Box shadow: `oklch(0 0 0 / 0.04) 0px 1px 3px 0px` (barely visible lift)
- Cursor: pointer
- Has "+" icon prefix for create actions

### Secondary Button (e.g. "Import / Export", "Display")
- Same dimensions as primary
- Background: `transparent`
- Border: `0.666667px solid transparent` (invisible border, same box model)
- No shadow
- Appears on hover with subtle background

### Ghost Button (e.g. sidebar items, "More")
- Height: **32px**
- Font size: **13px**
- Font weight: **425** (distinctive in-between weight)
- Color: `oklch(0 0 0 / 0.75)` (secondary text)
- Background: `transparent`
- Border: `0.666667px solid transparent`
- Border radius: **6px**
- Padding: **6px**

### Icon-Only Button (e.g. search, collapse, close)
- Size: **24x24px**
- Padding: **4px**
- Icon size: **16px** (fills remaining space)
- Border radius: **6px**
- Same transparent background/border pattern

### Disabled/Connect Button
- Color: `oklch(0 0 0 / 0.25)` (very muted, 25% opacity)
- Same structural styling as primary

### "Create opportunity" (in-column kanban button)
- Width: **234px** (fills column)
- Height: **36px**
- Font size: **12px**, weight **500**
- Color: `oklch(0 0 0 / 0.5)` (50% — muted placeholder)
- Border: `0.666667px solid oklch(0 0 0 / 0.12)`
- Border radius: **6px**
- Dashed appearance via sub-pixel border

## INPUTS

### Select/Dropdown (e.g. "24h before")
- Height: **28px**
- Font size: **13px**
- Font weight: **425**
- Color: `oklch(0 0 0 / 0.85)`
- Background: `transparent`
- Border: `0.666667px solid oklch(0 0 0 / 0.16)` (slightly more visible border)
- Border radius: **6px**
- Padding: `4.5px 6px 4.5px 8px`
- Includes chevron icon

### Checkbox
- Size: **16x16px**
- Border radius: **4px**
- Unchecked: transparent bg, `0.666667px solid oklch(0 0 0 / 0.12)` border
- Checked: `oklch(0.787 0.1124 249.79)` bg (blue), no border, white checkmark
- No transition specified (likely CSS transition)

### Chat Input
- Type: contenteditable `<div>` (not textarea)
- Font size: **15px** (larger than nav, matches chat text)
- Background: `transparent`
- Border radius: **6px**
- Placeholder: "Ask Lightfield"
- Container height: **87px** (includes toolbar below)
- Container padding: `0px 12px 10px`
- Toolbar icons below: history, tools, microphone, chat mode

### Filter Chip (e.g. "Meeting date after 1 day ago")
- Height: ~24px
- Font size: **12px**, weight **500**
- Individual parts are separate clickable buttons
- Icon prefix for field type
- "x" dismiss button
- All within filter bar with 14px gap

## DATA DISPLAY

### Table
- No visible row borders in relaxed mode
- Rows separated by subtle horizontal lines
- Row height: ~44px
- Column headers: 12px, weight 500, `oklch(0 0 0 / 0.85)` text, icon prefix
- Column headers have sort indicators (arrow down icon)
- Footer row: "X count" label + "+ Add operation" buttons per column
- Hover: likely subtle bg change (observed via cursor pointer on rows)
- Click: opens slide-over detail panel from right

### Badges/Pills (Industry Tags)
- Height: **24px**
- Font size: **12px**
- Font weight: **500**
- Border radius: **6px**
- Border: `0.666667px solid oklch(0 0 0 / 0.12)` (consistent sub-pixel)
- Padding: `2px 7px`
- Background: **10% opacity** of the category color
- Text color: Full saturation category color (darker shade)
- Color mapping by category:
  - Software → Blue (hue 251)
  - IT Services → Lime (hue 114)
  - Leasing → Indigo (hue 271)
  - Manufacturing → Orange (hue 64)
  - Client Service → Green (hue 143)
  - Food Processing → Red (hue 33)
  - AI → Orange (hue 64)
  - FinTech → Lime (hue 114)

### Account Avatars
- Size: **16x16px** (inline in tables)
- Larger variant: ~40px (in detail panel header)
- Each account has a unique colored icon/logo
- Border radius: 0px (square with custom shape)

### Contact Avatars
- Person icon prefix in muted color
- Size: **16px** inline

### Empty States
- Text only: "No meetings", "No tasks today" in muted color (`oklch(0 0 0 / 0.5)`)
- With CTA: descriptive text + action button (e.g. "Go to settings →")
- Full page 404: icon + "Nothing to see here" + description + "Back to Lightfield" button

### CRM Data Card (inline in chat)
- Background: `oklch(1 0 0)` (white)
- Border: `0.666667px solid oklch(0 0 0 / 0.12)`
- Border radius: **8px**
- Contains: checkbox + task text + account badge + date + avatar
- Height: ~51px

## NAVIGATION

### Sidebar
- Width: **250px** (resizable via drag handle)
- Background: `transparent` (same as page bg)
- No visible border-right (shares background with content)
- Item height: **32px**
- Item font size: **13px**, weight **425**
- Item color: `oklch(0 0 0 / 0.75)` (secondary)
- Active item bg: `oklch(0 0 0 / 0.04)` (4% black overlay)
- Active item color: `oklch(0 0 0 / 0.85)` (primary text)
- Active item border-radius: **6px**
- Section headers: uppercase text "Records", "Resources", "Lists", "Chats"
  - Font size: **11px** (from screenshot observation)
  - Font weight: likely **500**
  - Color: muted (`oklch(0 0 0 / 0.5)`)
- Icons: **16px**, inline with text
- Resize handle: 8px wide, cursor: col-resize

### Page Header Bar
- Height: **44px**
- Padding: `10px 14px 10px 30px`
- Contains: page icon + page title + view toggle ("All") + "+" button + actions
- Border bottom: none (clean separation)

### Filter Bar
- Height: **~41px**
- Padding: `8px 14px 8px 30px`
- Gap: **14px** between items
- Border bottom: `0.666667px solid oklch(0 0 0 / 0.12)`
- Contains: filter icon button + active filter chips + spacer + "Display" button

### Settings Sidebar
- Replaces main sidebar entirely
- Same 250px width
- "← Settings" back link at top
- Two sections: "Account" and "Workspace"
- Same nav item styling as main sidebar

## FEEDBACK

### Toast/Notification
- Position: bottom area (from alert element)
- Content: "Lightfield" text (observed in DOM)

### Detail Panel (Slide-over)
- Width: **388px**
- Background: `oklch(1 0 0)` (white)
- Border-left: `0.666667px solid oklch(0 0 0 / 0.12)`
- Border radius: **10px**
- Box shadow: `oklch(0 0 0 / 0.06) 0px 8px 24px 0px`
- Header: entity icon + name + "..." menu + link + expand + close
- Property list: icon + label (left, 128px) + value (right)
- Close button: 24x24px, border-radius 6px

## CHAT-SPECIFIC

### User Message Bubble
- Alignment: **right** (flex-end)
- Background: `oklch(0 0 0 / 0.04)` (4% black — very subtle)
- Border radius: **10px**
- Padding: `8px 12px`
- Font size: **15px**
- Font weight: **450** (unique in-between weight)
- Color: `oklch(0 0 0 / 0.85)`
- No border, no shadow

### AI Response
- Alignment: **left** (full width)
- Background: `transparent` (no bubble)
- Font size: **15px**
- Font weight: **450**
- Line height: **22.5px** (1.5 ratio)
- "Lightfield" label above with sparkle icon
  - Label color: muted
- "Retrieved CRM data" label before data cards

### Chat Input Bar
- Bottom-fixed
- Container padding: `0px 12px 10px`
- Input: contenteditable div, 15px font
- Toolbar below input: history icon, tools icon, spacer, mic icon, chat mode icon
- Persistent across pages (visible on Up Next too)

## TYPOGRAPHY HIERARCHY (observed across pages)

| Usage | Font Size | Weight | Color |
|-------|-----------|--------|-------|
| Settings page title | 24px | 500 | oklch(0 0 0 / 0.85) |
| Up Next date | ~20-24px | 500 | oklch(0 0 0 / 0.85) |
| Section header (Today/This Week) | ~14px | 500 | brand blue |
| Chat text (user + AI) | 15px | 450 | oklch(0 0 0 / 0.85) |
| Nav items / body text | 13px | 425 | oklch(0 0 0 / 0.75) |
| Buttons / labels | 12px | 500 | oklch(0 0 0 / 0.85) |
| Badges / meta | 12px | 500 | category color |
| Section headers (sidebar) | 11px | 500 | oklch(0 0 0 / 0.5) |
| Smallest text | 10px | 500 | muted |
| Page description | 13px | 425 | oklch(0 0 0 / 0.5) |
| Detail panel header | 13px | 500 | oklch(0 0 0 / 0.85) |
| Letter spacing (title) | — | — | -0.3px |
