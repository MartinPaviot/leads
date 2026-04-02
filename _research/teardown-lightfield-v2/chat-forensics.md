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

## PHASE 3: RESPONSE FORMATTING

### 3.1 Table Format — "Show me all contacts at Meridian Labs"

**Response structure:**
1. Intro text: "There is one contact on record for Meridian Labs:"
2. **Field/Details table** (NOT a multi-row contact list):
   - Columns: Field | Details
   - Rows: Name (linked), Title, Email (mailto link), Notes
3. Inline account badge: "🔵 Meridian Labs" (linked to account record)

**Table CSS:**
- HTML `<table>` element, not markdown or custom component
- Column headers: "Field", "Details" — plain text, no special styling
- Field names in `<strong>` (bold)
- Contact name: linked with initials avatar circle ("SC") + "Sarah Chen"
- Email: linked with `mailto:` URL
- Clean, borderless rows

**Entity links in response:**
- Contact: `?hsot=c&hsid={contactId}` — opens contact slide-over
- Account: `?hsot=a&hsid={accountId}` — opens account slide-over
- Opportunity: `?hsot=o&hsid={opportunityId}&hsaid={accountId}` — opens opportunity
- Email draft: `?hsot=ed&hsid={draftId}` — opens email composer
- Task: `?hsot=t&hsid={taskId}` — opens task detail
- Entity badges include company logos (auto-generated) and initials avatars

### 3.2 Email Draft — "Draft a follow-up email to Sarah Chen"

**Response includes THREE parts:**

**Part 1 — Analysis panel** (expandable "Analyzed data"):
- "Analyzed 1 account" sub-step
- Shows what data the AI found:
  - Notes the CRM has only a brief note from SaaStr 2025
  - Quotes the note in a blockquote with italics
  - Mentions the existing follow-up task with due date
  - Links to Sarah Chen contact record
- This is the AI "showing its work" before drafting

**Part 2 — Email draft card** (inline in chat):
- Email icon + subject line preview ("Great connecting at SaaStr!")
- Body preview truncated ("Hi Sarah, It was great meeting you...")
- "Sarah Chen" entity badge (linked)
- "Draft" status badge
- Clicking opens the email composer slide-over

**Part 3 — Commentary text:**
- "I kept it concise since the CRM only had a brief note... I can personalize it further before you send."
- AI proactively explains its limitations and offers to iterate

**Email Composer Slide-Over:**
- **Header**: Email icon + subject + close (X) button
- **To**: sarah@meridianlabs.io (pill tag with X delete, editable)
- **Cc Bcc**: expandable button
- **From**: "No email account connected" (grayed out — needs setup)
- **Subject**: "Great connecting at SaaStr!" (editable textbox)
- **Body**: Multi-paragraph personalized email (editable contenteditable):
  - "Hi Sarah,"
  - References SaaStr 2025, API product, Meridian Labs
  - Proposes call scheduling
  - Sign-off with "Martin Paviot / Elevay"
- **Send button**: Blue "✈ Send" at bottom right (requires email integration)

**CRITICAL**: This is a REAL email composer, not text output. Editable fields, real send capability, properly structured with To/From/Subject/Body separation.

### 3.3 List/Priority Format — "What should I focus on today?"

**Response structure:**
1. Opening: "I'll look across your accounts to find what needs attention today."
2. "Retrieved data" indicator
3. Bold sections:
   - **"No meetings or tasks are scheduled for today."**
   - **"One open opportunity to consider:"**
4. Entity breadcrumb: 🔵 Meridian Labs > ○ Meridian Labs - API Product Deal — **Qualification** stage
5. Bullet points with contextual analysis:
   - "Met Sarah Chen (CTO) at SaaStr 2025; she showed interest..."
   - "No next steps defined, no last interaction recorded..."

**Formatting patterns observed:**
- Bold text for section headers and key data
- Entity breadcrumbs for hierarchical navigation (Account > Deal)
- Bullet lists for analysis details
- Inline entity badges with logos for all CRM records
- No numbered priorities — organic prose structure

### 3.4 Response Formatting Summary

| Content Type | Formatting Used |
|-------------|----------------|
| Count query | Plain paragraph with bold number |
| Contact list | HTML table (Field/Details layout) with entity links |
| Email draft | Inline card + slide-over composer |
| Priority/focus | Bold headers + entity breadcrumbs + bullet lists |
| Opportunity details | HTML table (Field/Value) with entity links |
| Meeting prep | Generated document + email draft (dual output) |
| Error/not found | Plain paragraph with suggestions |

All responses use Inter font, 15px, weight 425. Bold text uses weight 600.

---

## PHASE 4: CITATIONS — INLINE ENTITY LINKS

### 4.1 Citation Mechanism

Lightfield does NOT use traditional footnote-style citations. Instead, it uses **inline entity links** — clickable references to CRM records embedded in the response text.

**Types of entity links observed:**

| Entity Type | URL Pattern | Display | Opens |
|-------------|------------|---------|-------|
| Contact | `?hsot=c&hsid={id}` | Initials avatar circle + name | Contact slide-over |
| Account | `?hsot=a&hsid={id}` | Company logo + name | Account slide-over |
| Opportunity | `?hsot=o&hsid={id}&hsaid={accountId}` | Company logo + pipeline icon + deal name | Opportunity slide-over |
| Task | `?hsot=t&hsid={id}` | Checkbox icon + task name | Task detail |
| Email draft | `?hsot=ed&hsid={id}` | Email icon + subject + preview | Email composer slide-over |

**Entity badge styling:**
- Rendered as inline `<link>` elements with custom display components
- Account badges show auto-generated company logos (colored squares with text)
- Contact badges show initials circles (e.g., "SC" for Sarah Chen)
- All are clickable and open slide-over panels within the chat thread
- The slide-over overlays the chat, keeping context

### 4.2 Data Transparency (Alternative to Citations)

Instead of linking to source documents, Lightfield shows the **data retrieval process**:

**Collapsible "Retrieved data" panels:**
- Button labeled "Retrieved CRM data", "Retrieved data", or "Analyzed data"
- Expandable sub-steps: "Retrieved 'Meridian Labs'", "Analyzed 1 account", etc.
- Each sub-step can be expanded to show raw data:
  - CSV previews with file name, row count, column headers
  - Tables showing which records were found/not found
  - Query descriptions ("Retrieved 5 contacts ordered by lastInteractionAt:desc")
  - "Done" checkmark indicator

**This replaces citations** — instead of saying "according to [email from March 15]", Lightfield says "I retrieved your contacts data, processed 5 records, and here's the raw CSV."

### 4.3 Citation Quality Assessment

**Strengths:**
- Every entity reference is a clickable link to the actual record
- Links open in-context (slide-over within chat), preserving conversation
- Data retrieval is fully transparent and inspectable
- Account/contact badges are visually distinct with logos and initials

**Weaknesses:**
- No citation to specific interactions (emails, calls, meeting notes)
- No quote blocks from original sources in most responses
- The data panel shows raw CSV, not specific highlighted evidence
- No "confidence score" or "source reliability" indicators

---

## PHASE 5: ACTIONS IN CHAT

### 5.1 Record Creation Flow

**Full flow tested: "Add John Smith at Acme Corp"**

**Step 1 — Search**: AI searches CRM for "John Smith" — not found
**Step 2 — Offer**: Tells user "not found" and offers to create or search differently
**Step 3 — Clarification**: User says "add as new contact at Acme Corp"
**Step 4 — Account check**: AI searches for "Acme Corp" — not found
**Step 5 — Options**: Offers to create Acme Corp or link to existing account
**Step 6 — User confirms**: "Option 1 — create Acme Corp"

**Step 7 — Confirmation Card (Account)**:
- Structured card with:
  - Header: "Acme Corp account" (building icon)
  - Content: building icon + "Acme Corp" | globe icon + "acme.com" | avatar
  - Permission dropdown: "Ask every time ∨"
  - Buttons: "Dismiss" | "Create"
- **Editable fields** on the card before confirming!

**Step 8 — User clicks Create** → Account created (buttons become disabled)

**Step 9 — Confirmation Card (Contact)**:
- Header: "John Smith contact" (people icon)
- Content: "JS" initials | "John Smith" | email icon + "john@acme.com" | "No opportunity" | building icon + "Acme Corp"
- Same Dismiss/Create buttons

**Step 10 — User clicks Create** → Contact created
**Step 11 — Confirmation**: "Both records are created. Anything else?"

**KEY DESIGN PATTERNS:**
1. **Search before create** — never blindly creates, always checks first
2. **Sequential confirmation** — account first, then contact linked to it
3. **Confirmation cards** — structured UI elements, not just text
4. **Permission control** — "Ask every time" dropdown (configurable automation level)
5. **Editable pre-create** — fields can be modified on the card before confirming
6. **Auto-generated assets** — company logos and initials avatars created automatically

### 5.2 Dangerous Actions

**"Delete all my contacts"** response:
- "I'm not able to delete records from the CRM — that's not a capability I have access to."
- "If you need to delete contacts, you'll need to do so manually through the CRM interface."
- No data retrieval attempted — immediate refusal
- Polite redirect to manual interface

**Safety model**: Delete operations are not available as AI capabilities. Only CREATE and READ actions exist in the chat.

---

## PHASE 6: CONVERSATION MEMORY

### 6.1 Within-Session Pronoun Resolution

**Test: "Show me all contacts at Meridian Labs" → "What about their deals?"**
- **Result**: AI correctly resolved "their" = Meridian Labs
- Response: "Here's the opportunity on record for 🔵 Meridian Labs:"
- Showed the Meridian Labs - API Product Deal with stage and value

**Test: "Tell me about John Smith" → "Yes, add John Smith as a new contact..."**
- Maintained full context across 4 messages in the thread
- Correctly created account + contact with all specified details

### 6.2 Cross-Session Memory

- Chat threads are preserved in the sidebar under "Chats" section
- Previous threads listed with titles (auto-generated from first query)
- Threads accessible via direct URL: `/crm/thread/{id}`
- Sidebar shows 5 most recent threads + "More" combobox for older ones
- Clicking a previous thread loads the full conversation history

---

## PHASE 7: ERROR HANDLING & EDGE CASES

### 7.1 Nonexistent Records

**"Tell me about John Smith"** (not in CRM):
- "I wasn't able to find anyone named John Smith in your CRM — no contacts, accounts, opportunities, or meetings matched that name."
- Searched across ALL record types (contacts, accounts, opportunities, meetings)
- "It's possible the person isn't in your system yet, or the name may be recorded differently."
- Offered alternatives: search differently or create
- **NO HALLUCINATION** — correctly reported not found

### 7.2 Dangerous Operations

**"Delete all my contacts"**:
- Immediate refusal — "not a capability I have access to"
- No data retrieval attempted
- Redirect to manual CRM interface

### 7.3 Off-Topic (from v1 teardown)

**"What's the weather in Paris?"**:
- Polite deflection with helpful alternatives
- Doesn't attempt to answer from CRM data
- Suggests weather.com or Google

---

## PHASE 8: CHAT ACROSS THE PRODUCT

### 8.1 Contextual Awareness

**Contact detail page + "Tell me more about this person"**:
- AI correctly identified "this person" = Sarah Chen (from scoped chat badge)
- Response: "Here's what I found about Sarah Chen:" with full profile summary
- **Scoped chat creates scoped threads** — the thread retains the entity scope
- The "Sarah Chen" badge persists in the thread view's chat input

### 8.2 Scoping Architecture

The chat input is contextually scoped based on where you are:

| Location | Chat Scope | Badge Shown | Thread URL |
|----------|-----------|-------------|------------|
| /crm/agent (dedicated chat) | Global | None | /crm/thread/{id} |
| /crm/up-next (dashboard) | Global | None | /crm/thread/{id} |
| /crm/contact/{id} (detail) | Contact-scoped | "SC Sarah Chen" | /crm/thread/{id} |
| /crm/account/{id} (detail) | Account-scoped | "🔵 Account Name" | /crm/thread/{id} |

**Slide-over panels within threads:**
Entity links in responses open slide-over panels that overlay the chat. This means you can:
1. Ask a question about Meridian Labs
2. Click a contact link in the response
3. See the contact details in a slide-over
4. Close the slide-over and continue the conversation
All without leaving the thread.

---

## PHASE 9: PERFORMANCE & FEEL

### 9.1 Response Times (Approximate)

| Query Type | Time to First Token | Total Response Time |
|-----------|--------------------|--------------------|
| Simple count ("how many contacts") | ~2-3s | ~3-5s |
| Data retrieval ("contacts at Meridian Labs") | ~5-8s | ~10-15s |
| Action + analysis ("draft email") | ~8-12s | ~15-25s |
| Record creation (confirmation card) | ~5-10s | ~10-15s |
| Error/refusal ("delete all contacts") | ~2-3s | ~3-5s |

### 9.2 Streaming Observations

- Page navigates to thread URL immediately on send (URL: `/crm/thread/{id}`)
- Response appears to arrive as a complete block, not character-by-character
- For short responses, no visible streaming animation
- The "✦ Lightfield" label and status indicator appear before the response text
- Thread title auto-populates from the first query text
- Chat input returns to empty state immediately after send
- Send button re-disabled immediately
- "Scroll to bottom" button appears when content overflows viewport

### 9.3 Overall Feel

- Feels **responsive and professional** — not like a chatbot
- The structured confirmation cards and entity badges make it feel like a product, not just an LLM wrapper
- Data transparency (expandable retrieval panels) builds trust
- Entity links with logos/avatars make responses feel rich and connected
- The email composer slide-over is the highlight — feels like a real email tool

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
| 008 | 008-chat-input-with-text.png | Input with text, send button enabled (blue) |
| 009 | 009-message-sent-streaming-start.png | Response complete — user bubble right, AI left |
| 010 | 010-retrieved-data-expanded.png | Expanded process indicators (Retrieved data) |
| 011 | 011-retrieved-data-raw-csv.png | Raw CSV data panel with file/rows/preview |
| 012 | 012-table-response-meridian-contacts.png | Table response with entity links |
| 013 | 013-email-draft-composer.png | Email composer slide-over with draft |
| 014 | 014-conversation-memory-their-deals.png | Pronoun resolution: "their" = Meridian Labs |
| 015 | 015-deals-response-scrolled.png | Deal details with Field/Value table |
| 016 | 016-focus-today-list.png | Priority list with entity breadcrumbs |
| 017 | 017-nonexistent-contact-john-smith.png | "Not found" response — no hallucination |
| 018 | 018-create-contact-response.png | Account not found, offers create/link options |
| 019 | 019-contact-created-confirmation.png | Confirmation card with Create/Dismiss |
| 020 | 020-account-created-contact-pending.png | Account created, contact card pending |
| 021 | 021-contact-created-final.png | Both records created after sequential confirmation |
| 022 | 022-both-created-final.png | "Both records are created" confirmation |
| 023 | 023-delete-all-contacts-response.png | Delete refused — "not a capability" |
| 024 | 024-scoped-chat-contextual.png | Scoped chat: "this person" = Sarah Chen |
