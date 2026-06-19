# Superhuman Mail — in-app teardown findings (2026-06-16)

Driven live via Playwright on Elevay's real Superhuman (Google mailbox), READ-ONLY.
22 screenshots in `screenshots/`. Note: Superhuman guards `isTrusted` — synthetic
**clicks work** (opened Ask AI, clicked suggestions, switched panels) but synthetic
**keyboard confirms in command modals are rejected** (got wedged in the Snooze modal;
reload escaped it). So: panels/buttons drivable; keyboard-gated command overlays not.

## A. Onboarding (screens 001–015)
- Starts on a **"practice inbox"** with demo data (Rahul Vohra et al.), not real mail.
- A **3-minute keyboard tutorial**: full-width coach-mark cards blur the inbox and teach
  one shortcut at a time (E = Mark Done, Enter = open, H = Remind Me). "Hit enter to continue."
- Teaches by **doing** on demo data (press E three times, etc.) — muscle-memory onboarding.

## B. Triage & flow (003–014, 019)
- **Mark Done (E)**: instant archive-from-inbox, auto-advances selection, inbox count ticks down.
- **Remind Me / Snooze (H)**: dark monospace command overlay. **Natural-language input**
  ("type 'monday' or '2d'" → parses to "on Monday · MON 8:00 AM"). Quick options: tomorrow /
  next week / this weekend / someday / never. **KEY: an "if no reply" toggle** — the reminder
  fires ONLY if there's no reply → the no-reply nudge is **unified into snooze** (one control).
- **Split Inbox** (019, 022): top tabs `Important (8) · Calendar · Other (189+) · + Add Split`.
  Per Ask AI: a split's **Definition = search criteria** (`From:`,`To:`,`Subject:`,`Cc:`,`Bcc:`
  combined with AND/OR) + optional **Auto Labels**; created via **Cmd+K → New Split Inbox** from
  any email. "Hide empty Split Inboxes" + a "Reminders Split" exist.
- **Auto Labels**: AI auto-classification; a pink **"Pitch"** label is auto-applied to cold
  pitches (Resend welcome, Qonto insurance). Built-in + custom labels. There's an "Auto Labels"
  nav section.

## C. Reading (006, 009)
- Thread view: messages **collapsed/expanded** (quote-collapse, "Expand message header", "…"
  to expand trimmed content), clean typography, real clickable links (`<a href>`), action bar
  (Share · Done · Snooze · ↑↓ next/prev). Demo emails are short/plain — couldn't observe rich
  HTML/attachment rendering on demo data.

## D. Social Insights sidebar (003–009)
- A right sidebar **auto-renders a contact card for the selected message's sender**: avatar,
  email, location (Google Maps link), title/bio ("Founder & CEO…"), recent emails with you, and
  social links (LinkedIn / GitHub / X / AngelList / about.me / personal site). Dynamic per row.
- This is the closest thing to our GTM sidebar — but it's **social-only**, not CRM/deal-aware.

## E. Ask AI (021–022) — the AI core
- Left-panel **conversational assistant** (toggled by the "ai" icon); the inbox stays on the
  right (split layout). Input: **"Find, write, schedule, or ask anything…"**. Suggestions are
  how-to + integrations ("How do I create a Split Inbox?", "connect Salesforce?", "add team
  members?"). `Enter` to send · `Esc` to close · `Ctrl+Shift+J` new chat.
- Answers are **formatted markdown** (headings, numbered lists, inline-code for operators,
  bold), **product-grounded**, multi-section (steps + Quick shortcut + Mobile + Pro Tips).
- **Knowledge Base (Beta)**: "Add to the Knowledge Base" — you feed it custom knowledge that
  Ask AI uses (≈ AI memory / standing instructions).

## F. Read status, notifications, calendar (019, 020)
- **Recent Opens** sidebar: "see recently opened messages from you by people not on your domain"
  — read-status of YOUR sent mail by external recipients.
- **Latest Updates** widget: Share Availability (booking pages from your calendar), Quick Reply
  from mobile notifications, Reminders Split, Hide empty Split Inboxes.
- A "Calendar" split tab + calendar icon in the left rail.

## G. Speed / keyboard-first (every screen)
- A persistent bottom **command bar**: `E` Done · `H` Remind · `C` Compose · `/` Search ·
  **`Ctrl+K` = Superhuman Command** (the universal command palette).
- **"G then X"** go-to shortcuts down the left rail (G·i Inbox(8), G·S, G·D, G·T, G·E, G·H,
  G·; , G·!, G·#) — jump between splits/folders. Everything is keyboard-reachable.
- Aesthetic: minimal chrome, lots of whitespace, dark monospace command overlays, fast.

## H. What we BEAT them on (drives the specs)
1. **Context sidebar**: theirs = generic *social* card (LinkedIn/GitHub). OURS (INBOX-G01) =
   contact + company + **open deal + stage + signals + last interaction, each CITED** from our
   CRM graph (Lightfield recall + Monaco intel). Their sidebar stops where our moat starts.
2. **Auto Labels**: theirs = generic ("Pitch"). OURS = ICP/persona/**sequence-grounded** — we
   own the outbound graph, so "reply to your campaign" / "objection: pricing" is *correct*, and
   for non-sales mail we show an honest summary (INBOX-T08), not a guessed sales label.
3. **Ask AI**: theirs is product-help + a manual Knowledge Base. OURS = grounded in the CRM/
   pipeline with **citations** (INBOX-Q02/Q05) — "what deals are at risk?", answered from data.
4. **Sovereignty**: theirs = US SaaS on Google/MS only. OURS = self-hostable, IMAP/Zimbra/CalDAV,
   EU/CH residency, zero-retention AI (Pilae). A category they can't serve.
5. **Founder-led GTM**: theirs optimizes *speed*. OURS optimizes *revenue motion* — every triage,
   draft and reminder is tied to the deal and the next action.

## Patterns to STEAL (fold into specs)
- The **"if no reply" conditional snooze** → merge snooze + no-reply nudge into ONE control
  (revise INBOX-T05 + INBOX-T06 to be one picker).
- **Natural-language time input** everywhere (snooze, send-later, reminders) → INBOX-T05/C11.
- **Split Inbox = saved search + optional auto-label** → INBOX-T01 should be "saved-query lanes
  + AI-label lanes", creatable from a thread via the command palette.
- **Keyboard-first command bar + Cmd+K everything** → INBOX-K01/K02 are P0, not nice-to-have.
- **Conversational AI panel that keeps the inbox visible** (split layout) → INBOX-Q02 UX.
- **Knowledge Base** (user-fed standing knowledge) → INBOX-O02 (AI memory).
- **3-min do-it-yourself keyboard onboarding** → INBOX-O04.

## I. Ask AI = an AGENT (screenshot 028) — the key insight
Asked "write a follow-up to Sarah about a demo", Ask AI ran a **multi-tool agentic flow**
and showed its reasoning: (1) **look up Sarah in contacts**, (2) **analyze your tone/voice
style**, (3) **check your calendar availability** — "all at once". It then drafted the email
grounded in all three (real proposed dates "Wed June 17 / Thu June 18" from the open calendar,
a friendly low-pressure tone matched to the user), used a placeholder email because Sarah
wasn't in contacts (and SAID so), and offered **Send** / **Create Draft** + a plain-language
explanation of what it did and what to fix. So Ask AI is not a chatbot — it's an **agent that
composes by joining contacts + voice + calendar**, with transparent reasoning + an approval gate.

**This is the bar for our T4/T7.** Ours must do the same but grounded in the **CRM/deal graph
with citations** (not just contacts + calendar): draft the reply using the prospect's real
context (deal stage, last interaction, signals), propose times via our sovereign calendar,
and cite every fact. Superhuman joins contacts+voice+calendar; we join the **whole GTM graph**.
New/ळrevised specs: INBOX-C01 (voice draft) + INBOX-G08 (context-grounded draft) should be a
single **agentic compose** that shows its reasoning + sources and gates on approval.
