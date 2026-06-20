# AUDIT — Elevay inbox vs Upstream, onglet par onglet

> Live, 2026-06-20. Upstream = app.upstream.do (contact@elevay.app).
> Ours = localhost:3007 (martin.paviot@pilae.ch), branch feat/inbox-ai-draft.
> Screenshots: `UP-audit-*.png` (Upstream), `OURS-audit-*.png` (ours).
> Method: click each surface live on BOTH, diff concretely with file:line.

Surfaces audited:
- Frame: top bar, left sidebar, split-strip, search
- Sidebar folders: Inbox · Needs Reply · Follow Ups · Starred · Snoozed · Sent · Drafts · Scheduled · All Mail
- Split tabs: Primary · Needs Reply · Follow Ups · Promotions · Social · custom · Noise
- List row anatomy
- Reading view (click): toolbar · subject · message · composer
- Multi-select / bulk actions
- Compose (new email)

Status legend: [MATCH] parity · [DIFF] differs · [MISSING] Upstream has, we don't · [EXTRA] we have, Upstream doesn't

---

## A. FRAME & navigation (IA)

**Upstream structure (live a11y tree):**
- Far-left **icon rail**: AI Chat · Inbox · Channels · (support, settings).
- **Left sidebar folders** (menuitems): Inbox · Needs Reply · Follow Ups · — · Starred ·
  Snoozed · Sent · Drafts · Scheduled · All Mail · **Spam** · **Trash** · **Labels**.
- **Top split-strip** = REAL ROUTES: Primary `/inbox` · Needs Reply `/inbox/needs-reply` ·
  Follow Ups `/inbox/follow-ups` · Promotions `/inbox/promotions` · Social `/inbox/social` ·
  Qonto `/inbox/<uuid>` (custom) · Noise `/inbox/cold-emails` · `+` (new split).
- Split counts are **DOUBLE** ("Promotions 4 3", "Noise 7 3", "Qonto 2 9") — unread + total.
- Top search: combobox "Find, search, or ask anything…" (search + AI ask, one field).
- Settings panel: My Team · Theme · Signature · Filters · Notifications · API and MCP ·
  Integrations · Billing · Workspace · Preferences · **Configure Agents**.

**Ours (`page.tsx` + `_inbox-folders.tsx` + `_split-strip.tsx`):**
- Far-left = the Elevay app rail (Accounts/Contacts/Opportunities/Proposals/Inbox/Call/
  Campaigns/Meetings/Chat), collapsed to icons on /inbox.
- Sidebar folders: Inbox · Needs Reply · Follow Ups · — · Starred · Snoozed · Sent ·
  Drafts · Scheduled · All Mail · — · Done · Handled · Bundles. NO Spam, NO Trash, NO Labels folder.
- Split-strip: Primary · Needs Reply · Follow Ups · Promotions · Social · Noise — driven by
  `?split=` / page STATE, not routes.
- Search: top bar "Search mail — from: subject: is:unread" (search only, no AI-ask in the field).

**Diffs:**
- [DIFF] Splits are **state**, not **URL routes**. Upstream `/inbox/needs-reply` is shareable/
  bookmarkable/back-button-able; ours resets on reload. (`_split-strip.tsx` onSelect → setState.)
- [MISSING] **Spam** + **Trash** folders — we have no spam/trash lanes at all.
- [MISSING] **Labels** as a folder/management surface in the sidebar.
- [DIFF] Split counts are **single** ours vs **double (unread+total)** Upstream.
- [EXTRA] We add Done · Handled · Bundles folders (our triage model) — Upstream has none.
- [DIFF] Search field: Upstream merges search+AI-ask ("ask anything"); ours is search-only.
- [DIFF] Upstream "Channels" (multi-channel) + "Configure Agents" settings — we have neither
  as a first-class surface here.

## B. SPLIT TABS (the intention/category strip)

| Tab | Upstream URL | Upstream mechanism (live empty-state / content) | Ours |
|-----|--------------|--------------------------------------------------|------|
| Primary | `/inbox` | The main triaged list. | `split=null`, lane=attention. [MATCH concept] |
| Needs Reply | `/inbox/needs-reply` | **AI-generated reply DRAFTS queue** — empty state "No AI-generated reply drafts right now." | `split=needs_reply` = reply-WORTHY threads (awaiting YOUR reply). **[DIFF semantic]**: ours = "threads to reply to", Upstream = "AI drafts ready to review". |
| Follow Ups | `/inbox/follow-ups` | **AI follow-up SUGGESTIONS** — empty state "No follow-up suggestions right now." | `split=follow_ups` = `isFollowupDue` (a nudge is due on an awaiting-their-reply thread). **[DIFF framing]**: ours = reminder list, Upstream = AI suggestion queue. |
| Promotions | `/inbox/promotions` | Gmail-style marketing category, full list. | `split=promotions`. [MATCH concept]. |
| Social | `/inbox/social` | Gmail-style social category. | `split=social`. [MATCH concept]. |
| custom (Qonto) | `/inbox/<uuid>` | User-defined split (sender/keyword), own UUID route + gear config. | We have custom lanes (`customLanes`, "New lane") but they key on sender DOMAIN, not the saved-search/gear model, and are state not routes. **[DIFF]** |
| Noise | `/inbox/cold-emails` | Low-priority/cold list (count 73); rows can show a "NEW" badge. | `split=noise` (soft-demoted), Noise tab when noiseCount>0. [MATCH concept]; **[MISSING]** no "NEW since last visit" badge. |

**Split-tab diffs (summary):**
- [DIFF] **Needs Reply / Follow Ups are AI-output queues in Upstream**, intention-filters in ours.
  This is the single biggest semantic gap: Upstream's two AI tabs surface *what the agent
  produced* (drafts, follow-up suggestions); ours surface *what needs your attention*.
- [DIFF] Counts are single (total) on both — earlier "double count" read was an a11y artifact.
- [MISSING] Per-row "NEW" badge (unread-since-last-visit) on category lists.

## C. SIDEBAR FOLDERS (the email-folder column)

| Folder | Upstream | Ours |
|--------|----------|------|
| Inbox | `/inbox`, count badge | [MATCH] |
| Starred | `/starred`, runs `is:starred`, header "Starred"; row star is **LEADING (left)** + a "Draft" sparkle badge when an AI draft exists | We have Starred, but star is **TRAILING (right cluster)** (`_inbox-row.tsx:121`), no per-row Draft badge. **[DIFF]** |
| Snoozed | `/snoozed`-ish, `is:snoozed` | [MATCH] |
| Sent | `/sent`, `is:sent`, sender shows "me" | outbound lane. [MATCH] |
| Drafts | `/drafts`, "Drafts are saved automatically as you compose them." | `status='draft'`. [MATCH concept] |
| Scheduled | `/scheduled`, `is:scheduled`, "Threads you've scheduled will appear here." | empty on prod (CLE-11 undeployed). [MATCH visually-empty] |
| All Mail | folder | lane=all. [MATCH] |
| **Spam** | `is:spam` folder | **[MISSING]** — no spam folder/lane. |
| **Trash** | `is:trash` folder | **[MISSING]** — no trash; our "Done"/"Handled" are different (triage, not deletion). |
| **Labels** | label management surface | **[MISSING]** as a sidebar folder (we have thread labels via `ThreadLabels`, no folder view). |

**Folder diffs (summary):**
- [DIFF] Upstream folders are **URL routes** with a list **header** (e.g. "Starred"); ours are
  state-driven with only the top "Inbox" band, no per-folder header above the list.
- [MISSING] Spam, Trash, Labels-as-folder.
- [DIFF] Star position (leading vs trailing) + missing per-row "Draft" badge.

## D. LIST ROW anatomy

**Upstream row** (a11y + screenshots): `[checkbox(hover)] · avatar · Sender · [Subject(semibold) snippet(muted)] · date`.
Unread = blue dot leading + sender bold. Category lists add a colored category dot. A row with
an AI draft shows an inline green **"Draft"** sparkle badge before the subject. "NEW" badge on
recently-arrived noise.

**Ours row** (`_inbox-row.tsx`): `[checkbox(hover)] · priority-dot(attention lane) · avatar ·
Sender(semibold) Subject(medium) snippet(muted) · [SLA/followup chip] [labels] · star(hover) ·
date · mailbox-dot`.

**Diffs:**
- [DIFF] Leading indicator: Upstream = **unread dot** (read-state); ours = **priority/importance
  dot** (our signal) — different semantics, we have no read-state. [we lack a read flag entirely]
- [MISSING] Inline "Draft" badge on rows with a pending AI draft (Upstream surfaces it in the list).
- [MISSING] "NEW" badge (arrived-since-last-visit).
- [EXTRA] We add an SLA-overdue chip + follow-up chip + per-thread labels + mailbox dot inline
  (richer, more CRM; Upstream's row is calmer).
- [DIFF] Star trailing (ours) vs leading (Upstream).

## E. READING VIEW (click a thread)

**Upstream** (`/threads/<id>`, full-screen — `UP-thread-detail.png`): toolbar (← archive trash ⋮ ·
Add channel · participant avatars · Comment) → subject 24px bold → message block (avatar + name +
`<email>` + date) → **inline composer** ("Hit Ctrl+J to draft with AI" + format bar + Send▾).
Calm: subject + message, nothing else.

**Ours** (split pane — `OURS-thread-emailfirst.png`, post email-first rebuild): header (subject 17px
semibold + sender secondary + reason/urgency badges + action row) → messages → collapsed
**Intelligence panel** → inline composer.

**Diffs:**
- [DIFF] Upstream replaces the list **full-screen** on click; ours keeps a **split pane** (founder
  explicitly chose this: "on s'en fou du plein écran"). [intentional]
- [DIFF] Subject 24px (Upstream full-screen) vs 17px (ours, scaled to pane). [intentional scale]
- [EXTRA] Ours has the Intelligence panel + reason/urgency badges + more action buttons (Book
  meeting/Assign/Snooze/Done) — our GTM differentiation; Upstream's toolbar is 4 icons.
- [MISSING] Upstream "Add channel" (post the thread into a team channel) + "Comment" (internal
  team note on the thread) — we have ThreadNotes (private) but not channel-posting/threaded comments.
- [MATCH] Composer "Hit ⌘/Ctrl+J to draft with AI" affordance (added this session, T5).

## F. COMPOSE (new email)

**Upstream** (`/compose/new_thread.<uuid>`, full page — `UP-audit-10-compose.png`): To autocompletes
**people AND channels** (#general, #customer-feedback) → Cc/Bcc → AI field "Hit Ctrl+J to draft with
AI" + **mic (voice dictation)** → Subject → body + format bar → Send + schedule-send caret.

**Ours:** the composer (`email-composer-panel.tsx`) is **reply-scoped** — it opens in the reading
pane on Reply/Generate-draft. **[MISSING / to verify]**: a standalone "compose a NEW email" entry
point from the inbox (no thread selected). Upstream's pencil opens a blank new-thread compose.

**Diffs:**
- [MISSING] Standalone new-email compose from the inbox (verify on :3007).
- [MISSING] Channel targeting in To (multi-channel product).
- [MISSING] Voice dictation (mic) in the composer.
- [MATCH] AI-draft affordance + schedule-send (we have scheduled-send backend, CLE-11).
- [CONFIRMED in code] inbox composer is reply-scoped only (`page.tsx` tools + `_conversation-pane.tsx`
  openReply/generateDraft); no compose-new entry — grep found zero new-message button.

---

## G. SYNTHÈSE — écarts priorisés (ce qu'un PM corrige, dans l'ordre)

### Parité email-client manquante (vrais gaps, à combler)

| # | Écart | Sév. | Effort | Où |
|---|-------|------|--------|-----|
| 1 | **Needs Reply / Follow Ups = files de sortie IA** (drafts / suggestions), pas des filtres d'intention | HAUTE | ~3-5 j | `splits.ts` resolveSplit + route + a brancher sur preparedDraft/nudge queues |
| 2 | **Splits/dossiers = routes URL** (`/inbox/needs-reply`, `/starred`) shareable/back-button | MOY | ~2-3 j | `_split-strip.tsx` + `page.tsx` → App Router routes `/inbox/[split]` |
| 3 | **Compose nouveau mail** (entrée crayon → blank compose) | HAUTE | ~1-2 j | nouveau bouton inbox + réutiliser `EmailComposerPanel` hors thread |
| 4 | **Spam + Trash** (dossiers) | MOY | ~2 j | lanes + route filters + actions archive/delete |
| 5 | **Header de dossier** au-dessus de la liste ("Starred", "Sent"…) | BASSE | ~2 h | `page.tsx` content header dérivé de la lane/split active |
| 6 | **Badge "Draft" par row** (thread avec brouillon IA en attente) + **"NEW"** | BASSE | ~3 h | `_inbox-row.tsx` (a déjà `starred`; ajouter `hasDraft`/`isNew` au projection route) |
| 7 | **Étoile en tête** (leading) au lieu de droite | BASSE | ~30 min | `_inbox-row.tsx:121` déplacer le span étoile avant l'avatar |
| 8 | **Labels comme dossier/management** | BASSE | ~1 j | surface labels (on a `ThreadLabels`, manque la vue dossier) |
| 9 | **Dictée vocale** (mic) dans le composer | BASSE | ~1 j | `email-composer-panel.tsx` + Deepgram (déjà au stack) |

### Différences ASSUMÉES (notre produit GTM ≠ client email — NE PAS aligner)

- Split **pane** au lieu du thread plein écran — choix founder explicite ("on s'en fou du plein écran").
- **Panneau Intelligence** + badges reason/urgency + boutons Book meeting/Assign/Stop sequence —
  c'est notre différenciation (Monaco+Lightfield), absente d'Upstream. On la GARDE (repliée).
- **Dot de priorité** (notre signal d'importance) au lieu du dot non-lu — on n'a pas d'état lu/non-lu
  du tout ; le construire est un chantier data séparé (gap #10, voir ci-dessous).
- Dossiers **Done / Handled / Bundles** — notre modèle de triage, pas dans Upstream.

### Gap structurel de données

- 10. **Aucun état lu/non-lu** (`ConversationListItem` n'a pas de flag read). Upstream s'en sert
  partout (dot, gras, count "NEW"). Le construire = colonne/table read-state + maj à l'ouverture +
  reflux dans la liste. Chantier moyen (~2-3 j), pré-requis de #6 et du "vrai" dot non-lu.

### Ce qui est DÉJÀ à parité (vérifié ce jour)

- Liste dense 44px single-line, avatar + sender + sujet + snippet + date, checkbox multi-select au hover.
- Sidebar dossiers dans l'ordre Upstream + split-strip catégories.
- Starred / Drafts / Scheduled / All Mail / Sent existent.
- Reading view email-first + composer "Hit ⌘/Ctrl+J to draft with AI".
- Switcher multi-mailbox (gated 2+).

### Note multi-canal (le plus gros écart de SCOPE)

Upstream est un **hub multi-canal** : compose vise des **#channels** (Slack-like), il y a "Channels"
dans le rail + "Configure Agents" en settings + "Add channel" / "Comment" sur un thread. Elevay est
un **moteur GTM email-first**. Ce n'est pas un bug de parité — c'est une décision de scope produit.
À trancher par le founder : viser le hub multi-canal, ou rester email + voix (Twilio/Deepgram déjà au stack) ?




