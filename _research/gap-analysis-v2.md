# Gap Analysis v2 — LeadSens vs Monaco vs Lightfield (Comprehensive)

**Date**: 2026-04-01
**Our status**: 48 features in feature_list.json, all marked PASS
**Product screenshots reviewed**: our-ui-001 through our-ui-005, e2e-001 through e2e-005
**Sources**: teardown-monaco-v2/, teardown-lightfield-v2/, ui-teardown/, settings-deep-dive.md, settings-intelligence.md

---

## IMPORTANT: Feature Presence ≠ Quality Parity

Almost all gap features from the original analysis (G1-G20) are now marked as PASS in feature_list.json. However, PASSING an eval rubric does not mean we match competitor quality. This analysis compares **quality, depth, and polish** — not just feature existence.

---

## 1. ONBOARDING & FIRST-RUN EXPERIENCE

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Signup flow | Demo-gated, no self-serve | Magic link email, profile creation | Clerk OAuth (Google/Microsoft) | **Built, ahead** | We're ahead — self-serve beats demo-gated | — |
| First-run wizard | Unknown (demo-gated) | Mail sync prompt, pricing page | Onboarding flow with ICP config | **Built** | Good foundation | No guided tour, no sample data |
| Mail/calendar connection | Unknown | Pre-connection config (backsync, visibility, do-not-track, auto-creation mode) | "Connect Gmail" button only | **Partial** | SIGNIFICANT | Missing: backsync range selector, visibility (metadata-only vs full), do-not-track domains, auto-creation mode (disabled/selective/always) |
| Empty state handling | Unknown | Bare "No meetings" text with "Go to settings →" link | Skeleton loading cards on dashboard | **Partial** | Both competitors are weak here | Our skeleton cards are better than Lightfield's bare text but still show no actionable guidance |
| Time to first value | Pre-built TAM on signup | Auto-enrichment on import | Manual account creation + enrichment | **Built** | Monaco wins — instant TAM | We require manual trigger ("Enrich All" button); should auto-enrich on creation |

## 2. TAM / PROSPECTING

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Account table density | 8+ columns, 36-40px rows, 15+ accounts visible | 4-5 columns, ~44px rows, 5-6 accounts | 8+ columns visible, good density | **Built, near parity** | Close to Monaco | Row height may be slightly taller than Monaco's 36px |
| Score display | Letter grade (A-F) + 🔥 fire emoji + "Burning/Warm/Cold" heat label | No scoring | Numeric score (e.g. "79") with color | **Built but different** | QUALITY GAP | Our numeric score is less intuitive than Monaco's letter+heat system. G11 (score visualization) is marked PASS but screenshots show plain numbers, not letter grades with fire emoji |
| Signal columns | Binary Yes/No with color-coded badges (green/muted) | No signals | Signal count badge per row | **Built but different** | QUALITY GAP | We show signal COUNT; Monaco shows individual signal VALUES inline as columns. Each signal is a separate column with Yes/No |
| Per-signal reasoning | Click Yes → popover with "Reasoning" + "Sources" tabs, cited URLs with favicons | No equivalent | G2 marked PASS | **Built** | Need to verify popover has two tabs (reasoning + sources) with real URL citations and favicons |
| Contact auto-suggestion | Expand account row → auto-discovered contacts with "Suggested" status | Contact list separate from accounts | G3 marked PASS | **Built** | Need to verify expandable rows under accounts show contacts |
| Account logos | Real company logos (small rounded square ~24px) in table | Auto-generated colored icons | No logos visible in screenshot | **Missing** | Monaco shows real company logos; we show no logos | Need company logo fetching (Clearbit Logo API or similar) |
| Custom boolean signal columns | Configurable: "Common Investor?", "Sales-led growth?", "YC Company?" | No equivalent | G18 marked PASS | **Built** | Need to verify these are configurable per workspace |
| "Connected to" column | Team member names with colored avatars showing relationship | No equivalent | Not visible in screenshots | **Unclear** | Monaco's social selling feature — showing which team member is connected to the account | May need team member relationship mapping |
| Account lifecycle stages | 7 stages: New, Prospecting, Opportunity, Customer, Disqualified, Inbound, Nurture | 7 kanban stages (Lead through Lost) | G16 marked PASS | **Built** | Need to verify color-coded pills for each stage |
| Industry badges | Multi-colored pills, auto-assigned colors per industry | Multi-colored pills, OKLCH-based auto-color | Colored badges visible in screenshot | **Built** | Close to parity | Verify auto-color assignment by industry hash |

## 3. CUSTOMER MEMORY & AUTO-CAPTURE

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Email sync | Unknown internal | Google + Microsoft OAuth, pre-connection config | Gmail OAuth | **Built** | Lightfield's pre-connection config is superior | Missing: Microsoft OAuth, backsync range, visibility settings, do-not-track domains, auto-creation modes |
| Calendar sync | Meeting recording built-in | Calendar auto-sync for meetings | F2.2 NOT built (passes: false, attempts: 0) | **NOT BUILT** | CRITICAL GAP | Calendar sync is the foundation for meeting intelligence. Without it, no meeting recording, prep, or structured extraction |
| Meeting recording | Full video recording with playback controls, 33-min calls | Meeting transcript processing + summarization | Not built | **NOT BUILT** | CRITICAL GAP | Monaco records meetings and plays them back with AI notes alongside. We have no recording capability |
| Structured data extraction | Auto-extracts budget ($30K), team size (4), CRM (Hubspot), point solutions (Apollo, Fireflies) from meetings | No equivalent | G9 marked PASS (extraction from meeting notes) | **Partial** | Our extraction works on text notes; Monaco extracts from LIVE MEETING AUDIO in real-time with "Updating..." loading state |
| Activity timeline | Auto-generated dated timeline from emails, meetings, Slack | No explicit timeline | F2.4 PASS, G8 PASS | **Built** | Need to verify chronological interaction history on deal detail pages |
| Auto-summarization | Meeting notes with Summary + Key Points + Budget/Team Size sections | AI-generated "Account summary" + "About their business" per account | F2.5 PASS | **Built** | Lightfield auto-generates business descriptions from enrichment; verify we have per-account AI summaries |
| 2-year email backfill | Unknown | Backsync up to 24 months configurable | Not configurable | **Missing** | Lightfield lets users choose 1/3/6/12/24 month backsync | Need backsync range configuration |
| Schema-less data model | Fixed fields (but custom boolean signal columns) | Custom fields per entity with type system (Text, Date, Single/Multi select, URL, Social handle, Address, Markdown) + AI fill modes (Auto/Suggest/Off) per field | Fixed schema with JSONB | **NOT BUILT** | CRITICAL GAP — Lightfield's biggest differentiator | Need: custom field creation, field type system, per-field AI fill mode (Auto/Suggest/Off) |

## 4. NL QUERIES & CHAT INTELLIGENCE

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Chat interface | Floating "Ask AI" panel (~400x350px) overlaying current view | Full-page chat + persistent input across pages | Full-page chat with suggested prompts | **Built** | Good foundation | Monaco's chat is an OVERLAY (accessible from any page without navigating away); Lightfield has persistent input bar on non-chat pages |
| Suggested prompts | Hybrid: pre-built actions (Overview, Outbound Sequences, Summary, Opportunities) + freeform | 8 suggested prompts on empty state | 8 suggested prompts on empty state | **Built, parity** | Match with Lightfield | Monaco's hybrid menu+chat (preset actions AND freeform) is slightly more sophisticated |
| Sales coaching tone | Blunt: "You Lost Control - This Demo Was About You, Not Their Pain" | Helpful assistant tone | F6.1 CRO Copilot PASS | **Built** | Need to verify the tone is direct/confrontational (Monaco's tough coach), not polite/generic | Coaching should reference SPECIFIC meeting moments and behaviors |
| Account-scoped chat | Not visible (chat is global overlay) | Chat scoped to account on detail pages with entity badge | G14 PASS | **Built** | Need to verify chat context auto-scopes on account/deal pages |
| Transparency indicators | Not visible | "Ran code" / "Retrieved CRM data" / "Analyzed data" labels | G15 PASS | **Built** | Verify labels appear showing AI actions |
| Chat history | Not visible | Previous threads in sidebar, browsable | G19 PASS | **Built** | Need to verify threads persist in sidebar |
| Multi-language | Not visible (English only) | French queries → French responses with French table headers | G10 PASS | **Built** | Need to verify non-English queries work |
| Email drafting from chat | Auto-generates follow-up emails from meeting content | Side panel email composer with real Send button, auto-filled To/From/Subject | G5 (email composer) PASS | **Built** | Lightfield's email composer is a real side panel with send functionality; verify ours matches |
| Agentic actions | AI suggests sequences, emails, follow-ups | Creates tasks, drafts emails, generates meeting prep docs from chat | Chat + tool use | **Partial** | Lightfield creates actual CRM records from chat; verify our chat can create tasks, accounts, deals |
| Citations in responses | Signal reasoning has source citations | Company badges link to accounts, opportunity badges link to deals | F2.7 NL queries with citations PASS | **Built** | Verify inline citations link to source records |
| Voice input | Not visible | Microphone icon on chat input | Not built | **Missing** | Low priority | Voice input button on chat |

## 5. OUTBOUND SEQUENCES & EMAIL

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Sequence builder | Vertical timeline with numbered steps, wait periods, connecting lines | No sequences | F4.1 PASS | **Built** | Need to verify visual matches Monaco's clean timeline UI |
| Physical gift integration | Veuve Clicquot champagne in sequences, product image + price | No equivalent | Not built | **Not built** | SKIP for MVP | Complex logistics, not essential for founder-led sales |
| Approve/reject flow | "Start" (white pill) + thumbs-down reject buttons | No sequences | G4 PASS | **Built** | Verify approve/reject buttons exist on AI-proposed sequences with sender→recipient header context |
| Suggested replies | AI pre-drafts replies to incoming emails with rich text toolbar | No outbound | G12 PASS | **Built** | Monaco shows pre-filled reply in chat thread view with B/I/list formatting toolbar |
| Auto-generated follow-ups | After meetings, auto-draft follow-up with extracted action items | Meeting prep doc generation from chat | G7 PASS | **Built** | Verify follow-up emails include action items extracted from interactions |
| Email composer | Part of sequence builder + follow-up modal | Side panel with To/From/Subject/Body + Send button | G5 PASS | **Built** | Lightfield's side panel email composer is the gold standard |
| Deliverability monitoring | Not visible | No equivalent | F4.6 PASS | **Built, ahead** | We're ahead of both competitors here |
| Mailbox warm-up | Unknown | No equivalent | F4.4 PASS | **Built, ahead** | We're ahead |

## 6. PIPELINE & DEAL MANAGEMENT

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Kanban view | Deal cards with company logos + values + momentum ⚡ icon | 7-stage kanban, minimal cards (account, deal, owner, dates) | Kanban with KPI cards + value-by-stage chart | **Built** | We have analytics Monaco doesn't show publicly | Our kanban cards may lack company logos and momentum indicators |
| Pipeline column totals | Stage name + deal count + total $ value in column headers | "$0" footer per column, count in header | G13 PASS | **Built** | Verify column headers show count + total value |
| Deal detail panel | Right-side panel: AI summary + owner + close date + auto-generated interaction timeline | Slide-over panel (388px) with property list | Deal detail exists | **Built** | Monaco's auto-generated timeline is the differentiator; verify we have dated interaction entries |
| Momentum indicator | ⚡ lightning bolt on high-activity deals | No equivalent | G17 PASS | **Built** | Verify ⚡ icon appears on active deals in kanban |
| Deal summary | AI-generated overview paragraph | No AI summary on opportunity cards | F5.4 PASS | **Built** | Verify quality of AI summaries |
| Risk detection | "Stalled 3 days" on dashboard with auto-nudge | No risk detection | F5.3 PASS, G6 PASS | **Built** | Verify stall badges appear and AI drafts nudge emails |
| Pipeline analytics | Not publicly visible | No analytics | F5.5 PASS — KPI cards, value-by-stage bars, risk summary | **Built, ahead** | We show analytics Monaco doesn't visibly have |
| Opportunity stages with AI | Unknown | Stage descriptions are AI instructions; AI auto-progresses based on description match; AI fill mode (Auto/Suggest/Off) | Static stage labels | **Partial** | Lightfield's stage descriptions train the AI to auto-progress deals | Need: stage descriptions as AI training data, AI fill mode per stage, optional AI prompt |

## 7. DAILY DASHBOARD / HOME

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Greeting | "Good morning, Sam" | No dashboard (accounts list is default) | "Good afternoon, martin" | **Built** | Parity with Monaco | Capitalize user name properly |
| Weekly summary | "This week: 45 sequences, 12 responses, 2 meetings, 8 opportunities" | No equivalent | "No activity this week yet. Let's change that." (empty state) | **Built but empty** | QUALITY GAP | Our summary shows empty state message; Monaco shows real stats. Need to populate with actual weekly metrics even when counts are low |
| Priority cards | 4 actionable cards: "Nudge Alex Shan" with deal context, stall badges, due dates, monetary values | No equivalent | Skeleton loading cards visible | **Built** | QUALITY GAP | Our screenshot shows skeleton loading, not real priority data. Need to verify real priority cards render with stall detection, deal context, and $ values |
| Today's meetings | "Your 2 meetings today" with names and times | No dashboard | "TODAY'S MEETINGS: No meetings today" | **Built** | Structural parity | Needs calendar sync (F2.2) to populate real data |
| Tasks due | Not explicit section (integrated into priorities) | "Up Next" page with tasks grouped by date | "TASKS DUE: No tasks due today" | **Built** | Structural parity | Needs real task data |
| Inline email preview | Click priority → right panel shows email thread + AI-drafted nudge | No equivalent | Not visible in screenshot | **Unclear** | Monaco's killer feature: click a priority → see the email + AI-drafted response inline | Verify clicking a dashboard priority opens email detail with AI draft |
| Bottom navigation bar | 8 icon toolbar: home, send, play, calendar, grid, chart, gear, more | No equivalent | No bottom nav | **Missing** | LOW priority | Monaco uses bottom toolbar for quick navigation; our sidebar handles this |
| "Respond from Inbox" button | Blue button on stalled priorities linking to email thread | No equivalent | Not visible | **Unclear** | Collapses email client into the priority list | Verify one-click email response from dashboard |

## 8. COACHING & INSIGHTS

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Deal coaching | "You Lost Control — This Demo Was About You, Not Their Pain" with specific behavioral bullets | No coaching | F6.1 CRO Copilot PASS | **Built** | Need to verify coaching references SPECIFIC meeting moments, uses direct/confrontational tone, and provides actionable behavioral feedback |
| Proactive insights | "Monaco gives you information proactively" (feature bullet) | No proactive insights | F6.4 PASS | **Built** | Verify insights surface without user asking |
| Prioritized actions | Daily priorities with urgency indicators (stalled, overdue) | "What should I focus on today?" chat response | F6.3 PASS, G1 PASS | **Built** | Monaco integrates priorities into dashboard; Lightfield delivers via chat. We should do both |
| Meeting coaching | References specific demo behaviors ("you never asked why") | No meeting analysis | Not explicitly built | **Partial** | Monaco's coaching references SPECIFIC things said in meetings | Needs meeting recording + transcript analysis to reference specific moments |

## 9. SETTINGS & CONFIGURATION

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Profile | Unknown | First name, last name, email (readonly), language, timezone | First name, last name, email | **Built** | Minor | Missing: language selector, timezone selector |
| Mail & Calendar config | Unknown | Pre-connection config: backsync (1-24mo), visibility (metadata/full), do-not-track, auto-creation (disabled/selective/always), Google + Microsoft OAuth | "Connect Gmail" button | **Partial** | SIGNIFICANT GAP | Missing: all pre-connection config, Microsoft OAuth |
| Agent permissions | Unknown | Ask every time / Auto-run for record changes | Agent settings page exists | **Built** | Near parity | Verify ask/auto-run toggle |
| Knowledge base | Unknown | Multi-topic structured pairs (Topic + Content), unlimited entries, add/remove independently | Knowledge page exists | **Built** | Verify our knowledge is structured topics (not single textarea) | If single textarea, need multi-topic system |
| Data model / Custom fields | Unknown | Custom fields per entity with type system + AI fill modes (Auto/Suggest/Off) per field + "Create field" button | Fixed schema | **NOT BUILT** | CRITICAL GAP | Need: custom field creation, field types (Text, Date, Single/Multi select, URL, Social handle, Address, Markdown), AI fill mode per field |
| Opportunity stages | Unknown | Named stages with descriptions (AI reads them), In Progress/Done categories, AI fill mode, optional AI prompt | Opportunity Stages page exists | **Built** | Need to verify stage descriptions exist and feed AI auto-progression |
| Notifications | Unknown | 6 types × 3 channels (Slack/Email/In-app), per-type toggles, task reminder timing | Notifications page exists | **Partial** | Need 3-channel support (Slack/Email/In-app) with per-type toggles |
| Recording settings | Unknown | Toggle + custom recorder name + custom avatar | Not built | **Missing** | Depends on meeting recording feature |
| MCP Connectors | Unknown | Granola, Notion, Linear via MCP protocol | Not built | **Missing** | Forward-thinking but low priority for MVP |
| Workflows | Unknown | Beta: create workflow, status/runs tracking | Not built | **Missing** | Low priority (Beta in Lightfield) |
| Members/Roles | Unknown | 2 roles (Admin/Member), email invite | Members page exists | **Built** | Verify invite flow and role assignment |
| Workspace settings | Unknown | Workspace name, URL, domain exclusion (own domains), scheduled deletion | General page exists | **Built** | Verify domain exclusion for own company |
| API keys | Unknown | Beta: create, name, type, scopes | Not built | **Missing** | Low priority for MVP |
| Import history | Unknown | Track past CSV imports | Not explicitly visible | **Missing** | Need import history tracking |
| Billing | Unknown | External redirect | Not built | **Missing** | Needed before launch |

## 10. UI/UX POLISH & DESIGN

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Theme | Dark-only, premium "ops center" feel | Light mode, clean "Notion for CRM" feel | Dark mode | **Built** | Good — dark mode matches Monaco | Consider light mode option for accessibility |
| Information density | VERY HIGH: 8+ cols, 36px rows, minimal whitespace | LOW: generous whitespace, 44px rows | MEDIUM-HIGH: good density | **Built** | Good density, between Monaco and Lightfield | Could tighten row height to 36px to match Monaco |
| Company logos | Real logos in table (~24px rounded squares) | Auto-generated colored icons | No logos | **Missing** | Visual quality gap | Need logo fetching from Clearbit/similar API |
| Sub-pixel borders | Not used (relies on background layering) | 0.666px borders throughout | Standard 1px borders | **Partial** | Lightfield's sub-pixel technique adds refinement | Consider adopting 0.5px borders for polish |
| Typography | Inter-like, 6-level scale, light-on-dark | System fonts, weight 425/450 unique | Inter font, dark theme | **Built** | Good foundation | Consider 425/450 weights for more refined feel |
| Badge auto-coloring | Multi-color per industry, distinct hues | hash(category) % 10 color assignment | Visible colored badges | **Built** | Verify consistent color assignment per industry |
| Slide-over detail panels | Not used (inline expansion and split panels) | 388px slide-over from right | Not explicitly visible | **Partial** | Lightfield's slide-over is elegant | Need slide-over for account/contact/deal details from list views |
| Persistent chat input | Chat is floating overlay (accessible anywhere) | "Ask Lightfield" input visible on non-chat pages | "Ask LeadSens..." on dashboard only | **Partial** | QUALITY GAP | Chat input should be persistent across ALL pages, not just dashboard and chat page |
| Loading states | "Updating..." text during extraction | No visible loading (instant transitions) | Skeleton cards on dashboard | **Built** | Skeleton loading is good pattern | Verify skeletons resolve to real data |
| Empty states | Unknown | Bare "No meetings" text | "No activity this week yet. Let's change that." | **Partial** | Lightfield's empty states are too bare; ours are slightly better | Add illustrations and contextual guidance to empty states |
| Animations | Typewriter text effect, selection glow, smooth transitions | Minimal — instant page transitions | Not evaluated | **Unknown** | Monaco's typewriter effect for AI queries is a nice touch | Consider subtle animations for AI responses |

## 11. DATA QUALITY & RELIABILITY

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Real company data | Demo shows real AI companies (Dust, Vellum, LangSmith, Nango, Adept AI) | Real enriched data (industry, headcount, revenue) | Real enrichment from data providers | **Built** | Parity | — |
| Data retrieval accuracy | Unknown | Failed to find existing contact (Pierre Dubois) — 95% claim not verified | Not tested | **Unknown** | Critical for trust | Need to test NL query accuracy against known records |
| AI hallucination prevention | Source citations for signal reasoning | Polite deflection for out-of-scope questions | Not tested | **Unknown** | Must prevent hallucinated data | Need guardrails testing |

## 12. PERFORMANCE & RELIABILITY

| Capability | Monaco | Lightfield | LeadSens | Status | Quality Gap | Missing Elements |
|-----------|--------|-----------|----------|--------|-------------|------------------|
| Page load speed | Unknown (demo-gated) | Instant transitions, no spinners | Not measured | **Unknown** | Need performance testing | Measure and optimize |
| Chat response time | Unknown | 5-15s simple, 15-25s complex | Not measured | **Unknown** | Need to benchmark | Target <5s for simple queries |
| Real-time updates | "Updating..." during live meeting extraction | No real-time observed | Not built | **Missing** | Monaco's real-time extraction during meetings is a differentiator | Depends on meeting recording feature |

---

## SUMMARY: Gaps by Severity

### CRITICAL GAPS (competitive disadvantage, blocks key workflows)

1. **Calendar sync not built** (F2.2) — Foundation for meeting intelligence, recording, structured extraction
2. **Custom fields / Data model** — Lightfield's biggest differentiator. Users can't define their own schema.
3. **Mail pre-connection config** — No backsync range, visibility, do-not-track, auto-creation modes
4. **Score visualization quality** — Our numeric scores vs Monaco's letter+fire+heat. Feature exists but UX doesn't match.
5. **Dashboard empty state** — Weekly summary shows "no activity" instead of real stats. Priority cards show skeletons.

### HIGH GAPS (noticeable quality deficit)

6. **Company logos in tables** — Monaco shows real logos; we don't
7. **Persistent chat across pages** — Chat input only on dashboard + chat page, not everywhere
8. **Meeting recording** — Monaco records and analyzes meetings in real-time; we have no recording
9. **Signal columns vs signal count** — Monaco shows individual signal values inline; we show a count badge
10. **Stage descriptions as AI training** — Lightfield's stage descriptions drive AI auto-progression
11. **Structured knowledge base quality** — Verify our Knowledge page uses multi-topic pairs, not single textarea
12. **Microsoft OAuth for email** — Lightfield supports both Google and Microsoft

### MEDIUM GAPS (nice-to-have differentiators)

13. **Slide-over detail panels** — Lightfield's 388px slide-over for entity details
14. **Sub-pixel borders (0.5px)** — Lightfield's refinement technique
15. **Voice input on chat** — Microphone icon
16. **Notifications: 3-channel support** — Slack/Email/In-app per notification type
17. **MCP Connectors** — Granola, Notion, Linear
18. **Language/timezone in profile** — Per-user localization
19. **Import history tracking** — Log of past imports
20. **Domain exclusion** — Prevent own company from appearing as account

### LOW GAPS (polish, can wait)

21. **Bottom navigation toolbar** — Monaco's 8-icon bottom bar
22. **Workflows/automation** — Lightfield Beta feature
23. **API keys** — Lightfield Beta feature
24. **Custom recorder avatar** — Meeting recording setting
25. **Billing redirect** — External billing integration
26. **Light mode option** — Accessibility/preference

---

## Build Priority for Next Milestone

### Immediate (before next checkpoint)
1. Fix dashboard: populate weekly summary with real stats, ensure priority cards render with real data
2. Fix score visualization: letter grades + fire emoji + heat labels instead of plain numbers
3. Add company logos to account tables (Clearbit Logo API)
4. Make chat input persistent across all pages
5. Add mail pre-connection config (backsync, visibility, do-not-track, auto-creation mode)

### Next Sprint
6. Calendar sync (F2.2) — unlocks meeting features
7. Custom fields / Data model page
8. Microsoft OAuth for email
9. Stage descriptions feeding AI
10. Slide-over detail panels

### Future
11. Meeting recording + AI notes
12. MCP Connectors
13. Workflows
14. API keys
