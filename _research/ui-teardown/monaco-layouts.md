# Monaco Layout Patterns - Extracted from Screenshots

## Overall Architecture

Monaco uses a **single-page application** layout with these primary zones:

```
+-------------------------------------------------------------------+
|  [Logo]  [Navigation]                        [Login] [Request Demo] |  <- Top nav (website)
+-------------------------------------------------------------------+
|         |                                                          |
|         |                                                          |
| Sidebar |              Main Content Area                           |
|  (left) |              (flexible layouts)                          |
|         |                                                          |
|         |                                                          |
+-------------------------------------------------------------------+
|  [<] [>>] [>] [grid] [list] [gear] [...]                          |  <- Bottom toolbar (product)
+-------------------------------------------------------------------+
```

## Sidebar Structure

### Position & Size
- **Position**: Left side, fixed
- **Width**: Approximately 200-240px (estimated from product screenshots)
- **Background**: Darkest shade (`#0D0D0D` or close)
- **Full height**: Extends from top to bottom of viewport

### Sidebar Items (Reconstructed from Screenshots)
The sidebar is not fully visible in most screenshots, but from product page screenshots and hero frames, the following navigation items are inferred:

1. **Accounts / TAM** — The main table view showing all target accounts
2. **Sequences** — Sequence builder for outbound campaigns
3. **Meetings** — Grid of recorded meetings
4. **Pipeline** — Deal pipeline view
5. **Ask AI / CRO Copilot** — AI assistant panel (may be floating, not sidebar)
6. **Dashboard / Home** — Priority actions and daily summary

### Sidebar Item Design
- **Icon**: 20px line icon, left-aligned
- **Label**: Text next to icon, white when active, gray when inactive
- **Active indicator**: Subtle background highlight or left border accent
- **Sections**: Items may be grouped but no visible section headers in screenshots
- **Density**: Tight spacing between items

---

## Main Content Layouts

### Layout 1: Full-Width Data Table (TAM View)

```
+--+----------+----------+----------+----------+----------+----------+----------+
|☐ | Account  | Status   | Score    |Industries|Connected | Signal 1 | Signal 2 |
+--+----------+----------+----------+----------+----------+----------+----------+
|☐ | JudgLabs | New      | A 🔥Burn| AI Intel.| Sam, Mal | Yes      | Yes      |
|☐ | Bluenote | New      | A 🔥Burn| Soft dev.| Shek, To | Yes      | Yes      |
|☐ | Nowadays | New      | A 🔥Burn| AI Intel.| Malay D  | Yes      | Yes      |
|  | ...      | ...      | ...      | ...      | ...      | ...      | ...      |
+--+----------+----------+----------+----------+----------+----------+----------+
```

- **Usage**: Primary TAM / accounts list
- **Characteristics**:
  - Edge-to-edge horizontal, fills entire main content area
  - Scrollable vertically (15+ rows visible)
  - Scrollable horizontally (columns extend beyond viewport)
  - Column headers are sticky/fixed
  - Checkbox column for bulk actions
  - Dense rows (~36-40px height)
  - No visible pagination (appears to be infinite scroll or all-at-once)
  - Signal columns scroll right (Common Investor?, Sales-led growth?, YC Company?)
  - Columns are likely resizable (cursor shown hovering between columns)

### Row Expansion
When an account row is expanded:
```
+--+----------+----------+----------+----------+
|☐ | JudgLabs | New      | A 🔥Burn| AI Intel.|
+--+----------+----------+----------+----------+
   | Enyu Rao      | Founding Ops | Suggested |
   | Andrew Li     | Co-founder   | Suggested |
   | Alex Shan     | Co-founder   | Suggested |
+--+----------+----------+----------+----------+
```
- Contact rows are indented under the parent account
- Show name, title, and a green "Suggested" status
- Expandable/collapsible per account

### Signal Popover
When clicking a "Yes" badge:
```
+----------------------------------------+
| [Reasoning] [Sources]                  |  <- Tab bar
|                                        |
| Judgment Labs common investors with    |
| Monaco include Founders Fund.          |
|                                        |
| [Card 1] [Card 2] [Card 3]            |  <- Source article cards
+----------------------------------------+
```
- Floating popover, appears inline near the clicked cell
- Tabs for "Reasoning" (AI explanation) and "Sources" (evidence)
- Source cards show website favicons + titles
- Dark surface with rounded corners

---

### Layout 2: Split-Panel Detail (Sequence Builder)

```
+---------------------------+---------------------------+
| Sequence Timeline         | Email Preview             |
|                           |                           |
| Sam Blond → Alex Shan     | Recipient: Alex Shan      |
|                           | Subject: Congrats on...   |
| [1] Fundraise gifting     |                           |
|  |  Wait 3 business days  | [Gift Image]              |
| [2] Gift reminder         | Veuve Clicquot            |
|  |  Wait 3 business days  |                           |
| [3] Final message         | Message:                  |
|                           | Hi Alex - congrats on...  |
|                           |                           |
|                           |       [👎] [ Start ]      |
+---------------------------+---------------------------+
```

- **Left panel** (~40%): Vertical timeline of sequence steps
- **Right panel** (~60%): Preview of selected step's content
- **Split ratio**: Roughly 40/60
- **Step selection**: Clicking a step shows its preview on the right
- **Action buttons at bottom-right**: Reject (thumbs-down) and Start (white pill)

---

### Layout 3: Chat Thread View

```
+-----------------------------------------------+
|                                                |
|        [Response from Alex Shan]               |
|        Thanks for the Veuve! I'm              |
|        interested in learning more...          |
|        2 hrs ago  [Email]                      |
|   [avatar]                                     |
|                                                |
|                  [Your reply]                  |
|                  Let's meet Tuesday at 1pm,    |
|                  I'll give you a walkthrough!  |
|                  1 minute ago  [Email]         |
|                                                |
| +-------------------------------------------+ |
| | Suggested reply                            | |
| | [                                        ] | |
| | B I ☰ ≡              Sent from sam@...     | |
| +-------------------------------------------+ |
+-----------------------------------------------+
```

- **Chat bubbles**: Left-aligned for incoming, potentially right-aligned for outgoing
- **Message format**: Header label → body text → metadata (timestamp + channel badge)
- **Suggested reply**: Pre-filled input at bottom with rich text toolbar
- **Channel badge**: "Email" with envelope icon (could also show "Slack", "Call", etc.)
- **Thread is unified**: Shows messages from multiple channels in one chronological stream

---

### Layout 4: Meeting Recorder Split

```
+------------------------------+---------------------+
|                              | Meeting Notes        |
|   [Video Player]             | Virtual Meeting with |
|   Alex Shan [name tag]       | Alex Shan            |
|                   [rec dot]  |                      |
|                              | Great first call...  |
|                              |                      |
|   [||] 3:00/33:00  🔊 ⛶ ⋯   | Key Points           |
|   [━━━━━━━━━━━━━━━━━━━━━]    | • Current CRM is     |
+------------------------------+   Hubspot             |
                               | • Point solutions    |
                               |   are Apollo and     |
                               |   Fireflies          |
                               +---------------------+
```

- **Left panel** (~60%): Full video player with standard controls
  - Participant name overlay (top-left, gray badge)
  - Recording indicator (top-right, red dot)
  - Play/pause, timestamp, volume, fullscreen, more menu
  - Progress bar at bottom
- **Right panel** (~40%): AI-generated meeting notes
  - Title: Meeting name
  - Summary paragraph
  - "Key Points" section with bullet list
  - Notes update in REAL-TIME as the meeting progresses
  - Auto-extracted structured data (CRM, point solutions, budget)

---

### Layout 5: Card Grid (Meetings)

```
+-------------+-------------+-------------+-------------+
| Demo Call   | Demo Call   | Demo Call   | Demo Call    |
| for Delve   | for Camp..  | for Agent..  | for Galileo |
| Video Mtg   | Video Mtg   | Video Mtg   | Video Mtg   |
+-------------+-------------+-------------+-------------+
| Demo Call   |[Demo Call ] | Demo Call   | Demo Call    |
| for Serval  |[for JudgL] | for Casca   | for Adapt   |
| Video Mtg   |[Video Mtg]  | Video Mtg   | Video Mtg   |
+-------------+-------------+-------------+-------------+
| Demo Call   | Demo Call   |             |              |
| for Solve.. | for Sing..  |             |              |
| Video Mtg   | Video Mtg   |             |              |
+-------------+-------------+-------------+-------------+
```

- **Grid**: 4 columns, variable rows
- **Card size**: Consistent, ~200x100px each
- **Selected card**: Blue-teal glow/highlight border
- **Card content**: Title + subtitle + "View more"
- **Spacing**: ~12-16px gaps between cards

---

### Layout 6: Pipeline List + Detail

```
+------------------+-----------------------------------+
| Pipeline Cards   | Overview                          |
|                  |                                   |
| [logo] Dust      | Summary                           |
|        $55,000   | Judgment Labs in active eval...   |
|                  |                                   |
| [logo] JudgLabs⚡| • Oct 27, 2025: Monaco <> Judg... |
|        $30,000   | • Oct 23, 2025: Slack channel...  |
|                  |                                   |
| [logo] Vellum AI |                                   |
|        $45,000   |                                   |
|                  |                                   |
| [logo] LangSmith |                                   |
|        $40,000   |                                   |
+------------------+-----------------------------------+
```

- **Left panel**: Scrollable list of deal cards (vertical stack)
  - Each card: logo + company name + dollar value
  - Selected card has subtle highlight
  - Lightning/sparkle icon on some (active deals?)
- **Right panel**: Detail view for selected deal
  - "Overview" header
  - AI-generated summary paragraph
  - Chronological timeline of interactions (dated bullet points)
- **Split ratio**: ~35/65

### Pipeline Card Grid (Alternative View)

```
+-----------------+-----------------+
| [logo] Vellum AI| [logo] JudgLabs |
|        $45,000  |        $30,000⚡ |
+-----------------+-----------------+
| [logo] Nango    | [logo] Akka     |
|        $35,000  |        $40,000  |
+-----------------+-----------------+
| [logo] Adept AI | [logo] Log10    |
|        $40,000  |        $35,000  |
+-----------------+-----------------+
```

- **2-column grid**: Alternative to vertical list (seen in hero-0075)
- **Cards**: Larger format with more prominent logos

---

### Layout 7: Dashboard / Home

```
+------------------------------------------------------+
| Good morning, Sam                                     |
| This week: 45 sequences, 12 responses, 2 meetings,   |
| 8 opportunities                                      |
+---------------------------+--------------------------+
| Your priorities today     | Your 2 meetings today    |
|                  See All  |                 See All   |
| [!] Nudge Alex Shan      | Remotely Demo 2          |
|     JudgLabs • $30K      | 2:30 - 4:00 PM           |
|     Stalled 3 days       |                          |
|                           | Philip (AfterPay) & Sam  |
| [!] Respond to Gabriel   | 8:30 - 9:00 AM           |
|     Dust • $55K          |                          |
|     Received 5 days ago  +--------------------------+
|                           | Nudge Alex Shan (CEO)   |
| [✓] Set up Slack channel | [Respond from Inbox]     |
|     JudgLabs • $30K      |                          |
|     Due Feb 15           | Hey Alex!                |
|                           | Email thread content...  |
| [✓] Send collateral      |                          |
|     Compass • $43K       | [Draft reply area]       |
|     Due Feb 16           |                          |
+---------------------------+--------------------------+
| [<] [>>] [>] [⊞] [☰] [⚙] [...]                     |
+------------------------------------------------------+
```

- **Greeting**: Personalized, top-left
- **Weekly summary**: Stats bar below greeting
- **Two main columns**:
  - Left: Priority action items (task cards with checkboxes, status badges, due dates)
  - Right: Meetings + email detail/draft
- **Priority tasks** include:
  - Alert indicators (stalled, overdue)
  - Account + opportunity info
  - Monetary value
  - Due dates
- **Right panel morphs**: Clicking a priority opens its detail (email draft, meeting info)
- **Bottom toolbar**: Navigation icons across full width

---

## Information Density Comparison

### Monaco vs. Typical CRM (e.g., Salesforce, HubSpot)

| Dimension | Monaco | Typical CRM |
|-----------|--------|-------------|
| Row height | ~36-40px | ~48-56px |
| Columns visible | 8+ simultaneously | 4-6 typically |
| Whitespace ratio | Very low (~15%) | High (~35-40%) |
| Data per screen | 15+ accounts with signals | 8-12 records |
| Signal display | Inline Yes/No badges | Separate detail pages |
| AI content | Inline (popovers, side panels) | Separate tab/page |
| Navigation depth | 1-2 clicks to any data | 3-5 clicks typical |

Monaco is SIGNIFICANTLY denser than typical CRMs. It follows a "terminal/cockpit" philosophy where maximizing information per screen is prioritized over visual comfort. This is consistent with their target user: experienced sales operators who want data, not onboarding wizards.

---

## Navigation Patterns

### Primary Navigation
- **Sidebar**: Main sections (Accounts, Sequences, Meetings, Pipeline, etc.)
- **No visible breadcrumbs** in any screenshot
- **No visible tabs** for top-level navigation (sidebar handles everything)

### Secondary Navigation
- **Within views**: Tab bars exist (e.g., "Reasoning" | "Sources" in signal popovers)
- **Bottom toolbar**: Icon-based, appears on dashboard view (purpose unclear — may be app-wide or dashboard-specific)
- **Right-click / context menus**: Not visible in screenshots

### Modal / Overlay Patterns
- **Ask AI**: Floating centered modal with semi-transparent background
- **Follow-up email**: Floating composer panel
- **Signal reasoning**: Inline popover near the clicked element
- **Sequence preview**: Side panel (not modal)

### Detail View Access
- **Account detail**: Expand row in table, or click to open side panel
- **Meeting detail**: Click card in grid to open split video+notes view
- **Pipeline detail**: Click deal card to open right-side overview panel
- **Priority detail**: Click task on dashboard to open email/action panel on right

---

## Responsive Behavior

From screenshots, Monaco appears to be designed for **desktop only** (large screens, 1440px+). Evidence:
- Dense multi-column tables that would not work on mobile
- Split-panel layouts that require horizontal space
- No visible mobile navigation patterns (hamburger menu, bottom tab bar for mobile)
- All screenshots show desktop-width viewports
- Target users are at their desks selling, not on phones

---

## The "Dot Grid" Background

Multiple hero video frames show a subtle dotted grid pattern on the background:
- Evenly spaced small dots in a grid formation
- Very low contrast (barely visible against the dark background)
- Creates a subtle "technical" or "blueprint" aesthetic
- Used on the product demo background, marketing page hero section
- NOT visible in the actual product UI (only in marketing/demo presentation context)

---

## Key Layout Principles

1. **Everything is dark**: No light mode, no light surfaces anywhere
2. **Split panels over full-page navigation**: Detail views open alongside lists, not replacing them
3. **Inline AI content**: AI-generated insights (reasoning, coaching, notes, drafts) appear IN CONTEXT, not in a separate AI page
4. **Dense tables for data, cards for deals**: Accounts use data tables; pipeline/meetings use card layouts
5. **Human-in-the-loop bottom bar**: Approve/reject controls (Start/thumbs-down) at the bottom of AI-generated content
6. **Minimal chrome**: Very little UI decoration — no colored headers, no gradient backgrounds, no illustrations. Just data and controls
7. **Chat-like interactions**: Email threads rendered as chat bubbles, suggested replies as chat input — treating all communication channels as a unified conversation
