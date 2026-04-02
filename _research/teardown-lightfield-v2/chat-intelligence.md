# Lightfield Chat Intelligence — Synthesis

**Date**: 2026-04-02
**Source**: chat-forensics.md (24 screenshots, 10 phases of testing)

---

## 1. ARCHITECTURE MAP

```
User Input (contenteditable div, "Ask Lightfield")
     |
     | [Enter key / Send button click]
     |
     v
Page Navigation (/crm/thread/{id})
     |
     v
Scoping Resolution
  - If on entity detail page: scope = that entity (contact/account)
  - If on /crm/agent or /crm/up-next: scope = global
     |
     v
Context Gathering (server-side)
  - Search CRM records matching query intent
  - Cross-entity search: accounts, contacts, opportunities, tasks, meetings, notes
  - Sort: lastInteractionAt:desc, createdAt:desc
  - Export as CSV for LLM consumption
     |
     v
LLM Processing
  - Model: Unknown (likely GPT-4o or Claude — response quality suggests frontier model)
  - System prompt: CRM-aware, action-capable, safety-constrained
  - Tool calling: data retrieval, record creation, email drafting
  - Response format: Markdown with custom entity link syntax
     |
     v
Response Streaming (appears as complete blocks, not character-by-character)
     |
     v
Post-processing
  - Entity link injection: Convert CRM record references to clickable badges
  - Confirmation card rendering: For create/update actions
  - Email composer instantiation: For draft requests
  - Process transparency panels: Show tool call results (collapsible)
     |
     v
Display (no bubble for AI, subtle bubble for user)
```

---

## 2. DESIGN PATTERNS WE MUST REPLICATE

### 2.1 Entity Scoping Badge
- Show a colored badge above the chat input when on an entity detail page
- Badge = entity avatar (initials/logo) + entity name
- Creates scoped threads — queries are about THAT entity
- CSS: inline badge within the chat container, above the textbox

### 2.2 Confirmation Cards for Actions
- Structured card UI with: entity icon + header + details row + permission dropdown + Dismiss/Create
- Sequential for multi-step creation (account first, then contact)
- "Ask every time" permission dropdown for configurable automation
- Fields are EDITABLE on the card before confirming
- Buttons become disabled after approval (prevent double-click)

### 2.3 Inline Entity Links
- Every CRM record reference becomes a clickable badge
- URL pattern: `?hsot={type}&hsid={id}` appended to thread URL
- Opens slide-over panels within the chat thread (no navigation away)
- Visual: logo/initials + name in a styled inline component
- Types: c (contact), a (account), o (opportunity), t (task), ed (email draft)

### 2.4 Process Transparency Panels
- Collapsible "Retrieved data" / "Analyzed data" / "Ran code" indicators
- Show the AI's tool calls and their results
- Sub-steps with expandable raw data (CSV preview, query description)
- "Done" checkmark when processing complete
- CSS: 13px text, weight 425, color oklch(0 0 0 / 0.5) for indicators

### 2.5 Email Composer Slide-Over
- Full email editing interface: To (pill tags), From, Subject, Body
- Auto-populated from CRM data
- Editable everything
- Real "Send" button (requires email integration)
- Opens as right-side slide-over panel

### 2.6 Chat Input Design
- Sticky bottom, max-width 740px, centered
- contenteditable div (NOT textarea)
- Placeholder: "Ask Lightfield"
- Toolbar: history + settings (left), upload + send (right)
- Send button: disabled when empty (grey), enabled when text (blue)
- Container: white bg, 0.5px border, rounded-xl (10px), 8px padding
- Max height: 40vh (auto-expands)
- Enter sends, creates new thread URL

### 2.7 Message Layout
- User messages: RIGHT-aligned, subtle grey bubble (oklch 0 0 0 / 0.04), rounded-[10px], px-3 py-2
- AI messages: LEFT-aligned, NO bubble, plain text on white
- AI identity: sparkle icon + "Lightfield" label
- NO avatars, NO timestamps
- No hover actions observed

---

## 3. CAPABILITIES CHECKLIST

| Capability | Lightfield | Us | Gap |
|-----------|:----------:|:--:|-----|
| Free-text NL query | YES | YES | Similar |
| Suggestion prompts | YES (8 items, vertical list) | NO | Need to add |
| Entity-scoped chat | YES (contact + account detail pages) | NO | Critical gap |
| Inline entity links | YES (contacts, accounts, opps, tasks) | NO | Critical gap |
| Process transparency | YES (collapsible tool call results) | NO | Important gap |
| Table responses | YES (HTML tables with entity links) | Partial | Need entity links |
| Email drafting | YES (real composer slide-over) | NO | Critical gap |
| Record creation via chat | YES (confirmation cards, sequential) | NO | Critical gap |
| Confirmation cards | YES (editable, with permission dropdown) | NO | Critical gap |
| Permission control | YES ("Ask every time" dropdown) | NO | Future feature |
| Conversation memory (session) | YES (pronoun resolution works) | YES | Similar |
| Cross-session history | YES (threads in sidebar, persistent) | YES | Similar |
| Multi-language | YES (French tested, full response in French) | Partial | Need to verify |
| Off-topic handling | YES (polite deflection, no hallucination) | YES | Similar |
| Delete prevention | YES (refuses, not a capability) | YES | Similar |
| Nonexistent record handling | YES (truthful, offers alternatives) | YES | Similar |
| Contextual awareness | YES ("this person" on contact page) | NO | Critical gap |
| Slide-over panels from chat | YES (entities open inline) | NO | Important gap |
| Upload file | YES (button present) | NO | Future feature |
| Bulk actions | NOT TESTED | NO | Unknown |

---

## 4. WHAT MAKES IT FEEL LIKE MAGIC

### 4.1 The "It Just Knows" Moments

1. **Entity scoping** — On Sarah Chen's page, typing "tell me more about this person" just works. The chat KNOWS you're looking at Sarah Chen without you naming her.

2. **Pronoun resolution** — After asking about Meridian Labs' contacts, saying "what about their deals?" correctly resolves "their" to Meridian Labs. This feels like talking to a colleague who has context.

3. **Email composer from chat** — Saying "draft a follow-up email" produces a REAL email composer with auto-populated To, personalized body referencing actual CRM data, and a Send button. It's not text in a chat bubble — it's a fully functional email tool.

4. **Confirmation cards with editable fields** — When creating a contact, the confirmation card shows all fields and lets you EDIT them before confirming. The "Ask every time" dropdown implies you can configure the AI to auto-approve certain actions.

5. **Process transparency** — Seeing "Retrieved data" with expandable raw CSV data makes you TRUST the response. You can verify exactly what data the AI used.

### 4.2 What a Generic LLM Chat Cannot Do

1. **Inline entity links** — A ChatGPT wrapper shows text. Lightfield shows clickable badges with company logos that open slide-over panels. This requires deep product integration.

2. **Confirmation cards** — Action-oriented UI elements embedded in the chat stream. These are custom React components, not markdown.

3. **Entity scoping** — The chat knows what page you're on and adjusts its context. A wrapper can't do this.

4. **Email composer integration** — Draft → real email tool. Not just text generation but actual email sending capability.

5. **Sequential multi-step actions** — Create account → then create contact linked to it. The AI orchestrates a multi-step workflow with confirmation at each step.

### 4.3 What Makes a Founder Say "This is Worth $36/mo"

The single most valuable moment: **"Draft a follow-up email to Sarah Chen referencing SaaStr."** In one sentence, the founder gets:
- AI analysis of what data exists (transparency)
- A personalized, ready-to-send email (action)
- Full editing control before sending (trust)
- No context switching to an email tool (efficiency)

This saves 10-15 minutes of: looking up the contact → checking notes → opening email → writing the email → personalizing it. The ROI is immediately obvious.

---

## 5. WHAT TO BUILD FIRST

### Priority 1: Inline Entity Links (Foundation)
**Impact**: 10/10 — makes every response feel connected and navigable
**Effort**: Medium — need entity badge components + URL-based slide-over system
**Dependencies**: Entity detail pages must support `?hsot=` query param for slide-overs

### Priority 2: Entity-Scoped Chat
**Impact**: 9/10 — "tell me about this" is the most natural query possible
**Effort**: Medium — need scoping context passed to LLM, badge UI on detail pages
**Dependencies**: Chat must know which page the user is on

### Priority 3: Process Transparency Panels
**Impact**: 8/10 — builds trust, differentiates from "black box" AI
**Effort**: Low — collapsible UI components showing tool call results
**Dependencies**: Tool calls must be logged and surfaced

### Priority 4: Confirmation Cards for Actions
**Impact**: 8/10 — enables safe record creation/updates from chat
**Effort**: Medium-High — custom card components, permission system
**Dependencies**: Entity creation/update APIs, permission model

### Priority 5: Email Composer Integration
**Impact**: 9/10 — the #1 "wow" feature
**Effort**: High — full email composer UI, email sending integration, draft persistence
**Dependencies**: Email integration (Resend/Gmail), composer components

### Priority 6: Suggestion Chips
**Impact**: 5/10 — nice onboarding, but low ongoing value
**Effort**: Low — static list, easy to implement
**Dependencies**: None

---

## 6. CSS REFERENCE — EXACT VALUES TO REPLICATE

### Chat Input Container
```css
max-width: 740px;
border-radius: 10px;
padding: 8px;
border: 0.5px solid oklch(0 0 0 / 0.12);
background: oklch(1 0 0); /* white */
position: relative;
```

### Chat Input Textbox
```css
font-family: Inter, "Noto Sans KR", system-ui, sans-serif;
font-size: 15px;
font-weight: 400;
line-height: 22.5px;
color: oklch(0 0 0 / 0.85);
padding: 4px;
border-radius: 6px;
max-height: 40vh;
overflow: hidden auto;
```

### User Message Bubble
```css
background: oklch(0 0 0 / 0.04); /* near-invisible grey */
border-radius: 10px;
padding: 8px 12px;
font-size: 15px;
font-weight: 425;
line-height: 24px;
white-space: pre-wrap;
/* Container: flex items-end (right-aligned) */
```

### AI Response Text
```css
font-size: 15px;
font-weight: 425;
line-height: 24px;
color: oklch(0 0 0 / 0.85);
/* No bubble, no background, no border */
/* Container: padding 0 18px */
```

### AI Label ("Lightfield")
```css
font-size: 16px;
font-weight: 400;
color: rgb(0, 0, 0);
/* Preceded by sparkle icon */
```

### Process Indicator ("Retrieved data")
```css
font-size: 13px;
font-weight: 425;
color: oklch(0 0 0 / 0.5); /* medium grey */
cursor: pointer;
```

### Send Button (Enabled)
```css
width: 40px;
height: 28px;
border-radius: 6px;
background: oklch(0.787 0.1124 249.79); /* blue */
color: oklch(1 0 0); /* white icon */
```

### Suggestion Chips
```css
width: 100%; /* full container width, not pills */
height: 44px;
font-size: 15px;
font-weight: 425;
color: oklch(0 0 0 / 0.6); /* medium grey */
padding: 0 12px;
cursor: pointer;
/* Separated by 0.5px hairline bottom border via ::after */
```
