# Inbox tab-parity campaign — per-tab spec + tracker

Goal (founder): for EACH Upstream tab → spec the target → adapt (build) → re-compare
live → when ~99% faithful, move to the next. Autonomous; expert decisions.

Evidence base: `AUDIT-upstream-diff.md` + live captures `UP-audit-*.png` / `OURS-audit-*.png`.
Re-compare = Upstream (app.upstream.do) vs ours (:3007, authed via cookie shared from :3000).

Sequencing rationale: foundational/most-visible first (Primary reshapes the inbox model
everything else overlays on), then the AI-output tabs, then folders, then cross-cutting.

| # | Tab/surface | Status | Fidelity |
|---|-------------|--------|----------|
| 1 | Primary (Inbox) | IN PROGRESS | — |
| 2 | Needs Reply | TODO | — |
| 3 | Follow Ups | TODO | — |
| 4 | Promotions | TODO (likely ~match) | — |
| 5 | Social | TODO (likely ~match) | — |
| 6 | Noise | TODO | — |
| 7 | Starred | TODO | — |
| 8 | Sent | TODO (~match) | — |
| 9 | Drafts | TODO (~match) | — |
| 10 | Scheduled | TODO (empty prod) | — |
| 11 | All Mail | TODO (~match) | — |
| 12 | Spam / Trash | TODO (missing) | — |
| X | Cross-cutting: URL routes · per-folder header · compose-new · read-state | TODO | — |

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

**Status:** IN PROGRESS.
