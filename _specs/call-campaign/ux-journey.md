# Call-campaign UX journey — how the rep thinks at each step, and how to remove the friction

Grounded in the CURRENT build (orchestration engine + onboarding + cron + cadence hook shipped on
feat/page-elevation; live dialing/enrichment key-gated). Per-step: what the rep is thinking → what
they must do today → the friction now → the concrete simplification.

The thread running through all of it: **a cold-caller's only job is to talk to the right people.
Everything else (who, number, when, logging, follow-up) should be invisible.** The rep should open
Call Mode, see a person + an opener, press call, hang up, repeat — and trust the machine for the rest.

---

## Step 0 — First arrival on Call Mode (onboarding)
- **Thinks:** "I want to start calling. What do I do?"
- **Now:** Onboarding asks the goal (any objective → daily quota). Good.
- **Friction:** Setting a goal does NOT guarantee a list. If the tenant has no ICP / no
  enriched-with-phone contacts, the list is empty (we saw callsReturned=0). And if Twilio isn't
  connected, the next screen is a dead-end "Voice isn't configured". The rep set a goal and got
  nothing to call → broken first impression.
- **Simplify:** The onboarding must end in one of two HONEST states, never an empty cockpit:
  1. "Your list is ready — N prospects, M with a mobile" (calls now), or
  2. "Building your list — pulling ICP prospects and enriching numbers, ~N ready in a few minutes",
     with a live count. Chain it: goal → (no ICP?) one-line ICP confirm → (no callable pool?) auto
     kick off TAM build + enrichment → show progress. Surface setup gates inline ("Connect a number
     to start dialing" with a button), not as a separate dead screen.

## Step 1 — Who to call (ICP / TAM)
- **Thinks:** "Who are my best-fit prospects?"
- **Now:** ICP in Settings; TAM build via Apollo is a separate manual page, disconnected from the goal.
- **Friction:** The rep must independently know to define an ICP and build a TAM before any list exists.
- **Simplify:** Derive the needed pool size from the goal ("200 calls/day over 15 days ≈ 600 fresh
  prospects") and offer one-click "build them from your ICP". The daily cron already tops up from
  callable contacts; make it auto-trigger a TAM build when the pool runs low, so the rep never thinks
  about supply.

## Step 2 — People inside the accounts
- **Thinks:** "Who exactly do I call at each company?"
- **Now:** extract-contacts (Apollo) pulls decision-makers per account — manual, separate.
- **Friction:** Multi-step manual chain (find companies → extract people → enrich) before a callable list.
- **Simplify:** Fold extraction into the auto pipeline: when the cron tops up, it extracts people for
  new accounts and queues enrichment. The rep sees people, not a pipeline to operate.

## Step 3 — Enrichment (email + phone)
- **Thinks:** "I need their direct line or mobile — now."
- **Now:** Waterfall Apollo→Kaspr→Lusha (geo-routed), on-demand in the brief + batch. Key-gated.
- **Friction:** Without keys, no phone → not callable → silently absent from the list. The rep can't
  tell WHY someone isn't there, or how good the coverage is.
- **Simplify:** Pre-enrich the next 1-2 days of list ahead of time (cron), and make coverage visible:
  "182/200 have a mobile · 18 enriching · 0 blocked". Per-prospect provenance ("mobile via Kaspr").
  When a provider key is missing, say so once at the top, not by silent absence.

## Step 4 — The morning list
- **Thinks:** "Who do I call today, and in what order?"
- **Now:** Today's list = retries due + fresh, ordered by score. Attempt count shows as a chip.
- **Friction:** Pure score order buries time-sensitive callbacks and due-retries under cold leads;
  no sense of "how far to today's quota".
- **Simplify:** Order = callbacks first → due-retries → fresh-by-score. Add a quota progress bar
  ("47 / 200 today"). One keyboard flow: call → auto-advance to next on hangup.

## Step 5 — Making a call (pre-call brief + dial)
- **Thinks:** "Who is this, what do I say in the first 10 seconds, why now?"
- **Now:** Rich PreCallBrief + AccountBrain. Dial is one click.
- **Friction:** The brief is deep but the rep needs the OPENER at a glance, not to read a dossier
  mid-dial.
- **Simplify:** Top of the brief = one signal-based opener line + 3 bullets (why now / what they care
  about / the ask). Dossier collapses below. The opener is the hero; everything else is on demand.

## Step 6 — During the call (transcript + coaching)
- **Thinks:** "Am I handling this? What do I say to that objection?"
- **Now:** Live transcript + coaching cards (objection → suggested responses).
- **Friction:** Logging the outcome at hangup is a manual classification the rep shouldn't have to think about.
- **Simplify:** At hangup, pre-fill the disposition from AMD + transcript and let the rep confirm in
  one tap ("No answer — confirm" / "Connected, interested — confirm"). Then auto-advance.

## Step 7 — After the call (disposition → CRM → next step)  ← biggest current gap
- **Thinks:** "Logged. What now for this lead?"
- **Now:** Post-call auto-creates an ACTIVITY and feeds the cadence (shipped). But contact/deal FIELDS
  aren't auto-updated, and next-steps aren't auto-created.
- **Friction:** "Actualisation automatique du CRM" is only half-true: the timeline gets an entry, but
  the rep still hand-updates the contact (new title/email learned on the call), creates the deal when
  a meeting is booked, sets the follow-up task. That's exactly the manual CRM work this product is
  meant to kill.
- **Simplify (build next):** From the call's extracted signals: patch the contact (corrected name,
  role, email, mobile heard on the call), and route by outcome — meeting_booked → create/advance a
  deal + place a calendar hold + draft the confirmation; callback_requested → already re-queued, also
  draft the reminder; not_interested/do_not_call → close + DNC. Human-in-the-loop via the existing
  capture-approval seam. This closes the loop the rep actually feels.

## Step 8 — Cadence / not-reached
- **Thinks:** "Did I miss anyone? When do they come back?"
- **Now:** Cadence engine auto-requeues no-answers up to 8x/15d (shipped); retries surface in the list.
- **Friction:** The machinery is invisible — the rep can't see who's on attempt 5 vs exhausted, so
  they can't trust it.
- **Simplify:** A small cadence panel: "31 in retry · 12 due tomorrow · 4 exhausted (reached the
  8x/15d cap)". Per-prospect "attempt N/8 · next call Tue". Visibility = trust = they stop re-checking
  manually.

## Step 9 — Progress toward the goal
- **Thinks:** "Am I on track for my number this week?"
- **Now:** Goal is stored; no progress surfaced.
- **Friction:** The rep can't see goal progress, so the goal feels decorative.
- **Simplify:** A goal strip on Call Mode: "Today 47/200 · Week 312/1000 · 3 meetings booked · pace:
  on track". Pull from calls + targets. Make the goal the scoreboard the whole cockpit serves.

---

## Prioritised (what moves the needle, in order)
1. **Onboarding ends in a real, non-empty (or visibly-building) enriched list** — never an empty
   cockpit or a Twilio dead-end. (Step 0/1/2/3 chained + honest setup gates.)
2. **Close the CRM loop automatically** — patch contact/deal + route next-step by outcome, not just
   an activity. (Step 7 — the headline "actualisation automatique" gap.)
3. **Make the funnel visible** — enrichment coverage, cadence state, goal progress — so the rep trusts
   the autopilot and stops doing it by hand. (Steps 3/8/9.)
4. **Per-call ergonomics** — one-line opener + one-tap auto-suggested disposition + auto-advance.
   (Steps 5/6.)
