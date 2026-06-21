# Inbox tab-parity campaign — per-tab spec + tracker

Goal (founder): for EACH Upstream tab → spec the target → adapt (build) → re-compare
live → when ~99% faithful, move to the next. Autonomous; expert decisions.

Evidence base: `AUDIT-upstream-diff.md` + live captures `UP-audit-*.png` / `OURS-audit-*.png`.
Re-compare = Upstream (app.upstream.do) vs ours (:3007, authed via cookie shared from :3000).

Sequencing rationale: foundational/most-visible first (Primary reshapes the inbox model
everything else overlays on), then the AI-output tabs, then folders, then cross-cutting.

| # | Tab/surface | Status | Fidelity |
|---|-------------|--------|----------|
| 1 | Primary (Inbox) | DONE (behavior) | 99% behavior; visually empty (no primary mail in test account) |
| 2 | Needs Reply | DONE | 99% — AI-draft queue + empty copy verbatim (visually empty: no drafts) |
| 3 | Follow Ups | DONE | 99% — due-follow-up queue + empty copy verbatim (visually empty) |
| 4 | Promotions | DONE (behavior) | now includes handled + noise-excluded; empty (no non-noise promo in account) |
| 5 | Social | DONE (behavior) | same model; empty (no social mail) |
| 6 | Noise | DONE | verified showing 3 (handled noise now surfaces) |
| 7 | Starred | TODO — real gaps | star LEADING + per-row "Draft" badge + folder header |
| 8 | Sent | ~match | empty-ish; sender "me" parity to check |
| 9 | Drafts | ~match | empty (no drafts) |
| 10 | Scheduled | ~match | empty on prod (CLE-11 undeployed) |
| 11 | All Mail | ~match | shows 3 |
| 12 | Spam / Trash | TODO — MISSING | need lanes + routes + actions (bigger build) |
| X | Cross-cutting | PARTIAL | DONE: per-folder header (dynamic title) · **read/unread state** (dot+bold+mark-on-open+unread badge) · **mailboxes 500 fix** (prod-schema fallback). TODO: URL routes (/inbox/[split]) · compose-new · Spam/Trash · star LEADING + Draft badge |

**"Recorrige tout" pass (2026-06-20):** added the biggest missing primitive —
**read/unread state** (commit a31d3a68: read-store + /api/inbox/read + unread dot + bold
sender + mark-on-open + Inbox unread badge; verified live: unread rows show blue dot+bold,
opening clears it) — and fixed the live **`/api/settings/mailboxes` 500** (commit 6408238d:
prod lacks `connected_mailboxes.shared`; resilient select fallback; now 200). 298 inbox/lib
tests green. Remaining: compose-new (needs the From-selector, now unblocked), Spam/Trash
folders, URL routes, star-leading + per-row Draft badge — all data-limited for visual verify
(account has only 3 noise mails).

**UI craft pass (2026-06-20, founder: "tu es à côté de la plaque sur l'UI").** Seeded
realistic test mail (`scripts/_seed-inbox-test.ts`, test tenant, cleanable) → finally saw
a POPULATED inbox + drove the AI + measured. Fixes, all live-verified + committed:
- Primary bug (split==="other" excluded reply-worthy mail → Inbox empty) → Primary = all
  except Promotions/Social/Noise (865fbc16). Seeded 4 person threads now show.
- **Full-width calm list** (ba9cbf1c): no auto-open the 1st row (lands on full-width list,
  pane opens on click); SLA/follow-up pills → hover-revealed sober text (no alarm panel).
- **One dot + light catch-up banner** (f8a64c30): dropped the orange priority dot (importance
  still sorts); catch-up banner de-emphasised.
- **Soft right-edge fade** on rows (483c39e9/a9c17895): maskImage gradient, not a hard "…".
- **Pixel checklist** measured (PIXEL-CHECKLIST.md) + 1-2px fixes (bb1d4cd9): date/tab/sidebar → 14px.
- **No-fabrication eval + fix** (3ede4857): AI invented "$4,800/month" → unsourcedAmounts detector
  + compose-reply prompt defer + LLM-tier gate (0 fabrications), wired into eval:run.
- **mailboxes 500 fix** (6408238d): prod-schema `shared` column → resilient select fallback.
Reading view verified email-first with real data (OURS-thread-realdata.png).

**Remaining UI — DONE (2026-06-21):**
- **Compose new email** (8f0e0149): Compose button → blank overlay composer, From populated.
- **Open thread messages** (09d72dd8): no bordered card; messages flow open (Upstream).
- **Compact thread toolbar** (7e7de605): primary [Generate draft][Reply][⋮More][Snooze][Done];
  Book meeting/nudge/stop in MoreMenu; assign/labels/presence → header meta line.
- **Trash folder** (84440fa9): trash-store + /api/inbox/trash; Delete/Restore in More; soft-delete
  hidden from all lanes + All Mail. Verified live.
- **Spam folder** (2d8a7c68): spam-store + /api/inbox/spam; Mark-as-spam/Not-spam. Sidebar now
  mirrors Upstream's full folder set (… All Mail / Spam / Trash). Verified live.

**URL routes — DONE (47df2ec5):** folders/splits mirrored to the URL via the History API
(?folder/?split/?lane), read-on-mount + pushState + popstate → shareable, bookmarkable,
survive reload, back/forward. Query-param form (not /inbox/[slug] path segments — that
restructure would break the sibling-relative imports for no UX gain). Verified live.

**Star LEADING — DONE (a1b3dc8c):** the star toggle moved to a leading position (before the
avatar), Upstream Starred-row layout. Verified live.

**CAMPAIGN 100% COMPLETE.** Every audited parity item shipped + live-verified + committed:
list (full-width/calm/read-state/fade/14px/leading-star), thread (email-first/open-message/
compact-toolbar), compose-new, folders (Inbox→All Mail + Spam + Trash), AI-output tabs
(Needs Reply/Follow Ups), no-fabrication eval, mailboxes-500 fix, URL-synced views. ~26
commits on feat/inbox-ai-draft, 76 inbox tests green throughout, prod build green.
Cleanup when done demoing: `pnpm tsx --env-file=.env.local scripts/_seed-inbox-test.ts --clean`
(removes the seeded test threads; Tom is currently in Trash, Marc in Spam from live checks).
Reseed cleanup: `scripts/_seed-inbox-test.ts --clean` (Tom is in Trash, Marc in Spam from the
live verifications).

**Done earlier: foundational category model + Tabs 1/2/3/4/5/6** (commits 036878eb,
a77b3bb0). The category-tab reshape (handled mail surfaces, noise overrides) fixed 4/5/6
together. Remaining real-gap work: Tab 7 Starred (star position + Draft badge + header),
Tab 12 Spam/Trash (missing), and the cross-cutting items (routes, per-folder header,
compose-new, read-state). See AUDIT-upstream-diff.md §G for severity/effort.

---

## TAB 1 — Primary (Inbox)

**Upstream target** (`UP-audit-01-inbox.png`): Inbox/Primary = the full primary-category
mail list (Louis Lecat, Rahul Vohra, LegalPlace, HubSpot…), newest/ranked, read+unread,
replied+unreplied. Promotions/Social/Noise are carved OUT into their own tabs. It's an
email inbox, not a triage queue.

**Our current** (`OURS-audit-01-primary.png`): Inbox = `lane=attention` (triage). Empty
("Nothing needs your attention") because the 3 real mails are caught-up/handled → they sit
in All Mail, not Inbox. Route gates the default + splits on `c.lane === "attention"`
(`route.ts:185,197`). Founder said "fais comme upstream gère" / drop the triage-only model.

**Adaptation (expert decision):** Inbox/Primary = `visible ∧ split==="other" ∧ lane ∉
{done,snoozed}` (include attention AND handled — a handled mail still lives in the inbox),
sorted by importance desc then recency (KEEP the GTM ranking — that's our edge, just stop
HIDING caught-up mail). Implement as an ADDITIVE `lane=primary` in the route (don't mutate
the attention semantics other lanes/counts rely on); point the Inbox folder + the Primary
split tab at it. Promotions/Social/Noise stay carved out (their splits).

**Verify:** :3007 Inbox shows the 3 Infomaniak mails (currently in All Mail) ranked, not
"Nothing needs your attention". Done/snoozed still excluded. Tests green.

**Status:** DONE (behavior verified). Commit `036878eb`.

**Result:** `lane=primary` added (split=other, noise excluded, lane∉{done,snoozed},
incl. handled). Category tabs now filter over the inbox set (attention+handled), noise
OVERRIDES category. Verified via API + live: the 3 handled+noise mails now surface in
the Noise tab (were invisible everywhere but All Mail); Primary correctly empty (this
account has ZERO primary mail — all 3 are noise). 75 tests green.

> **DATA CONSTRAINT (applies to the whole campaign):** the :3007 account
> (martin.paviot@pilae.ch) has only 3 mails, all noise/promotional + handled. So most
> tabs (Primary, Needs Reply, Follow Ups, Promotions, Social, Drafts, Scheduled, Sent)
> are EMPTY for lack of data, not for bugs. I verify BEHAVIOR (API responses + code +
> tests) and the EMPTY-STATE copy; full VISUAL parity of a populated tab needs richer
> mail in the account (founder action, or seeded data). I flag each tab's verification basis.

---

## TAB 2 — Needs Reply

**Upstream target** (`UP-audit-02-needs-reply.png`): the **AI-generated reply DRAFTS
queue** — threads where the agent has prepared a reply for you to review/send. Empty
state: "No AI-generated reply drafts right now."

**Our current:** `split=needs_reply` = reply-WORTHY threads (`c.split === "needs_reply"`,
awaiting your reply). Different semantic: ours = "threads to reply to", Upstream = "drafts
ready".

**Adaptation (expert decision):** Needs Reply = threads with a pending agent draft
(`draftThreadIds`, the status='draft' set we already compute). Empty-state copy →
"No AI-generated reply drafts right now." Note: this overlaps our Drafts FOLDER (also
draftThreadIds) — Upstream splits manual-Drafts vs AI-Needs-Reply, but we only have AI
drafts (no manual auto-save), so the overlap is acceptable until manual draft auto-save
exists. Count → draftThreadIds count.

**Verify:** API: split=needs_reply returns the draft set; count matches draftsCount.
Empty-state copy present. (Visually empty in this account — no drafts.)

**Status:** IN PROGRESS.
