# Lightfield Component Inventory — Deep Extraction 2026-04-01

All values verified via live Playwright DOM inspection + `getComputedStyle()`.

## BUTTONS

### Primary CTA Button (e.g., "Create account", "Create note", "Create opportunity")
```
Height:        24px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.85)
Background:    oklch(1 0 0) — pure white
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 6px
Padding:       2px 7px
Box shadow:    oklch(0 0 0 / 0.04) 0px 1px 3px 0px — barely visible lift
Cursor:        default (not pointer — interesting choice)
Transition:    all
```
Has "+" icon prefix for create actions.

### Submit/Update Button (Settings forms)
```
Height:        32px — taller than standard CTA
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.25) — disabled state color (no changes = disabled)
Background:    oklch(1 0 0)
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 6px
Padding:       2px 12px — wider horizontal padding than standard
Cursor:        default
```

### View Toggle Button — Active (e.g., "All", "Just me")
```
Height:        24px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.85)
Background:    oklch(0 0 0 / 0.04) — 4% black overlay
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 6px
Padding:       2px 7px
```

### View Toggle Button — Inactive (e.g., "My team")
```
Height:        24px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.5) — muted
Background:    transparent
Border:        0.666667px solid transparent — invisible, same box model
Border radius: 6px
Padding:       2px 7px
```

### Ghost/Sidebar Button (e.g., "Notifications", "New list", "More")
```
Height:        32px
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.75)
Background:    transparent
Border:        0.666667px solid transparent
Border radius: 6px
Padding:       6px
Cursor:        pointer
Transition:    all
```

### Icon-Only Button (e.g., search, collapse, close)
```
Size:          24x24px
Padding:       4px
Icon size:     16px (fills remaining space)
Border radius: 6px
Background:    transparent
Border:        transparent
```

### Filter Button
```
Height:        24px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.85)
Background:    transparent
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 6px
Padding:       2px 7px
Transition:    none
```

### Kanban "Create opportunity" Button
```
Width:         234px (fills column)
Height:        36px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.5) — muted placeholder appearance
Background:    transparent
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 6px
Padding:       2px 10px 2px 12px
```

### User/Account Button (sidebar top)
```
Height:        24px
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.85)
Background:    transparent
Border:        0.666667px solid transparent
Border radius: 6px
Padding:       6px 7px
```

## INPUTS

### Text Input (Settings forms) — VERIFIED
```
Height:        32px
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.85) — filled value
Background:    transparent (empty) / oklch(0 0 0 / 0.02) (disabled)
Border:        0.666667px solid oklch(0 0 0 / 0.06) — very subtle at rest
Border radius: 6px
Padding:       8px 12px
Line height:   17.94px
Outline:       blue-tinted at 25% opacity (focus ring from CSS)
```

### Disabled Input
```
Color:         oklch(0 0 0 / 0.25) — very muted
Background:    oklch(0 0 0 / 0.02) — barely tinted
```

### Select/Dropdown (Settings)
```
Height:        28px (in compact mode) / 32px (in forms)
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.85)
Background:    transparent
Border:        0.666667px solid oklch(0 0 0 / 0.16) — slightly more visible
Border radius: 6px
Padding:       4.5px 6px 4.5px 8px
```
Includes chevron icon on right.

### Checkbox
```
Size:          16x16px
Border radius: 4px
Unchecked:     transparent bg, 0.666667px solid oklch(0 0 0 / 0.12)
Checked:       oklch(0.787 0.112 249.79) bg (blue), white checkmark
```

### Chat Input (contenteditable div) — VERIFIED
```
Tag:           <div contenteditable>
Font size:     16px
Font weight:   400
Color:         oklch(0 0 0 / 0.85)
Background:    oklch(1 0 0) — white
Padding:       8px
Border radius: 10px
Placeholder:   "Ask Lightfield"
```

### Chat Composer Container — VERIFIED
```
Width:         740px
Height:        ~77px
Padding:       8px
Background:    oklch(1 0 0) — white
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 10px
Box shadow:    oklch(0 0 0 / 0.06) 0px 8px 24px 0px — floating shadow
Position:      relative (within flex container at page bottom)
```
Toolbar below input: history (clock), tools (settings), spacer, mic, chat mode icons.

### Filter Chip
```
Height:        ~24px
Font size:     12px
Font weight:   500
Parts:         Individually clickable segments (field, operator, value)
Icon:          16px prefix for field type
Dismiss:       "x" button on right
Gap:           14px between chips in filter bar
```

### Form Labels — VERIFIED
```
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.6)
Margin bottom: 0px (tight) or 5px (for select fields)
```

## NAVIGATION

### Sidebar — VERIFIED
```
Width:         250px (resizable via drag handle)
Background:    transparent (inherits page bg)
Border right:  0px solid oklch(0 0 0 / 0.12) — NO visible border
Padding:       0px
Position:      static
```
No hard visual boundary — sidebar blends seamlessly with content area.

### Sidebar Navigation Item — Active — VERIFIED (Accounts page)
```
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.85) — primary text
Background:    oklch(0 0 0 / 0.04) — 4% black overlay
Padding:       6px
Height:        32px
Border radius: 6px
Gap:           (between icon and text)
```

### Sidebar Navigation Item — Inactive
```
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.75) — secondary text
Background:    transparent
Padding:       6px
Height:        32px
Border radius: 6px
```

### Sidebar Section Labels ("Account", "Workspace" in settings; "Records", "Resources" etc. in main)
```
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.6)
Text transform: none (NOT uppercase — lowercase with capital first letter)
Letter spacing: normal
```

### Page Header Bar
```
Height:        44px (from padding: 10px 14px 10px 30px)
Left padding:  30px from sidebar edge
Right padding: 14px
Contains:      page icon + title + view toggles + "+" button + actions
```

### Filter Bar — VERIFIED
```
Height:        ~41px
Padding:       8px 14px 8px 30px
Gap:           14px between items
Border bottom: 0.666667px solid oklch(0 0 0 / 0.12)
Contains:      "Filter" button + chips + spacer + "Display" button
```

### Settings Sidebar
```
Width:         250px (same as main)
Replaces:      Main sidebar entirely
Back nav:      "← Settings" link at top (14px, weight 500, brand blue-ish)
Sections:      "Account" and "Workspace" headers
Items:         Same styling as main sidebar items
```

## DATA DISPLAY

### Table — VERIFIED

#### Table Headers
```
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.6) — secondary/label color
Background:    oklch(0.9851 0 0) — same as page (not separate header bg)
Height:        46.67px
Padding:       11px 8px 11px 0px (first col) / 11px 8px 11px 10px (others)
Border bottom: 0.666667px solid oklch(0 0 0 / 0.12)
Sort:          Sort icon on clickable columns
```

#### Table Rows
```
Height:        44px
Background:    transparent
Border bottom: 0px (no visible row separators)
Padding:       0px
Hover:         cursor pointer, likely subtle bg change
```

#### Table Cells
```
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.85) — primary text
Padding:       0px 8px 0px 0px
Height:        44px
```

#### Table Footer
```
"X count" + "+ Add operation" per column
Font size:     13px
Font weight:   425
Color:         oklch(0 0 0 / 0.5) — muted
```

### Badges/Pills (Industry Tags) — VERIFIED
```
Height:        24px
Font size:     12px
Font weight:   500
Line height:   15.96px
Border radius: 6px
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Padding:       2px 7px
```
**Color formula**: BG = `oklch({hue z5-z7} / 0.1)` — 10% opacity of category color. Text = hue's solid z7/z8 computed to RGB.

### Kanban Card — VERIFIED
```
Width:         234px (fills column minus padding)
Padding:       6px
Background:    oklch(0.9925 0 0) — slightly whiter than page bg
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 8px — slightly more rounded than buttons
Box shadow:    oklch(0 0 0 / 0.04) 0px 1px 3px 0px
Gap:           1px (between card rows)
```
Contains: account icon + name, opportunity icon + name, owner, last interaction, amount, close date.

### Kanban Stage Header
```
Font size:     12px
Font weight:   500
Color:         oklch(0 0 0 / 0.85)
```
Includes colored stage dot + count badge.

### Account Icons (inline in tables)
```
Size:          20x20px (table) / 14x14px (compact inline)
Border radius: 0px — square with custom colored shape
No border
```

### Empty States — VERIFIED
```
"No meetings" / "No tasks":
  Font size:   13px
  Font weight: 425
  Color:       oklch(0 0 0 / 0.25) — very faint
  No icon, no illustration, text only
```

### CRM Data Card (inline in chat)
```
Background:    oklch(1 0 0) — white
Border:        0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 8px
Height:        ~51px
Contains:      checkbox + task text + account badge + date + avatar
```

## FEEDBACK

### Detail Panel (Slide-over)
```
Width:         388px
Background:    oklch(1 0 0) — white
Border left:   0.666667px solid oklch(0 0 0 / 0.12)
Border radius: 10px
Box shadow:    oklch(0 0 0 / 0.06) 0px 8px 24px 0px
Header:        entity icon + name + "..." + link + expand + close
Properties:    label (128px, 13px) + value (12px, 500)
```

### Toast/Notification
```
Position:      bottom area
```
(Limited visibility during testing — requires triggering actions.)

## CHAT-SPECIFIC

### User Message Bubble
```
Alignment:     right (flex-end)
Background:    oklch(0 0 0 / 0.04) — 4% black, very subtle
Border radius: 10px
Padding:       8px 12px
Font size:     15px
Font weight:   450
Color:         oklch(0 0 0 / 0.85)
No border, no shadow
```

### AI Response
```
Alignment:     left (full width)
Background:    transparent — no bubble
Font size:     15px
Font weight:   450
Line height:   22.5px (1.5 ratio)
Label:         "Lightfield" with sparkle icon above, muted
```

### Chat Input Bar
```
Position:      bottom-fixed within page
Composer:      740px wide, 77px tall, white bg, 10px radius
Shadow:        oklch(0 0 0 / 0.06) 0px 8px 24px 0px — floating
Toolbar:       history, tools, spacer, mic, chat mode icons
Persistent:    Visible on Up Next page too, not just chat threads
```
