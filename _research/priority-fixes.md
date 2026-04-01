# Priority Fixes — Comprehensive Audit Results

**Date**: 2026-04-01
**Sources**: gap-analysis-v2.md, ui-teardown/, teardown-monaco-v2/, teardown-lightfield-v2/, settings-deep-dive.md, product screenshots (our-ui-001 through our-ui-005, e2e-001 through e2e-005)

---

## CRITICAL — Must fix before next checkpoint

### C1: Dashboard weekly summary shows empty state instead of real metrics
- **Current**: "No activity this week yet. Let's change that." even when data exists
- **Expected**: "This week: X sequences launched, Y responses, Z meetings, W opportunities" (Monaco pattern)
- **Screenshot**: our-ui-001-dashboard.png
- **Fix**: Query actual weekly metrics (sequence count, reply count, meeting count, opportunity count) and display even when counts are 0 ("This week: 0 sequences launched, 0 responses...")
- **Impact**: Dashboard is the first thing users see. Empty message signals "nothing works"

### C2: Dashboard priority cards show skeleton loading, not real data
- **Current**: Skeleton shimmer cards visible in screenshot with no real priority content
- **Expected**: Actionable task cards like "Nudge Alex Shan — Judgment Labs · $30,000 — Stalled 3 days" (Monaco pattern)
- **Screenshot**: our-ui-001-dashboard.png
- **Fix**: Ensure priority generation pipeline produces real priorities from deal/activity data. If no priorities exist, show helpful empty state instead of infinite skeleton
- **Impact**: Core value prop of dashboard is "what to do today" — skeleton loading defeats this

### C3: Score display uses plain numbers instead of letter grades + heat
- **Current**: Numeric score like "79" visible in accounts table
- **Expected**: "A 🔥 Burning" with letter grade + fire emoji + heat label (Monaco pattern)
- **Screenshot**: e2e-005-accounts-scored.png
- **Fix**: Map numeric scores to letter grades (90+→A, 75+→B, 60+→C, below→D) and heat levels based on signal recency (Burning/Warm/Cool/Cold). Display as composite badge
- **Impact**: Letter+heat is more intuitive than arbitrary numbers. Monaco's core UX innovation

### C4: Calendar sync not built (F2.2)
- **Current**: Feature marked passes: false, attempts: 0 in feature_list.json
- **Expected**: Google Calendar + Microsoft Calendar OAuth sync, meeting auto-detection, participant extraction
- **Fix**: Implement calendar sync with meeting auto-detection
- **Impact**: Foundation for meeting recording, meeting prep, structured extraction, daily calendar on dashboard. Blocks multiple downstream features
- **Dependencies**: Enables G9 (structured extraction), meeting recording, "Today's meetings" on dashboard

### C5: No mail pre-connection configuration
- **Current**: "Connect Gmail" button with no options
- **Expected**: Pre-connection config panel with: backsync range (1/3/6/12/24 months), visibility (metadata-only vs full access), do-not-track domains, auto-creation mode (disabled/selective/always), Google + Microsoft options
- **Screenshot**: our-ui-005-settings.png, Lightfield settings-003 through settings-009
- **Fix**: Add configuration step BEFORE OAuth flow (Lightfield pattern: settings configured upfront, then "Continue with Google/Microsoft")
- **Impact**: Trust-building. Founders need to control what gets synced before connecting

### C6: Custom fields / Data model not built
- **Current**: Fixed hardcoded schema (company, contact, deal with JSONB)
- **Expected**: Data model settings page where users can: create custom fields per entity, choose field types (Text, Date, Single/Multi select, URL, Social handle, Address, Markdown), set AI fill mode per field (Auto/Suggest/Off), see all fields with types and permissions
- **Reference**: Lightfield settings-020 (Data model page)
- **Fix**: Build data model configuration UI + schema extension system
- **Impact**: Lightfield's biggest differentiator. Without custom fields, our CRM can't adapt to each founder's workflow

---

## HIGH — Should fix in next sprint

### H1: No company logos in account tables
- **Current**: No logos visible in accounts table
- **Expected**: Small rounded square (~24px) company logos next to account names (Monaco pattern)
- **Fix**: Integrate Clearbit Logo API (or Logo.dev, Brandfetch) to fetch and cache company logos by domain
- **Impact**: Significant visual polish gap. Logos make the table scannable and professional

### H2: Chat input not persistent across all pages
- **Current**: "Ask LeadSens..." input visible on dashboard and chat page only
- **Expected**: Chat input bar visible at bottom of ALL pages (Lightfield pattern — persistent across Up Next, Accounts, etc.)
- **Fix**: Add persistent chat input component to main layout (not just dashboard and chat routes)
- **Impact**: AI should feel omnipresent, not siloed to one page

### H3: Signal display is count badge, not individual columns
- **Current**: Accounts table shows "Signals" column with a count (e.g., "3")
- **Expected**: Individual signal columns ("Common Investor?", "Sales-led growth?") with inline Yes/No badges, each clickable for reasoning popover (Monaco pattern)
- **Fix**: Render detected signals as individual columns with binary badges. Each "Yes" opens reasoning popover with Reasoning + Sources tabs
- **Impact**: Monaco's signal system is transparent (see each signal + why). Ours hides signals behind a count number

### H4: Microsoft OAuth for email sync
- **Current**: Gmail only ("Connect Gmail" button)
- **Expected**: Google + Microsoft OAuth options (Lightfield pattern: "Continue with Google" / "Continue with Microsoft")
- **Fix**: Add Microsoft Graph API integration for Outlook/Office 365 email sync
- **Impact**: Many founders use Outlook/Office 365. Blocking ~40% of potential users

### H5: Opportunity stage descriptions for AI training
- **Current**: Static stage labels (Lead, Qualification, Demo, etc.)
- **Expected**: Each stage has a description that the AI reads to auto-progress deals. Plus AI fill mode (Auto/Suggest/Off) and optional custom AI prompt
- **Reference**: Lightfield settings-021/022 (Opportunity stages)
- **Fix**: Add description field and AI fill mode to stage configuration. AI reads descriptions when deciding stage transitions
- **Impact**: Turns static stage labels into AI training data. More you describe your process, smarter the AI gets

### H6: Structured knowledge base — verify multi-topic format
- **Current**: Knowledge page exists but format unclear from screenshots
- **Expected**: Multi-topic structured pairs (Topic title + Content body), unlimited entries, add/remove independently (Lightfield pattern)
- **Fix**: If single textarea: rebuild as structured topic/content pairs. If already structured: verify add/remove/edit per topic works
- **Impact**: Structured knowledge is better than blob text for AI context

### H7: Meeting recording capability
- **Current**: Not built
- **Expected**: Meeting recording with AI notes panel alongside (Monaco pattern: split view — video left 60%, notes right 40%). Notes update in real-time with Summary, Key Points, and structured extraction
- **Fix**: Integrate meeting recording (Recall.ai or similar bot API) + real-time transcription + AI note generation
- **Impact**: Monaco's meeting intelligence is a core differentiator. Without recording, we can't do structured extraction from live calls
- **Note**: Depends on C4 (calendar sync)

### H8: Slide-over detail panels for entities
- **Current**: Entity details likely navigate to new page
- **Expected**: Click row in list → 388-400px slide-over panel from right with entity details, properties, related records (Lightfield pattern)
- **Fix**: Implement slide-over panel component. Trigger on list row click. Include entity header, property list, related records, close/expand buttons
- **Impact**: Keeps users in list context while viewing details. Reduces navigation depth

---

## MEDIUM — Nice to have, improves polish

### M1: Sub-pixel borders (0.5px)
- **Current**: Standard 1px borders
- **Expected**: 0.5px borders for ultra-thin definition (Lightfield pattern: 0.666px)
- **Fix**: Update border-width to 0.5px globally. Rounds to 1px on 1x displays, sharp on 2x
- **Impact**: Subtle refinement. Adds definition without visual weight

### M2: Notification system — 3-channel support
- **Current**: Notifications page exists but channel support unclear
- **Expected**: 6 notification types × 3 channels (Slack/Email/In-app) with per-type toggles and timing config
- **Reference**: Lightfield settings-010/011
- **Fix**: Build notification preference matrix UI + Slack integration + email notification service
- **Impact**: Enterprise-ready signal

### M3: User profile — language and timezone
- **Current**: First name, last name, email only
- **Expected**: Add language dropdown and timezone dropdown
- **Fix**: Add language and timezone fields to profile settings
- **Impact**: Per-user localization foundation

### M4: Domain exclusion (own company)
- **Current**: Not visible
- **Expected**: Workspace setting: "These domains will be associated with your company. No new accounts will be created for companies with these domains."
- **Reference**: Lightfield settings-016
- **Fix**: Add domain exclusion list to workspace settings. Filter own-company domains from account creation
- **Impact**: Prevents own company appearing as prospect. Quality-of-life improvement

### M5: Import history tracking
- **Current**: CSV import exists but no history
- **Expected**: Table of past imports: date, file name, record count, status
- **Fix**: Log each import to database and display in settings
- **Impact**: Auditability. Know what was imported when

### M6: Voice input on chat
- **Current**: Text input only
- **Expected**: Microphone icon on chat input bar (Lightfield pattern)
- **Fix**: Add Web Speech API or Whisper integration for voice-to-text
- **Impact**: Low — most desktop users type. But adds modern feel

### M7: Empty states with illustrations
- **Current**: Text-only empty states ("No meetings today", "No tasks due today")
- **Expected**: Icon/illustration + descriptive text + contextual CTA button
- **Fix**: Design and add SVG illustrations for each empty state. Add contextual guidance ("Connect your calendar to see meetings here")
- **Impact**: Empty states are the first impression for new users. Bare text feels unfinished

### M8: Persistent chat input animation
- **Current**: Static input bar
- **Expected**: Chat message entrance animation (fade in + slide up 4px, 100ms ease-out)
- **Fix**: Add CSS transitions to chat message rendering
- **Impact**: Subtle polish that makes AI feel responsive

### M9: Table row height optimization
- **Current**: Likely ~44-48px rows
- **Expected**: 36-40px dense rows (Monaco pattern)
- **Fix**: Reduce table row padding to achieve ~40px row height
- **Impact**: Fits more data on screen. "Bloomberg terminal" density signals professionalism

### M10: Badge auto-coloring by hash
- **Current**: May use fixed color mapping
- **Expected**: `hash(categoryString) % 10` → color from 10-hue palette with 10% bg + darker text
- **Fix**: Implement hash-based color assignment for all categorical badges (industry, stage, etc.)
- **Impact**: Consistent, automatic, visually distinctive badges without manual color assignment

---

## LOW — Polish items, can wait

### L1: Bottom navigation toolbar (Monaco pattern)
- 8-icon toolbar at bottom of product. Low priority since sidebar handles navigation.

### L2: Workflows / Automation (Lightfield Beta)
- "Create workflow" UI for automated actions. Still Beta in Lightfield. Can wait.

### L3: API keys management (Lightfield Beta)
- Create/manage API keys with scopes. Beta in Lightfield. Can wait.

### L4: MCP Connectors (Granola, Notion, Linear)
- Forward-thinking but not needed for MVP. Architecture consideration for later.

### L5: Custom meeting recorder avatar
- Depends on meeting recording feature. Cosmetic.

### L6: Billing redirect page
- Stripe/billing integration needed before commercial launch, not before product quality milestone.

### L7: Typewriter text animation for AI queries
- Monaco's "How could I have..." typing animation. Nice touch, purely cosmetic.

### L8: Light mode option
- Both modes for accessibility. Dark-first is fine for now.

### L9: Physical gift integration in sequences (Monaco)
- Veuve Clicquot in outbound sequences. Complex logistics. Skip for MVP.

### L10: Forward-deployed AE video integration (Monaco)
- "Monaco Expert" in video calls. Requires human headcount. Antithetical to autonomous mission.

---

## Summary Table

| Priority | Count | Examples |
|----------|-------|---------|
| CRITICAL | 6 | Dashboard empty state, score visualization, calendar sync, mail config, custom fields |
| HIGH | 8 | Company logos, persistent chat, signal columns, Microsoft OAuth, stage descriptions, knowledge format, meeting recording, slide-over panels |
| MEDIUM | 10 | Sub-pixel borders, notifications, profile fields, domain exclusion, import history, voice input, empty states, animations, row density, badge colors |
| LOW | 10 | Bottom nav, workflows, API keys, MCP connectors, recorder avatar, billing, typewriter anim, light mode, gifts, AE video |

**Total items: 34**

---

## Fix Order (Recommended)

### Sprint 1: Dashboard + Visual Quality (1-2 days)
- C1: Dashboard weekly summary with real metrics
- C2: Priority cards with real data (no infinite skeleton)
- C3: Score letter grades + fire + heat
- H1: Company logos in tables
- M9: Table row density (40px)

### Sprint 2: Email & Settings (2-3 days)
- C5: Mail pre-connection configuration
- H4: Microsoft OAuth
- H6: Verify/fix knowledge base format
- H5: Stage descriptions for AI
- M3: Language + timezone in profile
- M4: Domain exclusion

### Sprint 3: Core Features (3-5 days)
- C4: Calendar sync (F2.2)
- C6: Custom fields / Data model
- H3: Individual signal columns
- H2: Persistent chat across pages
- H8: Slide-over detail panels

### Sprint 4: Intelligence (3-5 days)
- H7: Meeting recording + AI notes
- M2: Notification 3-channel system
- M5: Import history
- M7: Empty states with illustrations
