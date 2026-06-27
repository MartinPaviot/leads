# Monaco UI — Forensic Teardown

> **Scope.** Per-screen forensic analysis of 12 Monaco app-UI screenshots (`app/apps/web/public/*.png`), reconciled against the OCR ground-truth layer (`_ALL-OCR.md`) and the prior field intel (`MONACO-COMPETITIVE-INTEL.md`). Produced for Elevay build decisions: a copy/beat/avoid/ignore call per feature an engineer can act on.
> **Method.** 12 parallel vision agents (one screenshot each, undiluted attention) → cross-screen synthesis → adversarial QA pass. Every claim is anchored to a screenshot filename; OBSERVED (literally visible) is kept separate from INFERRED (reasoning). Source data dated Apr 2026; captured 2026-06-25. App lives at `app.monaco.com`; observed user = "Devon Hennig".
> **Reliability (QA verdict).** Overall the teardown is highly reliable on its core analytical work: every transcribed table, counter, and the sharp findings all check out against the pixels — the 834/596 -> 850/607 reconciliation (and the conclusion that intel's ERP-Email Only = 0/0/0/0/0 is wrong; it is 16/11/0/0/0), the swapped filenames (demand-hub-performance-apr13-19.png is actually /reporting and reporting-revenue-pipeline.png is actually /demand/hub), the LinkedIn 0/178 and SaaS-Email 549->0 conversion read, the all-A|Burning uncalibrated score, the dropped meeting times, the "Enginner" typo, and the 5,530 TAM are all verified. The reliability problems are a small, contained set of over-reads where the author inferred dynamic/occlusion behavior the pixels contradict: RTI is fully enriched (not a "still-loading async row" — the dimmed row beneath it is a 15th account, Anrok), the apr6-12 "0 LinkedIn messages" label is fully visible (not edge-cut), and the "planned cap vs throughput 5x" item is a metric conflation, not a contradiction. After correcting those, the synthesis stands. The single biggest residual risk: 5 of the 12 screens are demo/screen-share captures (webcam tiles) of a staged/early-run tenant — all-A|Burning, every owner unassigned, all connections 0, 40-closed-vs-0-pipeline — so all quantitative conclusions (conversion rates, "Burning isn't predictive," dead-channel) rest on a single non-representative April month and must not be generalized to Monaco's steady state; and the headline moat the intel doc leans on (call-intelligence) has zero supporting pixels.

---

## STEP 1 — Per-screen forensics

### home-priorities.png
**Screen:** Home / priorities feed (no URL bar in crop; intel maps it to app.monaco.com `/`). Nav-highlighted tab: Home.
**Purpose (1 line):** Daily landing: an AI-triaged "respond to inbound" action queue on the left, a "today's meetings" panel on the right, under a weekly greeting/digest line.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating launcher) / 2 content columns (Your priorities today | Today's meetings) / ~6 priority cards visible (5 fully rendered + 1 cut off behind the nav) / 1 meetings panel (empty) / interactive controls = 2 "See All" links + 1 "×" dismiss (only on the hovered top card) + 8 nav tabs + 1 launcher. No browser chrome (tab strip/address bar) is in this crop.

3x3 grid walkthrough:
- Top-left: "Good morning, Devon" greeting (small) above the bold digest headline "This week, we've launched 6 sequences and closed 40 opportunities."
- Top-center: continuation of the digest headline (spans the width).
- Top-right: empty whitespace; the headline does not reach this far.
- Mid-left: section label "Your priorities today" with the first card — "Respond to Olivia Edison", reply-glyph icon, "Qubit Capital • New", body "Olivia agreed to your call and proposed next Tuesday at 3pm." This card is in a hover/active state: a "×" sits at its right edge and the cursor arrow rests over "Tuesday".
- Mid-center: stacked priority cards 2–4 (Meghan Hardy, Yasmine Ruiz, Amanda Alcamo). To the right of this column sits the "Today's meetings" header (with a far-right "See All") and a single empty-state card "No meetings scheduled for today."
- Mid-right: mostly empty page background; faint vertical scrollbar at the right edge.
- Bottom-left: lower priority cards (Yasmine Ruiz "Received 3 days ago" in amber; partial "Respond to Mayur Toshniwal").
- Bottom-center: bottom navigation bar (Home highlighted) overlapping the last partial card.
- Bottom-right: floating Monaco-logo launcher button to the right of the nav bar; scroll indicator.

Priority feed transcription — 6 rows x 4 fields (Name / Account•Status / ReceivedAgo / AI one-line):
| # | Respond to (name) | Account • Status | Received | Parsed next-step (one-liner) |
|---|---|---|---|---|
| 1 | Olivia Edison | Qubit Capital • New | Received 13 hours ago | Olivia agreed to your call and proposed next Tuesday at 3pm. |
| 2 | Meghan Hardy | Levitate • New | Received 1 day ago | Meghan read your paper on judiciously procrastinating responsive syne... |
| 3 | Yasmine Ruiz | Levitate • New | Received 1 day ago | Yasmine proposed next Friday at 5:30pm for your chat on sticky sprints. |
| 4 | Amanda Alcamo | Kong • New | Received 2 days ago | Amanda proposed next Wednesday 6:30pm for your quick call. |
| 5 | Yasmine Ruiz | Levitate • New | Received 3 days ago (AMBER) | Yasmine proposed next Thursday at 9:30am for your project feedback... |
| 6 | Mayur Toshniwal | Qubit Capital • New (partial, behind nav) | (hidden) | (hidden behind nav bar) |

Today's meetings panel — 1 row: empty-state "No meetings scheduled for today."

Bottom nav (left→right, 8): Home (active) · Inbox · Demand · Opportunities · Accounts · Contacts · Reporting · Settings; then floating launcher.

Second-pass additions: (1) every card carries the same left-edge reply/"respond" glyph icon — a single repeated action affordance, not per-contact avatars. (2) The "×" dismiss is only rendered on the hovered card (card 1), implying dismiss is hover-revealed, not always-on. (3) "Received 3 days ago" on card 5 is rendered in amber/orange while all newer timestamps are gray — an age-color escalation. (4) A faint vertical scrollbar on the right edge + a scroll indicator bottom-right show the feed is longer than the viewport (more than 6 cards exist). (5) Two separate "See All" links (one per column) confirm both lists are paginated/overflow views. (6) Status enum observed is uniformly "New" across all 6 cards (no other status value appears). (7) The greeting "Good morning" implies time-of-day templating. (8) Cards 2 and 5 end in "..." (truncated summaries) whereas 1/3/4 end in a full period — truncation is length-based, not a sentence boundary.

**Edge/occlusion check:** Card 6 "Respond to Mayur Toshniwal" and its "Qubit Capital • New" sub-line are clipped by the bottom nav bar — its timestamp and summary are fully hidden. The "×" dismiss appears only on the hovered card 1; whether other cards expose the same control is occluded by their non-hover state. Cursor arrow sits over the word "Tuesday" in card 1 (OCR garbled it "Tuegiey"). Truncated verbatim labels: "...responsive syne..." (card 2) and "...your project feedback..." (card 5). No browser tab titles or URL are visible in this crop (the address bar is cropped out).

**OCR reconciliation:** ~40 tokens accounted for. Mapped: greeting + digest line; "Your priorities today"/"Today's meetings"; "SeeAll" (OCR collapsed it once — there are two, one per column); all 6 contact names; accounts (Qubit/"Quit Capital", Levitate, Kong); "New" statuses; all received-ago strings; all 5 visible summaries; 8 nav labels. OCR errors corrected against pixels: "Quit Capital"→"Qubit Capital", "Tuegiey"→"Tuesday", "Cermand"→"Demand", "Cortects"→"Contacts". Dismissed as noise: the glyph row "@ & WV $ ® & k& #" = the 8 nav icons + launcher (icon-noise), and the per-card "@"/reply glyph = the repeated respond icon. Elements OCR missed that I see: the amber color on card 5's timestamp, the hover-only "×", the right-edge scrollbar/scroll indicator, the floating launcher button, and the cursor position.

**INFERRED — implied data model:**
PriorityCard { id, actionType: "Respond" (only value seen), contactName: string, accountName: string, status: enum[New] (inferred — only "New" observed), receivedAt: timestamp (rendered as relative "N hours/days ago"), aiSummary: string (LLM-generated one-liner over the inbound reply), proposedMeetingTime?: datetime (inferred extracted entity — present on cards 1/3/4/5, ABSENT on card 2 → nullable), channel?: enum (icon implies email/LinkedIn source but channel label not shown — inferred), dismissed: boolean (× action). Meeting { /* none today */ } — the panel is a simple list with an empty-state. Greeting digest is a separate aggregate: { sequencesLaunchedThisWeek: 6, opportunitiesClosed: 40 } — note opportunitiesClosed contradicts Reporting (§8.7 Pipeline=0). Age-color is a derived field: receivedAt bucket → gray (<3d) | amber (>=3d).

**INFERRED — capability/automation:**
Proves an inbound-triage engine: each human reply is (a) summarized to one line and (b) mined for a proposed meeting datetime, then ranked into a "priorities today" queue. Automated = ingest + summarize + time-extraction + ranking. Human-driven = the actual reply ("Respond to…") and dismissal (×) — there is NO auto-reply and NO auto-book. The human override IS the whole right-hand action. The loop: inbound reply → parse/summarize/extract-time → priority card → human responds or dismisses → card clears. Open question: whether ranking is by recency only (cards are in strict received-ago order here) or by a fit/intent score — not visible.

**UX pattern & quality:** An action-queue / triage-inbox pattern: dense, uniform left-aligned cards, one repeated respond glyph, hover-revealed dismiss, two paginated columns. It is good for a "clear my morning" workflow — the one-line AI summary lets you skim intent without opening threads, and age-color nudges stale replies. It is thin on density economics: each card spends a full row on whitespace and a redundant identical icon, so only ~5 fit a viewport while the scrollbar hints at many more (slow to triage a backlog). No bulk actions, no per-card "Book"/"Snooze" affordance beyond Respond/×.

**Strength:** The time-extraction is the real asset: 4 of 5 visible cards surface a concrete proposed slot ("next Tuesday at 3pm", "Friday at 5:30pm") parsed straight from free-text replies — that is the expensive NLP a builder wants, and it turns an inbox into a scheduling worklist. The one-line intent summary + account•status context on each card is genuinely useful triage metadata.

**Weakness / gap:** Two contradictions. (1) Cross-screen: the hero "closed 40 opportunities" does not reconcile with Reporting (Pipeline Value = 0, Revenue Booked empty per §8.7) — a templated vanity metric overriding the system of record. (2) Within-screen: 4 cards contain a proposed meeting time, yet "Today's meetings: No meetings scheduled for today" — the extracted times are inert, never written to the calendar/meetings panel. The feature parses intent but drops it on the floor, leaving the user to re-key every booking.

**→ Elevay decision:** BEAT
   - **What:** Build a `priorities` feed table: PriorityCard { contactId, accountName, status, receivedAt, aiSummary, extractedMeetingTime (nullable), channel, dismissedAt }. Beat Monaco on its two visible gaps: (a) wire extractedMeetingTime into the Today's meetings panel as a one-tap "Book this slot" draft (close the loop Monaco leaves inert), and (b) compute the greeting digest's "closed N" from the SAME query that powers Reporting (single source of truth) or drop the metric — never a templated count. Add age-color bucketing (gray <3d / amber >=3d) and hover-reveal dismiss.
   - **Build effort:** M — the card list + age-color + dismiss is S/trivial; the load-bearing work is the inbound summarizer and the proposed-meeting-time extractor (and wiring that datetime into a calendar draft), which is the M.

---

### inbox-john-wade-thread.png
**Screen:** Inbox — single thread view (John Wade / Beeline). No browser chrome captured, so no URL bar; intel maps Inbox to route `/`.
**Purpose (1 line):** A unified per-contact conversation console: read an inbound reply, see the AI/user-drafted outbound reply, and send it on the channel the thread lives on (here: LinkedIn), with contact enrichment pinned to the right.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items + 1 floating launcher = 9 nav affordances; 3 vertical panes (thread-list / conversation / enrichment); 1 thread row in the list; left-pane controls = 2 dropdowns ("Prospecting", "Inbox") + 1 eye/preview icon; conversation = 3 message bubbles (2 inbound, 1 outbound) + 1 send button; right rail = 2 tabs ("Contacts" active, "Account") + 1 contact card; top bar = 1 "Last synced 1m ago" label + 1 refresh icon.

3x3 grid walkthrough:
- Top-left: page title "Inbox" (plain, top of left pane).
- Top-center: speech-bubble icon + thread header "John Wade" with sub-line "Beeline".
- Top-right: "Last synced 1m ago" + circular-arrow refresh icon; directly under it the right-rail tab strip "Contacts | Account" (Contacts active/underlined).
- Mid-left: filter row — "Prospecting" dropdown (chevron), "Inbox" dropdown (chevron), an eye (preview-toggle) icon; below it the only thread card: square avatar, "John Wade", sub-line "Beeline ·", right-aligned "1h".
- Mid-center: inbound bubble with a pink/red square "J" avatar — "Hey Devon, did I just get an email from you or has somebody robbed your name?" + "1h"; below it a SECOND inbound "J" bubble that is EMPTY except timestamp "1h".
- Mid-right: enrichment card — round "JW" avatar, "John Wade", "Snr Sales Enginner EMEA Lead at Beeline", link "linkedin.com/in/johnwade47" (external-link icon), link "beeline.com" (external-link icon), "Connected to Devon Hennig".
- Bottom-left: empty whitespace (only one thread in list).
- Bottom-center: outbound gray bubble (right-aligned, no avatar) — "Hey John. Appreciate the heads up. Can you paste the subject line or a screenshot here so I can confirm whether it came from me? / I'll check as soon as you send it and escalate if it looks like someone is spoofing my name. / Devon"; footer "Sent from your LinkedIn account" + dark circular send button (up-arrow glyph).
- Bottom-right: floating launcher (dark rounded square, asterisk/flower glyph) sitting right of the nav.

Conversation transcript (3 rows x 3 cols: direction | body | meta):
| Direction | Body | Meta |
|-----------|------|------|
| Inbound (J avatar) | "Hey Devon, did I just get an email from you or has somebody robbed your name?" | 1h |
| Inbound (J avatar) | (empty bubble — no visible text) | 1h |
| Outbound (no avatar) | "Hey John. Appreciate the heads up. Can you paste the subject line or a screenshot here so I can confirm whether it came from me? I'll check as soon as you send it and escalate if it looks like someone is spoofing my name. Devon" | footer: "Sent from your LinkedIn account" + send button |

Bottom nav (left→right, 8 items): Home · Inbox (active/highlighted) · Demand · Opportunities · Accounts · Contacts · Reporting · Settings.

Second-pass additions: (1) the second inbound bubble is genuinely empty — a placeholder/failed-render or an attachment/screenshot that didn't load, not text OCR missed. (2) Title is misspelled "Enginner" (not "Engineer") — a data-quality artifact in Monaco's enrichment. (3) The thread-list card sub-line ends in a trailing "·" ("Beeline ·"), implying a snippet/preview field that is blank here. (4) Inbound avatar is a colored "J" initials-square while the right-rail avatar is "JW" two-initials — two different avatar renderers in one screen. (5) Send button uses an up-arrow (▲) glyph, not a paper-plane. (6) No reply text input/composer box is visible — the drafted reply renders as a finished bubble, send is one tap. (7) No browser chrome at all (clean app capture) → no tab titles/URL to harvest here, unlike the Accounts screenshots.

**Edge/occlusion check:** Truncated/partial: thread-list sub-line "Beeline ·" (snippet after the dot is cut/blank). Occluded/missing content: the 2nd inbound bubble is empty — its actual content (likely the forwarded email subject line or the screenshot John was asked for) is not rendered, so the triggering artifact is hidden. No cursor/modal overlay. Right rail "Account" tab content is hidden (Contacts tab is active). Both filter dropdowns are collapsed — their option lists are hidden.

**OCR reconciliation:** ~24 OCR tokens accounted for. Mapped: "Inbox"/"Last synced Imago"→header+"Last synced 1m ago"; "Prospecting v"/"Inbox ,"/"©"→two dropdowns+eye icon; "(John Wade"/"Beeline"/"th"→thread card+"1h"; "J Jw 7"→inbound J avatar + right-rail JW avatar + stray "1h"; the two message blocks→inbound+outbound bodies; "Snr Sales Enginner EMEA Lead at Beeline"→title (note misspelling); "linkedin.com/in/johnwade47"; "beeline.com 4"→beeline.com + external-link icon; "7). % Connected to Devon Hennig"→connected line (leading glyphs=link icons); "Devan"→signature "Devon" (OCR misread); "Sent from your Linkedin account"; nav line "Home...Settings oe"→8 tabs + launcher. Dismissed as icon-noise: "Qieev ¢ &@ & & |S" = bottom-nav icon glyphs; "oe" = floating launcher glyph; leading "&"/"%"/"7)" = link/avatar icon artifacts. Elements OCR missed: the empty 2nd inbound bubble; the send button up-arrow; the active-tab underline on "Contacts"; Inbox nav highlight.

**INFERRED — implied data model:**
Thread { id, contactId, channel: enum["email","linkedin"] (inferred — footer says "Sent from your LinkedIn account"), folder: enum["Inbox", ...], scope: enum["Prospecting", ...], lastSyncedAt: timestamp, previewSnippet: string|null }. Message { id, threadId, direction: enum["inbound","outbound"], body: text|null (null observed on bubble 2), channel, sentVia: "LinkedIn account", relativeTime: string("1h"), authorInitials }. Contact { name, title:string("Snr Sales Enginner EMEA Lead"), company:"Beeline", linkedinUrl:"linkedin.com/in/johnwade47", websiteUrl:"beeline.com", connectedTo:ownerName("Devon Hennig"), avatarInitials:"JW" }. The right rail has two record types behind tabs: Contact and Account (Account schema not shown). The scope dropdown "Prospecting" implies a thread-classification enum (Prospecting vs e.g. Customer/All) distinct from the folder dropdown "Inbox".

**INFERRED — capability/automation:**
Proves: (1) a single inbox unifies email + LinkedIn threads — the SAME console sends via LinkedIn when the thread is LinkedIn-native ("Sent from your LinkedIn account"); channel is a per-thread property, not a separate app. (2) Outbound replies are pre-drafted and shown as a ready bubble (no empty composer), so the loop is draft-then-one-tap-send — AI/system drafts, human approves/sends (human-in-the-loop). (3) Contact enrichment (title, LinkedIn, company site, owner-connection) is auto-pinned per thread from the records graph. The human override is the explicit send button — nothing auto-sends from this view. Loop: inbound reply synced → thread surfaced → reply drafted → human reviews enrichment + edits/sends on the native channel. Not visible — open question: whether the draft was AI-generated or hand-typed (no "AI drafted" badge), and whether the composer is editable in place (no input field rendered).

**UX pattern & quality:** Three-pane mail/console pattern (list · conversation · enrichment) — familiar, low learning curve. Density is deliberately low: generous whitespace, one ink tone, gray-vs-white bubble differentiation for direction, relative timestamps. Good: channel-aware send footer removes "which channel am I replying on?" ambiguity; right-rail enrichment kills tab-switching to a CRM record. Weak: showing the drafted reply as a finished bubble with no visible editable composer is ambiguous — a user can't tell if "Devon ... Sent from your LinkedIn account" is already sent or pending until they notice the send button; the empty 2nd inbound bubble looks broken. Bottom nav (8 items) is unusual for a desktop web app and eats vertical space better used by the thread.

**Strength:** Cross-channel unification done right: the reply console abstracts email vs LinkedIn so the founder works one queue and the system picks the channel — exactly the zero-tool-switching promise. The pinned enrichment (title, LinkedIn handle, company URL, "Connected to {owner}") gives reply context without leaving the thread, and "Last synced 1m ago" + manual refresh sets an honest freshness expectation. This is the model Elevay's inbox should match.

**Weakness / gap:** Thin/broken: (1) the second inbound message renders as an EMPTY bubble — the actual triggering artifact (John's forwarded email/screenshot) is missing, so the very evidence the reply asks for isn't shown. (2) Enrichment title carries a typo "Snr Sales Enginner" — Monaco's enrichment surfaces raw, unverified data; intel doc §8.2 silently "corrected" it to "Engineer" (pixels disagree — flag the doc). (3) No editable composer / no "AI-drafted" provenance badge is visible, so draft authorship and editability are unprovable from this screen. (4) Only one thread in the list — cannot judge list sorting, unread badges, or triage at volume.

**→ Elevay decision:** BEAT
   - **What:** Build the unified thread console with an explicit channel-and-provenance header that Monaco lacks: render Message.channel as a per-bubble badge (email vs LinkedIn) and tag system-drafted replies with a visible "AI draft — review before send" pill + an inline editable composer (not a finished-looking static bubble). Carry Thread.channel + Message.direction/body(nullable) in schema, and render a real fallback for null/empty inbound bodies (e.g. "[attachment — open in source]") instead of a blank bubble. Surface enrichment freshness/confidence so we don't ship raw typos like "Enginner" as fact.
   - **Build effort:** M — three-pane shell + thread/message/contact schema is standard; the real work is the channel-send abstraction (email + LinkedIn/Unipile dispatch) and a draft-provenance/edit composer, both of which Elevay already has partial infra for (inbox-ai-draft worktree, Unipile port).

---

### demand-hub-performance-apr6-12.png
**Screen:** Demand → Demand Hub (route /demand/hub per sibling screenshots; URL bar not visible in this frame). Active bottom-nav tab = "Demand". Active sub-tab = "Demand Hub".
**Purpose (1 line):** Operator cockpit for the autonomous outbound engine: a weekly/daily outreach metrics strip + an "Autopilot is on" control banner + a day-bucketed preview of the upcoming auto-send queue.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating Monaco launcher) / 3 sub-tabs (Demand Hub·Sequences·Templates) / 7 metric tiles (4 "Weekly outreach" + 3 "Sent today") / 4 day buckets / 1 scope dropdown ("My Sequences") + 2 banner controls (Settings link, Review Upcoming expander). No data table on this screen (the queue is a 4-row day list, not the per-contact grid — that lives in demand-queue-expanded.png).

3x3 grid walkthrough:
- TOP-LEFT: page title "Demand"; sub-tab row "Demand Hub" (active, white pill) · "Sequences" (gray) · "Templates" (gray).
- TOP-MIDDLE: empty off-white whitespace.
- TOP-RIGHT: "My Sequences ▾" scope dropdown; the right ~18% of the frame is a webcam video tile (dark room, a framed picture on the wall) — picture-in-picture from a live call.
- MID-LEFT: "Performance" section header; below it "Weekly outreach (Apr 6-12)" with metrics "29 / 21 / 8 / 0".
- MID-MIDDLE: pale-blue "Autopilot is on" banner with paper-plane icon and subtitle "6 sequence types automated".
- MID-RIGHT: "Sent today" group "8 / 7 / 0(cut)"; banner right side "Settings" link + teal "Review Upcoming ▾" expander (appears expanded); bottom webcam tile = bearded man with glasses in a cream knit sweater.
- BOTTOM-LEFT: "Thursday" row with green chip "29/30 processed"; "Friday" row with blue chip "30 sequences".
- BOTTOM-MIDDLE: "Monday  30 sequences ▾" · "Tuesday  30 sequences ▾"; a hand cursor sits near the rows.
- BOTTOM-RIGHT: empty whitespace under the queue card; webcam tile bleed.
- BOTTOM CENTER STRIP: floating rounded nav bar — Home(house)·Inbox(chat)·Demand(paper-plane, ACTIVE highlighted)·Opportunities($)·Accounts(building)·Contacts(people)·Reporting(line-chart)·Settings(sliders) + Monaco square-cluster launcher to its right.

Metric strip transcription (2 rows x labels):
| Group | Tile 1 | Tile 2 | Tile 3 | Tile 4 |
|---|---|---|---|---|
| Weekly outreach (Apr 6-12) | 29 Added to queue | 21 In queue now | 8 New contacts reached | 0 New responses |
| Sent today | 8 Emails | 7 Connection requests | 0 LinkedIn messages | — |

Day-bucket queue transcription — 4 rows x 3 cols:
| Day | Count chip | Expand |
|---|---|---|
| Thursday | "29/30 processed" (green) | (progress, today) |
| Friday | "30 sequences" (blue) | ▾ |
| Monday | "30 sequences" (blue) | ▾ |
| Tuesday | "30 sequences" (blue) | ▾ |

Second-pass additions: (1) the queue skips Saturday & Sunday — sequence goes Thursday→Friday→Monday→Tuesday, i.e. business-day-only scheduling. (2) "Review Upcoming" chevron is pointing up/active (teal fill), implying the day list below is the expanded state of that control. (3) Thursday's chip is GREEN ("processed") while Fri/Mon/Tue chips are BLUE ("scheduled") — a two-color state encoding (done vs pending). (4) The whole right edge is two stacked webcam tiles — this screenshot was captured during a screen-share on a video call, not a static product shot. (5) The autopilot banner has its own pale-blue tinted background card distinct from the white metric card — it is visually a separate "control" surface. (6) No address bar / browser chrome / tab titles are visible in this crop (unlike sibling demand screens which show app.monaco.com/demand/hub).

**Edge/occlusion check:** The full "Sent today" triple is directly visible — 8 Emails / 7 Connection requests / 0 LinkedIn messages — the webcam tiles sit far right and do not reach the metric strip (the earlier "label edge-cut" read was wrong). "Review Upcoming ~" is partially clipped at the right ("Review Upco…" in the upscaled crop). The two webcam picture-in-picture tiles occlude roughly the right 15-18% of the canvas across the full height, hiding whatever sits at the far-right of the banner and queue rows. No modal/cursor occlusion of text except the hand cursor hovering the Monday/Tuesday rows.

**OCR reconciliation:** ~28 meaningful tokens accounted for. Mapped: "Demand", "DemandHub/Sequences/Templates", "Performance", "My Sequences v", "Weekly outreach (Apr 6-12)", "Sent today", "29 21 8 0 8 7 0" (→ four weekly + three today metrics, trailing 0 = LinkedIn messages), the seven metric labels, "Autopilot is on", "6 sequence types automated", "Settings", "Review Upcoming ~", "Thursday 29/30 processed", "Friday/Monday/Tuesday 30 sequences v". Dismissed as noise: "% " after Thursday (icon/progress glyph), the strings "9 9 a =", "s", "=", "\c", "1", "\ ;", "," — all OCR artifacts from the two webcam video tiles on the right. Elements OCR MISSED that I see: the 8-icon bottom nav bar + Monaco launcher (rendered as glyphs, no text captured), the two-tone chip color coding (green vs blue), the hand cursor, the paper-plane autopilot icon, the active-tab highlight on "Demand Hub" and "Demand".

**INFERRED — implied data model:**
OutreachPerformance { scope: enum["My Sequences", …other saved scopes] ; weekRange: {start, end} ; addedToQueue:int=29 ; inQueueNow:int=21 ; newContactsReached:int=8 ; newResponses:int=0 ; sentToday: { emails:int=8 ; connectionRequests:int=7 ; linkedinMessages:int=0 } }. AutopilotConfig { enabled:bool=true ; automatedSequenceTypeCount:int=6 (a SUBSET — the reporting screen lists ~14 distinct {Vertical}-{Channel} sequence types, so "6 automated" ≠ total) ; dailyCap≈30 (inferred from every bucket = 30) }. UpcomingDayBucket { weekday: enum[Thu,Fri,Mon,Tue …skips weekend] ; plannedCount:int=30 ; processedCount:int|null (Thu=29) ; state: enum["processed"(green) | "scheduled"(blue)] ; expandable→ rows of QueuedContact{contact,title,account,contactScore,status,sequenceType,Remove} (per demand-queue-expanded.png) }. Channel taxonomy is 3-way: email / LinkedIn connection-request / LinkedIn message — the "Sent today" triple is the per-channel send ledger.

**INFERRED — capability/automation:**
Proves a running autonomous sender: a daily worker that processes a fixed cap (~30) of sequence steps per business day across email + two LinkedIn actions, with a live progress counter ("29/30 processed" = today's run nearly complete). Automated = candidate selection, day-bucketing, and the actual sends for the 6 enrolled sequence types. Human-driven override = the "Review Upcoming" expander (preview the next days' queue before it fires) + "Settings" + per-contact "Remove" on the expanded view. The loop: enroll→bucket by send-day→process daily under cap→meter reached/responses→surface for human pre-send review. The hidden human checkpoint is BEFORE send (preview/prune), not after.

**UX pattern & quality:** Three stacked horizontal bands: (1) a flat 7-tile KPI strip (big number + small gray caption, no charts — scannable, low density), (2) a tinted "control" banner that states autopilot status + count and offers exactly two affordances (Settings, Review Upcoming), (3) an expandable day-bucket list with one-line-per-day and a single colored count chip. Good: the green-vs-blue chip instantly separates "done today" from "scheduled"; weekday-only buckets read as a calendar without being one; the expander keeps the per-contact firehose collapsed by default. Weak: the KPI strip has no deltas, no rates, and no sparkline — "0 New responses" sits with the same weight as "29 Added to queue", so a dead funnel and a healthy one look identical at a glance; the banner gives a count ("6 types") but no inline list of WHICH types or a one-click pause.

**Strength:** It makes an "autonomous" engine legible and reversible: an operator sees today's exact send count by channel, the literal processed/planned ratio, and the next four send-days BEFORE anything fires — with a path to prune. That pre-send transparency + the explicit "X/30 processed" worker heartbeat is the credibility move that lets a founder trust a system that sends on their behalf.

**Weakness / gap:** The funnel is dead on this screen and the UI doesn't flag it: 8 new contacts reached and 0 new responses for the whole Apr 6-12 week, yet the layout celebrates volume (29/21/8). No reply-rate, no positive-reply, no per-sequence breakdown here (that's siloed in Reporting). Note (NOT a contradiction): the ~30/day shown in each day-bucket are sequence STEPS processed against the standing backlog ("In queue now" = 21), whereas "Added to queue" = 29 is the week's new-contact INFLOW — different quantities, so processing more per day than the weekly inflow simply draws the backlog down. "6 sequence types automated" contradicts the ~14 sequence types in reporting-sequence-performance.png — the banner count is a silent subset. And the right-edge webcam tiles mean this is demo/call data, so the numbers may be a staged tenant, not steady-state production.

**→ Elevay decision:** BEAT
   - **What:** Elevay already has the engine (lib/autopilot/* + inngest/daily-autopilot.ts behind DAILY_AUTOPILOT_ENABLED) but no operator cockpit. Build a DemandHub "Review Upcoming" surface that beats Monaco's: (a) a per-channel "Sent today" ledger {emailsSentToday, connectionRequestsToday, linkedinMessagesToday} + a weekly strip {addedToQueue, inQueueNow, newContactsReached, newResponses} sourced from agent_traces/send-events; (b) day-bucketed UpcomingDayBucket rows {weekday, plannedCount, processedCount, state:processed|scheduled} rendered as green/blue chips, business-days-only, each expandable to QueuedContact rows with a per-row Remove that writes a suppression/prune; (c) the one thing Monaco lacks — surface reply-rate and a one-click Pause-autopilot on the banner, and show WHICH sequence types are automated (named list, not just "6"). Label the three quantities distinctly — new-contact inflow (added-to-queue) vs steps-processed/day vs standing backlog (in-queue-now) — so they are never read as one diverging number.
   - **Build effort:** M — metrics strip + day-bucket list is a thin read-model over existing autopilot/send-event tables; the expand-to-contacts + Remove(prune) and the reply-rate/pause additions are the real work, but all data already exists server-side.

---

### demand-hub-performance-apr13-19.png
**Screen:** Reporting (URL bar: app.monaco.com/reporting) — NOT the Demand Hub. Filename is mislabeled.
**Purpose (1 line):** Org-level GTM reporting dashboard: revenue booked by owner, pipeline value, and a sequence-performance funnel for the selected period.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating launcher) / 2 filter dropdowns / 5 KPI counters / Revenue-Booked chart = 6 owner rows / Sequence-Performance table = 6 columns, only 1 data row visible (rest below fold + occluded) / 5 browser tabs.

3x3 grid walkthrough:
- Top-left: browser tab "Reporting - Monaco" (active), grey/green window chrome.
- Top-center: more tabs — "Liam on X: 'we guarantee 2…'" (truncated) + 2-3 unreadable tabs; address bar "app.monaco.com/reporting".
- Top-right: bookmark star, extension glyphs, green "Work" profile pill, kebab menu.
- Mid-left: page title "Reporting"; below it two stacked grey loading/placeholder blocks; "Revenue Booked" panel header.
- Mid-center: "Revenue Booked" horizontal-bar chart — row "Unassigned" (highlighted blue) + 5 "Devon Hennig" rows, all bars empty; x-axis $0 · $100K · $200K · $300K · $400K · $500K.
- Mid-right: "Pipeline Value (i)" = "0" (top counter) and a second "Pipeline Value (i)" panel showing empty-state "No data available / There's no chart data to display for this period" with a faint bar-chart icon.
- Bottom-left: section header "Sequence Performance"; KPI "850 Added to Queue".
- Bottom-center: KPIs "607 New contacts reached · 11 Completed · 3 New responses · 1 New meeting"; table header row; floating bottom nav bar overlays the table mid-section.
- Bottom-right: table columns "New Responses / New Meetings" with row values "0  0"; nav launcher (Monaco logo) at far right.

Table transcription (Sequence Performance) — 2 rows x 6 cols (header + 1 visible data row; middle cells occluded by the floating nav bar):
| Sequence Type | Added to Queue | New Contacts Reached | Completed | New Responses | New Meetings |
|---|---|---|---|---|---|
| Engage In-Network Connection (Buyer) | (occluded) | (occluded) | (occluded) | 0 | 0 |

Second-pass additions: (1) two grey skeleton/placeholder rectangles top-left = chart still loading or empty region; (2) "(i)" info tooltip icons beside both "Pipeline Value" labels; (3) the "Unassigned" bar row is rendered in a blue selected/hover state distinct from the Devon Hennig rows; (4) small bar-chart glyph inside the right "No data available" empty-state; (5) browser tab #2 "Liam on X: 'we guarantee…'" reveals the user simultaneously researching cold-outreach guarantee claims; (6) green "Work" Chrome profile badge = user is in a dedicated work browser profile; (7) KPI counters use bold number + light caption typography (850 / 607 / 11 / 3 / 1).

**Edge/occlusion check:** Floating bottom nav bar overlays the horizontal middle of the Sequence-Performance table, hiding the "Added to Queue / New Contacts Reached / Completed" cell values of the only visible row (Engage In-Network Connection Buyer) — only the right-edge "0  0" survives. Table is cut at the bottom frame edge after row 1; remaining ~13 sequence rows (per §8.8) are below the fold. Browser tab #2 truncated: "Liam on X: 'we guarantee 2…'". OCR mojibake corrected against pixels: "$2700K"→$200K, "$scoK"→$500K, "11 Cc ted"→11 Completed, "here's no art Gata…this perrod"→"There's no chart data to display for this period", "veven ene/oeren Hee"→Devon Hennig. Top-left grey blocks partly clip the Revenue-Booked panel.

**OCR reconciliation:** ~35 tokens accounted for. Mapped: "Reporting - Monaco"/URL/"Work"→browser chrome; "Reporting"→title; "This Month (Apr 1 - Apr 30)" + "Entire Organization"→2 filter dropdowns; "Pipeline Value"+"0"→counter+panel; "Revenue Booked"→chart; 6x "Devon Hennig"/garbled variants→owner rows; "No data available"+"there's no chart data…period"→empty-state; "$0…$500K"→x-axis; "Sequence Performance"→section; "850/607/11/3/1" + captions→KPI counters; "Sequence Type…New Responses…New Meetings"→table header; "Engage In-Network Connection (Buyer)"→row1; trailing "0 0"→row1 right cells; nav tokens "tome/Inbox/Opp/Accounts/Reporting/Settings"→bottom nav. Dismissed: "oo oo" (top) = grey skeleton blocks, not text; "@ & WV $ … = #" = bottom-nav icon glyph noise; "am on X: we guarantee" = adjacent browser tab (chrome). Elements OCR missed that I see: the two "(i)" tooltip icons, the blue-highlighted Unassigned row, the empty-state bar-chart glyph, the floating launcher logo, the bookmark star.

**INFERRED — implied data model:**
Screen reveals an aggregation/reporting layer over the sequence engine. ReportQuery { period: enum[This Month (Apr 1–Apr 30), …prior ranges], scope: enum[Entire Organization, …per-owner/team] }. RevenueBookedByOwner { owner: string|"Unassigned", bookedAmount: currency } rendered 0–$500K (all rows = 0 here). PipelineValue: currency = 0 (single scalar + would-be trend chart, empty). FunnelSummary { addedToQueue:int=850, newContactsReached:int=607, completed:int=11, newResponses:int=3, newMeetings:int=1 }. SequencePerformanceRow { sequenceType: string ("{Vertical} - {Channel}" or named play e.g. "Engage In-Network Connection (Buyer)"), addedToQueue:int, newContactsReached:int, completed:int, newResponses:int, newMeetings:int }. Inferred funnel ratios from the summary: reach 607/850 = 71.4%, response 3/607 = 0.49%, meeting 1/607 = 0.16% — these reconcile exactly with the §8.8 monthly totals (this IS the §8.7 reporting screen).

**INFERRED — capability/automation:**
Proves Monaco has a monthly roll-up that joins the autonomous sequence engine's activity (queue/reach/complete) to outcomes (responses/meetings) and to revenue attribution by owner. Automated: counter + funnel aggregation across all sequences; the per-sequence breakdown is auto-segmented by vertical×channel. Human-driven: only the two filters (period, scope) and reading. The loop: autopilot sends → activity logged → this dashboard rolls up reach→response→meeting per sequence so the operator can see which channel/vertical converts. Revenue Booked / Pipeline are wired to an Opportunities/deal object that is empty here (0 closed, 0 pipeline) — the attribution plumbing exists but has no data. No write/override affordance on this screen.

**UX pattern & quality:** Counter-strip + dual-chart + funnel-table dashboard. KPI strip (bold number / light caption) is scannable and good. Weakness: two panels both titled "Pipeline Value" (a duplicated header) and both Revenue Booked + Pipeline render empty/zero — the screen is ~60% dead space showing "No data available," which makes a flagship reporting page feel hollow. Density is low. The floating bottom nav physically occludes the most useful artifact (the funnel table) at this scroll position — a fixed overlay colliding with content is a real layout defect. Affordance gap: no row drill-down, export, or date-compare visible.

**Strength:** The Sequence-Performance funnel (Added→Reached→Completed→Responses→Meetings, segmented per "{Vertical} - {Channel}") is the genuinely valuable artifact: it lets a founder see channel/vertical conversion at a glance and is the one screen whose numbers reconcile across the product. Owner-level revenue attribution and a single org/period filter pair keep the mental model simple.

**Weakness / gap:** Contradiction stack: (1) FILE/INTEL MISLABEL — filename "demand-hub-performance-apr13-19" and the §8.3 hint (120/98/49/0) describe the Demand Hub widget, but the pixels are the /reporting screen; the 120/98/49/0 figures actually live in the file named reporting-revenue-pipeline.png. The two assets are swapped. (2) PRODUCT contradiction — Home greeting claims "closed 40 opportunities" while this screen shows Pipeline Value = 0, Revenue Booked all-empty, and only 1 meeting / 3 responses for the month: the hero vanity metric does not reconcile with the system of record. (3) UX — duplicate "Pipeline Value" headers; empty panels dominate; nav overlaps the table.

**→ Elevay decision:** COPY
   - **What:** Build a Reporting page with a `sequence_performance` funnel table: columns sequence_type, added_to_queue, new_contacts_reached, completed, new_responses, new_meetings (int), one row per "{vertical} - {channel}" play, plus a 5-tile KPI strip (queued/reached/completed/responses/meetings) and period+scope filters. Add a derived `reach_rate` and `response_rate` column Monaco lacks. Pull revenue_booked_by_owner and pipeline_value from the deals table BUT gate empty panels behind a non-zero check (show an onboarding empty-state, not a dead 0/"No data available" chart) — and never let Home's vanity counters diverge from this table (single source of truth). Fix: don't let a fixed bottom nav overlay scrollable report tables.
   - **Build effort:** S — a filtered aggregate query + counter strip + one table; the data model is already implied by Elevay's sequence engine. The only real work is the funnel rollup query and added conversion-rate columns.

---

### demand-queue-expanded.png
**Screen:** Demand → DemandHub → "Review Upcoming" autopilot queue, expanded (day = Thursday). No browser chrome / URL visible in this crop — the app fills a screen-shared video-call frame.
**Purpose (1 line):** Per-contact preview of what the autopilot will send next, grouped by day, with a per-row human kill switch (Remove) and an approval gate on AI-Suggested additions.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating launcher) / 7 table columns / 13 visible data rows (row 13 partly occluded) / controls = Settings, "Review Upcoming ▲" pill, table collapse chevron ▲, day-row close ✕, 13× Remove, 1× Details (hover).

3x3 GRID WALKTHROUGH:
- Top-left: paper-plane icon + banner "Autopilot is on / 6 sequence types automated"; directly below, day tab "Thursday  29/30 processed" (the "29/30 processed" on a green highlight).
- Top-center: pale-blue header band; table column headers begin — "Title", "Account" with small briefcase/building glyphs.
- Top-right: "Settings" text button + blue rounded pill "Review Upcoming ▲" (expanded); a collapse chevron ▲ at the table's right edge; top of a video tile (man with headphones).
- Mid-left: Contact column — names Andrew Haire, Lee Pittman, Sarah Gooding, Iosif Skorohodov, Loryll Denamur, Jessie Petrov, Alison Seong, Ross Moulton (Ross's row hovered → "Details" chip).
- Mid-center: Title + Account (each account has a colored brand favicon) + Contact Score columns.
- Mid-right: Status chips (green "Started", amber "Queued"), "Sequence Type" text, "Remove" links; a second video tile (man with glasses).
- Bottom-left: lower contact rows Thomas Bordes, Andrew Szatan, Matthew Madden, Madison Nelson.
- Bottom-center: bottom nav Home · Inbox · Demand(active, blue) · Opportunities · Accounts · Contacts · Reporting · Settings.
- Bottom-right: last rows' Queued status + Sequence Type + Remove; dark floating launcher (Monaco logo); bottom video tile shows thumbs-up / thumbs-down reaction buttons (a live video-call UI).

TABLE — 13 rows x 7 cols (Contact | Title | Account | Contact Score | Status | Sequence Type | Remove):
| Contact | Title | Account | Contact Score | Status | Sequence Type | Remove |
|---|---|---|---|---|---|---|
| (empty) | (empty) | werkmetoffra.nl (W) | ● Warm | Suggested ⓘ(red) | SaaS - LinkedIn Primary | Remove |
| Andrew Haire | Head of Marketing (Product... | Xano | — | Started | SaaS - LinkedIn Primary | Remove |
| Lee Pittman | Marketing Director | Whereoware | — | Started | SaaS - LinkedIn Primary | Remove |
| Sarah Gooding | Head of Content Marketing | Socket | — | Started | SaaS - LinkedIn Primary | Remove |
| Iosif Skorohodov | Chief Marketing Officer \| Gr... | ITC Management Group | — | Started | SaaS - LinkedIn Primary | Remove |
| Loryll Denamur | Director of Corporate Marke... | Jumio | — | Started | SaaS - LinkedIn Primary | Remove |
| Jessie Petrov | Director of Marketing | GenArts | — | Started | SaaS - LinkedIn Primary | Remove |
| Alison Seong | Marketing | NHN Global | — | Started | SaaS - LinkedIn Primary | Remove |
| Ross Moulton [Details] | VP of Product, Marketing &... | Leafly | — | Started | SaaS - LinkedIn Primary | Remove |
| Thomas Bordes | Head of Marketing | Lambda | — | Queued | SaaS - LinkedIn Primary | Remove |
| Andrew Szatan | Head of Marketing | Follow Up Boss | — | Queued | CRM - LinkedIn Primary | Remove |
| Matthew Madden | Solutions Marketing Director | Anaconda | — | Queued | SaaS - LinkedIn Primary | Remove |
| Madison Nelson | Head of Partner & Field | (occluded by nav bar) | (occluded) | (occluded) | SaaS - LinkedIn Primary | Remove |

Second-pass additions (>=5): (1) Contact Score is populated on ONLY the Suggested row ("Warm"); all 12 Started/Queued rows have a blank score cell. (2) The Suggested row has NO contact name or title — it is an account-only suggestion (werkmetoffra.nl). (3) Column-header glyphs: person (Contact), briefcase (Title), building (Account), circle-temp (Contact Score), circle (Status), flag (Sequence Type). (4) Status uses 3 colors: blue "Suggested", green "Started", amber "Queued" — a visual lifecycle. (5) "Details" appears only on the hovered Ross Moulton row (row-level affordance, not a column). (6) The right ~30% of the frame is two stacked webcam tiles + thumbs-up/down — this is a recorded video call / screen-share, not a clean product capture. (7) Sequence-type vertical tracks the account's category (Follow Up Boss=CRM → "CRM - LinkedIn Primary"; all others SaaS).

**Edge/occlusion check:** Truncated titles verbatim: "Head of Marketing (Product...", "Chief Marketing Officer | Gr...", "Director of Corporate Marke...", "VP of Product, Marketing &...". Row 13 (Madison Nelson): its Account, Contact Score, and Status cells are hidden behind the floating bottom nav bar overlay — only Contact, Title, Sequence Type, Remove are readable. The far-right edge of the table (any column past Remove, if any) is covered by the two video-call tiles. The "Review Upcoming" pill is in its expanded state (chevron ▲) — the collapsed state is not shown.

**OCR reconciliation:** ~95% of tokens accounted for. Garbled header "Saf a hauica hee automated Setings Sees" → "6 sequence types automated / Settings / Review Upcoming". "Thursday 29/30 processed x" → confirmed (x = collapse day). All 12 named rows + the empty Suggested row map 1:1 to OCR. "Linkagdin Primary" (Ross row) = OCR noise for "LinkedIn Primary". Bottom-nav OCR "urea ll inbox Ypportunities Accounts Contacts Reporting Settings" → Home·Inbox·Demand·Opportunities·Accounts·Contacts·Reporting·Settings. OCR MISSED (visible, not in OCR): the two webcam video tiles, thumbs up/down reaction buttons, the per-row "Remove" links on lower rows (OCR caught some), the "Details" hover chip, the airplane banner icon, the column-header glyphs, the red ⓘ on the Suggested row. Unplaceable: none material — remaining OCR fragments are icon-noise/video-frame garble.

**INFERRED — implied data model:**
QueueItem { id, day: date (bucketed — "Thursday"), contactId: nullable (null for account-only Suggested rows), contactName: string|null, title: string|null, accountId: fk→Account, contactScore: enum[Warm, Hot, Cold?] (temperature chip, only set pre-enrollment), status: enum[Suggested, Started, Queued], sequenceType: string = "{vertical} - {channel}" e.g. "SaaS - LinkedIn Primary" | "CRM - LinkedIn Primary", removable: bool }. Account { name, vertical: enum[SaaS, CRM, ...], domain, faviconUrl }. DayBucket { label, processed: int, capacity: int } → "29/30 processed". Inferred enums: status (3 observed); sequenceType vertical derived from Account.vertical, channel observed only "LinkedIn Primary". The blank ContactScore on enrolled rows implies score is a pre-enrollment ranking signal that the UI stops surfacing once a contact is Started/Queued.

**INFERRED — capability/automation:**
Proves an autopilot that (1) ranks candidates by signal/score, (2) auto-enrolls them into vertical+channel sequences at a fixed daily cap (~30/day, "29/30 processed"), and (3) surfaces the next-up queue for human review. Automated: candidate selection, sequence-type assignment, scheduling/processing. Human-driven overrides: per-row Remove (prune any item) and an approval gate — "Suggested" rows (flagged with a red ⓘ, account-only, no contact yet) appear to require human confirmation before becoming Started. The loop: signal-ranked Suggested → human approves/Remove → Started → Queued → processed (counted against the day's cap). "6 sequence types automated" = the autopilot runs multiple vertical/channel playbooks concurrently. Not visible — open question: what the ⓘ tooltip says, whether Remove is reversible, and whether there is bulk-approve.

**UX pattern & quality:** Day-grouped, single-row-per-send preview table with inline status chips and a per-row destructive action. Good: the lifecycle is legible at a glance via 3 color-coded statuses (blue Suggested / green Started / amber Queued), the "29/30 processed" gives an honest capacity meter, and Remove sits at constant far-right for muscle memory. The Suggested-with-⚠️ pattern is the right HITL affordance — it visually separates "AI wants to do this" from "this is already happening". Weak: dense 13-row table with no row spacing, no bulk-select / bulk-approve visible (every override is one row at a time), and Contact Score shown on only 1/13 rows wastes a whole column. No "why this contact" rationale inline (you must click Details).

**Strength:** Monaco makes an "autonomous" system feel governable: a concrete, previewable queue with a daily cap, color lifecycle, and a one-click Remove on every row. That converts trust ("the AI is sending 30 LinkedIn touches today") into something a founder can audit and veto before it happens, which is exactly the objection an autonomous GTM tool must overcome.

**Weakness / gap:** The Contact Score column is empty on all 12 enrolled rows — the one piece of "why is this person here" evidence is dropped precisely where the user is reviewing real sends; rationale is buried behind a hover "Details". No bulk approve/remove, no per-row "why" reason, and Suggested rows lack a contact identity (account-only), so the human is asked to approve an outreach without seeing who it targets. The capture is from a screen-shared sales call (webcam tiles + thumbs up/down), so right-edge columns are unverifiable here.

**→ Elevay decision:** BEAT
   - **What:** Build Elevay's daily-autopilot queue (spec 37) as a day-bucketed table with the same columns — contactName, title, account(+favicon), status enum[suggested|started|queued], sequenceType "{vertical} - {channel}", per-row Remove — but BEAT Monaco on two gaps: (1) keep contactScore + a one-line "why" (top signal) populated on EVERY row, not just Suggested, rendered inline; (2) add bulk-select with bulk Approve / Remove on the Suggested set so a founder clears the day's queue in one action. Add a reversible Remove (undo) and require contact identity before any Suggested row is approvable.
   - **Build effort:** M — the queue table + status enum + per-row Remove is straightforward over the existing autopilot candidate loop; the delta is wiring inline score/why-signal per row, bulk actions, and a Suggested→approve state transition with an audit of removals.

---

### accounts-score-status.png
**Screen:** Accounts — TAM record table (browser URL bar: app.monaco.com/records/accounts; browser tab title "Accounts - Monaco")
**Purpose (1 line):** The "Clay-style" all-accounts TAM grid, scrolled to the lead-prioritization column group: per-account Status, Owner, Score (letter grade + heat), Industry, Headcount and relationship-graph columns.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating launcher) / 9 visible table columns / 14 fully-visible data rows (+1 partial "Forerunner" clipped at bottom) / 5 toolbar controls above the table (All Accounts saved-view dropdown, filter, sort, AI-scan, search) + 1 top-right "+ Add Account" button.

3x3 GRID WALKTHROUGH:
- Top-left: page H1 "Accounts"; below it the "All Accounts" saved-view dropdown (chevron) and four icon buttons: funnel (filter), up/down arrows (sort), circle-with-crosshair (AI/scan), magnifier (search).
- Top-center: empty header band (light gray), table header row begins lower.
- Top-right: black "+ Add Account" button. Above the app, browser chrome: pill "✦ Ask Gemini", a "Work" Chrome profile avatar, kebab menu.
- Mid-left: checkbox column + Company column with per-row brand favicons and names (Cursor, Zocks, BigPanda, Runway, AirOps, Signeasy, iBase-t, PLAUD.AI, Manychat, Cloaked, Rogo).
- Mid-center: Status column (all "New"), Account Owner column (entirely empty), Score column rendered as "A | 🔥 Burning" pill pair, Industries column.
- Mid-right: Headcount (right-aligned integers), Connected To (empty), Connections (all "0"), Software Category column (header truncated to "Softy", values SaaS/Other/Healthc...).
- Bottom-left: rows Sycurio (with a "Details" button appearing on row-hover), AxisCare Home Care (green "Customer" badge), Sonatus, and a clipped "Forerunner" row.
- Bottom-center: 8-tab bottom nav — Home · Inbox · Demand · Opportunities · Accounts(active, gray rounded highlight) · Contacts · Reporting · Settings.
- Bottom-right: trailing Software Category cells + the floating Monaco launcher (4-square clover logo) at far right of the nav.

FULL TABLE TRANSCRIPTION — 14 rows x 9 cols (Software Category column header truncated to "Softy"; Score = letter-grade pill | heat pill):
| Company | Status | Account Owner | Score | Industries | Headcount | Connected To | Connections | Software Category |
|---|---|---|---|---|---|---|---|---|
| Cursor | New | (empty) | A \| 🔥 Burning | Software Development | 262 | (empty) | 0 | SaaS |
| Zocks | New | (empty) | A \| 🔥 Burning | Software Development | 66 | (empty) | 0 | SaaS |
| BigPanda | New | (empty) | A \| 🔥 Burning | Software Development | 338 | (empty) | 0 | SaaS |
| Runway | New | (empty) | A \| 🔥 Burning | Software Development | 339 | (empty) | 0 | SaaS |
| AirOps | New | (empty) | A \| 🔥 Burning | Software Development | 55 | (empty) | 0 | SaaS |
| Signeasy | New | (empty) | A \| 🔥 Burning | Administrative Services [IT S...] | 74 | (empty) | 0 | SaaS |
| iBase-t | New | (empty) | A \| 🔥 Burning | Software Development | 306 | (empty) | 0 | Other |
| PLAUD.AI | New | (empty) | A \| 🔥 Burning | Technology Information An... | 66 | (empty) | 0 | SaaS |
| Manychat | New | (empty) | A \| 🔥 Burning | Software Development | 421 | (empty) | 0 | SaaS |
| Cloaked | New | (empty) | A \| 🔥 Burning | Technology Information An... | 70 | (empty) | 0 | SaaS |
| Rogo | New | (empty) | A \| 🔥 Burning | Software Development | 51 | (empty) | 0 | SaaS |
| Sycurio | New | (empty) | A \| 🔥 Burning | Financial Services [IT Servic...] | 113 | (empty) | 0 | SaaS |
| AxisCare Home Care | Customer (green) | (empty) | A \| 🔥 Burr[ning] | Software Development | 164 | (empty) | 0 | Healthc[are] |
| Sonatus | New | (empty) | A \| 🔥 [heat label clipped] | Software Development | 239 | (empty) | 0 | SaaS |

Second-pass additions (found on re-inspection): (1) browser-tab strip shows FOUR open tabs — "Monaco Onboarding Plan - G[oogle]", "Accounts - Monaco"(active), "Funnel Metrics - Google She[ets]", "Screenshot 2026-04-09 at..." — revealing the operator is cross-referencing a funnel-metrics spreadsheet. (2) The Score letter-grade and the heat label are visually TWO separate pills separated by a thin vertical divider "|", not one chip — confirms grade and temperature are independent axes. (3) Account Owner column is present but 100% unassigned across all 14 rows. (4) Connections column is uniformly 0 and Connected To is uniformly empty — relationship-graph columns exist but are unpopulated for this workspace. (5) A "Details" affordance appears only on the hovered row (Sycurio) — row-level hover action to open the account. (6) Company logos are real fetched brand favicons (per-domain), not generic placeholders. (7) The AI-scan toolbar icon (circle + crosshair) sits between sort and search — a dedicated enrich/AI action distinct from search. (8) Active nav tab "Accounts" carries a gray rounded-rect highlight; floating 4-square Monaco launcher is docked right of Settings.

**Edge/occlusion check:** Column header "Software Category" truncated to "Softy". Industry cells truncated mid-word: "Administrative Services It'S" (→ "...IT Services"), "Technology Information An..." (→ "...and Analytics"), "Financial Services It Servic...". Heat labels truncated on bottom rows: AxisCare "Burr"/"Burnir" (→ "Burning"); Sonatus heat label clipped/absent in OCR. Software Category "Healthc" (→ "Healthcare"). Bottom row "Forerunner" is clipped by the nav bar (only the name peeks). Mouse cursor sits in the Connections column near the AxisCare/Sonatus rows. Browser tab titles all truncated by tab width.

**OCR reconciliation:** ~70 tokens accounted for. Browser chrome dismissed as non-UI: tab titles (Monaco Onboarding Plan / Funnel Metrics - Google Sheets / Screenshot 2026-04-09 / Ask Gemini), "app.monaco.com/records/accounts" (URL bar), "Work" (Chrome profile). Toolbar icon-row OCR garble "VILSIIN||S@]}aQ" dismissed as icon-noise = the filter/sort/AI/search glyphs. Score garble "A | A Burning" / "A | & Burning" / "A | @ Burning" mapped: first "A" = letter grade pill, the middle glyph (&, @, A) = the flame/heat icon OCR mis-read, "Burning" = heat label. "It'S"/"It S"/"It Servic" mapped to "IT Services" inside Industry cells. "Burr"/"Burnir" mapped to truncated "Burning". "Softy" mapped to truncated "Software Category" header. Row-name OCR all placed (Cursor…Sonatus). Bottom-nav OCR garble "@a2evd $ 8 &S & = #" + "box J es Accounts ts me Setting" mapped to the 8 nav icons/labels. Elements OCR MISSED that the pixels show: the green "Customer" status badge color, the per-row brand favicons, the hover-only "Details" button, the 4-tab browser strip, the floating Monaco launcher logo, the "+ Add Account" button, the vertical divider between grade and heat pills.

**INFERRED — implied data model:**
Account { name: string; logoDomain: string (favicon source); status: enum["New","Prospecting"(seen other views),"Customer"]; ownerId: nullable user ref (all null here); scoreGrade: enum["A","B","C","D"...] (only "A" observed); scoreHeat: enum["Burning","Warm","Cold"] (only "Burning" observed here, "Warm" elsewhere) — grade and heat are TWO independent fields, not one; industry: string/taxonomy ("Software Development","Administrative Services","Technology Information and Analytics","Financial Services"); headcount: integer; connectedToUserId: nullable (relationship-graph, all empty); connectionsCount: integer (all 0); softwareCategory: enum["SaaS","Other","Healthcare","LMS"...]. } Inferred: scoreHeat is a derived/computed temperature from intent signals (see signal popover sibling screen 8.6), scoreGrade is an ICP-fit letter. Owner + Connected To + Connections form a relationship/ownership layer that is structurally present but unpopulated for this tenant — i.e. fields exist before data does.

**INFERRED — capability/automation:**
This screen proves Monaco auto-scores every account in the TAM on two independent automated axes — an ICP-fit letter grade (A) and an intent "temperature" (Burning) — and auto-fills firmographics (industry, headcount, software category) without manual entry; the operator's job is to read/sort/filter the ranked list, not populate it. Automated: scoring, firmographic enrichment, heat computation. Human-driven: Status transitions (New→Customer), the eventual Owner assignment, and the per-row "Details" drill-in / "+ Add Account". The loop: TAM auto-built and auto-scored → operator filters to A/Burning → enrolls into sequences (Demand) → Status flips to Customer. The relationship-graph (Connected To / Connections) is the warm-intro layer but is empty here, so the loop currently runs on cold signal-scoring only.

**UX pattern & quality:** Dense single-table spreadsheet pattern (Clay/Airtable lineage): pinned Company column, horizontally scrollable column groups, saved-view dropdown ("All Accounts"), and a filter/sort/AI/search toolbar. Good: high information density at ~32px rows, two-axis score rendered as a compact grade|heat pill pair is instantly scannable, color-coded status badge (green "Customer") gives at-a-glance state, hover-reveal "Details" keeps the grid clean. Weak: zero column-level visual hierarchy distinguishing the value-bearing Score from the empty Owner/Connected-To columns — three fully-empty columns waste horizontal space and push Headcount off the first viewport; the grade|heat divider is subtle and could read as one token at a glance.

**Strength:** Two-axis automated scoring surfaced directly in the grid: an ICP-fit letter grade AND a separate intent "temperature", both computed, both sortable, with a sibling hover popover (screen 8.6) that explains WHY (Top Signals: paid-search spend, AI-strategy mandate, hiring, SEO decline). For a builder this matters because it makes the ranked TAM both actionable (sort by heat) and trustworthy (explainable score), with firmographics auto-hydrated so the table is useful with zero manual entry.

**Weakness / gap:** The score axis is collapsed: every one of the 14 visible rows is "A | Burning" — a scoring scale where nothing is below the top grade conveys zero prioritization signal (it cannot rank within the "All Accounts" view). Combined with Account Owner, Connected To all empty and Connections all 0, the high-value differentiating columns are inert; the grid is effectively Company+Industry+Headcount+Status. Contradiction worth flagging: the intel doc frames Score as the prioritization lever, but with uniform A/Burning it does not discriminate — and it sits in the same product where Reporting (8.8) shows these "Burning" accounts produced 0 meetings, so "Burning" is not predictive of conversion here.

**→ Elevay decision:** BEAT
   - **What:** Build the Accounts TAM table with a TWO-FIELD score on the account entity: account.icpGrade (enum A-D, computed from firmographic ICP match) and account.intentHeat (enum Burning/Warm/Cold, computed from a weighted signal set) rendered as a grade|heat pill pair — but BEAT Monaco by (1) forcing grade distribution (calibrate so A is scarce, not universal) so the column actually sorts, (2) making intentHeat clickable to the signal-evidence popover inline (carry over screen 8.6's Top Signals list), and (3) hiding empty relationship columns (Owner/Connected To/Connections) until populated instead of shipping three dead columns. Add a saved-view dropdown + filter/sort/AI-enrich/search toolbar and a "+ Add Account" action to match.
   - **Build effort:** M — the Drizzle account schema + scored columns + a virtualized resizable grid with saved views and a grade|heat pill is a few days; the real work is the scoring/signal engine behind icpGrade and intentHeat (calibration so grades discriminate), which is the differentiator, not the table.

---

### accounts-firmographic-columns.png
**Screen:** Accounts — TAM records grid, firmographic column group. URL bar: app.monaco.com/records/accounts
**Purpose (1 line):** The TAM/accounts spreadsheet showing the firmographic + derived-ICP column band: who each account is (headcount, software category, funding, industry) and two computed Yes/No signal flags.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items; 9 table columns visible (Company [frozen], Headcount[left-clipped as "...dcount"], Connected To, Connections, Software Category, Latest Funding Rou..., Industry Served, Ai Strate..., Compe...[right-cut]); 14 fully-rendered data rows + a 15th row (Anrok) dimmed/scrolling under the floating nav; toolbar = saved-view dropdown "All Accounts" + ~5 icon controls (filter/sort/group/fields/AI-sparkle) + search, plus 1 "+ Add Account" button = ~7 controls.

3x3 grid walkthrough:
- Top-left: browser tabs "Monaco Onboarding Plan", active "Accounts - Monaco"; address bar lock + app.monaco.com/records/accounts.
- Top-center: more tabs "Funnel Metrics - Google Sh[eets]", "Screenshot 2026-04-09 at...".
- Top-right: "Ask Gemini" tab; window min/max/close; profile avatar with "+2"; "Work" Chrome profile badge; bookmark star; black "+ Add Account" button sits just under, page-right.
- Mid-left: page title "Accounts"; under it the "All Accounts" saved-view dropdown.
- Mid-center: toolbar icon row (filter, sort, group, hide-fields, AI sparkle) + magnifier search; the table header row begins (Company | ...dcount | Connected To | Connections | Software Category).
- Mid-right: header cells "Latest Funding Rou... | Industry Served | Ai Strate... | Compe..." (last clipped at frame edge).
- Bottom-left: company cells with colored logo/favicon avatars + checkboxes (Aftershoot, TriNetx, WorkRamp, ConsumerAffairs, Spotter, Whitepages, ROLLER, Labelbox, Aha, Suno, Artera, Ahrefs, infoTrack US, RTI).
- Bottom-center: body cells — Headcount numbers, blank Connected To, "0" Connections, Software Category (SaaS/Healthcare/LMS/Other), funding rounds, industries.
- Bottom-right: green "Yes" / red "No" chips for AI Strategy & Competitor; floating bottom-center nav pill (Home, Inbox, Demand, Opportunities, Accounts[active], Contacts, Reporting, Settings) overlapping last row.

Full table — 14 fully-rendered rows + 1 dimmed (Anrok) x 9 cols (— = empty/unreadable cell):
| Company | Headcount | Connected To | Connections | Software Category | Latest Funding Round | Industry Served | AI Strategy | Competitor |
|---|---|---|---|---|---|---|---|---|
| Aftershoot | 126 | — | 0 | SaaS | Pre-Seed | Photography | Yes | No |
| TriNetX | 292 | — | 0 | Healthcare | Series D | Healthcare | Yes | No |
| WorkRamp | 71 | — | 0 | LMS | Series C | General / Horizontal | Yes | No |
| ConsumerAffairs | 190 | — | 0 | Other | — | General / Horizontal | Yes | No |
| Spotter | 221 | — | 0 | SaaS | Series D+ | Media & Entertainment | Yes | No |
| Whitepages | 90 | — | 0 | SaaS | Seed | General / Horizontal | Yes | No |
| ROLLER | 356 | — | 0 | SaaS | Series D+ | Leisure & Attractions | Yes | No |
| Labelbox | 315 | — | 0 | SaaS | Series E | General / Horizontal | Yes | No |
| Aha | 378 | — | 0 | SaaS | — | General / Horizontal | Yes | No |
| Suno | 191 | — | 0 | SaaS | Series C | Music | No | No |
| Artera | 287 | — | 0 | Healthcare | Series D+ | Healthcare | Yes | No |
| Ahrefs | 125 | — | 0 | SaaS | — | Marketing | Yes | No |
| infoTrack US | 227 | — | 0 | SaaS | — | Legal | Yes | No |
| RTI | 445 | — | 0 | Other | — | Aerospace & Defense | Yes | No |
| Anrok | 96 | — | — | — | — | Software / SaaS | — | — |

Second-pass additions: (1) each row has a colored company logo/favicon avatar left of the name; (2) a leftmost checkbox column (multi-select) precedes Company; (3) the Artera row shows an inline "Details" button + a hover-icon cluster — i.e. row actions appear on hover and the cursor is parked there; (4) a manual "Funnel Metrics - Google Sheets" tab is open alongside (operator keeps an out-of-app funnel sheet); (5) an "Ask Gemini" tab is open (operator runs a second AI in parallel); (6) sort/percent glyphs sit next to Headcount and Connections headers; (7) RTI (row 14) sits just above the nav and is fully populated (AI Strategy=Yes, Competitor=No are readable; only columns past Competitor are off-frame); a 15th row "Anrok" (Headcount 96, Industry "Software / SaaS") is dimmed/scrolling in under the floating nav, its remaining cells unreadable — not a loading state; (8) "+2" badge by the profile avatar (extra Chrome profiles); (9) Suno is the only "No" in the AI Strategy column — the one negative classification on screen.

**Edge/occlusion check:** Truncated headers verbatim: "...dcount" (Headcount, left edge clipped under the frozen Company column), "Latest Funding Rou..." , "Ai Strate..." (AI Strategy), "Compe..."/"Come" (Competitor — only a header sliver shows, all its cells are off the right edge). RTI (row 14) sits just above the floating bottom nav pill; its AI Strategy=Yes / Competitor=No cells ARE readable — only the columns beyond Competitor are off the right frame. A 15th account, "Anrok" (Headcount 96, Industry "Software / SaaS"), is dimmed and scrolling in under the nav (a real next row, not a loading/empty state). Blank "Latest Funding Round" cells: ConsumerAffairs, Aha, Ahrefs, infoTrack US, RTI (enrichment gap, not zero). Entire "Connected To" column is empty for all 14 rows; every "Connections" value = 0.

**OCR reconciliation:** ~120 OCR tokens in this section, ~all accounted for. Mapped: browser-chrome tokens ("Monaco Onboarding Pian", "Accounts - Monaco", "Funnel Metrics - Google St", "Screenshot 2026-04-09 at", "Ask Gemini", "app.monaco.com/records/accounts", "Work") → tabs/URL/profile. Header tokens "Company / dcount / Connected To / Connections / Software Category / Latest Funding Rou... / Industry Served / Ai Strate... / Come" → 9 columns ("dcount"=Headcount left-clipped, "Come"=Competitor). All 14 company names + numeric/category cells mapped to the table. Dismissed as icon-noise: "VIPSIINIJI SIL aQ" (toolbar icon row), "OO 9®" (Artera hover/select icons), "© " before Healthcare (cell icon), "@ & WV $ & roa ae > a" (bottom-nav glyph row), the per-row leading glyphs "(&/i\"/«/©/3)/D/@/®" (checkbox+favicon). OCR misses I see: the black "+ Add Account" button, the Yes/No chip COLORS (green/red), the per-row avatars, the leftmost checkbox column, the "%/sort" header carets.

**INFERRED — implied data model:**
Account { name: string; logo_url: string; headcount: int; connected_to: ref[]→User/Contact (warm-graph owner, all empty); connections: int (warm-intro count, all 0); software_category: enum[SaaS, Healthcare, LMS, Other] (inferred; sibling sequence names imply also ERP/CRM/HR) — this is WHAT THE ACCOUNT SELLS; industry_served: enum[Photography, Healthcare, General / Horizontal, Media & Entertainment, Leisure & Attractions, Music, Marketing, Legal, Aerospace & Defense] (inferred) — the VERTICAL THEY SERVE, a separate taxonomy from software_category (e.g. WorkRamp software=LMS / industry=General; Suno software=SaaS / industry=Music; TriNetX software=Healthcare / industry=Healthcare); latest_funding_round: enum[Pre-Seed, Seed, Series C, Series D, Series D+, Series E, null] (inferred; "+"=at-or-beyond); ai_strategy: bool (Yes/No derived classification); competitor: bool (Yes/No). } Key inference: software_category and industry_served are TWO distinct enum taxonomies, not duplicates. ai_strategy/competitor are computed boolean enrichments (one Yes/No per account), the firmographic head of the wider ICP-boolean band seen in accounts-icp-boolean-columns.png.

**INFERRED — capability/automation:**
Proves Monaco auto-enriches a 5,530-account TAM (bulk footer in sibling shot) with firmographics (headcount, funding round, dual category/industry taxonomy) AND derives per-account ICP classifier booleans (AI Strategy, Competitor). Automated: the enrichment fill + Yes/No classification (the negative on Suno shows it's a real classifier, not all-Yes default; blanks on 5 funding cells show coverage gaps, i.e. live/partial enrichment). Human-driven: saved views ("All Accounts"), filter/sort/group/field-hide, search, "+ Add Account", multi-select → bulk Actions, per-row Details/hover. Human override = which accounts to keep and which view/columns to see. Loop: ingest accounts → enrich firmographics + classify ICP booleans → score/rank (accounts-score-status) → autopilot sequences (Demand). Connected To/Connections present-but-empty = warm-relationship-graph feature shipped, unpopulated for this tenant.

**UX pattern & quality:** Clay/Airtable-style dense data grid: frozen Company column, resizable columns organized into swappable column-groups (this shot = firmographic band), inline colored chips for booleans, logo avatars per row, multi-select + bulk Actions, saved views. Density is good and scannable (green Yes / red No chips read instantly). It's a strong pattern for an analyst sweeping thousands of accounts. Weak affordances: too many columns for the viewport so the rightmost column (Competitor) is cut with no "N more columns / scroll" indicator; the frozen-Company column clips the Headcount header to "...dcount"; provenance for the Yes/No flags is not inline (you must hover the score popover to learn why).

**Strength:** Two separate taxonomies done right — software_category (what they build) vs industry_served (vertical they serve) — plus funding-round enum, give precise, filterable segmentation that a single "industry" field can't. Reducing fuzzy ICP fit to discrete, filterable Yes/No columns (AI Strategy, Competitor) makes a 5.5k-row TAM sortable/filterable at a glance and feeds autopilot targeting directly. Matters to a builder: this is the segmentation schema the whole engine keys off.

**Weakness / gap:** No inline provenance/confidence on the derived booleans here — AI Strategy = "Yes" with no source, date, or citation; the rationale only exists in the separate hover popover (8.6). 5 of 14 funding cells are blank with no "enriching…" vs "unknown" distinction, so the user can't tell a coverage gap from a real null. Entire Connected To / Connections band is dead weight (all empty / 0) yet still occupies prime horizontal space, pushing Competitor off-frame. Contradiction with intel doc §8.5: it lists Headcount as firmographic but the live header is clipped to "...dcount" — easy to mis-transcribe as "Account"; confirmed Headcount via WorkRamp=71 matching the popover "Company has 71 employees".

**→ Elevay decision:** COPY
   - **What:** On Elevay's Account entity add the dual-taxonomy split: software_category enum (SaaS/Healthcare/LMS/ERP/CRM/HR/Other) = what they sell, distinct from industry_served enum (vertical) — do NOT collapse into one "industry" field. Add latest_funding_round enum (Pre-Seed…Series E, "+" suffix, nullable) and a derived-boolean ICP column band starting with ai_strategy:bool and competitor:bool, rendered as green/red chips in the accounts grid. BEAT angle to bake in now (cheap at build time): each derived boolean carries {value, source_url, asOf, confidence} and renders a citation tooltip inline — Monaco hides provenance behind a separate hover popover; surface it on the cell. Distinguish "enriching" from "unknown" so blank funding cells aren't ambiguous.
   - **Build effort:** M — Elevay already has an accounts table; the work is schema additions (two enums + funding enum + 2 boolean classifier columns), the LLM/web classifiers that fill ai_strategy/competitor with provenance, and grid chip/tooltip rendering. Lake, not ocean.

---

### accounts-icp-boolean-columns.png
**Screen:** Accounts — ICP boolean enrichment columns (route: app.monaco.com/records/accounts, browser tab title "Accounts – Monaco")
**Purpose (1 line):** A Clay-style TAM grid where each ICP-fit criterion is a discrete, per-column AI-enriched boolean (green Yes / red No), horizontally scrolled to the enrichment-column band.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (+1 floating launcher) / 9 data columns in view (Company frozen + Industry Served + 7 ICP booleans, plus a "+" add-column stub) / 14 fully-rendered data rows (Aftershoot…RTI) + a 15th row (Anrok) dimmed/scrolling under the nav / 6 toolbar controls (All Accounts saved-view dropdown, filter funnel, sort up/down, AI-scan-in-box, search magnifier, + Add Account top-right).

3x3 GRID WALKTHROUGH:
- Top-left: page H1 "Accounts"; below it "All Accounts ▾" saved-view dropdown.
- Top-center: toolbar icon cluster — filter funnel, sort (↑↓), AI-scan (sparkle in rounded box), search magnifier.
- Top-right: black pill button "+ Add Account". Above the chrome: browser tabs "Monaco Onboarding Plan – G…", active "Accounts – Monaco", "Funnel Metrics – Google S…"; address bar "app.monaco.com/records/accounts".
- Mid-left: frozen Company column with row avatars + names (Aftershoot, TriNetX, WorkRamp, ConsumerAffairs, Spotter, Whitepages…) and the partially-visible "Industry Served" column.
- Mid-center: boolean columns "Ai Strate… / Competi… / Active P… / Has Rec…", each header carrying a left checkbox glyph and a right sparkle (enrich) glyph; cells are green "Yes" or red "No" chips.
- Mid-right: boolean columns "Hiring Fo… / Seo Traf… / B2B" + a faint "+" add-column control at the far right edge.
- Bottom-left: last rows (Ahrefs, infoTrack US, RTI) sit above the floating nav and are fully enriched (RTI = Yes/No/Yes/No/Yes/Yes/Yes); a faint 15th row "Anrok" (Industry "Software / SaaS") is dimmed/scrolling in under the nav.
- Bottom-center: floating bottom nav bar — Home, Inbox, Demand, Opportunities, Accounts (active, dark pill), Contacts, Reporting, Settings.
- Bottom-right: floating Monaco-logo launcher (cluster-of-dots) to the right of the nav; the faint chips bleeding under the bar belong to the dimmed 15th row (Anrok), not a loading state.

TABLE — 14 fully-rendered rows + 1 dimmed (Anrok) x 9 cols (Company, Industry Served, Ai Strategy, Competitor, Active Paid, Has Recent, Hiring For, SEO Traffic, B2B):
| Company | Industry Served | AI Strat | Competitor | Active Paid | Has Recent | Hiring For | SEO Traf | B2B |
|---|---|---|---|---|---|---|---|---|
| Aftershoot | Photography | Yes | No | Yes | No | Yes | Yes | Yes |
| TriNetX | Healthcare | Yes | No | No | Yes | Yes | Yes | Yes |
| WorkRamp | General / Horizontal | Yes | No | Yes | No | Yes | Yes | Yes |
| ConsumerAffairs | General / Horizontal | Yes | No | Yes | No | Yes | Yes | Yes |
| Spotter | Media & Entertainment | Yes | No | No | Yes | Yes | Yes | Yes |
| Whitepages | General / Horizontal | Yes | No | Yes | No | Yes | Yes | Yes |
| ROLLER | Leisure & Attractions | Yes | No | No | Yes | Yes | Yes | Yes |
| Labelbox | General / Horizontal | Yes | No | Yes | Yes | No | Yes | Yes |
| Aha | General / Horizontal | Yes | No | Yes | No | Yes | Yes | Yes |
| Suno | Music | No | No | Yes | Yes | Yes | Yes | No |
| Artera | Healthcare | Yes | No | Yes | Yes | No | Yes | Yes |
| Ahrefs | Marketing | Yes | No | Yes | No | Yes | Yes | Yes |
| infoTrack US | Legal | Yes | No | Yes | No | Yes | Yes | Yes |
| RTI | Aerospace & Defense | Yes | No | Yes | No | Yes | Yes | Yes |
| Anrok | Software / SaaS | — | — | — | — | — | — | — |

Second-pass additions: (1) every header has TWO glyphs — a left selection-checkbox and a right sparkle = per-column AI re-enrich affordance. (2) The "Competitor" column is "No" (red) for ALL 14 rows — a uniform column, not noted in intel. (3) A "+" add-column button sits past B2B (Clay-style custom-column add). (4) Browser tabs reveal the operator's parallel workflow: a Monaco Onboarding Plan doc + a "Funnel Metrics – Google Sheets" tab + an "Ask Gemini" affordance at top-right of chrome. (5) Suno is the lone off-ICP outlier (AI Strategy = No AND B2B = No — a consumer music product). (6) Row striping is subtle zebra; Yes chips are green-on-pale-green, No chips red-on-pale-red, ~12px. (7) The Accounts nav pill is the active/dark state in the bottom bar.

**Edge/occlusion check:** All 7 boolean headers are ellipsis-truncated verbatim: "Ai Strate…", "Competi…", "Active P…", "Has Rec…", "Hiring Fo…", "Seo Traf…", "B2B" (last one full). infoTrack US and RTI sit just above the floating bottom-nav bar + logo launcher and are FULLY enriched (RTI = Yes/No/Yes/No/Yes/Yes/Yes). The faint "N"/Yes chips bleeding under the bar belong to a 15th account "Anrok" (Industry "Software / SaaS") dimmed and scrolling in — there is NO observed per-row loading/empty state on this screen. The far-right "+" add-column control is clipped at the frame edge. The Industry Served column is partially clipped on the left between the frozen Company column and the booleans. OCR misreads to correct: "Yos"/"Yoc" = Yes (Aha SEO Traffic, Artera Has Recent).

**OCR reconciliation:** ~95 tokens accounted for. Browser-chrome (dismissed): "Monaco Onboarding Pian", "Accounts - Monaco", "Funnel Metrics - Googie St", "Screenshot 2026-04-09 at", "Ask Gemini", "€ C 23 app.monaco.com/records/accounts", "Work", "+". Header tokens mapped: "Company / Industry Served / Ai Strate… / Competi rd→Competitor / Active… / Has Rec / Hiring Fo… / Seotraf…→Seo Traf / B2B4→B2B". 14 company tokens map 1:1 to rows. All "Yes/No/Yos/Yos" cell tokens map to the transcribed grid (Yos/Yoc dismissed as Yes misreads). Bottom-nav OCR "@aewv gs 8 &S = #" + "box…tunities Accounts ects Ry Settling" = icon-noise for the 8-tab nav (Home/Inbox/Demand/Opportunities/Accounts/Contacts/Reporting/Settings). Unplaceable: none material. Elements OCR MISSED that I see: the per-column sparkle enrich glyphs, the per-column checkboxes, the "+ Add Account" pill, the toolbar filter/sort/AI-scan/search icons, the "+" add-column stub, the active-state dark Accounts nav pill, the floating logo launcher.

**INFERRED — implied data model:**
Account { company: string(FK→identity); industryServed: enum[Photography, Healthcare, "General / Horizontal", Media & Entertainment, Leisure & Attractions, Music, Marketing, Legal, Aerospace & Defense] }. ICP signal sub-model — each a discrete boolean column, independently enrichable & filterable: account_signal { ai_strategy: bool; uses_competitor: bool (label "Competitor"; observed all-false → likely "uses a competitor product", used as an exclusion flag); active_paid_search: bool (cross-ref popover "Active Paid Search Spend"); has_recent: bool (INFERRED "has recent funding/news" — ambiguous, open question); hiring_for: bool (popover "Hiring for SEO/GEO/AIO/AEO roles"); seo_traffic: bool (popover "SEO Traffic Decline"); is_b2b: bool }. Each column almost certainly carries a hidden *_source / provenance + as-of timestamp (sparkle = re-run enrichment). The "+" header implies user-definable custom enrichment columns (schema-less / Clay waterfall). These 7 booleans are the explainable inputs that feed the composite Score/grade and the Top-Signals popover (8.6).

**INFERRED — capability/automation:**
Proves a per-column AI enrichment engine (Clay-style waterfall): for every account in a ~5,530-row TAM, an agent computes each ICP criterion and writes a discrete boolean, rendered as a green/red chip. Automated: the enrichment + scoring (the sparkle icon = re-run an individual column's agent). Whether row-fill is async/lazy per-row is NOT observable here (no loading/empty state appears) — open question. Human-driven: defining which boolean columns exist ("+" add column), filtering/sorting on them, and bulk-selecting the filtered set (sibling screen: "All 5530 selected → Actions") to enroll. The override point: the human curates the ICP definition and the action set, the machine fills the matrix. Loop: define ICP boolean → enrich across whole TAM → filter to the all-Yes cohort → bulk-enroll into sequences → signals also explain the per-account score.

**UX pattern & quality:** Discrete-boolean ICP matrix: each fit criterion is its own sortable/filterable column of Yes/No chips rather than a free-text or single composite score. Good — it makes ICP fit auditable, queryable, and bulk-actionable (you can filter "AI Strategy=Yes AND B2B=Yes" to slice the TAM), and the green/red chips give instant scan-ability. Density is high but readable (~12px chips, subtle zebra, frozen Company column). Weak spots: 7 truncated headers ("Ai Strate…", "Has Rec…") force hover to disambiguate — the labels are too terse to act on confidently (is "Has Recent" funding or news?); chips are not (visibly) inline-editable for human override; the floating bottom-nav occludes the last 1–2 rows, a real layout bug at this height.

**Strength:** Monaco turns ICP from a vibe into a typed boolean schema: every targeting criterion is a first-class, enrichable, filterable column, and the same booleans resurface as the explainable "Top Signals" behind each account's score (8.6). For a builder this is the auto-TAM moat — completeness across the whole 5,530-row universe plus a "+add column" path to extend the schema per-customer without code. The per-column sparkle (re-enrich one signal) implies enrichment can be re-run incrementally per column; whether row-fill is async is not observable on this screen.

**Weakness / gap:** The signals are presented as hard booleans with no visible confidence, provenance, or as-of date on the cell — "Active Paid = Yes" gives no source or freshness, so a stale or wrong enrichment is indistinguishable from a fresh one (contrast Elevay's citation requirement). "Competitor = No" for all 14 rows is suspicious: either the column is near-useless here or it silently failed to enrich. And these crisp green/red booleans collide with Monaco's own reporting reality (8.8: LinkedIn 0 meetings, the one win came from an off-ICP HR sequence) — perfect-looking ICP matrices are not predicting the conversions.

**→ Elevay decision:** COPY
   - **What:** Build an `account_signals` table with one typed boolean per ICP criterion — ai_strategy, uses_competitor, active_paid_search, has_recent_funding, hiring_icp_roles, seo_traffic_decline, is_b2b — and for EACH add a paired `{signal}_source` (url/provenance) + `{signal}_as_of` timestamp + `{signal}_confidence`. Render in the Accounts TAM grid as green/red Yes/No chips with a per-column sparkle "re-enrich this signal" action and a "+ add enrichment column" affordance, with column-level filter/sort so a user can slice "ai_strategy=Yes AND is_b2b=Yes" and bulk-enroll the cohort. Beat Monaco on the one gap: show provenance + freshness on hover of every chip (we already require citations elsewhere), and a real per-row loading/empty state for in-flight enrichment (Monaco shows no such state).
   - **Build effort:** M — the table + chip UI + filter/sort is small; the real work is the per-signal enrichment agents (waterfall: paid-search, hiring, SEO, funding, B2B classification) with provenance + freshness, run incrementally across the whole TAM.

---

### accounts-tam-5530-selected.png
**Screen:** Accounts — TAM record table, all-selected state (URL bar: app.monaco.com/records/accounts; browser tab title "Accounts - Monaco")
**Purpose (1 line):** Prove the auto-built TAM size (5,530 accounts) and the cross-page bulk-action primitive: select the entire result set and run one Action verb against it.

**OBSERVED — every UI element:**
Counts: nav items = 0 visible (the bottom global nav bar present on the other Accounts shots is hidden here — the floating bulk bar sits where it would be); data columns = 9 (+1 leading master checkbox) — Company, Status, Account Owner, Score, Industries, Headcount, Connected To, Connections, Software Category(cut); rows = 15 visible (one more than OCR caught); table-toolbar controls = "All Accounts ▾" saved-view dropdown + 4 icon buttons (funnel filter, ↕ sort, AI/scan sparkle, magnifier search); page buttons = "+ Add Account" (top-right); bulk bar = 3 affordances ("All 5530 selected", × dismiss, "⚡ Actions").

3x3 grid walkthrough:
- TOP-LEFT: macOS Chrome tab strip — tab1 "Monaco Onboarding Plar…" (Docs icon), tab2 active "Accounts - Monaco" (Monaco logo), tab3 "Funnel Metrics - Googie St…" (Sheets icon).
- TOP-CENTER: tab4 "Screenshot 2026-04-09 at 1…", "+" new-tab.
- TOP-RIGHT: "✦ Ask Gemini" pill; below it URL bar "app.monaco.com/records/accounts", star/bookmark, reading-mode icon, green "Work" profile avatar, kebab ⋮.
- MID-LEFT: page H1 "Accounts"; below it "All Accounts ▾" dropdown + the 4 icon buttons; then the column-header row starting with a FILLED master checkbox + "Company".
- MID-CENTER: column headers Status · Account Owner · Score · Industries; data cells "New" status, blank Account-Owner, "A | 🔥 Burning" score, industry strings.
- MID-RIGHT: column headers Headcount · Connected To · Connections · Softw(are Category, cut at frame edge); "+ Add Account" black button sits above this zone.
- BOTTOM-LEFT: last data rows AxisCare Home Care, Sonatus, Forerunner (Forerunner greyed, half-hidden behind the floating bar), each with a checked blue checkbox.
- BOTTOM-CENTER: floating white pill bulk bar "All 5530 selected  ×  | ⚡ Actions" (the "5530" is highlighted blue / text-selected, an I-beam caret sits over the final "0").
- BOTTOM-RIGHT: continuation of Sonatus/Forerunner rows — Headcount 239 / 90, Connections 0, Software Category SaaS.

Table — 15 rows x 9 cols (checkbox column omitted; all 15 checkboxes are CHECKED):
| Company | Status | Account Owner | Score | Industries | Headcount | Connected To | Connections | Software Category |
|---|---|---|---|---|---|---|---|---|
| Cursor | New | (blank) | A · 🔥 Burning | Software Development | 262 | (blank) | 0 | SaaS |
| Zocks | New | (blank) | A · 🔥 Burning | Software Development | 66 | (blank) | 0 | SaaS |
| BigPanda | New | (blank) | A · 🔥 Burning | Software Development | 338 | (blank) | 0 | SaaS |
| Runway | New | (blank) | A · 🔥 Burning | Software Development | 339 | (blank) | 0 | SaaS |
| AirOps | New | (blank) | A · 🔥 Burning | Software Development | 55 | (blank) | 0 | SaaS |
| Signeasy | New | (blank) | A · 🔥 Burning | Administrative Services It S… | 74 | (blank) | 0 | SaaS |
| iBase-t | New | (blank) | A · 🔥 Burning | Software Development | 306 | (blank) | 0 | Other |
| PLAUD.AI (OCR "Pvsup.ai") | New | (blank) | A · 🔥 Burning | Technology Information An… | 66 | (blank) | 0 | SaaS |
| Manychat | New | (blank) | A · 🔥 Burning | Software Development | 421 | (blank) | 0 | SaaS |
| Cloaked | New | (blank) | A · 🔥 Burning | Technology Information An… | 70 | (blank) | 0 | SaaS |
| Rogo | New | (blank) | A · 🔥 Burning | Software Development | 51 | (blank) | 0 | SaaS |
| Sycurio | New | (blank) | A · 🔥 Burning | Financial Services It Servic… | 113 | (blank) | 0 | SaaS |
| AxisCare Home Care | Customer | (blank) | A · 🔥 Burning | Software Development | 164 | (blank) | 0 | Healthc(are) |
| Sonatus | New | (blank) | A · 🔥 Burning | Software Development | 239 | (blank) | 0 | SaaS |
| Forerunner (occluded) | New | (hidden by bar) | (hidden by bar) | Technology Information An… | 90 | (blank) | 0 | SaaS |

Second-pass additions (>=5 found only on re-inspection): (1) a 15th row "Forerunner" exists, faded and clipped behind the floating bar — OCR missed it entirely; (2) the master select-all checkbox in the header is filled/checked, not empty; (3) the "5530" digits are rendered as a highlighted text selection (blue) with a text I-beam caret parked on the final digit — someone literally drag-selected the count; (4) the Actions button glyph is a lightning/sparkle "⚡", signalling an AI/automation action rather than a plain menu; (5) the 4th toolbar icon is a distinct "scan/AI" sparkle glyph separate from the magnifier search; (6) "✦ Ask Gemini" pill and a green "Work" Chrome profile reveal the operator's browser context; (7) AxisCare's Status "Customer" is the only non-"New" status visible and is rendered in green.

**Edge/occlusion check:** Truncated/occluded verbatim: column header "Softw…" (Software Category, clipped at right frame edge). Industry cells clipped: "Administrative Services It S…", "Technology Information An…" / "…Ant", "Financial Services It Servic…". Software-category cell "Healthc…" (Healthcare). Bulk-bar count "All 5530 selected" — the trailing "0" sits under an I-beam text caret. Row 15 "Forerunner" is half-hidden behind the floating bulk bar: its Score and Account-Owner cells are fully occluded, name+logo greyed. Browser tabs clipped: "Monaco Onboarding Plar x", "Funnel Metrics - Googie St x", "Screenshot 2026-04-09 at 1… x". No modal/cursor occludes the table body otherwise.

**OCR reconciliation:** ~40 substantive tokens accounted for / unplaceable: the toolbar glyph soup "VY ILS NII SIEaQ" and row-leading glyphs ("(re", "Se)", "00,]", "@") are icon/logo/checkbox noise — dismissed; "Accounts [" = page H1 plus OCR mis-read of the "+ Add Account" button edge. OCR "(re AllSS3Q selected x & Actions" = the floating bulk bar "All 5530 selected × ⚡ Actions" (the "&" = lightning glyph). Column tokens "industries/Headcount/Connected To/Connections/Softy" all map (Softy=Software Category). Row names all map; OCR "Pvsup.ai" = PLAUD.AI. Elements OCR MISSED that I see: the 15th row "Forerunner"; the filled master checkbox; the "+ Add Account" button text; "✦ Ask Gemini"; the green "Work" profile avatar; the blue text-selection on "5530"; AxisCare's green "Customer" status.

**INFERRED — implied data model:**
Account { company_name: string; company_logo: url/favicon; status: enum[New, Prospecting(inferred, from §8.5), Customer]; account_owner: user_ref nullable (empty for all 15 → unassigned default); score: composite { grade: enum[A..F] (only A observed), temperature: enum[Burning, Warm](only Burning observed) } — TWO independent axes stored separately, rendered "A | 🔥"; industries: string/taxonomy (values seen: "Software Development", "Administrative Services & …", "Technology Information And Analytics", "Financial Services / IT Services", "Hospitals And Health Care") — looks NAICS-like, inferred; headcount: integer (51–421 range here); connected_to: relationship_ref nullable (all empty); connections: integer (all 0 → warm-intro graph wired but unpopulated for this tenant); software_category: enum[SaaS, Other, LMS, Healthcare](inferred — SaaS dominant, "Other" + "Healthc" seen) }. Collection-level: TAM total_count = 5530; a Selection object = { mode: "all_across_results", count: 5530 } distinct from per-row selection. Each ICP-boolean (AI Strategy, Hiring For, SEO Traffic Decline, B2B…) is a separate Yes/No enrichment column (seen on sibling shots, not this one).

**INFERRED — capability/automation:**
Proves: (1) an auto-built TAM of 5,530 ICP-matched accounts exists as one virtualized table; (2) a select-ALL-across-the-entire-result-set primitive — "All 5530 selected" is not "15 on this page selected", it spans every row behind the scroll; (3) a single "⚡ Actions" verb runs a bulk operation against all 5,530 (inferred: enroll-in-sequence / assign-owner / add-to-list / export / suppress). The automation is account sourcing + scoring + the bulk fan-out; the human override is the explicit checkbox selection + Actions trigger and the × to deselect — i.e. the operator decides WHEN to act on the machine-built list. Loop: ICP → auto-source 5,530 → score each (grade+heat) → operator bulk-selects all → Actions pushes them into Demand/sequences. The lightning glyph implies Actions itself may be AI-driven (auto-sequence assignment by vertical, per §8.4 naming).

**UX pattern & quality:** Clay/Airtable-style dense virtualized grid: ~28px rows, leading checkbox column, icon-prefixed column headers, sticky saved-view toolbar. On selection a white rounded floating bar pins bottom-center with the live count, a × to clear, a divider, and a primary "Actions" button — standard and good. Two strong touches: select-all means the WHOLE 5,530 result set (not the loaded page), and the count is a real number you can text-select. Two weaknesses: the floating bar OVERLAPS and greys the last data row (Forerunner) so a selected row is partially unreadable — bar should offset above the last row or the list should bottom-pad; and "Actions" gives no inline hint of the verb set or a destructive-op guardrail before you fan out to 5,530 records.

**Strength:** The bulk primitive is the moat moment: a machine-built 5,530-row TAM that an operator can act on in ONE gesture (select-all-across-results → Actions), with each row already carrying an explainable two-axis score (grade + heat). For a builder this is the difference between "we have an accounts table" and "we can launch outbound against the whole TAM in two clicks" — the count badge doubles as social proof of TAM depth.

**Weakness / gap:** Thin spots: Account Owner is empty on all 15 and Connections=0 / Connected To blank on all 15 — the relationship-graph and ownership columns are present but unpopulated for this tenant, so two of nine columns carry zero signal here (contradicts the implied "warm-intro" value). Score is identical "A · 🔥 Burning" on all 15 visible rows — either the default sort floats only A-Burning to top or the grading lacks spread; can't distinguish from this frame (open question). "Actions" exposes no verb list or confirmation before acting on 5,530 records. The floating bar occludes a selected row.

**→ Elevay decision:** BEAT
   - **What:** Build a select-all-across-result-set bulk bar on Elevay's Accounts table: a Selection{mode:'all_results', count:N} distinct from page-selection, a bottom-center floating bar "All N selected · ✕ · Actions▾", and an Actions menu with named verbs — Enroll in sequence, Add to list, Assign owner, Export, Suppress (route every verb through evaluateSend's gate stack for the sequence-enroll path). Add a confirm step when N exceeds a threshold (e.g. >500). Fix Monaco's flaw: bottom-pad the list so the bar never occludes a selected row. Pair with the existing two-axis score (grade+temperature) and surface it in the same Score column.
   - **Build effort:** M — Elevay already has an Accounts table; the net-new work is the cross-page selection model, the floating Actions bar, and wiring bulk verbs through the existing send-gate stack (no new data plane).

---

### accounts-signal-popover.png
**Screen:** Accounts — TAM table with an account score/signal hovercard open. Route (address bar): app.monaco.com/records/accounts. Browser tab title: "Accounts - Monaco".
**Purpose (1 line):** Explain WHY an account scored as it did: an on-hover card that converts a letter+temperature grade into a plain-language verdict, a fit tier, a firmographic justification, and an itemized "Top Signals" evidence list — i.e. an explainable account score.

**OBSERVED — every UI element:**
Counts: 8 bottom-nav items (Home, Inbox, Demand, Opportunities, Accounts[active], Contacts, Reporting, Settings) + 1 floating Monaco-logo launcher to their right; ~9 table columns (Company, Status, Account Owner, Score, Industries, Headcount, Connected To, Connections, Software-Category[truncated "Softw"]); 14 visible account rows; 5 toolbar controls (All Accounts saved-view dropdown, filter funnel, sort up/down, AI/scan sparkle, search) + "+ Add Account" top-right; popover contains 1 headline + 1 fit-tier + 1 firmographic line + a "Top Signals" header + 4 signal rows. Browser: 5 open tabs + a "+" + an "Ask Gemini" pill.

3x3 grid walkthrough:
- Top-left: dark browser tab strip — tab1 "Monaco Onboarding Pla…", tab2 "Accounts - Monaco" (active). Below: page title "Accounts", then toolbar "All Accounts ▾ | filter | sort | scan | search".
- Top-center: browser tabs "Funnel Metrics - Googl…", "Screenshot 2026-04-0…". Below: the white hovercard's top edge overlapping the table header.
- Top-right: tab "Practice Management S…", "+", and the green "Ask Gemini" pill; the "Work" Chrome profile; (the "+ Add Account" dark button sits at table's top-right under the chrome).
- Mid-left: column headers (checkbox · Company · Status) and first rows: AxisCare Home Care [Customer green chip], Sonatus [New], Forerunner [New].
- Mid-center: THE POPOVER — "Stellar account, Take action immediately" / "Perfect Fit" / ↗ "Company has 71 employees" / "Top Signals" / sparkle "Active Paid Search Spend" / sparkle "AI Strategy Mandate". It occludes the Account Owner + Score columns and part of Industries.
- Mid-right: Headcount / Connected To / Connections / Software-Category cells; Connections column = 0 for every row.
- Bottom-left: rows TriNetX, WorkRamp (Details hover affordance), ConsumerAffairs, Spotter, Whitepages, ROLLER, Labelbox, Aha, Suno, Artera (owner "Devon Hennig", grade A).
- Bottom-center: the floating pill bottom-nav (Home…Settings) overlapping the lower table; pink/magenta sliver bleed behind nav (an underlying tab's content showing through window edges).
- Bottom-right: continuation of Headcount/Software-Category cells; right window edge shows a blurred brown/tan photo (another app/desktop behind the browser window).

Full table transcription — 14 rows x 9 cols (Account Owner + Score columns occluded by popover for the top rows; "—" = hidden):
| Company | Status | Acct Owner | Score | Industries | Headcount | Connected To | Connections | Software Cat |
|---|---|---|---|---|---|---|---|---|
| AxisCare Home Care | Customer | — | — | …opment (Software Development) | 164 | (empty) | 0 | Healthc… |
| Sonatus | New | — | — | …opment | 239 | (empty) | 0 | SaaS |
| Forerunner | New | — | — | Information An… | 90 | (empty) | 0 | SaaS |
| Aftershoot | New | — | — | …opment | 126 | (empty) | 0 | SaaS |
| TriNetX | New | — | — | …ture And Analy… | 292 | (empty) | 0 | Healthc… |
| WorkRamp | New | (A| Burning, per sibling shots) | — | Technology Information An… | 71 | (empty) | 0 | LMS |
| ConsumerAffairs | New | — | — | Information An… | 190 | (empty) | 0 | Other |
| Spotter | New | — | — | Information An… | 221 | (empty) | 0 | SaaS |
| Whitepages | New | — | — | Information An… | 90 | (empty) | 0 | SaaS |
| ROLLER | New | — | — | …opment | 356 | (empty) | 0 | SaaS |
| Labelbox | New | — | — | …opment | 315 | (empty) | 0 | SaaS |
| Aha | New | — | — | …opment | 378 | (empty) | 0 | SaaS |
| Suno | New | — | — | Technology Information An… | 191 | (empty) | 0 | SaaS |
| Artera | Prospecting | Devon Hennig | A | Hospitals And Health Car… | 287 | (empty) | 0 | Healthc… |

Top Signals (4 rows, each with a leading icon): the firmographic line "Company has 71 employees" (under "Perfect Fit", separate from the signals header) carries a distinct ↗-trend icon; the four Top Signals — "Active Paid Search Spend", "AI Strategy Mandate", "Hiring for SEO / GEO / AIO / AEO", "SEO Traffic Decline" — all share one uniform sparkle/asterisk (✦) mark.

Second-pass additions (found on re-scan): (1) the "71 employees" in the card matches the WorkRamp row's Headcount=71 → the hovered account is WorkRamp, NOT a top row; (2) the firmographic "71 employees" line uses a distinct line-chart/trend (↗) icon, while the four Top Signals all share one uniform sparkle (✦) mark — no per-signal-class icon typing is observed (the earlier "person glyph / typed per class" read was an over-read); (3) "Perfect Fit" is rendered in muted grey, a sub-label, while the verdict line is bold black; (4) a faint horizontal divider separates the firmographic block from "Top Signals"; (5) Chrome "Work" profile chip + bookmark star + extensions puzzle icon in the address bar; (6) the WorkRamp row shows a "Details" hover button (same row-hover affordance seen in sibling shots), confirming the card is the row's hover state; (7) Artera's row alone has a populated Account Owner (Devon Hennig) + visible grade A while all "New" rows above are owner-less.

**Edge/occlusion check:** Browser tab titles all truncated: "Monaco Onboarding Pla…", "Funnel Metrics - Googl…", "Screenshot 2026-04-0…", "Practice Management S…". Column header "Softw…" (Software Category) cut at right frame. Industries cells all truncated: "…opment" (Software Development), "Information An…" (Technology Information And Analytics), "…ture And Analy…", "Hospitals And Health Car…". Software-Category values clipped: "Healthc…". Signal-row text clipped at card's right edge in raw thumbnail: "Active Paid Search Spe…", "Company has 71 emplo…" (resolved on zoom to full strings). OCCLUDED BY POPOVER: the Account Owner, Score (letter grade + 🔥/Warm temperature), and the left half of Industries for the top ~6 rows are fully hidden behind the white card. Bottom rows partly hidden behind the floating nav pill. Right window edge shows a blurred tan photo = desktop/other window behind the browser, not app content.

**OCR reconciliation:** ~70 tokens accounted for / unplaceable: none material — "AccountC" (OCR ln105) = "Account O[wner]" clipped by the card; "cture And Analy" = Industries "…structure And Analytics"; "Burr"/"Burning" temperature labels belong to sibling shots, here hidden by the card; garbled bottom-nav string "box emund ves Accounts pacts Report Settings" = the 8 nav labels (Inbox/Demand/.../Settings). / Elements OCR missed that I see: the per-signal ICONS (1 trend ↗ on the firmographic line, 4 uniform sparkle ✦ on the Top Signals); the grey-vs-bold weight hierarchy of verdict/fit-tier; the divider rule; the "Ask Gemini" pill; Chrome "Work" profile + bookmark star; the blurred photo on the right edge; that the card's "71 employees" maps specifically to the WorkRamp row. OCR dismissed as noise: "@aeawd gs &B8 & & = ¥" (nav-bar icon row), "aE" (stray).

**INFERRED — implied data model:**
Account { id, name, status: enum[New, Prospecting, Customer], owner: User|null, scoreGrade: enum[A,B,C…] (inferred; hidden here), temperature: enum[Burning🔥, Warm] (inferred; hidden), headcount: int (obs 71–378), industries: string (Software Development | Technology Information & Analytics | Hospitals & Health Care | …), softwareCategory: enum[SaaS, Healthcare, LMS, Other] (obs), connections: int (all 0). } ScoreExplanation (the popover) { verdict: enum-ish string keyed to grade — obs "Stellar account, Take action immediately" (inferred siblings: lower tiers for B/C/Warm); fitTier: enum[Perfect Fit, …] (inferred there are weaker tiers); firmographicReasons: Reason[] { icon: trend, text: "Company has {headcount} employees" }; topSignals: Signal[] }. Signal { label: string, signalClass(inferred from icon): enum[ paid_search(✦), ai_strategy(✦), hiring(person), seo_traffic(✦) ], polarity: intent/positive }. Inference: the score is a rollup of (firmographic fit e.g. headcount band) + (a set of typed buying signals); each signal is a discrete boolean enrichment (matches §8.5 Yes/No ICP columns) surfaced here as the "why". 71 employees qualifying as "Perfect Fit" implies an ICP headcount floor well below 71 / a small-mid-market target band.

**INFERRED — capability/automation:**
Proves an explainable, deterministic-looking account scoring layer: a hidden grade (A + 🔥) on every row PLUS an on-demand rationale card that lists the exact signals driving it. Automated: enrichment/signal detection (paid-search spend, AI-strategy mandate, SEO-role hiring, SEO-traffic decline) and the headcount/firmographic match; the verdict + "Take action immediately" CTA is auto-generated. Human-driven: the human reads the card and decides to action the account (no in-card action button visible → the override/decision is the human eyeballing then acting elsewhere). The loop: enrich account → detect signals → roll into grade+temperature → render verdict + evidence on hover → human prioritizes. Not visible — open question: whether signals are weighted/scored numerically, whether the verdict text is template or LLM-written, and whether you can act (enroll/sequence) directly from the card.

**UX pattern & quality:** Row-hover → anchored popover that turns an opaque grade into a 3-part argument: bold verdict + muted fit-tier, an icon'd firmographic one-liner, then a divided "Top Signals" evidence list with one typed icon per signal. It's a good pattern: progressive disclosure (table stays scannable, rationale on demand), evidence-before-conclusion framing, and per-signal icons that double as a legend. Weaknesses as built: the card OCCLUDES the very Score/Owner columns it explains (you lose the grade while reading the why); there's no quantification (no per-signal weight, no numeric score, no "3 of 7 ICP criteria"); and no action affordance in-card, so the "Take action immediately" CTA is words, not a button. Density is comfortable (~28px rows, generous card padding) but the verdict copy is generic.

**Strength:** Explainability done plainly: Monaco never shows a bare number — it shows a verdict, a fit label, and the literal signals (Active Paid Search Spend, AI Strategy Mandate, Hiring for SEO/GEO/AIO/AEO, SEO Traffic Decline). For a founder this is trust-building: the prioritization is auditable and the same signals are reusable as filter columns (§8.5). Typed icons per signal-class make the evidence skimmable. It cleanly separates firmographic fit (headcount) from behavioral/intent signals.

**Weakness / gap:** It explains but doesn't quantify or act: no signal weights, no numeric contribution, no "X/N criteria met", and no recency/dates on signals (when did SEO traffic decline? how much paid-search spend?) — so two "Perfect Fit / Stellar" accounts are indistinguishable. The card covers the Score column it describes. The verdict text "Stellar account, Take action immediately" is templated marketing-speak with no in-card action. Contradiction with the product's own claims: a 71-employee company is labeled "Perfect Fit / Stellar," yet §8.5 confirms Connections=0 across the whole TAM (relationship graph empty) and §2.3/§8.8 show LinkedIn sequences converted 0 — so "take action immediately" is asserted on signals that the funnel data does not show converting. The score's confidence outruns the evidence of outcomes.

**→ Elevay decision:** BEAT
   - **What:** Build an Account score hovercard (component: AccountScoreCard) that BEATS Monaco's by adding what it lacks. Schema: account.score { grade, temperature, numericScore:0-100, confidence } + account.scoreReasons: Reason[] { class: enum[firmographic|intent|engagement|relationship], label, icon, weight:number, detectedAt:date, sourceUrl, value } + verdict (LLM one-liner) + fitTier. Card layout: bold verdict + fitTier badge, a numeric score with the top-3 weighted contributors shown as "+N pts" each, every signal stamped with detectedAt + a source link (so "SEO Traffic Decline" shows the date and magnitude, "Active Paid Search Spend" shows the channel), and a PRIMARY in-card action button ("Enroll" / "Draft outreach") so "take action immediately" is a click, not a slogan. Do NOT occlude the row's own Score/Owner — anchor the card to the side. Reuse the same signal definitions as the Accounts ICP boolean columns so filter ↔ explanation stay in sync.
   - **Build effort:** S — the card UI + a scoreReasons join table over existing enrichment signals is a few days; the only non-trivial part is assigning per-signal weights + capturing detectedAt/source at enrichment time, which the pipeline should already pass through.

---

### reporting-revenue-pipeline.png
**Screen:** Demand → Demand Hub. URL bar reads app.monaco.com/demand/hub. NOTE: file is named "reporting-revenue-pipeline" but the pixels are the Demand Hub, NOT the Reporting revenue/pipeline screen.
**Purpose (1 line):** Autopilot outreach cockpit: weekly/daily activity counters on top + an editable, day-bucketed queue of auto-enrolled contacts the user can prune before send.

**OBSERVED — every UI element:**
Counts: browser tabs = 4 (+ new-tab button); floating bottom nav items = 8 (Home, Inbox, Demand[active], Opportunities, Accounts, Contacts, Reporting, Settings) + 1 launcher/drag-handle; sub-tabs = 3 (Demand Hub[active], Sequences, Templates); top-line counters = 7 in 2 groups (120/98/49/0 under "Weekly outreach (Apr 13-19)"; 0/4/0 under "Sent today"); table = 6 columns + 1 Remove action; table rows visible = 8; controls = "My Sequences v" dropdown, Settings link, "Review Upcoming v" green button, Thursday collapse caret, 8x per-row Remove.

3x3 grid walkthrough:
- TL: Chrome tabs — active "Demand - Monaco", "Liam on X: 'we guarantee 20...'"; back/forward/reload icons; left edge of address bar.
- TM: Address bar "app.monaco.com/demand/hub"; further tabs "Leads That Show | B2B Outb...", "(anonymous)".
- TR: bookmark star, reading-list/cast icon, green "Work" profile chip, kebab menu, "Ask Gemini" pill.
- ML: H1 "Demand"; active sub-tab "Demand Hub"; card title "Performance"; "Weekly outreach (Apr 13-19)" with 120 "Added to queue", 98 "In queue now".
- MM: counters 49 "New contacts reached", 0 "New responses"; group header "Sent today" with 0 "Emails", 4 "Connection requests".
- MR: "My Sequences v" dropdown (top-right of card); 0 "LinkedIn messages".
- BL: blue "Autopilot is on / 6 sequence types automated" banner (plane icon); section row "Thursday" + green badge "30 processed"; Contact column values Jake Martin → Jemima Mendenhall.
- BM: Title + Account columns (SORACOM, Perion, Hivelocity, Indus Group, Groundswell, CaliRail); floating pill nav bar overlaps the bottom 1-2 rows.
- BR: Settings + "Review Upcoming v" (top of band); Status column (Queued) + Sequence Type column + per-row "Remove" links.

Full table — 8 rows x 6 cols (+Remove). Contact Score is blank for every visible row; Account/Score/Status of last two rows are occluded by the floating nav bar:
| Contact | Title | Account | Contact Score | Status | Sequence Type | Action |
|---|---|---|---|---|---|---|
| Jake Martin | Director, Corporate Marketing + ... | SORACOM | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| Kimberly Leone | SVP, Global Product Marketing ... | Perion | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| Ashleigh Becker | Director of Marketing | Hivelocity | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| Jason Cook | Marketing | Indus Group | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| David Ehrlich | Managing Director - Growth Str... | Groundswell | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| Alex Rapp | Director of Strategic Account M... | CaliRail | (blank) | Queued | SaaS - LinkedIn Primary | Remove |
| Staci McKee | Vice President, Growth Marketi... | (occluded by nav) | (blank) | (occluded) | SaaS - LinkedIn Primary | Remove |
| Jemima Mendenhall | Vice President, Global Marketin... | (occluded by nav) | (blank) | (occluded) | HR - LinkedIn Primary | Remove |

Second-pass additions: (1) browser tab titles reveal an active prospecting/research workflow — "Liam on X: 'we guarantee 20...'" and "Leads That Show | B2B Outb..." are open alongside the app. (2) A 4-square apps/grid icon sits at the top-left of the content area below the address bar. (3) The "30 processed" badge is rendered green (vs apr6-12 sibling which read "29/30 processed" — this one drops the denominator). (4) Each column header carries a tiny leading glyph (person icon on Contact, building on Account, clock/score on Contact Score, status dot, etc.) and Status appears to be the sorted column. (5) The active "Demand" nav item is visually highlighted in the floating bar; a black square launcher/drag-handle sits to its right. (6) "Review Upcoming v" is a caret expander, not a flat button — it expands the day buckets seen in the sibling screen.

**Edge/occlusion check:** Truncated titles (verbatim): "Director, Corporate Marketing + ...", "SVP, Global Product Marketing ...", "Managing Director - Growth Str...", "Director of Strategic Account M...", "Vice President, Growth Marketi...", "Vice President, Global Marketin...". Browser tabs truncated: "Liam on X: 'we guarantee 20...'", "Leads That Show | B2B Outb...". Occlusion: the floating pill nav bar (Home…Settings + launcher) sits over the bottom two data rows — for Staci McKee and Jemima Mendenhall it hides the Account cell, Contact Score, and Status; only their Contact, Title (truncated) and Sequence Type remain readable. No modal/cursor occlusion otherwise.

**OCR reconciliation:** ~70 tokens accounted for. Placed: "/demand/nub"→address bar /demand/hub (OCR n→h misread); the 7 counter numbers 120/98/49/0/0/4/0 + their labels; "Autopilot is on", "6 Sequence types automated", "Thursday 30 processed"; header "Contact/Tite/Account/Contact Score/Status/Sequence Type"; all 8 contact names + accounts (SORACOM, Perion, Hivelocity, Indus Group, Groundswell, CaliRail); "Queuved"→Queued (×6). Dismissed as noise/overlap: "emo.", "F v", "We", "4 v", "R ve" = partially-rendered/cut "Remove" buttons; "@ 3) 7 $ Gh 2 iw = Of a" on the Staci McKee row = the floating nav-bar icons overlapping that row (icon-noise); "mm" = Jemima's account logo glyph; the X/Gemini/tab strings = browser chrome. Elements OCR missed: the green "Work" profile chip, bookmark star, the 4-square apps icon, the green color of the "30 processed" badge, the blank Contact Score column, and that Status is the sorted column.

**INFERRED — implied data model:**
queue_item { contactId: fk, title: string(truncated in UI), accountId: fk→account{name,logo}, contactScore: enum[Warm,Hot,Cold]|null (null/blank for all queued rows here), status: enum[Suggested,Queued,Started,Completed] (only Queued visible on this screen; others from sibling 8.4), sequenceType: string pattern "{vertical} - {channel}", scheduledDay: enum[Mon..Fri], removable: bool=true }. sequenceType decomposes into vertical ∈ {SaaS, HR, CRM, LMS, ERP, Healthcare} × channel ∈ {LinkedIn Primary, Email Only} (this screen shows only SaaS-/HR-LinkedIn Primary; full enum inferred from reporting sibling). performance_window { range:'Apr 13-19', addedToQueue:120, inQueueNow:98, newContactsReached:49, newResponses:0 }. sent_today { emails:0, connectionRequests:4, linkedinMessages:0 }. autopilot_config { enabled:bool, automatedSequenceTypes:int=6 }. day_bucket { day:'Thursday', processed:30 }. Inferred: contactScore is a separate axis from a letter grade (Accounts screens render "A | Burning"); here the grade axis isn't surfaced.

**INFERRED — capability/automation:**
Proves an autonomous outreach engine: "Autopilot is on — 6 sequence types automated" auto-enrolls ICP contacts into vertical×channel sequences and fires ~30/day ("Thursday 30 processed"), 120 queued this week. Automated: candidate selection, sequence assignment, scheduling, and sending across LinkedIn + email (Connection requests / LinkedIn messages / Emails counters). Human-in-the-loop override is explicit and per-row: every Queued item has a "Remove" before it sends, plus "Review Upcoming" and "Settings". The loop is Added to queue → In queue now → New contacts reached → New responses, with a daily processed counter as the heartbeat. Not visible / open question: how a contact enters the queue (score threshold? signal trigger?), and whether Remove also suppresses the contact globally or just this day.

**UX pattern & quality:** Dashboard-over-worklist on one surface: a KPI counter strip (weekly + today), an autopilot status banner, then an editable day-bucketed queue table. Good: monitor and intervene without a context switch; per-row Remove makes an "autonomous" system feel reversible and trustworthy; day buckets make cadence legible. Bad and concrete: (1) the floating pill nav overlaps the last two table rows — a real z-index/layout bug that hides Account+Status; a sticky bar must reserve bottom padding equal to its height. (2) The Contact Score column is empty for all 8 rows — a dead column eating horizontal space. (3) The counters are activity-only with no outcome on the same view (0 responses, 0 meetings, 0 emails today against 120 queued), so the screen can look "healthy/busy" while converting nothing.

**Strength:** Explainable + reversible autonomy: every machine-decided send is individually visible and removable before it fires, the banner states exactly how many sequence types are automated, and the day buckets expose the cadence. That combination (auto-build the queue, but show me the queue and let me veto rows) is the credible answer to "can I trust the autopilot" — it is the pattern worth matching.

**Weakness / gap:** Activity-vanity divorced from outcomes. This screen shows 120 added / 98 in queue / 49 reached / 4 connection requests today but 0 responses and 0 meetings, and nothing here reconciles that against revenue. It is the same disease the intel doc flags at §8.0/§8.7: Home says "closed 40 opportunities" while Reporting shows Pipeline=0 / Revenue Booked empty / transcripts confirm 0 closed. The Demand Hub never shows responses-per-sent or meetings, so the engine reads as productive while converting zero. Plus the data contradiction in the asset itself: this file is named/referenced as the Reporting revenue-pipeline screen (intel §8.7 line 189) but its pixels are the Demand Hub /demand/hub (its values 120/98/49/0 and today 0/4/0 match §8.3 demand-hub-performance-apr13-19) — the intel doc mis-maps this asset.

**→ Elevay decision:** BEAT
   - **What:** Build Elevay's Autopilot Queue = a table autopilot_queue_item { contact, title, account, contactScore enum[Hot|Warm|Cold], status enum[Suggested|Queued|Started|Completed], sequenceType "{vertical}-{channel}", scheduledDay, Remove } with a per-row veto and "Review Upcoming" expander — copy that. BEAT Monaco by binding outcomes into the SAME performance strip Monaco keeps separate: add newResponses, newMeetings, and revenueBooked (or pipeline$) columns to the weekly row so the activity counters reconcile against conversion on one surface; drop the always-blank Contact Score column unless populated; and pad the bottom of the scroll container by the sticky nav height so the last rows are never occluded. This kills the "busy but 0 converting / closed-40-vs-pipeline-0" lie at the source.
   - **Build effort:** M — the counter strip, autopilot banner, and queue table are standard CRUD/list work; the real effort is the day-bucket scheduler and joining live outcome/revenue data into the weekly performance row so activity and conversion sit together.

---

### reporting-sequence-performance.png
**Screen:** Reporting → Sequence Performance (URL bar: app.monaco.com/reporting)
**Purpose (1 line):** Per-sequence funnel report: every {Vertical}-{Channel} sequence (plus two non-vertical "Engage" plays) scored on a 5-stage funnel (queued → reached → completed → responses → meetings) for the selected month, org-wide.

**OBSERVED — every UI element:**
Counts: 8 bottom-dock nav items (Home, Inbox, Demand, Opportunities, Accounts, Contacts, Reporting[active], Settings) + 1 far-right colored app-grid/logo icon; 6 table columns; 14 visible data rows (last row partly occluded by the dock, and headline counters imply ≥1 more row off-screen); 5 top-line counters; 2 scope/range filter dropdowns; 1 sort/filter caret on the Sequence Type header.

3x3 grid walkthrough:
- Top-left: page title "Reporting".
- Top-center: empty whitespace (the revenue/pipeline charts that belong to /reporting are NOT on this scroll position — this view is scrolled to the Sequence Performance block).
- Top-right: two dropdowns — "This Month (Apr 1 - Apr 30)" and "Entire Organization". Above them, browser chrome: tabs "Reporting - Monaco"(active), "Liam on X: \"we guarantee 2…\"", "Leads That Show | B2B Outb…", "(anonymous)", "+", and a green "Work" Chrome-profile chip + "Ask Gemini" pill; address bar app.monaco.com/reporting with a star/bookmark icon.
- Mid-left: "Sequence Performance" subheading; the 5 counters row (850 / 607 / 11 / 3 / 1); the Sequence Type column with row labels.
- Mid-center: the numeric columns Added to Queue / New Contacts Reached / Completed.
- Mid-right: New Responses and New Meetings columns (mostly zeros).
- Bottom-left: lower sequence labels (ERP - LinkedIn Primary, CRM - LinkedIn Primary, ERP - Email Only).
- Bottom-center: the floating bottom nav dock overlapping the final data rows, "Reporting" tab highlighted.
- Bottom-right: trailing 0/0 cells of the last rows; empty beyond.

Header icons (left→right): Sequence Type (funnel ▽), Added to Queue (clock), New Contacts Reached (play/arrow ▷), Completed (check-circle), New Responses (speech bubble), New Meetings (calendar).

Table — 14 rows x 6 cols (screen order, NOT sorted):
| Sequence Type | Added to Queue | New Contacts Reached | Completed | New Responses | New Meetings |
|---|---|---|---|---|---|
| Engage In-Network Connection (Buyer) | 0 | 0 | 0 | 0 | 0 |
| CRM - Email Only | 16 | 15 | 0 | 0 | 0 |
| Engage Buyer | 0 | 0 | 0 | 0 | 0 |
| LMS - LinkedIn Primary | 0 | 0 | 0 | 0 | 0 |
| HR - LinkedIn Primary | 3 | 1 | 0 | 0 | 0 |
| HR - Email Only | 24 | 21 | 1 | 1 | 1 |
| Healthcare - Email Only | 59 | 44 | 1 | 0 | 0 |
| SaaS - Email Only | 549 | 429 | 8 | 2 | 0 |
| SaaS - LinkedIn Primary | 162 | 71 | 0 | 0 | 0 |
| Healthcare - LinkedIn Primary | 6 | 3 | 0 | 0 | 0 |
| LMS - Email only | 8 | 7 | 1 | 0 | 0 |
| ERP - LinkedIn Primary | 4 | 3 | 0 | 0 | 0 |
| CRM - LinkedIn Primary | 3 | 2 | 0 | 0 | 0 |
| ERP - Email Only | [occluded] | [occluded] | [occluded] | 0 | 0 |

Top-line counters verbatim: "850 Added to Queue · 607 New contacts reached · 11 Completed · 3 New responses · 1 New meeting".

Second-pass additions: (1) Browser tab text corrects the OCR/intel "Ulam" → it reads "Liam on X"; (2) a green "Work" profile chip + "Ask Gemini" affordance sit in the Chrome toolbar — user is in a work Chrome profile with Gemini side-panel; (3) "(anonymous)" is an open incognito tab and "Leads That Show | B2B Outbound" is a competitor/research tab — outbound-research workflow; (4) the casing inconsistency is real in the product: "LMS - Email only" and "Healthcare - LinkedIn Primary" lowercase "only"/varied "LinkedIn" vs "Email Only" elsewhere; (5) two rows use a different naming convention entirely — "Engage In-Network Connection (Buyer)" and "Engage Buyer" are play/template names, not "{Vertical} - {Channel}"; (6) the bottom dock is a floating pill that visually covers ERP - Email Only's left three cells; (7) header has a sort/filter caret only on Sequence Type, yet rows are not sorted by any column.

**Edge/occlusion check:** "ERP - Email Only" (bottom row): its Added-to-Queue, New-Contacts-Reached and Completed cells are hidden behind the floating nav dock; only its New Responses (0) and New Meetings (0) are visible. Browser tabs truncated verbatim: "Liam on X: \"we guarantee 2…\"", "Leads That Show | B2B Outb…". The nav dock covers the lower-center of the table; an additional sequence row may sit below ERP - Email Only off the visible scroll (see reconciliation).

**OCR reconciliation:** All OCR tokens accounted for. Mapped: browser tabs (OCR "Ulam"→pixels "Liam on X"; "828 Out"→"B2B Outb…"; "(anonymous)"; "+"), URL "app.monaco.com/reporting", "Reporting", "This Month (Apr 1 - Apr 30)", "Entire Organization", "Sequence Performance", the 5 counters (850/607/11/3/1), the 6 column headers, and all 14 rows incl. OCR noise digits "1°)"=0, "i"=1 (Healthcare-Email & LMS-Email Completed). Dismissed as icon-noise: "‘Y"=funnel icon, "“4"=check-circle on Completed, "=)"=calendar on New Meetings, "£3"/"yr"=site-lock/star in address bar, "@ & WV $ oh & a = ”"=the 8 nav-dock glyphs overlapping ERP-Email row. Elements OCR missed that pixels show: the green "Work" Chrome-profile chip, the "Ask Gemini" pill, the per-column header icons, and the Sequence-Type sort caret.

**INFERRED — implied data model:**
Sequence { id, name: string, vertical: enum[SaaS, HR, Healthcare, CRM, LMS, ERP] | null, channel: enum["Email Only","LinkedIn Primary"] | null, kind: enum["vertical-sequence","engage-play"] } — name pattern is "{vertical} - {channel}" for vertical sequences; the two "Engage…" rows are kind=engage-play with vertical/channel null (warm/in-network buyer plays, a distinct sequence class). SequenceStat (per sequence × date-range × org-scope) { addedToQueue:int, newContactsReached:int, completed:int, newResponses:int, newMeetings:int } — funnel is strictly monotonic (queued ≥ reached ≥ completed ≥ responses ≥ meetings holds in every row). Report params { dateRange: enum/preset["This Month (Apr 1 - Apr 30)", …], scope: enum["Entire Organization", per-owner] }. "Completed" = sequence finished all steps, distinct from "reached" (first touch landed). No conversion-rate or cost field is stored/shown — only raw counts.

**INFERRED — capability/automation:**
Proves Monaco runs many concurrent sequences segmented by vertical×channel and reports a unified 5-stage funnel per sequence, org-wide, date-scoped. Automated: enrollment/queueing and stepping through Email + LinkedIn touches (sibling screens show "Autopilot is on", "6 sequence types automated"). Human-driven: reading THIS table and deciding what to cut — there is NO visible auto-reallocation, no "dead channel" flag, no recommendation. The loop is open: LinkedIn ran ~178 queued across 6 verticals for 0 responses/0 meetings yet every LinkedIn sequence is still listed as active; nothing on-screen rebalances it. The human override point (pause/kill a sequence) is not on this read-only screen — open question where the kill switch lives (likely Demand/Sequences tab).

**UX pattern & quality:** Dense flat data-grid, one sequence per row, zero visualization. Good: canonical funnel column order mirrors the real pipeline (queue→reach→complete→respond→meet); date + org scoping is clear; counters give an at-a-glance monthly total. Bad and concrete: (1) rows are in an apparently arbitrary/internal order — the 549-queued SaaS sequence and the single converting HR-Email sequence are scattered mid-table, so the eye cannot find signal; the lone sort caret (Sequence Type) is unused. (2) No conversion-rate / cost / reply-% column — the reader must mentally divide 2/429 etc. (3) No totals row, and the floating nav dock physically occludes the last sequence's numbers — a layout bug on a reporting screen. (4) Every metric is an absolute count with no significance cue, so "1 meeting" reads identically whether it's signal or noise.

**Strength:** It is the single most analytically dense screen in the product: a true channel×vertical funnel matrix where you can read, in one grid, that Email = the only channel producing completions (8/1/1/1 across SaaS/Healthcare/HR/LMS = all 11 completions) and LinkedIn = 0 completions on every vertical. The strict queued≥reached≥completed≥responses≥meetings monotonicity per row shows the funnel events are consistently instrumented end-to-end — that instrumentation is the asset worth copying.

**Weakness / gap:** Headline counters do NOT reconcile with the visible rows: visible queued sums to 834 and reached to 596, but the counters say 850 / 607 — a gap of exactly 16 queued / 11 reached. Completed(11)/Responses(3)/Meetings(1) reconcile exactly. Correcting the intel doc: ERP - Email Only is almost certainly NOT 0/0 — its occluded queued/reached cells carry that 16/11 (with 0/0/0 downstream), which is the cleanest way the table closes to 850/607; the intel's "ERP - Email Only = 0|0|0|0|0" is unverified and likely wrong. Either way the screen ships no totals row to expose the gap. Cross-screen contradiction stands: Home greets "closed 40 opportunities" while this report shows 1 meeting, 0 pipeline. And the analytical headline ("LinkedIn = 0 conversion on ~178 queued; SaaS-Email = 65% of all volume converting 0 meetings off 2 replies; the only win is HR-Email, a 24-queued long-tail = statistical noise") is something the UI never surfaces — no flag, no sort, no rate.

**→ Elevay decision:** BEAT
   - **What:** Build a `sequence_performance` report view backed by SequenceStat { sequenceId, vertical enum, channel enum['email','linkedin'], queued, reached, completed, responses, meetings } with DERIVED columns reachRate=reached/queued, replyRate=responses/reached, meetingRate=meetings/reached. Improvements over Monaco: (1) default sort by queued desc with a pinned TOTALS row that reconciles to the headline counters (Monaco's 850 vs visible-834 gap is exactly the bug a totals row prevents); (2) an inline "dead channel" badge when queued≥50 && meetings=0 (fires on Monaco's SaaS-Email 549/0 and the whole LinkedIn column) plus a "low-significance" muted style when meetings≤1 so a single long-tail win doesn't read as a trend; (3) never occlude data rows with a floating dock; (4) wire the badge to an autopilot action ("pause LinkedIn Primary across verticals") so the override lives next to the insight, closing the loop Monaco leaves open.
   - **Build effort:** M — schema + funnel aggregation already exists in our send pipeline; the work is the derived-rate/totals/badge view layer and the one-click "pause sequence" wiring, not new data collection.

---

## STEP 2 — Cross-screen synthesis

### 1. Reconstructed data model
Notation: `[O]` = literally visible in pixels; `[I]` = inferred. Enum values anchored to the screen they came from. All values verified against the source PNGs at zoom.

### Owner / User
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| id | uuid | — | [I] | — |
| name | string | "Devon Hennig" | [O] | home-priorities, accounts-signal-popover, demand-hub(reporting screen) Revenue Booked rows |
| role | enum | owner/AE | [I] | — |

Relationships: `Account.ownerId -> User` (only Artera = Devon Hennig populated [O accounts-signal-popover]); `Contact.connectedTo -> User` ("Connected to Devon Hennig" [O inbox-john-wade-thread]).

### Account
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| id | uuid | — | [I] | — |
| name | string | Cursor, Zocks, BigPanda, AxisCare Home Care, Forerunner, Sonatus; Aftershoot, TriNetX, WorkRamp, RTI, Anrok… | [O] | accounts-score-status, accounts-firmographic-columns, accounts-tam-5530-selected |
| logoDomain / faviconUrl | string | per-domain favicons | [O] field, [I] name | accounts-firmographic-columns |
| status | enum | `New`, `Customer` (green, on AxisCare); `Prospecting` (on Artera) | [O] | accounts-score-status, accounts-signal-popover |
| ownerId | User? | null on all except Artera=Devon Hennig | [O] | accounts-signal-popover |
| scoreGrade | enum | only `A` observed on every row (B/C/D inferred to exist) | [O]/[I] | accounts-score-status, accounts-tam-5530-selected |
| intentHeat | enum | only `🔥 Burning` observed on every account row | [O] | accounts-score-status, accounts-tam-5530-selected, accounts-signal-popover |
| industryServed | string/taxonomy | Software Development, Administrative Services [IT…], Technology Information & Analytics, Financial Services [IT…], Hospitals And Health Care, Photography, Media & Entertainment, Leisure & Attractions, Music, Marketing, Legal, Aerospace & Defense, General / Horizontal, Software / SaaS | [O] | accounts-score-status, accounts-firmographic-columns, accounts-icp-boolean-columns |
| softwareCategory | enum | `SaaS`, `Healthcare`, `LMS`, `Other` | [O] | accounts-firmographic-columns |
| headcount | int | 51–445 (Cursor 262 … RTI 445, Anrok 96) | [O] | accounts-firmographic-columns |
| latestFundingRound | enum? | Pre-Seed, Seed, Series C, Series D, Series D+, Series E, **null (5 cells blank)** | [O] | accounts-firmographic-columns |
| connectedTo | ref? | **blank on every account row** in all 4 account grids; **populated only in the Inbox rail** ("Connected to Devon Hennig") | [O] | accounts-* (all four) vs inbox-john-wade-thread |
| connections | int | `0` on every account row | [O] | accounts-* (all four) |

Two load-bearing inferences, both pixel-grounded:
- `industryServed` and `softwareCategory` are **two distinct taxonomies** (WorkRamp software=LMS / industry=General/Horizontal; Suno software=SaaS / industry=Music; TriNetX software=Healthcare / industry=Healthcare) [O pairs, accounts-firmographic-columns].
- `scoreGrade` and `intentHeat` are **two independent axes** rendered `A | 🔥 Burning` with a divider [O accounts-score-status]. Note `Warm` for an ACCOUNT's intentHeat is **not observed** in any account grid (all 14–15 rows = Burning); `Warm` appears only as a CONTACT temperature in the queue (`contactScore`, see Contact) — the intel doc's "also Warm elsewhere" conflates the two fields.

### account_signal (one boolean per ICP criterion)
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| ai_strategy | bool | Yes on 13/14; **No on Suno only** | [O] | accounts-icp-boolean-columns, accounts-firmographic-columns |
| uses_competitor ("Competitor") | bool | **No on all 14 rows incl RTI** | [O] | accounts-icp-boolean-columns |
| active_paid_search | bool | Yes/No mix (e.g. TriNetX No, Spotter No, ROLLER No) | [O] | accounts-icp-boolean-columns; popover label "Active Paid Search Spend" |
| has_recent (funding/news?) | bool | Yes/No mix; **label semantics ambiguous** | [O] value / [I] meaning | accounts-icp-boolean-columns |
| hiring_icp_roles | bool | Yes/No mix (Labelbox No, Artera No) | [O] | accounts-icp-boolean-columns; popover "Hiring for SEO / GEO / AIO / AEO" |
| seo_traffic_decline | bool | Yes on all visible rows | [O] | accounts-icp-boolean-columns; popover "SEO Traffic Decline" |
| is_b2b | bool | Yes on 13/14; **No on Suno only** | [O] | accounts-icp-boolean-columns |
| {signal}_source / _asOf / _confidence | url / ts / float | **not rendered anywhere** | [I] | gap (see contradictions) |

All visible rows (14 named + the 15th dimmed "Anrok") are **fully enriched** — no loading/empty cell state is observed on any account screen. Per-column sparkle = "re-enrich this signal" [O]. `+` header = user-definable custom column [O]. These booleans roll up into `scoreGrade`/`intentHeat` and resurface as the popover Top Signals [I, accounts-signal-popover].

### ScoreExplanation (hover popover)
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| verdict | string | "Stellar account, Take action immediately" | [O] | accounts-signal-popover |
| fitTier | enum | `Perfect Fit` (weaker tiers inferred) | [O]/[I] | accounts-signal-popover |
| firmographicReasons[] | {icon:trend, text} | "Company has 71 employees" (maps to the WorkRamp row, headcount 71) | [O] | accounts-signal-popover |
| topSignals[] | label[] | Active Paid Search Spend, AI Strategy Mandate, Hiring for SEO/GEO/AIO/AEO, SEO Traffic Decline — **four uniform sparkle icons** | [O] | accounts-signal-popover |
| numericScore / per-signal weight / detectedAt / source | — | **absent** | [I] | gap |

### Contact
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| name | string | John Wade, Andrew Haire, Jake Martin… | [O] | inbox-john-wade-thread, demand-queue-expanded, reporting-revenue-pipeline(demand-hub) |
| title | string | "Snr Sales Enginner EMEA Lead" (sic, typo in pixels), "Head of Marketing", "Director of Marketing" | [O] | inbox-john-wade-thread, demand-queue-expanded |
| accountId | Account ref | Beeline, Xano, SORACOM, Follow Up Boss… | [O] | inbox, demand-queue |
| linkedinUrl | string | linkedin.com/in/johnwade47 | [O] | inbox-john-wade-thread |
| websiteUrl | string | beeline.com | [O] | inbox-john-wade-thread |
| connectedTo | User? | "Connected to Devon Hennig" | [O] | inbox-john-wade-thread |
| contactScore | enum? | `Warm` (amber dot) — observed **only on the Suggested queue row**; blank on all Started/Queued rows | [O] | demand-queue-expanded |

### Sequence
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| name | string | "SaaS - LinkedIn Primary", "CRM - LinkedIn Primary", "HR - Email Only", "Engage In-Network Connection (Buyer)", "Engage Buyer" | [O] | reporting-sequence-performance, demand-queue-expanded |
| vertical | enum? | SaaS, HR, Healthcare, CRM, LMS, ERP (null for the two Engage plays) | [O] | reporting-sequence-performance |
| channel | enum? | "Email Only", "LinkedIn Primary" (null for Engage plays) | [O] | reporting-sequence-performance |
| kind | enum | `vertical-sequence`, `engage-play` | [I] | reporting-sequence-performance |
| automated | bool | banner "6 sequence types automated" — a count, not a list; 14 distinct sequences exist in Reporting | [O] count, [I] subset relationship | demand-hub-performance-apr6-12, reporting-sequence-performance |

### SequenceStat (per sequence × dateRange × scope) — all int [O reporting-sequence-performance]
`addedToQueue, newContactsReached, completed, newResponses, newMeetings`. Funnel is strictly monotonic (queued ≥ reached ≥ completed ≥ responses ≥ meetings) in **every** verified row [O]. No rate/cost field stored [O]. Verified row values: SaaS-Email 549/429/8/2/0; SaaS-LinkedIn 162/71/0/0/0; Healthcare-Email 59/44/1/0/0; HR-Email 24/21/1/1/1; CRM-Email 16/15/0/0/0; LMS-Email 8/7/1/0/0; Healthcare-LinkedIn 6/3/0/0/0; ERP-LinkedIn 4/3/0/0/0; HR-LinkedIn 3/1/0/0/0; CRM-LinkedIn 3/2/0/0/0; LMS-LinkedIn 0×5; Engage In-Network 0×5; Engage Buyer 0×5; **ERP-Email Only = occluded on-screen, reconstructs to 16/11/0/0/0** (see contradictions). Params: `dateRange` enum ("This Month (Apr 1 - Apr 30)") + `scope` enum (`Entire Organization`, per-owner) [O].

### QueueItem (autopilot queue)
| Field | Type | Values | O/I | Anchor |
|---|---|---|---|---|
| day | weekday enum | Thu, Fri, Mon, Tue (**skips weekend**) | [O] | demand-hub-performance-apr6-12, demand-queue-expanded |
| contactId | ref? | null on the account-only Suggested row | [O] | demand-queue-expanded |
| contactName, title, accountId(+favicon) | — | Andrew Haire/Xano … Jake Martin/SORACOM | [O] | demand-queue-expanded, reporting-revenue-pipeline(demand-hub) |
| contactScore | enum? | `Warm` only on Suggested; blank otherwise | [O] | demand-queue-expanded |
| status | enum | `Suggested` (blue, red ⓘ), `Started` (green), `Queued` (amber) | [O] | demand-queue-expanded |
| sequenceType | string | "{vertical} - {channel}" (e.g. Follow Up Boss = "CRM - LinkedIn Primary"; rest "SaaS - LinkedIn Primary"; one "HR - LinkedIn Primary") | [O] | demand-queue-expanded, reporting-revenue-pipeline |
| removable | bool | per-row "Remove" | [O] | demand-queue-expanded |

### DayBucket
`{label: weekday, processedCount: int, capacity: int, state: enum[processed=green, scheduled=blue]}`. Observed: Apr 6-12 capture = Thursday **29/30 processed** (green), Fri/Mon/Tue **30 sequences** (blue); Apr 13-19 capture = Thursday **30 processed** (denominator dropped) [O demand-hub-performance-apr6-12, reporting-revenue-pipeline].

### PerformanceWindow / AutopilotConfig
PerformanceWindow `{scope: enum[My Sequences, …], range, addedToQueue, inQueueNow, newContactsReached, newResponses, sentToday:{emails, connectionRequests, linkedinMessages}}`. Verified: Apr 6-12 = 29 / 21 / 8 / 0, today 8 / 7 / 0; Apr 13-19 = 120 / 98 / 49 / 0, today 0 / 4 / 0 [O demand-hub-performance-apr6-12, reporting-revenue-pipeline]. AutopilotConfig `{enabled: true, automatedSequenceTypeCount: 6}` [O]; `dailyCap` ≈ 30 [I from bucket counts].

### Thread + Message (inbox)
Thread `{contactId, channel: enum[email, linkedin] ([I]; this thread is linkedin per "Sent from your LinkedIn account"), folder: enum[Inbox,…], scope: enum[Prospecting,…], lastSyncedAt ("1m ago"), previewSnippet?}` [O inbox-john-wade-thread]. Message `{threadId, direction: enum[inbound, outbound], body: text|null (one inbound bubble renders EMPTY — body null/unrendered [O]), sentVia: "LinkedIn account", relativeTime "1h"}` [O].

### PriorityCard (home feed)
`{contactName, accountName, status: enum[New] (only value seen), receivedAt (relative), aiSummary, extractedMeetingTime?, actionType: enum[Respond], dismissedAt?}` [O home-priorities]. extractedMeetingTime present on 4 of 5 fully-rendered cards (Olivia/Yasmine/Amanda/Yasmine), **absent on Meghan** -> nullable [O]. Age-color derived: gray <3d / amber ≥3d (card 5 "Received 3 days ago" amber) [O].

### Meeting
No entity fields exposed — only the empty `Today's meetings` panel ("No meetings scheduled for today") [O home-priorities] and the `newMeetings` counter (=1/month) [O reporting-sequence-performance].

### Opportunity / Deal (never directly rendered)
Aggregates only: `RevenueBookedByOwner {owner, bookedAmount}` (6 rows: Unassigned + 5×Devon Hennig, all bars 0, axis $0–$500K); `PipelineValue` = 0 [O demand-hub-performance-apr13-19 = the /reporting screen]. Greeting digest `{sequencesLaunchedThisWeek:6, opportunitiesClosed:40}` [O home-priorities] — contradicts the above. Deal object schema **not visible — open question**.

### Selection (bulk)
`{mode: enum[all_results, page], count: 5530}` [O accounts-tam-5530-selected; "All 5530 selected" with the count drag-selected].

### 2. Feature map
Maturity reflects only what these 12 pixels prove for this (demo/early-run) tenant.

| Capability | Surface (screen file) | Automated / Human | Maturity (observed) |
|---|---|---|---|
| Inbound reply triage -> priorities feed | home-priorities.png | Automated (summarize+rank) / Human (respond, × dismiss) | Functional |
| Meeting-time extraction from free-text replies | home-priorities.png | Automated | Functional but **inert** (4/5 cards carry a time, none written to the empty meetings panel) |
| Weekly digest greeting ("closed 40 opportunities") | home-priorities.png | Automated | **Broken** (vanity; contradicts /reporting Pipeline=0, 1 meeting) |
| Today's meetings panel | home-priorities.png | — | **Empty** |
| Unified cross-channel inbox (email + LinkedIn) | inbox-john-wade-thread.png | Automated sync / Human send | Functional (channel inferred from "Sent from your LinkedIn account") |
| Reply drafting (rendered as a ready bubble) | inbox-john-wade-thread.png | Draft authorship **unproven** (no badge) / Human send | Functional; provenance unknown |
| Per-thread contact enrichment rail | inbox-john-wade-thread.png | Automated | Functional (ships raw typo "Enginner") |
| Last-synced freshness + manual refresh | inbox-john-wade-thread.png | Automated / Human | Polished |
| Null/empty inbound body rendering | inbox-john-wade-thread.png | — | **Broken** (blank bubble, no fallback) |
| Autopilot sender, daily cap ~30 | demand-hub-performance-apr6-12.png | Automated | Functional ("29/30 processed" heartbeat) |
| Per-channel "Sent today" ledger (emails / conn-req / LI-msg) | demand-hub-performance-apr6-12.png | Automated | Functional (all three labels visible: 8 / 7 / 0) |
| Weekly outreach KPI strip | demand-hub-performance-apr6-12.png, reporting-revenue-pipeline.png | Automated | Functional (counts only, no rates/deltas) |
| Review Upcoming day buckets (green/blue chips, business-days only) | demand-hub-performance-apr6-12.png, demand-queue-expanded.png | Automated + Human review | Functional |
| Per-contact queue with per-row Remove veto | demand-queue-expanded.png, reporting-revenue-pipeline.png | Automated + Human override | Functional |
| Suggested-row approval gate (blue chip + red ⓘ, account-only) | demand-queue-expanded.png | Human-in-the-loop | Functional |
| Sequence-type assignment by vertical×channel | demand-queue-expanded.png | Automated | Functional (Follow Up Boss=CRM, rest SaaS) |
| Auto-TAM (5,530 accounts) | accounts-tam-5530-selected.png | Automated | Polished |
| Two-axis scoring (grade + heat) | accounts-score-status.png | Automated | Functional but **uncalibrated** (all 14–15 rows = A | Burning) |
| ICP boolean enrichment columns (Yes/No) | accounts-icp-boolean-columns.png | Automated | Functional, **fully populated** (all 14 rows incl RTI enriched); no provenance; Competitor uniformly No |
| Firmographic enrichment (headcount/funding/category) | accounts-firmographic-columns.png | Automated | Functional; **5/14 funding cells blank**, no enriching-vs-unknown state |
| Dual taxonomy (software_category vs industry_served) | accounts-firmographic-columns.png | Automated | Polished |
| Score explainability popover (Top Signals) | accounts-signal-popover.png | Automated | Polished; no weights/dates/source, no in-card action |
| Relationship graph (Connected To / Connections) | accounts-*.png (4 grids) vs inbox-john-wade-thread.png | Automated [I] | **Empty in the account grids** (all 0/blank), **populated in the inbox rail** |
| Account Owner assignment | accounts-*.png | Human | **Empty** (all unassigned except Artera) |
| Saved views + filter/sort/AI-scan/search | accounts-*.png | Human | Functional |
| Select-all-across-results + ⚡ Actions | accounts-tam-5530-selected.png | Human trigger / Automated fan-out [I] | Functional (verb list + guard not shown) |
| Revenue Booked by owner chart | demand-hub-performance-apr13-19.png (the /reporting screen) | Automated rollup | **Empty** (6 owner rows, all bars 0) |
| Pipeline Value | demand-hub-performance-apr13-19.png | Automated | **Empty** (0 / "No data available"; header rendered twice) |
| Sequence Performance funnel | reporting-sequence-performance.png | Automated rollup | Data polished + monotonic; no rates/totals row; **headline 850/607 ≠ visible 834/596** |
| Period/scope report filters | reporting-sequence-performance.png, demand-hub-performance-apr13-19.png | Human | Functional |
| Call intelligence (recordings/summaries) | **not captured** (intel §4.3/§8.9) | Unknown | Unknown — no pixel |
| Opportunities / pipeline kanban | **not captured** (§8.9) | Unknown | Unknown — no pixel |
| Sequence/Templates copy editor | **not captured** (§8.9; intel §2.2 = FDAE-edited) | Human (FDAE) per intel | Unknown — no pixel |

### 3. The autonomy audit
Honest read: the pixels prove the **machine builds, scores, enriches the list and fires sends under a daily cap** — but **every consequential decision (approve, reply, book, prune, kill) is human**, and the intel doc confirms the **copy quality itself is FDAE human labor** (Hannah/Shira rewrite subverticals ~every 2 weeks, §2.2/§5 #6) that **no screen shows**. "Autopilot is on" governs *send mechanics*, not *judgment*. Do not read it as full autonomy.

| GTM-loop step | Truly automated (pixel-proven) | Human-in-the-loop / override (pixel-proven) | Unknown / not in these 12 | Evidence |
|---|---|---|---|---|
| **TAM build** | 5,530 accounts auto-sourced into one grid | `+ Add Account`, saved views, filter, select-all; intel §2.1: Monaco ops "loads the TAM" at onboarding (human setup) | source mix / dedup logic | accounts-tam-5530-selected.png |
| **Firmographic + ICP enrichment** | Yes/No booleans + firmographics auto-filled across the **whole visible TAM** (all 14 rows incl RTI fully enriched); per-column sparkle re-enrich; Suno's `ai_strategy=No` + `is_b2b=No` proves a real classifier, not an all-Yes default | define which boolean columns exist (`+` add column) | whether a human can override a cell; whether enrichment is batch or incremental (no loading state observed) | accounts-icp-boolean-columns.png, accounts-firmographic-columns.png |
| **Account scoring** | grade + heat computed; verdict + Top Signals auto-generated | none on the read-only grid — **but the score is uncalibrated** (every visible row A | Burning) so it does not actually rank | numeric weights; verdict template-vs-LLM | accounts-score-status.png, accounts-signal-popover.png |
| **Sequence assignment** | sequenceType derived from account vertical ("SaaS - LinkedIn Primary"); auto-enroll | `Suggested` rows gated behind a red-ⓘ approval; per-row `Remove`; **intel §2.2/§5 #6: subvertical/copy fixes done MANUALLY by FDAEs** | score threshold that triggers enrollment | demand-queue-expanded.png + intel |
| **Send** | ~30 steps/business-day processed across email + 2 LinkedIn actions ("29/30 processed"); weekend-skipping schedule | `Review Upcoming` preview + per-row `Remove` **before** send; Settings | whether Remove suppresses globally or only that day | demand-hub-performance-apr6-12.png, reporting-revenue-pipeline.png |
| **Reply triage** | inbound reply ingested, summarized to one line, meeting-time extracted, ranked into the feed | the reply itself ("Respond to…") + `×` dismiss are 100% human — **no auto-reply** | ranking key (recency vs intent score) | home-priorities.png |
| **Reply drafting** | a draft is rendered as a finished bubble | explicit send button; no in-place composer visible | **whether the draft is AI-generated or hand-typed — no provenance badge** | inbox-john-wade-thread.png |
| **Meeting booking** | **not automated** — the time is parsed then dropped | human must re-key: 4/5 cards carry a slot yet "No meetings scheduled for today" | whether auto-book exists elsewhere | home-priorities.png |
| **CRM / call capture** | **not visible in these 12 screens** | — | intel §4.3/§8.9 claims auto call-recording + summaries are the moat — **zero pixels to confirm any autonomy** | none (§8.9 gap) |
| **Reporting** | funnel auto-rolled up per sequence (queue->reach->complete->respond->meet), org/period scoped | period + scope filters only | — | reporting-sequence-performance.png |
| **Act on the insight** | **not automated — the loop is OPEN**: LinkedIn 0/178 and SaaS-Email 549->0 meetings stay active; no flag, rate, or auto-pause | no kill switch on the reporting screen | where pause/kill lives (likely Sequences tab, not captured) | reporting-sequence-performance.png |

Bottom line: of 11 loop steps, **3 are genuinely autonomous end-to-end** (TAM build, enrichment, send mechanics under cap), **5 are explicitly human-gated** (approve/reply/book/prune + FDAE copy), and **3 are unproven** (draft authorship, call capture, act-on-insight). The autonomy story is "machine prepares, human commits."

### 4. Moat vs gaps
### 3 real moat features (hard for Elevay to replicate quickly)
1. **Auto-built, auto-enriched, auto-scored TAM as one queryable grid.** 5,530 accounts (accounts-tam-5530-selected.png), each carrying a per-criterion ICP boolean matrix fully populated across the visible TAM — ai_strategy, uses_competitor, active_paid_search, has_recent, hiring_icp_roles, seo_traffic_decline, is_b2b (accounts-icp-boolean-columns.png) — a dual firmographic taxonomy (accounts-firmographic-columns.png) and a two-axis score (accounts-score-status.png). Why hard: it is not a table, it is a fleet of per-signal enrichment agents (paid-search, hiring, SEO-traffic, funding) run at TAM scale with a Clay-style `+ add column` extensible schema. Intel §4.1/§4.2: the user's strongest praise and the thing a tool-builder "wouldn't touch rebuilding."
2. **Explainable scoring tied to the same booleans that filter the TAM.** The hover popover converts a grade into verdict + fit tier + four Top Signals (accounts-signal-popover.png), and those exact signals are the filterable Yes/No columns (accounts-icp-boolean-columns.png) — filter ↔ explanation share one ontology. Why hard: the signal ontology + enrichment pipeline + rollup-into-grade spans four screens, not a component.
3. **Governable autonomy surface (the trust layer over a live sender).** A previewable, day-bucketed queue with a `processed/30` heartbeat (demand-hub-performance-apr6-12.png), per-row `Remove` veto, and a `Suggested` + red-ⓘ approval gate before anything fires (demand-queue-expanded.png), plus a per-channel send ledger. Why hard: it makes "the AI is sending ~30 touches today" auditable and reversible across email + LinkedIn. Caveat (intel §2.2): the *copy* behind it is human-carried by FDAEs — **the moat is the cockpit, not the autonomy.**

> Note: intel §4.3 calls **call-intelligence** the sleeper moat, but there is **no screenshot** in these 12. It cannot be ranked as observed (see open questions).

### 3 most exploitable gaps for Elevay
1. **Every loop is left open / inert** (effort **S–M**). Extracted meeting times are never booked — 4/5 cards carry a slot yet "Today's meetings" is empty (home-priorities.png); a dead channel keeps firing — LinkedIn 0 responses/0 meetings on 178 queued (162+6+4+3+3+0), SaaS-Email 549->0 meetings, with no flag, rate, or auto-pause (reporting-sequence-performance.png). Elevay wins by closing both loops: extracted time -> one-tap calendar draft; `queued≥50 && meetings=0` -> auto-pause wired to the sequence (intel §5 #8). Cheapest, highest-leverage attack because it targets Monaco's own visible failures.
2. **Enrichment without provenance + a score that does not discriminate** (effort **M**). Booleans are bare Yes/No with no source/date/confidence (accounts-icp-boolean-columns.png); `Competitor=No` on all 14 rows is ambiguous — plausibly a working exclusion filter (a target list excludes competitors) OR a non-functioning column, and the UI gives no way to tell. Every visible account is `A | Burning` so the score cannot rank (accounts-score-status.png), and those Burning accounts produced 0 meetings this month (reporting-sequence-performance.png). Elevay already requires citations — add `{source, asOf, confidence, weight}` per signal and force a grade distribution. Beats the single feature the user praised most (intel §4.1).
3. **Vanity metrics + activity-without-outcome dashboards** (effort **S**). Home greets "closed 40 opportunities" while /reporting shows Pipeline=0 / Revenue empty / 1 meeting (home-priorities.png vs demand-hub-performance-apr13-19.png); the Demand Hub celebrates 120 queued / 49 reached against 0 responses with no reply-rate (reporting-revenue-pipeline.png). Elevay: one source of truth for every counter + outcome columns next to activity. The largest STRATEGIC gap is invisible in all 12 screens — **own email infra / deliverability** (intel §5 #1/#2, both High severity) — the friction Monaco assumes the founder already solved; it is the wedge for Elevay's non-technical audience even though no pixel shows it.

### 5. Contradictions & vanity metrics
Each item is quantified and anchored. Items are tiered: **HARD** = a true internal inconsistency in the product/intel; **SOFT** = surfaces that don't reconcile but are explained by differing scope/window/metric (flag, don't over-claim).

**HARD — Home "closed 40 opportunities" vs system of record = 0.** home-priorities.png greeting: "launched 6 sequences and closed 40 opportunities." /reporting (mislabeled demand-hub-performance-apr13-19.png): **Pipeline Value = 0**, Revenue Booked all bars empty; reporting-sequence-performance.png: **1 New meeting / 3 responses for the whole month**. 40 claimed vs 0 booked. Templated vanity metric overriding the system of record.

**HARD — Reporting headline 850/607 ≠ visible row sums 834/596.** reporting-sequence-performance.png: the 13 readable rows sum to **834** Added-to-Queue and **596** Reached, but the counters read **850 / 607** — a gap of exactly **16 / 11**, equal to the single occluded row, **ERP - Email Only**. Completed (11), Responses (3), Meetings (1) reconcile exactly against the visible rows, so ERP-Email Only = **16/11/0/0/0**. **Intel §8.8 records ERP - Email Only as 0/0/0/0/0, which is wrong** — and the intel table itself sums to 834, leaving its own 850 headline 16 short. No totals row exists to expose the gap.

**HARD — Two assets are swapped (filenames vs pixels).** demand-hub-performance-apr13-19.png actually renders **/reporting** (URL bar app.monaco.com/reporting; Revenue Booked + two Pipeline Value panels + the Sequence Performance funnel 850/607/11/3/1). reporting-revenue-pipeline.png actually renders **/demand/hub** (Demand title, 120/98/49/0, today 0/4/0, Autopilot banner, day-bucketed contact queue). The pixels are transposed against both filenames; intel §8.3/§8.7 inherits the mis-mapping (right numbers, wrong file).

**HARD — Score has no spread, and "Burning" is not predictive.** All 14 rows (accounts-score-status.png) and all 15 (accounts-tam-5530-selected.png) = `A | 🔥 Burning`, so the score cannot prioritize within the view; yet those Burning accounts produced **0 meetings** (reporting-sequence-performance.png). The popover's "Stellar account, Take action immediately" (accounts-signal-popover.png) is asserted on signals the funnel does not show converting.

**HARD — Extracted meeting times are dropped.** home-priorities.png: 4 of 5 fully-rendered cards carry a concrete slot ("next Tuesday at 3pm", "Friday at 5:30pm", "Wednesday 6:30pm", "Thursday at 9:30am") yet Today's meetings = "No meetings scheduled for today." Parsed intent never reaches the calendar.

**HARD — LinkedIn (a headline channel) converts 0.** reporting-sequence-performance.png: LinkedIn Primary across 6 verticals = **178 queued** (162+6+4+3+3+0) -> **0 responses, 0 meetings**. SaaS-Email Only = 549/850 = **64.6%** of all volume -> 0 meetings on 2 responses (0.36% of reached). The **only meeting** came from HR-Email Only (24 queued, 1 meeting) — a long-tail, not the mass send.

**HARD — Enrichment data-quality vs intel doc.** inbox-john-wade-thread.png renders the title "**Snr Sales Enginner**" (typo); intel §8.2 normalized it to "Engineer." Doc ≠ pixel — Monaco surfaces raw, unverified enrichment.

**HARD — Relationship graph: empty in Accounts, populated in Inbox.** Connected To blank + Connections = 0 on **every** account row across all four account grids, yet inbox-john-wade-thread.png shows "**Connected to Devon Hennig**." The relationship feature works per-contact but the account-grid columns are dead for this tenant.

**HARD — Duplicate "Pipeline Value" header.** The /reporting screen (demand-hub-performance-apr13-19.png) renders **two** elements titled "Pipeline Value": a top counter ("0") and a separate empty-state panel ("No data available").

**SOFT — "6 sequence types automated" vs 14 sequences exist.** The autopilot banner says **6 automated** (demand-hub-performance-apr6-12.png, demand-queue-expanded.png); reporting-sequence-performance.png lists **14 distinct sequences** (12 vertical×channel + 2 Engage plays). This is consistent with 6 being on autopilot while 14 are *defined* (some paused/manual). Flag as "banner reports a subset" — not proven to be an error; whether the other 8 are paused is an open question.

**SOFT — Weekly "My Sequences" reach ≠ monthly "Entire Organization" reach.** Demand Hub (scope = My Sequences): Apr 6-12 reached 8, Apr 13-19 reached 49 (demand-hub-performance-apr6-12.png + reporting-revenue-pipeline.png). Reporting (scope = Entire Organization, full month): reached 607 (reporting-sequence-performance.png). 8+49=57 ≠ 607, but the two differ on **both scope (personal vs org) and window (2 weeks vs the month)**, so this is expected — the defect is only that no screen offers a shared total to reconcile them, not that the numbers conflict.

**NOT a contradiction (draft erred — remove).** The draft claimed "planned daily cap (30/day -> ~150/week) ≠ realized Added-to-queue (29) -> diverge 5x." `Added to queue` is weekly INFLOW of new contacts; the 30/day buckets are sequence STEPS processed against a standing backlog (`In queue now` = 21–98). Processing more than the weekly inflow simply draws down the backlog — the two measure different quantities, so there is no contradiction.

**TAM size reconciles — but the doc is of two minds.** accounts-tam-5530-selected.png "All 5530 selected" matches intel's "5,530" exactly. Intel §3/§4.1 frames the TAM as the user's strongest praise while §5 #4 lists "small TAM (5,530)" as a gap — praise and gap on the same number (an intel-doc tension, not a product contradiction).

### 6. Open questions / missing captures
Each resolves with a specific screen Monaco hasn't surfaced in these 12.

- **Is the inbox reply AI-drafted or hand-typed?** No provenance badge, no visible composer (inbox-john-wade-thread.png). -> Capture the composer mid-draft showing any "AI drafted / Generate" control.
- **Who authors the autopilot copy — the model or the FDAEs?** Intel §2.2/§5 #6 says Hannah/Shira rewrite subverticals every ~2 weeks, but no screen shows it. -> Capture the **Sequence editor / Templates tab** (variable-insertion UI, §8.9).
- **Does the score quantify (numeric value, per-signal weights, recency/dates)?** The popover shows only labels and four uniform sparkle icons (accounts-signal-popover.png). -> Capture a score-breakdown / scoring-settings view.
- **Is the call-intelligence moat real and autonomous?** Intel §4.3 calls it the sleeper killer; **no pixel exists**. -> Capture the **call-recording / AI-summary view** (§8.9, priority).
- **How is "closed 40 opportunities" computed and where do deals live?** No Opportunity object is rendered (only empty aggregates). -> Capture the **Opportunities / pipeline kanban** (§8.9).
- **What is the Contact entity's full schema?** Only fragments appear in the inbox rail + queue. -> Capture the **Contacts tab** (§8.9).
- **What email-infra / deliverability / warmup config exists?** The whole strategic wedge (intel §5 #1/#2) is invisible in all 12 screens. -> Capture **Settings -> email-infra / inbox / deliverability** (§8.9).
- **What verbs does bulk ⚡ Actions expose, and is there a destructive-op guard at 5,530?** Only the button is shown (accounts-tam-5530-selected.png). -> Capture the Actions menu expanded.
- **What does the Suggested-row ⓘ tooltip / row "Details" say (the "why this contact")?** Hover-only, unread (demand-queue-expanded.png). -> Capture the Details panel / tooltip open.
- **Does `Remove` suppress a contact globally or only for that day?** Ambiguous (demand-queue-expanded.png, reporting-revenue-pipeline.png). -> Capture a Remove confirm dialog / suppression view.
- **Is enrollment triggered by a score threshold or a signal event?** Not shown. -> Capture an autopilot/sequence Settings screen showing the enrollment rule.
- **Is `Competitor=No` a working exclusion filter or a dead column?** Uniform No across all 14 (accounts-icp-boolean-columns.png). -> Capture an account known to use a competitor, or the column's enrichment source.
- **Are the other 8 of 14 sequences paused/manual?** Banner says 6 automated (demand-hub-performance-apr6-12.png) vs 14 in Reporting. -> Capture the Sequences tab showing per-sequence active/paused state.

---

## STEP 3 — Prioritized build list for Elevay
Ranked by **leverage on Elevay's wedge**, not ease. COPY = match Monaco; BEAT = match then exceed on a visible gap; FIX = build the corrective for a Monaco anti-pattern. Every row anchored to a screen file (except #10, which is the one strategic gap absent from all 12 — anchored to intel).

| # | Item | Rationale (anchored) | COPY/BEAT/FIX | Effort | Priority |
|---|---|---|---|---|---|
| 1 | **Dead-channel / dead-sequence auto-detect -> auto-pause** wired into the autopilot | reporting-sequence-performance.png: LinkedIn 0 resp/0 mtg on 178 queued; SaaS-Email 549->0 mtg; no flag/rate/pause. Closes the loop Monaco leaves open (intel §5 #8). Attacks Monaco's biggest **visible** failure cheaply. | BEAT | S–M | P0 |
| 2 | **Two-axis explainable scoring** (grade + heat) with **numeric score, per-signal weights, detectedAt + source, an in-card action button**, and a **forced grade distribution** so A is scarce | accounts-signal-popover.png (labels + uniform icons only, no weights/dates/action); accounts-score-status.png (all A|Burning -> zero spread). Beats the feature the user praised most (intel §4.1). | BEAT | M | P0 |
| 3 | **ICP boolean enrichment matrix** with `{value, source, asOf, confidence}` per cell + per-column re-enrich + `+ add column` + filter/sort/bulk-enroll | accounts-icp-boolean-columns.png (bare Yes/No, no provenance, `Competitor=No` on all 14 with no way to tell exclusion-filter from dead-column); accounts-firmographic-columns.png (dual taxonomy; 5/14 funding cells blank with no enriching-vs-unknown state). Feeds scoring + targeting; auto-TAM is the user's "strongest praise" (intel §4.1). | COPY+BEAT | M | P0 |
| 4 | **Close the booking loop**: extract proposed time -> one-tap "Book this slot" calendar draft into Today's meetings | home-priorities.png: 4/5 cards carry a slot yet Today's meetings empty. Parsed intent dropped on the floor. | BEAT | M | P1 |
| 5 | **Autopilot cockpit**: per-channel Sent-today ledger + weekly strip (with reply-rate) + day buckets + Review-Upcoming queue, per-row Remove, **bulk approve**, **inline score/why on every row**, **one-click Pause**, and a named list of which sequences are automated | demand-hub-performance-apr6-12.png (counts only, no rates, no pause, "6 types" unnamed); demand-queue-expanded.png (Contact Score blank on 12/13 rows, no bulk action). Elevay has the engine (spec 37) but no cockpit. | BEAT | M | P1 |
| 6 | **Select-all-across-results bulk bar + Actions menu** routed through `evaluateSend`, with a confirm at N>500 and no row occlusion | accounts-tam-5530-selected.png: select-all 5,530 + ⚡ Actions, but no verb list/guard and the bar occludes the Forerunner row. | BEAT | M | P1 |
| 7 | **Unified cross-channel inbox** with per-bubble channel badge, "AI draft — review before send" pill, editable composer, and `[attachment — open in source]` fallback for null bodies | inbox-john-wade-thread.png: finished-looking static bubble (ambiguous sent/pending), empty 2nd inbound bubble, raw "Enginner" typo. Elevay has partial infra (inbox-ai-draft, Unipile). | BEAT | M | P1 |
| 8 | **Single-source-of-truth metric layer**: every counter (greeting, KPI strips) from the same query as Reporting; a totals row that reconciles to the headline; scope+window labels on every strip; outcome columns next to activity | home-priorities.png "closed 40" vs demand-hub-performance-apr13-19.png Pipeline=0; reporting-sequence-performance.png headline 850 ≠ visible 834. Builds the corrective for Monaco's vanity-vs-reporting split. | FIX | S | P2 |
| 9 | **Sequence Performance funnel** with derived reachRate/replyRate/meetingRate, a pinned totals row, low-significance muting (meetings≤1), and no nav occlusion of data rows | reporting-sequence-performance.png: absolute counts only, arbitrary row order, unused sort caret, nav covers the last (ERP-Email) row — the exact bug a totals row would have caught. | COPY+BEAT | S | P2 |
| 10 | **Email-infra / deliverability ownership** (warmup, DNS/DMARC, land-detection, fallback-channel nudge) | **No screen — intel §5 #1/#2 (both High severity).** The single biggest friction Monaco assumes the founder solved; it is Elevay's strategic wedge for non-technical founders. Low rank reflects effort/uncertainty (ocean-adjacent), not importance — scope before building. | BEAT | L | P2 (strategic) |

---

## Appendix — Adversarial QA: per-screen defects flagged
- **[HIGH] accounts-icp-boolean-columns.png** — INVENTED behavior + missing row. The block repeatedly claims RTI is a 'blank/loading' async-enrichment row ('RTI's boolean cells are essentially un-rendered (only a stray N / faint Yes chips bleed under the bar) -> its enrichment row appears still loading'; 'RTI's blank row shows enrichment is async/lazy per-row'; 'RTI's blank row shows no loading/empty state'). Pixels (zoomed) show RTI = Aerospace & Defense fully enriched: AI Strategy=Yes, Competitor=No, Active Paid=Yes, Has Recent=No, Hiring For=Yes, SEO Traffic=Yes, B2B=Yes. The faded row the author mistook for RTI-loading is actually a 15th account, 'Anrok' (Industry Served 'Software / SaaS'), being scrolled in / dimmed under the floating nav.
  - Fix: Delete every 'RTI blank/still-loading/async-lazy enrichment' claim and the INFERRED capability sentence built on it ('RTI's blank row shows enrichment is async/lazy per-row'). Transcribe RTI as fully enriched (Yes/No/Yes/No/Yes/Yes/Yes). Add the 15th row 'Anrok | Software / SaaS' (dimmed/scrolling under nav, values not readable). State there is NO observed loading/empty state on this screen (the async-enrichment inference is unsupported).
- **[HIGH] accounts-firmographic-columns.png** — Same RTI fabrication. Block says 'RTI bottom row is clipped by the floating nav and its two right cells are blank/pending' and (capability) 'async/lazy per-row (RTI still loading)'. Pixels show RTI fully populated: Headcount 445, Connections 0, Software Category Other, Industry Served Aerospace & Defense, AI Strategy=Yes, Competitor=No. RTI's AI Strategy/Competitor cells are not 'blank' — they render Yes/No; only the far-right (beyond Competitor) is off-frame. Also misses the 15th dimmed row 'Anrok' (Headcount 96, Industry 'Software / SaaS').
  - Fix: Replace 'RTI ... two right cells are blank/pending' with RTI fully enriched (445 / Other / Aerospace & Defense / AI Strategy=Yes / Competitor=No). Remove any 'async/lazy/RTI still loading' inference. Note row 15 'Anrok' (96 / Software / SaaS) dimmed under nav. The genuine enrichment gap to keep is the 5 BLANK funding cells (ConsumerAffairs, Aha, Ahrefs, infoTrack US, RTI) with no enriching-vs-unknown state — that is real.
- **[MEDIUM] demand-hub-performance-apr6-12.png** — FABRICATED occlusion. Block claims the 'Sent today' third tile is cut: metric table 'Tile 3 | 0 LinkedIn messages (label edge-cut)'; grid 'Sent today group 8 / 7 / 0(cut)'; edge/occlusion 'Sent today third tile label is truncated — only the 0 value shows, the LinkedIn messages label is cut by the webcam tile'. Zoom shows the full label '0 LinkedIn messages' rendered; the webcam tiles sit far right and do not reach the metric strip.
  - Fix: Remove the 'label edge-cut / truncated / cut by the webcam tile' claims. Transcribe the full, visible 'Sent today' triple: 8 Emails / 7 Connection requests / 0 LinkedIn messages. Drop the 'confirmed present via sibling' crutch — it was directly visible here.
- **[MEDIUM] demand-hub-performance-apr6-12.png** — FALSE contradiction (metric conflation). Weakness/gap says 'every day bucket is planned at 30 (~150/business-week) but the realized weekly Added to queue is only 29 — planned cap and actual throughput disagree by 5x'. 'Added to queue' is weekly INFLOW of new contacts; the 30/day buckets are sequence STEPS processed against the standing backlog ('In queue now' = 21/98). Processing 30/day while adding 29/week draws down a backlog — these measure different things, so there is no 5x contradiction.
  - Fix: Remove the '5x divergence / planned cap != realized throughput' framing. If kept at all, reframe as an OPEN QUESTION: 'added-to-queue (inflow) vs the ~30/day processed (backlog drawdown) are different quantities; the standing backlog (In queue now=21) explains processing >inflow.' Do not call it a contradiction.
- **[LOW] accounts-signal-popover.png** — OBSERVED/INFERRED blur on icons. Block asserts typed per-signal-class icons: '(2) the firmographic line uses a DIFFERENT icon (line-chart/trend) than the three sparkle signal icons and the one person-glyph'; 'Hiring for SEO/GEO/AIO/AEO' tagged with a person glyph; 'icons are typed per signal-class'. At pixel zoom the four Top Signals icons are uniform sparkle/asterisk marks; only the 'Company has 71 employees' firmographic line uses a distinct trend icon. The 'person glyph' / per-class typing is an overread.
  - Fix: State as OBSERVED only: the firmographic reason uses a trend icon; the four Top Signals share one sparkle icon. Drop the 'person glyph' and 'typed per signal-class' claims (move to INFERRED if you want, flagged as unconfirmed).
- **[LOW] inbox-john-wade-thread.png** — Wrong intel cross-reference. Weakness/gap (2) says intel '§8.4 silently corrected it to Engineer'. The inbox/title intel lives in §8.2 (line 134: 'Snr Sales Engineer EMEA Lead at Beeline'); §8.4 is the expanded queue. (The synthesis Contradictions section cites §8.2 correctly — the per-screen block is the one that's wrong.)
  - Fix: Change '§8.4' to '§8.2' in the inbox block. The substance (pixels show 'Enginner' typo; intel normalized to 'Engineer') is correct.
