# CRM Cluster — Code Analysis

Generated: 2026-06-05. Static analysis only — no server started, no network requests made.
Source root: `app/apps/web/src/app/(dashboard)/`

---

### Accounts (list) — route `/accounts`

- **Purpose**: Master list of all company accounts with TAM streaming, enrichment, scoring, signal detection, and bulk operations.

- **Reads (data in)**:
  - `GET /api/accounts?pageSize=50&page=N` — paginated account list (infinite-scroll sentinel triggers next pages)
  - `GET /api/custom-signals` — user-defined signals for column rendering
  - `GET /api/warm-paths?companyIds=...` — batched warm-intro relationship paths
  - `GET /api/accounts/${id}/contacts` — inline contact expansion per row (on chevron click)
  - TAM stream via `useTamStream` hook → `POST /api/tam/build`
  - Custom fields via `useCustomFields("company")`
  - Assumes: tenant exists, `companies` table reachable, Apollo key present for TAM/extract flows

- **States handled in code**:
  - **loading** (line 240–241): `setLoading(true)`, renders `<TableSkeleton>` (line 1305–1308)
  - **empty** (lines 1310–1317): `<EmptyState title="No accounts">` — renders when `mergedAccounts.length === 0`
  - **search-empty** (lines 1318–1330): semantic-search-returned-zero state with "Clear search" CTA
  - **populated** (lines 1332+): full table with all columns
  - **loading-more** (line 241): `setLoadingMore(true)`, `loadingMore` state gates sentinel
  - **partial-data / TAM streaming**: `streamBanner` + `TamBuildProgress` component (lines 1106–1115); streamed rows merged with DB rows in `mergedAccounts` (lines 819–838)
  - MISSING: **error** — fetch failures are `console.warn`'d only (lines 255–258); no error UI rendered; user sees a blank table or stale data silently
  - MISSING: **large-list edge**: `pageSize=50`, infinite scroll implemented, but warm-paths query sends all loaded IDs as a comma-separated query param (line 337) — could hit URL length limits at ~500+ accounts

- **Primary CTAs / outbound links (edges OUT)**:
  - Account name button → `setSlideOverAccount(account)` (line 1485) — opens `<SlideOver>` in-page panel, NOT a navigation
  - Bulk "Call Mode" button → `window.location.href = /call-mode?accounts=${ids}` (lines 1014–1018) — hard navigation
  - Chevron expand → loads contacts inline from `/api/accounts/${id}/contacts`, stays on page
  - No `<Link href="/accounts/${id}">` anywhere in the table — account name does NOT navigate to `/accounts/[id]`; it opens a slide-over

- **Inbound expectations (edges IN)**:
  - No query params consumed. Page starts fresh regardless of where user came from.
  - Exception: the empty-state on `/contacts` (contacts/page.tsx line 401) links to `/accounts?sort=score&dir=desc`, but accounts/page.tsx does NOT read `sort` or `dir` params — the link param is silently ignored.

- **Seam risks**:
  - Account name opens a `<SlideOver>` (quick view) rather than navigating to `/accounts/[id]`. Users who want the full detail page must know to click "View brain" inside the slide-over, or navigate manually. There is no direct "Open full page" link from the table row.
  - `window.location.href` to `/call-mode` (line 1017) is a hard page reload, not a `router.push` — breaks back-button behavior.
  - Contacts empty-state links to `/accounts?sort=score&dir=desc` but the target page ignores those params (silent dead link).

- **Notable gaps**:
  - No error state rendered — all fetch failures are swallowed silently (lines 255–258, 343–349, 404, 442)
  - `customBoolColumns` is hardcoded at `["Common Investor?", "Sales-led?"]` (line 778) — legacy columns never cleaned up
  - "Connected to" column reads `account.ownerFirstName`/`ownerLastName` via `as any` cast (lines 1640–1641) — these fields are not in the `Account` interface; if the API doesn't return them they render "Unassigned" silently

---

### Account Detail — route `/accounts/[id]`

- **Purpose**: Single account detail: AI summary, meeting intel, research dossier, deal list, suggested contacts, scoped chat, and inline field editing.

- **Reads (data in)**:
  - `GET /api/accounts/${accountId}` — account + linked deals (lines 53–71)
  - `GET /api/accounts/${accountId}/suggested-contacts` — on-demand discovery (line 384, only when user clicks button)
  - `POST /api/accounts/${accountId}/generate-summary` — refresh AI summary (lines 138–156)
  - `<IntelligenceBrief accountId={accountId} />` — component fetches its own data
  - `<CompanyDossier accountId domain name />` — component fetches its own data
  - `<ScopedChat contextType="account" />` — component fetches its own data
  - Assumes: account row exists, deals relation populated

- **States handled in code**:
  - **loading** (line 73): `if (loading) return <DetailPageSkeleton avatar="square" />`
  - **not-found** (line 74): `if (!account) return <p ...>Account not found</p>` — bare red text, no back link
  - **populated**: full layout (lines 78+)
  - MISSING: **error** — the `catch` block only logs (line 64); `loading` goes to false, `account` stays null, renders "Account not found" even on network error — indistinguishable from a genuine 404
  - MISSING: **AI summary absent** — the AI summary block (lines 118–185) is conditionally hidden when `aiSummary` and `aiHowTheyMakeMoney` are both null; no CTA to generate it (the refresh button only shows when content exists)
  - **deals empty** (line 263): renders text "No deals linked to this account."
  - **deals populated** (lines 266–280): list of cards, but deal cards are NOT clickable — no `<Link href="/opportunities/${deal.id}">`
  - **suggested contacts: not-yet-fetched** (line 398–406): shows "Discover contacts" button
  - **suggested contacts: empty** (lines 407–410): "No suggestions available."
  - **suggested contacts: populated** (lines 411–427): contact cards with "Suggested" badge — but NO action from the suggestion (no "Add contact" CTA, no link to `/contacts`)

- **Primary CTAs / outbound links (edges OUT)**:
  - `<Link href="/accounts/${accountId}/brain">` (lines 99–109) — "View brain" button
  - `<Breadcrumbs>` → `<Link href="/accounts">` (line 84) — back to list
  - Deal cards in the "Opportunities" section: NOT linked — no navigation to `/opportunities/${deal.id}`

- **Inbound expectations (edges IN)**:
  - Path param `params.id` only (line 39). No query params consumed.

- **Seam risks**:
  - Deal cards on account detail are display-only — clicking does nothing. There is no path from Account → Opportunity detail without going back to the pipeline list first. This is a DEAD-END for the Account → Opportunity flow.
  - Suggested Contacts are names/titles only, with no "add to CRM" action and no link to `/contacts`. Suggestions do not become real contacts.
  - "Account not found" renders for both genuine 404 and network error with no differentiation and no back-link.

- **Notable gaps**:
  - `(account as any).properties` cast at line 189 — bypasses TypeScript on meetingIntel
  - No `<Link>` from the deals list to `/opportunities/${deal.id}` — verified at lines 266–281
  - "Suggested contacts" has no "Save to CRM" / "Create contact" action (lines 411–427)

---

### Account Brain — route `/accounts/[id]/brain`

- **Purpose**: Admin/debug read of every artifact stored against an account: contacts, deals, activities, meetings, knowledge, graph edges, memories, freshness timestamps.

- **Reads (data in)**:
  - `GET /api/brain/${accountId}` — unified brain view (line 202)
  - Assumes: company brain assembled server-side; tenant scoping enforced by API

- **States handled in code**:
  - **loading** (line 224): `return <DetailPageSkeleton />`
  - **error** (lines 227–239): renders error message string + "Back to account" link
  - **not-found**: `brain` null after load returns null (line 241) — silent blank, no message
  - **populated**: full collapsible sections (lines 266+)
  - **each section empty**: each `<Section>` renders "No [X]." text (e.g. lines 294–296, 342–344)
  - **truncated lists**: truncation notices render in contacts/activities/memories (lines 323–326, 420–422, 525–527)
  - MISSING: **partial-data** — no skeleton per section; all sections toggle open/closed but load atomically

- **Primary CTAs / outbound links (edges OUT)**:
  - `<Link href="/accounts/${accountId}">` — "Back to account" (lines 536–542)
  - `<Breadcrumbs>` → `href="/accounts"` and `href="/accounts/${accountId}"` (lines 248–253)
  - No outbound links to contacts, deals, meetings, or activities — contacts, deals, and meetings are listed read-only with no click-through

- **Inbound expectations (edges IN)**:
  - Path param `params.id` only. No query params consumed.
  - The brain page mentions `?contacts=N`, `?recentActivities=N`, `?memories=N` in truncation notices (lines 325, 421, 526) but the page component does NOT read these params — they are hint text only, not functional.

- **Seam risks**:
  - Brain is a dead-end: contacts, deals, meetings are listed but NOT linked. User cannot navigate from a brain contact to `/contacts/[id]`, or from a brain deal to `/opportunities/[id]`.
  - Truncation hints suggest query params that the page ignores.

- **Notable gaps**:
  - "query with ?contacts=N" hint at line 325 is non-functional — page never reads searchParams
  - No links from brain sections to entity detail pages

---

### Contacts (list) — route `/contacts`

- **Purpose**: Paginated list of all contacts with import (CSV + smart), enrichment, bulk merge navigation, create modal, and sorting.

- **Reads (data in)**:
  - `GET /api/contacts?page=${page}&pageSize=50` (line 97)
  - `GET /api/import/history` — import history panel (line 110)
  - Custom fields via `useCustomFields("contact")` (line 93)
  - Assumes: contacts table reachable, enrichment API key present

- **States handled in code**:
  - **loading** (line 384): `<TableSkeleton rows={5} cols={10 + customFields.length} />`
  - **empty (no contacts)** (lines 391–401): `<EmptyState title="No contacts yet">` with "Import CSV" and "Find contacts at top accounts" CTAs
  - **empty (search returned nothing)** (lines 402–410): `<EmptyState title="No matching contacts">` with "Clear search" CTA
  - **populated** (lines 413+): full table
  - **import-result** (lines 375–381): success/error banner shown after CSV import
  - MISSING: **error** — fetch failure is `console.warn` only (line 104); loading goes false, empty-state renders as if no contacts exist
  - MISSING: **large-list edge**: pagination controls render when `totalPages > 1` but the current sort is done client-side on the loaded page only (lines 271–283) — sort state is lost on page change

- **Primary CTAs / outbound links (edges OUT)**:
  - Row click → `router.push("/contacts/${contact.id}")` (line 473)
  - Contact name button → `router.push("/contacts/${contact.id}")` (line 496)
  - Bulk "Merge" → `router.push("/contacts/merge?ids=${ids.join(",")}")` (line 253)
  - "Find duplicates" header button → `router.push("/contacts/merge")` (line 314)
  - Empty-state "Find contacts at top accounts" → `router.push("/accounts?sort=score&dir=desc")` (line 401) — NOTE: target page ignores these params

- **Inbound expectations (edges IN)**:
  - No query params consumed. Page starts fresh.

- **Seam risks**:
  - Company name in contact table shows text only — not a link to `/accounts/${contact.companyId}`. User cannot navigate from Contact list → Account without going through the Accounts list separately.
  - `router.push("/accounts?sort=score&dir=desc")` in empty-state navigates to Accounts, but the accounts page ignores those params.
  - Sort is client-side on the current page only; clicking "Next page" loses the sort order.

- **Notable gaps**:
  - Client-side sort on a paginated list (lines 271–283): sort only applies to the current page's 50 records; cross-page sort would require server-side sorting
  - Company name cell (lines 504–514) shows text + external link to domain, but no `<Link>` to `/accounts/${contact.companyId}`
  - `bulkDeleteSelected` deletes one by one in a loop (lines 199–217) — no batch endpoint used

---

### Contact Detail — route `/contacts/[id]`

- **Purpose**: Single contact: activity timeline, scoped chat, inline field editing (title, email, phone), buyer intent score, email composer, and linked company navigation.

- **Reads (data in)**:
  - `GET /api/contacts/${contactId}` (line 114)
  - `GET /api/activities?entityType=contact&entityId=${contactId}` (line 123)
  - `GET /api/contacts/${contactId}/buyer-intent` (line 133)
  - `GET /api/accounts/${cId}` — for each associated company id (line 155)
  - Assumes: contact row exists, activities relation exists, buyer intent computed

- **States handled in code**:
  - **loading** (line 177): `return <DetailPageSkeleton avatar="circle" />`
  - **not-found** (line 178): `if (!contact) return <p ...>Contact not found</p>`
  - **populated** (lines 184+): full layout
  - **no activities** (lines 234–237): "No activity recorded for this contact."
  - **activities populated** (lines 238–285): timeline cards
  - **buyer intent absent**: `buyerIntent` null → `<BuyerIntentCard>` not rendered (line 300)
  - **buyer intent present** (lines 409–506): full intent gauge + signals
  - MISSING: **error** — catch block only console.errors (line 169); contact stays null, renders "Contact not found" regardless of error type
  - MISSING: **email absent edge**: "Send email" button only renders when `contact.email` is truthy (line 211); no fallback CTA for phone-only contacts

- **Primary CTAs / outbound links (edges OUT)**:
  - `<Link href="/contacts">` in `<Breadcrumbs>` (line 190) — back to list
  - `<Link href="/accounts/${cId}">` in associated companies panel (line 376) — cross-link to account
  - "Send email" button → `setEmailComposer(...)` (lines 212–227) — opens `<EmailComposerPanel>` in-page
  - "Suggest reply" button (line 268–279) → `setEmailComposer(...)` — in-page panel

- **Inbound expectations (edges IN)**:
  - Path param `params.id` only. No query params consumed.

- **Seam risks**:
  - No link to `/opportunities` or to deals associated with this contact. A contact's deals are not surfaced here — DEAD-END for Contact → Opportunity navigation.
  - No link to `/call-mode` from contact detail despite the contact having a phone number field.

- **Notable gaps**:
  - No deals section on contact detail — deals where `contactId = this.id` are not fetched or shown
  - Phone field is editable but no "Call" CTA that links to `/call-mode?contacts=${contactId}`
  - `updateField` only handles title/email/phone — linkedinUrl is display-only with no edit

---

### Contacts Merge — route `/contacts/merge`

- **Purpose**: Two-mode merge tool: auto-detected duplicate groups (by email) or curated selection from query params.

- **Reads (data in)**:
  - Mode 1 (no `?ids`): `GET /api/contacts/merge` — duplicate groups (line 79)
  - Mode 2 (`?ids=a,b,c`): `GET /api/contacts` — all contacts, then filters by preselected ids (lines 98–109)
  - Assumes: contacts table has duplicate emails, or user arrived with valid ids

- **States handled in code**:
  - **loading** (lines 185–187): plain text "Loading duplicates…"
  - **curated mode** (lines 188–195): `<CuratedForm>` when `preselectedIds.length > 0 && curated.length >= 2`
  - **auto empty** (lines 196–201): `<EmptyState title="No duplicate emails detected">`
  - **auto populated** (lines 202–216): list of `<GroupCard>` per duplicate group
  - MISSING: **curated error when ids resolve to < 2 contacts** — toast fires (line 115) but UI shows EmptyState (auto mode fallback) which is confusing
  - MISSING: **skeleton** — loading state is just text, no skeleton

- **Primary CTAs / outbound links (edges OUT)**:
  - "Back to contacts" → `router.push("/contacts")` (line 179)
  - On curated merge success → `router.push("/contacts")` (line 156)
  - On auto merge success → removes the group from local state, stays on page

- **Inbound expectations (edges IN)**:
  - `?ids=a,b,c` (line 63–67): read via `useSearchParams`. Pre-fills curated merge form with those contact ids.
  - Arrives from contacts list bulk-merge action (contacts/page.tsx line 253): `router.push("/contacts/merge?ids=${ids.join(",")}")` — context IS carried.

- **Seam risks**:
  - `loadCurated` fetches ALL contacts without pagination (`GET /api/contacts` with no page params, line 98); for large tenants this returns page 1 only (50 records) and may not include the requested ids, silently dropping them.
  - After auto-merge, the page stays on merge — no signal to review merged result in contact detail.

- **Notable gaps**:
  - `loadCurated` fetches `/api/contacts` without passing the specific ids as a filter — relies on the full list including those ids within page 1 (line 98–109). If a contact is on page 2+, it won't be found and the curated form shows "Need at least 2 valid contacts" even with valid ids.
  - No skeleton loading state, just text (line 185–187)

---

### Opportunities (list) — route `/opportunities`

- **Purpose**: Deal pipeline in kanban board or table view, with analytics, Monte Carlo forecast, drag-and-drop stage changes, close-reason dialog, WIP limits, and stall detection.

- **Reads (data in)**:
  - `GET /api/opportunities` — all deals (line 206)
  - `GET /api/pipeline/analytics` — KPI aggregates (line 200)
  - `GET /api/forecast?granularity=month&horizon=3` — on demand (line 225)
  - `GET /api/accounts?pageSize=200` — for create modal account picker (line 213)
  - `GET /api/contacts?pageSize=200` — for create modal contact picker (line 217)
  - `usePipelineStages()` — custom stage definitions
  - Assumes: deals table populated; stage config exists or falls back to hardcoded STAGES constant

- **States handled in code**:
  - **loading** (line 995–999): `<KanbanColumnSkeleton>` per stage
  - **empty column** (lines 1261–1269): dashed "Create opportunity" button per empty column
  - **populated board** (lines 1104+): kanban columns with draggable cards
  - **populated table** (lines 1001–1101): sortable table with pagination summary
  - **no deals match filter** (line 1092): "No deals match your filters" inline in table body
  - **analytics hidden** (line 963): analytics panel togglable
  - **forecast loading** (lines 805–808): "Computing forecast..." text
  - **forecast empty** (lines 955–959): "No forecast data available."
  - MISSING: **error** — all fetch failures are `console.warn` only (lines 201, 208, 229); no error UI
  - MISSING: **edge for won/lost columns**: won and lost deals appear in their own columns — no empty state distinction for "you've won 0 deals yet"

- **Primary CTAs / outbound links (edges OUT)**:
  - Board card click → `router.push("/opportunities/${id}")` (line 377)
  - Table row click → `router.push("/opportunities/${id}")` (line 1030)
  - Forecast top-deal row click → `router.push("/opportunities/${d.id}")` (line 906)
  - "Create Opportunity" modal: creates deal via `POST /api/opportunities`, then stays on page

- **Inbound expectations (edges IN)**:
  - No query params consumed. Starts fresh regardless of origin.

- **Seam risks**:
  - Create opportunity modal allows picking an account (line 757–778) and contact (lines 787–796), but the contact dropdown shows all contacts when no account is selected; when an account IS selected, it filters contacts by `companyId === newAccountId` (line 459). However, if a contact has a different primary companyId but is still associated, they won't appear.
  - Account picker in create modal fetches up to 200 accounts (line 213) — tenants with >200 accounts will have incomplete dropdown.

- **Notable gaps**:
  - Account picker caps at `pageSize=200` — no infinite scroll or search-as-you-type in the create modal (separate `accountSearch` state exists but only filters loaded 200 records locally)
  - Contact picker caps at 200 and renders up to 50 in the `<select>` (line 792: `.slice(0, 50)`) — 150 contacts silently invisible

---

### Opportunity Detail — route `/opportunities/[id]`

- **Purpose**: Single deal: AI narrative, health score, win probability, stall risk with interventions, stakeholder map, autofilled intel, win/loss post-mortem, activity timeline, email composer, and scoped chat.

- **Reads (data in)**:
  - `GET /api/opportunities/${dealId}` (line 231)
  - `POST /api/opportunities/${dealId}/auto-progress` (line 162) — fetched on mount
  - `GET /api/opportunities/${dealId}/health` (line 160)
  - `GET /api/opportunities/${dealId}/timeline` (line 159)
  - `GET /api/deals/${dealId}/score` (line 192) — win probability, open deals only
  - `GET /api/deals/at-risk` (line 200) — all at-risk deals, filtered client-side
  - `GET /api/deals/${dealId}/win-loss` (line 216) — closed deals only
  - Assumes: deal exists, activities captured, LLM pipeline ran

- **States handled in code**:
  - **loading** (line 297): `return <DetailPageSkeleton avatar="square" />`
  - **not-found** (line 298): `if (!deal) return <p ...>Deal not found</p>`
  - **populated** (lines 313+): full layout
  - **stage suggestion present** (lines 348–384): banner with "Apply" / "Dismiss"
  - **stall risk > 50%** (lines 391–507): amber warning block with intervention actions
  - **coaching card** (lines 563–627): shows when `riskLevel = high/medium` or stalled >=7d
  - **no timeline** (lines 656–659): "No interactions recorded yet."
  - **no narrative** (lines 648–650): "No narrative yet — waiting on activity."
  - **win/loss (closed deal)** (line 630): `<WinLossCard>` only when `isClosed && winLoss`
  - MISSING: **intel pending** — `intelLoaded` tracks whether the auto-progress/health calls resolved (line 149), but there is no loading indicator for that async block; the right panel shows blank until health/winProb arrive
  - MISSING: **error** — catch blocks are `console.warn` only (lines 238–240, 263); deal null → "Deal not found"

- **Primary CTAs / outbound links (edges OUT)**:
  - `<Breadcrumbs>` → `href="/opportunities"` (line 319)
  - "Email contact" button → `setEmailComposer(...)` (lines 329–344) — opens `<EmailComposerPanel>` in-page
  - Stall interventions: "Schedule" → `POST /api/tasks` (line 277); "Email" → `setEmailComposer(...)`
  - "Apply" stage suggestion → `POST /api/opportunities/${dealId}/auto-progress` (lines 251–267)
  - `<ScopedChat contextType="deal" />` — in-page
  - Account name is shown as plain text (line 387, line 761) — NOT a link to `/accounts/${companyId}`

- **Inbound expectations (edges IN)**:
  - Path param `params.id` only. No query params consumed.

- **Seam risks**:
  - Account name in deal detail is plain text — no link to `/accounts/[companyId]`. DEAD-END: cannot navigate from Deal → Account without going back to lists.
  - "Email contact" button pre-fills `to: ""` (line 336) — the deal knows `companyName` but not the contact's email. The email will open blank and the user must fill the To field manually.
  - `GET /api/deals/at-risk` fetches ALL at-risk deals and filters client-side (line 203) — N+1 anti-pattern; also means stall risk only shows if the deal is in the tenant-wide at-risk list.

- **Notable gaps**:
  - `ExtractedIntel` component (lines 1141–1207) is defined in the file but never rendered in the JSX. It is dead code.
  - Account name at lines 387 and 761 is plain text, not `<Link href="/accounts/${deal.companyId}">` — companyId is available in the Deal interface (line 47 shows companyId is absent from the Deal interface here, which is why it can't be linked)
  - Deal interface (lines 24–35) does not include `companyId` or `contactId` — they cannot be used for navigation even if a link were added

---

### Proposals — route `/proposals`

- **Purpose**: Upload Word/PowerPoint templates, map components to data sources, and draft a proposal from a deal id.

- **Reads (data in)**:
  - `GET /api/proposals/templates` — template list (line 79)
  - `GET /api/proposals/templates/${id}` — single template detail (line 91)
  - `POST /api/proposals/templates` — upload (line 111)
  - `PATCH /api/proposals/templates/${id}` — confirm mapping (line 163)
  - `POST /api/proposals/templates/${id}/fill` — draft from deal (line 189)
  - `PATCH /api/proposals/${proposalId}` — save edits (line 222)
  - `POST /api/proposals/${proposalId}/components/${componentId}/regenerate` — single component re-draft (line 251)
  - Assumes: deal id is known to the user (typed manually); proposal storage provisioned; LLM configured

- **States handled in code**:
  - **templates empty** (lines 337–340): "No templates yet" text
  - **templates loaded** (lines 341–359): sidebar list
  - **no template selected** (lines 366–369): instruction text
  - **template selected, no components detected** (lines 383–386): "No components detected."
  - **template selected, components present** (lines 389–464): component editor form
  - **status=mapped, fill form** (lines 466–588): deal-id input + draft/preview
  - **filling** (line 485): "Drafting…" disabled button
  - **filled: unmapped sections** (lines 517–521): text warning
  - **filled: components** (lines 522–586): editable textareas with confidence badges, citations, regenerate button
  - **filled: abstained component** (line 534–540): "needs input" badge
  - **filled: unsupported component** (lines 541–547): dark-red "unsupported" badge
  - **notice banner** (lines 322–327): generic status/error text for all operations
  - MISSING: **error state per component** — if regenerate fails, notice sets a generic string; no per-component error UI
  - MISSING: **loading state for template list** — `loadList` is async but there is no loading indicator while it resolves

- **Primary CTAs / outbound links (edges OUT)**:
  - `<a href="/api/proposals/${proposalId}/download">` (line 497) — download DOCX
  - `<a href="/api/proposals/${proposalId}/download?as=pdf">` (line 504) — download PDF
  - No navigation links to any other CRM route

- **Inbound expectations (edges IN)**:
  - No query params consumed. Deal id must be typed manually into a plain text input (line 471–476).
  - `window.prompt()` used for regeneration guidance (line 248) — blocks UI, not a React controlled input.

- **Seam risks**:
  - Deal id must be copy-pasted manually — no picker, no search, no link from Opportunities. The Proposal page has NO connection to the pipeline. DEAD-END inbound: the user must leave the pipeline, manually copy a deal id, and paste it here.
  - `window.prompt()` for regeneration guidance (line 248) is a browser native dialog — inconsistent with the rest of the UI.

- **Notable gaps**:
  - Deal id input is a bare `<input>` with no autocomplete or search against `/api/opportunities` (line 471)
  - `window.prompt()` for re-draft guidance (line 248) — native browser blocking dialog
  - No loading skeleton for template list on first load
  - Regenerate uses `window.prompt` which will be blocked in some embedded contexts

---

## CRM cluster — seam summary

**Account list → Account detail**
The account name in the list opens a `<SlideOver>` (quick-view panel), NOT `/accounts/[id]`. There is no direct row-level link to the full detail page. Only a "View brain" link inside the slide-over reaches `/accounts/[id]/brain`. Navigation to `/accounts/[id]` requires knowing the URL directly or going through the brain page's breadcrumb back-link. Context is effectively dropped — the list's selected state does not carry to the detail.

**Account detail → Opportunities**
Deals linked to an account are shown on `/accounts/[id]` (lines 259–280) but the deal cards are NOT clickable. There is no `<Link href="/opportunities/${deal.id}">`. User must go back to the pipeline list to find the deal. Context (which account's deal) is not carried.

**Account detail → Contacts**
"Suggested Contacts" shows name+title+reason but has no "Add contact" or "Create contact" action and no link to `/contacts`. Suggestions are a dead-end display. The account brain page similarly shows contacts as plain text without links to `/contacts/[id]`.

**Contact list → Account**
The company name cell in the contacts table is text-only — no `<Link href="/accounts/${contact.companyId}">`. Users cannot navigate Contact → Account from the list.

**Contact detail → Opportunities**
There is no deals section on `/contacts/[id]`. Deals where `contactId = this.id` are never fetched. Contact detail is a dead-end for any deal-related follow-up.

**Contacts → Merge**
Context IS carried: `router.push("/contacts/merge?ids=${ids}")` passes ids, and merge page reads `useSearchParams`. However, `loadCurated` fetches page 1 of `/api/contacts` (50 records) without filtering by those ids — if any id is on page 2+, it silently drops it and the curated form never opens.

**Opportunity detail → Account**
Account name on `/opportunities/[id]` is plain text (lines 387, 761). The `Deal` interface on this page does not include `companyId`, making a link impossible without an API or interface change. Complete dead-end: Deal → Account navigation does not exist.

**Opportunity detail → Email contact**
"Email contact" pre-fills `to: ""` (line 336) — the contact's email is not loaded on this page. The email composer opens blank.

**Opportunity list → Proposals**
No link from `/opportunities` or `/opportunities/[id]` to `/proposals`. Deal id must be manually copy-pasted into the proposals page's text input. This is the hardest seam break in the cluster: the two features that should naturally connect (a deal in the pipeline → draft a proposal for it) have zero in-product navigation path.

**Accounts list → Call Mode**
Bulk selection + "Call Mode" → `window.location.href = /call-mode?accounts=${ids}` (line 1017). Context IS carried (account ids in URL). Hard page reload breaks browser back-button.
