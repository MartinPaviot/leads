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
| X | Cross-cutting | TODO | URL routes (/inbox/[split]) · per-folder header · compose-new · read-state/unread |

**Done this session: foundational category model + Tabs 1/2/3/4/5/6** (commits 036878eb,
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
