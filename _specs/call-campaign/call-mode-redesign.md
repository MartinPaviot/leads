# Call Mode redesign — the best B2B cold-call interface

Methodology-first (PM / ex-McKinsey / Stanford lens). Goal: the calmest, fastest, highest-conversion
cold-call cockpit in B2B — one rep, high volume, AI doing everything except the human conversation.

## 0. What the market does, and the gap we exploit
- **Volume dialers (Orum, Nooks, Koncert)** optimise dials/hour: parallel/power dialing, auto-advance,
  connect the rep only on a human pickup, auto-drop voicemails. Their weakness, repeatedly cited: the
  UI is **overwhelming and unintuitive** — options everywhere, prep lives in other tools.
- **Live-assist (Clari Copilot, Wingman, Gong Assist)** is the frontier: **live transcript + real-time
  objection/battlecard prompts during the call**, not just after.
- **Best practice everywhere**: native CRM (zero double-entry kills adoption in 30 days), and a call
  that follows a recent signal/email reads as a **warm, timely** call, not a cold one.
- **Our gap to win**: combine volume-flow + live-assist + native CRM **with radical calm**. One screen,
  one focal action at every moment, the AI surfacing exactly what's needed and nothing else.
Sources: orum.com, nooks.ai, salesloft champions, gong.io, clari/wingman, spiky.ai (see chat research).

## 1. First principles — the only job
A cold-caller's only job is **to talk to the right person well**. Every pixel either serves the live
conversation or it is noise. So the interface must:
1. **Remove all between-call friction** — no dialing, no logging forms, no "what next". (auto-advance +
   one-tap disposition: shipped.)
2. **Front-load the conversation** — when a human picks up, the screen becomes the conversation: live
   transcript + the few things to say/handle. Everything else recedes.
3. **One focal action per state** — the UI has modes; each shows exactly one primary thing.
4. **Trust through visibility** — the rep sees the autopilot working (funnel bar: shipped) so they
   never babysit it.
5. **Calm > dense** — generous space, one accent colour, no wall of controls (the anti-Orum).

## 2. The session journey (states) and what the rep needs at each
| State | Rep's head | Show ONE thing | Recede |
|---|---|---|---|
| **Arrive** | "what's my day?" | Funnel bar (today X/quota, due, callable) + the list | — |
| **Pre-call (selected)** | "who, why now, what do I say?" | **Pre-call hero**: name+role+company, ONE signal-based opener line, 3 bullets (why now / what they care about / the ask), big Call button | dossier collapsed below |
| **Dialing / ringing** | "is anyone there?" | Status + a calm ring timer; voicemail-drop appears at ~8s | brief dims |
| **Connected (LIVE)** | "listen, respond, don't fumble" | **Transcript-centric focus**: large diarised live transcript center; slim context rail (opener + the ask + objection coaching cards as they fire); timer + mute + voicemail + hang up | queue + funnel hidden |
| **Hang-up** | "log it, move on" | **One-tap disposition** (AMD-suggested pre-highlighted) + a one-line "captured: deal/task" | — |
| **Between** | "next" | auto-advance to next prospect; pre-call hero for the next | — |

## 3. The redesigned layout
Two layouts, switched by call state — the cockpit **transforms** when a call goes live.

**A. Prep layout (idle / selected)** — 3 calm columns:
- Left: today's list (compact rows; the row in cadence shows "attempt N/8"). Funnel bar on top.
- Center: **Pre-call hero** — avatar, name, title · company, then a boxed **opener** (signal-based) and
  3 bullets; the full dossier (account brain, history, signals) is collapsible beneath.
- Right: the softphone (big Call button) + number/local-presence.

**B. Live layout (dialing → connected)** — the screen flips to **focus mode**:
- The list + funnel **collapse** to a thin left strip (just count + next).
- **Center = the live transcript**, large, diarised (agent vs prospect), auto-scrolling, with the
  prospect's words emphasised. This is the hero — the rep reads along.
- Right rail (narrow): the opener + the ask pinned at top; **live objection-coaching cards** stack here
  as they fire (objection → 2-3 suggested responses, 12s auto-dismiss); call timer + mute + drop
  voicemail + hang up fixed at the bottom.
- AMD/voicemail banner inline.
Transition is a smooth width/opacity shift (transform/opacity only — no layout-thrash, per the GPU rule).

**C. Wrap (ended)** — disposition picker (shipped) + "captured: {deal} · {tasks}" + auto-advance.

## 4. The ultra-precise onboarding (USER-DEFINED frequency)
The user defines their own rhythm — never hardcoded "each morning / each month / 8x in 15d".
A short, precise multi-step (not a wall): each step one decision, with a live plan preview.

1. **Goal** — any objective: calls / connects / meetings, over a day / week / month, target number.
2. **Working days** — which days they actually call (Mon–Fri default, user toggles). Drives when the
   list regenerates and how the daily quota is spread. (No weekend calls unless chosen.)
3. **List frequency** — how often a fresh list is built: every working day (default) / weekly batch.
   The copy reflects THIS choice ("a fresh list every working day" vs "a weekly list each Monday").
4. **Cadence** — user sets max attempts and the window (defaults 8 / 15 days, both editable with a
   plain-language preview: "we'll try each prospect up to N times over M days, then stop").
5. **Who to call** — confirm/define the ICP (persona search) so the list is never empty.
6. **Connect a number** — Twilio status inline; the plan is saved and dialing activates once connected.
Each step shows the derived daily call volume so the rep sees the consequence of their choices.

Persist the chosen frequency/cadence on the campaign (weeklyTarget/daysPerWeek/dailyQuota/maxAttempts/
windowDays already exist; add `listFrequency` to targetFilter). All surfaced copy reads from these —
never a fixed period.

## 5. Build plan (phased, each verifiable)
- P1 (now): onboarding = user-defined frequency + cadence (fix the hardcoded copy); persist listFrequency.
- P2: live layout — transcript-centric focus mode on connect (collapse list/funnel, big transcript,
  pinned opener + objection rail + controls), smooth transition.
- P3: pre-call hero (opener + 3 bullets at the top; dossier collapses below).
- P4: wrap "captured" summary (deal/tasks created) after disposition.
Each phase: Playwright-verify the visible states; live dialing stays gated on Twilio.
