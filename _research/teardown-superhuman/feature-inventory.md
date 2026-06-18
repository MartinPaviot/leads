# Superhuman Mail — complete feature inventory (from Settings, 2026-06-16)

The Settings menu is the full feature surface. Captured verbatim (screenshot 023).

## Superhuman AI
- **Autocomplete** (toggle, ON) — intelligent autocomplete grounded in your history.
- **Autocorrect** — real-time typing correction.
- **Auto Archive** — AI auto-archives low-value mail.
- **Auto Drafts** — AI pre-writes full draft replies, unprompted, staged for you.
- **Auto Labels** — AI auto-classifies incoming mail (e.g. the "Pitch" label).
- **Auto Label Library** — catalog of built-in + custom auto-labels.
- **Knowledge Base** [BETA] — user-fed standing knowledge the AI uses (AI memory).
- **MCP** — Model Context Protocol: connect external tools/data sources to the AI.
- **Personalization** [BETA] — AI learns your voice/style/preferences.
- **Reminders** — follow-up reminders config.
- **Split Inbox** — smart lanes.
- **Split Inbox Library** — prebuilt + custom split definitions (search criteria + auto-labels).

## For Sales (CRM)
- **HubSpot** · **Pipedrive** · **Salesforce** — native CRM integrations.
- **Recent Opens** (toggle, ON) — read-status of your sent mail by external people.

## Learn
- Guides · Shortcuts · Tutorial · Attend Live Webinar · Quick Tips (toggle ON).

## My Account
- Add Accounts (multi-account) · Edit Profile · Theme · Achievements · Billing.

## My Team
- Add to Team · Talk to Sales (collaboration / shared inbox is team-tier).

## Calendar
- Calendar Accounts · **Meeting Links** · Timezones · **Scheduling** · Notifications.
  (Backs "Share Availability" booking pages + event-from-email + scheduling drafts.)

## Triage
- **Get Me To Zero** · **Bulk Actions** · Hide Empty Split Inboxes.

## Writing
- Emoji (`:` to insert) · **Signatures**.

## Workflow
- **Auto Advance** (jump to next after triage) · **Auto Bcc** (e.g. BCC your CRM) ·
  Blocked Senders · Downloads · Images (remote-image control) · **Instant Intro** ·
  **Out of Office Reply** · Redirect to Superhuman Mail · **Read Statuses** (toggle ON).

## Advanced
- Backtick as Escape · **Send + Mark Done** · **RSVP + Mark Done** (ON) ·
  Hide Comment Bar (team comments) · Show Sender Full Names.

---

## Map to our 12 spec themes (coverage check)
| Superhuman | Our theme/spec |
|---|---|
| Autocomplete | T4 INBOX-C05 (autocomplete grounded in history) |
| Autocorrect | T4 INBOX-C12 |
| Auto Archive | T2 INBOX-T10 / T01 |
| Auto Drafts | T4 INBOX-C03 |
| Auto Labels (+Library) | T2 INBOX-T02 (plain-English AI filters) + the badge T08 |
| Knowledge Base | T12 INBOX-O02 (AI memory) |
| **MCP** | T7 INBOX-G11 + a NEW spec: expose our CRM/inbox as MCP + consume MCP tools |
| Personalization | T12 INBOX-O03 (voice calibration) |
| Reminders / if-no-reply | T2 INBOX-T05+T06 (merge into one) |
| Split Inbox (+Library) | T2 INBOX-T01 (saved-query + auto-label lanes) |
| For Sales: HubSpot/Pipedrive/Salesforce | T7 — but we're NATIVE CRM, not an external sync (moat) |
| Recent Opens / Read Statuses | T10 (read status) |
| Calendar: Meeting Links / Scheduling | T9 INBOX-CAL01..05 (we add sovereign visio) |
| Get Me To Zero / Bulk Actions | T2 INBOX-T09 (bulk triage) |
| Instant Intro | T6 (instant intros) |
| Out of Office | T4 / T2 |
| Signatures / Emoji | T4 compose ergonomics |
| Auto Advance | T6 keyboard flow |
| Auto Bcc (CRM) | T7 INBOX-G02 (we auto-capture natively, no BCC hack) |
| Team comments / Add to Team | T8 collaboration |

## Gaps this revealed in OUR catalog (specs to ADD)
- **INBOX-G13 — MCP server + client**: expose Elevay's inbox/CRM as an MCP server AND let the
  inbox AI consume MCP tools (Superhuman has MCP; we should too, natively GTM-grounded).
- **INBOX-T12 — "Get Me To Zero"**: a guided inbox-zero flow.
- **INBOX-C13 — Out-of-Office auto-reply** (AI-generated, sequence-aware).
- **INBOX-O07 — Achievements / habit loop** (Superhuman gamifies speed; optional).
- **INBOX-R14 — Remote-image control** ("Images" setting) — already implied by R02/R07, make explicit.
