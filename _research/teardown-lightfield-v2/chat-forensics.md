# Lightfield Chat Forensics — Deep Teardown

**Date**: 2026-04-01/02
**Method**: Playwright browser, getComputedStyle pixel-level CSS extraction, systematic testing
**Trial expires**: 2026-04-13

---

## PHASE 1: CHAT UI ANATOMY

### 1.1 Chat Input Presence Across Pages

| Page | URL | Chat Input Present? | Scoped To |
|------|-----|---------------------|-----------|
| Up Next | /crm/up-next | YES | Global (no badge) |
| Accounts list | /crm/accounts | NO | N/A |
| Contacts list | /crm/contacts | NO | N/A |
| Opportunities | /crm/opportunities | NO | N/A |
| Tasks | /crm/tasks | NO | N/A |
| Notes | /crm/notes | NO | N/A |
| Meetings | /crm/meetings | NOT TESTED (empty) | N/A |
| Dedicated chat | /crm/agent | YES | Global (no badge) |
| Contact detail | /crm/contact/{id} | YES | **Scoped to contact** (badge shown) |
| Account detail | /crm/account/{id} | YES | **Scoped to account** (badge shown) |
| Contact slide-over | /crm/contacts?hsot=c&hsid={id} | NO | N/A |

**KEY FINDING**: Chat input is NOT persistent across all pages. It appears ONLY on:
1. "Up next" dashboard (global scope)
2. Dedicated chat page /crm/agent (global scope, with suggestion chips)
3. Entity detail pages (contact/account full views) — **scoped to that entity**

List/table views (Accounts, Contacts, Opportunities, Tasks, Notes) do NOT have chat input.
Slide-over/drawer detail views do NOT have chat input — only full-page detail views.

### 1.2 Chat Input — CSS Forensics

#### The Textbox
- **Element**: `<div role="textbox">` (contenteditable div, NOT textarea)
- **Placeholder text**: "Ask Lightfield"
- **Font**: Inter, "Noto Sans KR", "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", system-ui, sans-serif
  - Full CJK font stack for international support
- **Font size**: 15px
- **Font weight**: 400
- **Line height**: 22.5px (1.5x)
- **Text color**: oklch(0 0 0 / 0.85) ≈ rgba(0,0,0,0.85) — near-black
- **Background**: transparent
- **Border**: none (0px)
- **Border-radius**: 6px
- **Padding**: 4px
- **Min-height**: 0px (collapses to content)
- **Max-height**: 40vh (via parent `max-h-[40vh]`) — auto-expands up to 40% of viewport
- **Overflow**: hidden auto (scrolls when exceeding max-height)

#### The Container Box (visible rounded input area)
- **Class**: `relative mx-auto w-full max-w-[740px] rounded-xl p-[8px] border-[0.5px]...`
- **Width**: 740px max-width (fluid below)
- **Height**: ~77px at rest (expands with content)
- **Background**: oklch(1 0 0) = pure white
- **Border**: 0.667px solid oklch(0 0 0 / 0.12) — very faint, barely visible hairline
- **Border-radius**: 10px (Tailwind `rounded-xl`)
- **Padding**: 8px
- **Position**: relative

#### The Sticky Wrapper
- **Class**: `sticky bottom-0 mx-auto w-full max-w-[760px] bg-background-primary pb-2.5...`
- **Position**: sticky bottom-0 — sticks to bottom of scroll area
- **Width**: 760px max (20px wider than input for padding)
- **Background**: oklch(0.9851 0 0) ≈ #fafafa — very light grey (matches page bg)
- **Padding**: 0px 10px 10px

#### Viewport Context
- Viewport: 1280 x 533
- Textbox positioned at y:454 (46px from bottom of viewport)
- Container occupies bottom ~87px of the view

### 1.3 Chat Input — Toolbar Buttons

4 buttons in the toolbar below the text input:

| # | Position | Size | Title/Label | Icon | Disabled? | Color | Background |
|---|----------|------|-------------|------|-----------|-------|------------|
| 1 | Left (x:404) | 28x28 | None | Clock/history SVG | No | oklch(0 0 0 / 0.85) | transparent |
| 2 | Left (x:434) | 28x28 | None | Settings/sliders SVG | No | oklch(0 0 0 / 0.85) | transparent |
| 3 | Right (x:1052) | 28x28 | "Upload file" | Paperclip SVG | No | oklch(0 0 0 / 0.85) | transparent |
| 4 | Right (x:1086) | 40x28 | None (send) | Arrow/send SVG | **YES** (when empty) | oklch(0 0 0 / 0.25) faded | oklch(0 0 0 / 0.04) faint grey |

- **NO microphone button** (correction from v1 teardown — it's the upload/paperclip button)
- **Send button**: disabled when input is empty, becomes enabled when text entered
- **Layout**: 2 buttons left, 2 buttons right — centered gap between

### 1.4 Suggestion Chips (Dedicated Chat Page /crm/agent)

**Label**: "Some ideas..." (16px, weight 400, oklch(0 0 0 / 0.85))

**8 suggestions** displayed as a **vertical list** (NOT horizontal pills):

1. "Enrich my new accounts using the web"
2. "Summarize my active opportunities"
3. "Which of my opportunities need updating?"
4. "What's the deal value in my active opportunities?"
5. "Draft an email to customers I need to follow up with today"
6. "Prep me for my meetings today"
7. "Generate tasks from my last meeting"
8. "Research my accounts to determine my ICP"

#### Chip Styling
- **Layout**: Full-width list items, NOT pill/tag chips
- **Width**: 744px (full container width)
- **Height**: 44px per item
- **Font size**: 15px
- **Font weight**: 425 (slightly heavier than regular)
- **Text color**: oklch(0 0 0 / 0.6) — medium grey (60% opacity)
- **Background**: transparent
- **Border**: none — separated by hairline pseudo-element
- **Separator**: `::after` element, 0.5px height, `bg-border-moderate` color, inset 12px from edges
- **Padding**: 0px 12px
- **Cursor**: pointer
- **Hover behavior**: TBD (need to test)

**Suggestions are NOT contextual** — they appear only on the dedicated /crm/agent page, same every time.
Entity detail pages (contact/account) show the scoped chat input WITHOUT suggestion chips.

### 1.5 Entity Scoping Badge

On entity detail pages, a badge appears ABOVE the text input inside the chat container:

- **Contact detail**: Shows "SC Sarah Chen" with initials avatar (green circle)
- **Account detail**: Shows account logo + account name
- **Badge position**: Above the input, inside the same container
- **Effect**: Queries from this input are scoped to the entity — the AI knows you're asking about that specific contact/account

---

## PHASE 2: MESSAGE ANATOMY

### 2.1 Thread Page Layout

When a message is sent, the URL changes to `/crm/thread/{thread_id}`. The thread has:

**Header bar:**
- Thread title (auto-generated from first query): "How many contacts do I have?"
- Chat bubble icon (left of title)
- "..." menu button
- "Copy this page link" button (link icon)
- "New chat" link → /crm/agent

**Message area:**
- Scrollable, centered layout
- Messages rendered as a vertical stack
- Full width of content area (1030px total, 716px max-width message area)

### 2.2 User Message Bubble

| Property | Value |
|----------|-------|
| Alignment | **RIGHT** (flex items-end on container) |
| Background | oklch(0 0 0 / 0.04) ≈ very faint grey (#f5f5f5 equivalent) |
| Text color | oklch(0 0 0 / 0.85) ≈ near-black |
| Border-radius | 10px (all 4 corners same — `rounded-[10px]`) |
| Padding | 8px 12px (py-2 px-3) |
| Font | Inter + CJK stack, 15px, weight 425 (slightly heavier than 400), line-height 24px |
| Max-width | Content-fit within 716px container (no explicit max-width) |
| Avatar | **NONE** — no user avatar or initials shown |
| Timestamp | **NONE** — no timestamp visible |
| Hover actions | Not tested yet |
| Bubble class | `bg-surface-primary rounded-[10px] px-3 py-2` |

**Design notes:**
- NOT a traditional chat bubble — it's a very subtle, almost transparent rounded rectangle
- The background `oklch(0 0 0 / 0.04)` is so light it barely registers visually — just enough to separate user message from AI response
- The bubble is inline-fit (shrinks to content width), not full-width
- White-space: `pre-wrap` (preserves line breaks)

### 2.3 AI Response

| Property | Value |
|----------|-------|
| Alignment | **LEFT** (items-stretch, default start) |
| Background | **NONE** — transparent, no bubble |
| Text color | oklch(0 0 0 / 0.85) |
| Border-radius | N/A |
| Padding | 0px 18px (side padding only via container) |
| Font | Inter + CJK stack, 15px, weight 425 (slightly bolder than 400), line-height 24px |
| Bold text (strong) | Font-weight 600 |
| Max-width | 680px text within 716px container |
| Avatar/icon | **YES** — sparkle icon (✦) + "Lightfield" label, 16px, weight 400, pure black |
| Timestamp | **NONE** |

**Design notes:**
- AI responses have NO bubble — they render directly on the white background
- This creates visual asymmetry: user = subtle bubble (right), AI = plain text (left)
- The "✦ Lightfield" label serves as the AI identity marker, replaces avatar
- Text container class: `space-y-4` for paragraph spacing

### 2.4 Status Indicators (Process Transparency)

Between the "✦ Lightfield" label and the response text, there's a **collapsible process log**:

**Collapsed state:** Shows `"Retrieved data"` as a clickable button
- Font: 13px, weight 425, color oklch(0 0 0 / 0.5) — medium grey
- Clickable — toggles expanded view

**Expanded state:** Shows step-by-step process:
1. `"Retrieved data"` (header, now expanded)
2. `📊 "Retrieved contacts data"` — table icon + description (also clickable for raw data)
3. `✓ "Done"` — checkmark + completion status

**Raw data view** (when clicking the sub-step):
Shows a card with:
- **File:** `contacts_count.csv` (in `<code>` badge)
- **Rows:** 5
- **Preview:** code block with:
  - Language tag: "csv" + copy button
  - Query description: "Retrieved 5 contacts ordered by lastInteractionAt:desc, createdAt:desc."
  - Command: "cat contacts_count.csv"
  - Full CSV data with all columns

**CRITICAL DESIGN INSIGHT**: Lightfield exposes the AI's data retrieval as inspectable "tool calls". Users can:
1. See WHAT data the AI accessed (which records, how many)
2. See HOW data was ordered/filtered
3. View the RAW data the AI processed
4. Verify accuracy of the response against source data

This is their version of citations — instead of inline links to sources, they show the entire data pipeline. Trust through radical transparency.

### 2.5 Streaming Behavior

**Observations** (from the speed of response appearance):
- Response appeared nearly complete within ~3 seconds of sending
- For a simple count query, no visible character-by-character streaming — appeared as a block
- The page navigated to a new URL (/crm/thread/{id}) immediately on send
- Thread title in header auto-populated from the query text
- Suggestion chips disappeared on send (replaced by thread view)
- Chat input remained at bottom, ready for follow-up
- Send button returned to disabled state after message sent

**Keyboard behavior confirmed:**
- Enter sends the message (not Shift+Enter)
- URL immediately changes to thread URL

### 2.6 Send Button States

| State | Background | Icon Color | Cursor |
|-------|-----------|------------|--------|
| Disabled (empty input) | oklch(0 0 0 / 0.04) = faint grey | oklch(0 0 0 / 0.25) = very faded | default |
| Enabled (text in input) | oklch(0.787 0.1124 249.79) = **blue** | oklch(1 0 0) = white | pointer |
| Size | 40x28px | Border-radius 6px | — |

---

## SCREENSHOTS INDEX

| # | File | Description |
|---|------|-------------|
| 001 | 001-up-next-page-at-rest.png | Up Next page with chat input visible at bottom |
| 002 | 002-accounts-page-chat-input.png | Accounts list — NO chat input |
| 003 | 003-contacts-page-chat-input.png | Contacts list — NO chat input |
| 004 | 004-opportunities-page-chat-input.png | Opportunities kanban — NO chat input |
| 005 | 005-sarah-chen-detail-slideover.png | Contact slide-over — NO chat input |
| 006 | 006-sarah-chen-full-detail.png | Contact full detail — HAS scoped chat input |
| 007 | 007-dedicated-chat-page.png | /crm/agent — suggestion chips + chat input |
