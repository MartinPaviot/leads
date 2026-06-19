# Landing mockups vs real pages — gap analysis (2026-06-14)

Captured live as martin.paviot@pilae.ch (Pilae tenant). Screenshots + `_dom-dump.json`
in this folder. Goal: make each landing mockup IDENTICAL to its real page.

Real sidebar (all pages): workspace = "Pilae" + logo (TOP); nav Up next / CRM
[Accounts, Contacts, Opportunities, Proposals·Beta] / ENGAGE [Inbox, Call Mode·Beta,
Campaigns·Beta] / ACTIVITY [Meetings·Beta] / CHATS [New chat + recent threads] /
Martin + photo (BOTTOM). Landing mockup uses Elevay brand in the workspace slot
(intentional — the landing represents Elevay's own product). Persistent chat bar at
the very bottom: "e.g. Show my best prospects, Pipeline health, Draft email to…"

## 1. Accounts  (flagship — hero phase 1 + how-it-works step 1)
REAL: 12 cols — checkbox · Account(logo+name+desc) · Website(domain link+ext icon) ·
LinkedIn(icon) · Industry(sector badge) · Geography(MapPin city, country) · Size ·
Revenue · Stage(lifecycle pill) · Score(grade circle + heat) · Last Interaction ·
Connected to(owner avatar / warm-intro / Unassigned) · (hover actions).
Header: "Accounts" + total; [More ▾][Find more accounts][Create account] + right search
"Search accounts + describe and press ↵". Tabs: All(886) / Sourced(749) / Added(137).
Real industries seen: Research, Nonprofit Organization Management, Real Estate,
Hospitality, Food Production, Construction, Higher Education, Professional Training &
Coaching, Information Technology & Services, Marketing & Advertising, Machinery, Wholesale.
MOCKUP HAS: 5 cols (Account, Industry, Size, Stage, Score); fake tabs (ICP-1/ICP-2/
Customers); a scanning banner; no Website/LinkedIn/Geography/Revenue/LastInteraction/
Connected-to; no header search.
→ REBUILD: all 12 cols, real tabs, header search, More menu, sector badges, score grades.

## 2. Up next  (hero phase 2 + step 2)
REAL: h1 greeting; 6 KPIs = Pipeline · Active deals · Calls booked · Replies · Outreach ·
Win rate (grid up to 6). Activity (col-span-3) gradient chips rows + timeAgo + hover arrow.
Needs you (col-span-2) cards w/ 3px left tint border + Reply/Open buttons.
MOCKUP HAS: 4 KPIs (Pipeline/Accounts/Meetings/Replies); todos without action buttons or
left tint.
→ REBUILD: 6 KPIs w/ real labels; todo action buttons + left border; hover arrows.

## 3. Opportunities  (hero phase 3 / "CRM fills itself" step)
REAL: header [Forecast ▾][Analytics ▾][Analyze Pipeline][Create Opportunity][Archive];
toolbar [Search][Filter][Stalled][Display][Board|Table toggle]; 6 stat cards PIPELINE ·
WON · WIN RATE · AVG DEAL · VELOCITY · AT RISK; board stages = Lead · Qualification ·
Demo · Trial · Proposal (+ Won) each w/ icon + count + $sum + "Create opportunity" zone.
MOCKUP HAS: board only, stages Qualified/Discovery/Proposal/Negotiation/Closed Won (WRONG
names), a sync banner, no stat cards, no toolbar, no Board/Table toggle.
→ REBUILD: real stage names + icons, 6 stat cards, toolbar, view toggle.

## 4. Campaigns  (step 3) — EMPTY for Pilae → rebuild populated state from code
REAL chrome: "Campaigns" + Beta; [New campaign]. Empty state "Create your first campaign".
→ REBUILD from sequences/page.tsx populated layout (sequence cards, stats sent/open/reply).

## 5. Meetings  (step "every meeting captured") — EMPTY for Pilae → from code
REAL chrome: "Meetings" + Beta; [Manage calendars]. → REBUILD populated meeting/notes view.

## 6. Chat  (step "ask anything")
REAL: greeting "Good evening"; suggestion chips "Give me a pipeline summary",
"What should I focus on today?". MOCKUP: Q/A w/ citations (close; align greeting + chips).

## 7. Call Mode  (full-width cockpit step) — already most faithful
REAL: from-number "+33 6 38 34 52 31 AUTO"; Edit plan; Me/Team; All/High intent; funnel
Today/Week/Meetings/Cadence/Callable; queue ("en file"). MOCKUP already matches closely.
→ minor: from-number to a FR number; confirm funnel labels.
