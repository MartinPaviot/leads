# Superhuman — AI feature deep-dive (from Ask AI's own sourced docs, 2026-06-16)

Captured by asking Ask AI to document its features — it returned sourced help-doc
content (links to help.superhuman.com). Verbatim-faithful summary.

## MCP (Model Context Protocol) — Business+
Superhuman runs an **MCP Server**: external AI tools (Claude Desktop, Claude Code,
ChatGPT, Cursor, Gemini) connect to your inbox + calendar and can:
- search emails/calendar in natural language
- **draft replies in your voice and tone**
- send emails (Smart Send / Scheduled Send / Undo Send)
- create/update calendar events; find availability
- summarize emails and tasks
- manage labels, threads, read statuses, attachments
- (drafts created via MCP land in your Superhuman drafts folder)
**Pre-built Skills** (schedulable workflows): Morning Briefing · End-of-Day Wrap-Up ·
**Batch Draft Writer** · **Deal Tracker** (summarizes comms history with a contact/
company) · Meeting Scheduler. → *Superhuman is both an MCP SERVER and ships agent skills.*

## Personalization — Business/Enterprise (needs Ask AI)
Explicitly teach the AI how you write. Five sections: **Greeting & Signoff** · **Writing**
(tone, length, formatting) · **Scheduling** (how you share availability) · **Events**
(invite defaults) · **About Me** (location, key coworkers, context, + a **Knowledge Base**
for personal/company info). Per-account (not shared).

## Auto Labels — all plans (custom AI-prompt labels Business+)
Categorize incoming mail by content/subject/sender/recipients. Applies to new mail + last
14 days. **Auto Label Library** = 12+ prebuilt (e.g. "emails needing your response",
invoices, scheduling requests). Custom: Cmd+K → New Auto Label → deterministic criteria
(From/To/Subject) OR an **AI prompt**, AND/OR, exclusions, and a **live preview panel
where you click ✔/✖ on results to refine accuracy**. Max 10 AI-prompt labels.

## Auto Archive — all plans (needs Superhuman AI)
Emails matching a configured Auto Label skip the inbox → Auto Archived folder
(forward-only). Targets: marketing, cold pitches, social updates, or any label. Plus
**Always Archive / Never Archive** address/domain lists.

## Superhuman for Sales — CRM (Salesforce / HubSpot / Pipedrive) — Business/Enterprise
- **Salesforce**: view contacts/leads/accounts/opportunities in the sidebar, **update
  records** without leaving, auto-log emails via **Auto-Bcc**.
- **HubSpot**: view contacts/companies/deals in the sidebar (hover a recipient), customize
  objects/properties, **update records**, auto-log via Auto-Bcc.
- **Pipedrive**: view Persons/Companies/Deals, customize fields, auto-log via Auto-Bcc
  (desktop only, no record editing).
- **Mechanism = a sidebar VIEW + record update + Auto-Bcc logging.** It is an external
  CRM *integration*, NOT a native CRM. **OUR MOAT**: we ARE the CRM — the sidebar is our
  own deal/signal/last-interaction graph with citations, capture is native (no BCC hack),
  and the AI is grounded in it.

## AI-assisted REPLY behaviour (the focus — screens 033–034)
Asked "draft a reply to this email…", Ask AI:
1. **Checks your writing style first** ("Let me check your writing style for this reply
   before drafting it…"), and matches the **counterparty's tone** ("founder-to-founder…
   casual and warm tone, I'll keep it short and friendly").
2. Drafts a **thread-grounded** reply: header "Replying to: <subject>", **To auto-filled**
   from the thread (zeno.rocha@resend.com), answers the sender's actual question, and knows
   the user's company ("Elevay") from account context/Personalization.
3. Offers **Send** / **Insert Draft** (insert into the reply composer to edit) + a plain
   explanation of what it did.
- Open-thread shortcuts: **`i` = summarize** (Auto Summarize), **`Enter` = reply all**,
  `Ctrl+K` = command. Sidebar shows quick-action buttons (e.g. "Refer" / "no thanks").
- Team: a comment bar ("@mention anyone and share conversation") on the thread.

## The bar this sets for OUR specs (T3/T4/T7)
- **Agentic reply**: read thread → check user voice + counterparty tone → draft grounded
  → show reasoning → gate on approval (Send/Insert). Ours adds **CRM/deal grounding +
  citations** + sovereign scheduling.
- **MCP**: we should ship an MCP server (expose our GTM-grounded inbox/CRM) AND agent
  Skills (a "Deal Tracker"/"Morning Briefing" equivalent, but revenue-native). → new spec.
- **Auto Labels live-preview refine (✔/✖)** is a great UX for our AI-filter spec (T02).
- **Auto Archive forward-only + Always/Never lists** → fold into T2.

## The FULL AI-reply flow, captured end-to-end (screens 033–038)
1. **Auto Summarize** (`i`): the thread collapses to a one-line **TL;DR** at the top
   ("Zeno Rocha introduces Resend and offers tips") with a chevron → detailed summary.
   *Understand the thread before replying.*
2. **Ask AI contextual reply**: checks **your** writing style first, **matches the
   counterparty's tone**, drafts a **thread-grounded** reply (auto `To:`, answers their
   actual question, knows your company), offers **Send / Insert Draft** + explains itself.
3. **Reply composer**: **Send · Smart Send · Remind me · Share draft** + a **comment bar**
   ("@mention anyone and share conversation") + **Replace Draft** (regenerate from Ask AI).
4. **In-composer AI rewrite** (the composer "ai" icon): selects the draft, opens a
   free-form **"Describe how to edit the text"** box + one-click **Improve writing · Fix
   spelling and grammar · Shorten · Lengthen · Simplify · Rewrite (tone)**.

**OUR bar (T3 read + T4 reply + T7 moat):** same four-step flow, but:
- the draft is grounded in the **deal/contact/signal/last-interaction graph WITH
  CITATIONS** (not just contacts+calendar), and answers using the prospect's real context;
- summaries cite their source messages;
- rewrite presets include **GTM-aware** ones ("tie to their pain", "add the case study",
  "propose the next step / book the demo"), and the suggested reply respects the deal stage;
- "Smart Send"/"Remind me" map to our sequence + no-reply-nudge engine;
- sovereignty: the whole flow runs on self-hostable infra with a zero-retention AI option.
