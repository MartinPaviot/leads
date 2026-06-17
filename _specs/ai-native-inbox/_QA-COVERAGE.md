# AI-Native Inbox — QA coverage matrix

> Generated QA pass over the spec suite. Verifies completeness, structure, convention
> compliance, and traceability. Re-run the checks in `README.md` Status after any edit.

## Verdict

**101 / 101 specs — PASS.** All structural, convention, and traceability checks green.

| Check | Result |
|---|---|
| Specs present | 101 / 101 (catalog complete, IDs contiguous 1..N per theme) |
| Template sections (11 each) | 101 / 101 complete |
| EARS `SHALL` requirements | 101 / 101 |
| GIVEN/WHEN/THEN acceptance | 101 / 101 |
| No emoji in UI | 101 / 101 (T02 `✔/✖` shorthand → plain words + lucide `Check`/`X`) |
| No provider names in UI copy | 101 / 101 (3 matches were the rule being *enforced*, not leaked) |
| Anchored to audit/teardown | 101 / 101 |
| Cites real code (file paths) | 101 / 101 (97 dir-prefixed + 4 bare filename) |
| UI trailer (tokens/lucide/shortcut/light+dark) | 101 / 101 (3 hand-written exemplars brought up to par) |

## Distribution

- **Priority:** P0 41 · P1 47 · P2 13
- **Autonomy rung:** passive 27 · helper 53 · proactive 17 · agent 4
- **Autonomy is opt-in:** only 4 specs reach the `agent` rung; the suite defaults to passive/helper with a per-feature dial (INBOX-T11/O06).

## Coverage matrix (by theme)

### T1 — Rendering & fidelity (13)
| ID | Title | Pri | Rung |
|---|---|---|---|
| R01 | Sanitized HTML body rendering | P0 | passive |
| R02 | Inline images + remote-image privacy proxy | P0 | passive |
| R03 | Safe clickable links (rewrite, hover-preview, phishing warn) | P0 | helper |
| R04 | Attachments: list, inline preview, download | P0 | passive |
| R05 | Quote/signature collapse & thread folding | P1 | helper |
| R06 | Sender identity (avatar / company logo / verified domain) | P1 | helper |
| R07 | Tracking-pixel blocking (default-on) | P0 | passive |
| R08 | Dark-mode email rendering | P1 | passive |
| R09 | Plaintext & malformed-MIME graceful fallback | P1 | passive |
| R10 | Unicode / RTL / emoji correctness | P1 | passive |
| R11 | Large-email & long-thread virtualization (perf) | P1 | passive |
| R12 | Calendar invite (.ics) inline render + RSVP | P1 | helper |
| R13 | Capture: retain full HTML + text at ingestion | P0 | passive |

### T2 — Triage, lanes & rules (11)
| ID | Title | Pri | Rung |
|---|---|---|---|
| T01 | Smart lanes / Split Inbox (saved-query + auto-label lanes) | P1 | passive |
| T02 | Plain-English AI filters (label / star / archive) with live preview | P1 | proactive |
| T03 | Newsletter & promo bundles + bulk triage | P2 | proactive |
| T04 | AI importance / priority score | P1 | helper |
| T05 | Snooze + AI-suggested resurface time (unified "if no reply" control) | P1 | helper |
| T06 | Follow-up / no-reply nudge reminders (the "if no reply" engine) | P1 | proactive |
| T07 | One-click unsubscribe + block | P2 | helper |
| T08 | Replace the sales-label badge with an honest AI one-liner | P0 | helper |
| T09 | Bulk keyboard triage (multi-select actions) | P1 | passive |
| T10 | Auto-archive / done + computed reopen (extend existing lanes) | P2 | proactive |
| T11 | Per-rule autonomy dial (suggest → auto) | P1 | agent |

### T3 — AI reading & summarization (9)
| ID | Title | Pri | Rung |
|---|---|---|---|
| S01 | Per-thread summary with citations | P0 | helper |
| S02 | Per-message summary (top of email) | P0 | helper |
| S03 | Catch-me-up digest (since last seen) | P1 | proactive |
| S04 | Action-item / todo extraction | P1 | helper |
| S05 | Entity extraction (people / companies / dates / amounts) | P1 | helper |
| S06 | General intent & sentiment (not sales-only) | P0 | helper |
| S07 | Attachment summarization (PDF / doc) | P2 | helper |
| S08 | Long-thread TL;DR + key decisions | P1 | helper |
| S09 | "Why this matters" rationale line (replaces cryptic badge) | P0 | helper |

### T4 — AI compose & reply (12)
| ID | Title | Pri | Rung |
|---|---|---|---|
| C01 | Voice-matched full draft (agentic compose) | P0 | helper |
| C02 | Instant one-tap replies (3 suggestions) | P0 | helper |
| C03 | Auto-draft (pre-written, staged for approval) | P0 | proactive |
| C04 | Rewrite commands (free-form + GTM presets) | P0 | helper |
| C05 | Intelligent autocomplete grounded in your history | P1 | helper |
| C06 | Snippets / templates with variables + CC/BCC + attachments | P1 | helper |
| C07 | Draft from bullet points | P1 | helper |
| C08 | Translate / multi-language compose | P1 | helper |
| C09 | Follow-up generator (sequence-aware) | P0 | proactive |
| C10 | Scheduling-email drafter (real open slots, sovereign visio) | P0 | proactive |
| C11 | Undo send + send later (Smart Send) | P0 | helper |
| C12 | Inline grammar / autocorrect | P1 | helper |

### T5 — Search & Ask-AI (cited) (8)
| ID | Title | Pri | Rung |
|---|---|---|---|
| Q01 | Natural-language semantic search | P0 | helper |
| Q02 | Ask-AI over the whole inbox with citations | P0 | helper |
| Q03 | Search over attachments | P1 | helper |
| Q04 | Search operators + saved searches | P1 | helper |
| Q05 | Cross-entity search (inbox × CRM) | P0 | helper |
| Q06 | "Find that file/attachment" intent | P1 | helper |
| Q07 | Ask-AI scoped to a single thread | P0 | helper |
| Q08 | Web-grounded fresh-fact answers (gated, zero-retention) | P2 | helper |

### T6 — Speed & keyboard-first (7)
| ID | Title | Pri | Rung |
|---|---|---|---|
| K01 | Command palette (Cmd+K / Ctrl+K) — Elevay-light "Superhuman Command" | P0 | passive |
| K02 | Full keyboard shortcut map + cheatsheet | P0 | passive |
| K03 | Zero-latency optimistic UI | P0 | passive |
| K04 | Instant navigation / prefetch | P1 | passive |
| K05 | Quick-switch accounts / mailboxes | P1 | passive |
| K06 | Keyboard triage flow (j/k/e/#/r; mirror E/H/C/ / + G-then-X go-to) | P0 | passive |
| K07 | Customizable shortcuts | P2 | passive |

### T7 — GTM/CRM augmentation (moat) (13)
| ID | Title | Pri | Rung |
|---|---|---|---|
| G01 | Contact / company / deal sidebar with citations | P0 | helper |
| G02 | Auto-capture to CRM (approval-gated, human-in-the-loop) | P0 | proactive |
| G03 | Last-interaction + relationship timeline (cited) | P0 | helper |
| G04 | Signal surfacing (funding / hiring / intent) in-thread (freshness-gated, cited) | P1 | helper |
| G05 | Suggested next action tied to deal stage | P1 | proactive |
| G06 | Collision awareness (teammate already engaged) | P1 | helper |
| G07 | Sequence-reply linking + reply classification | P0 | proactive |
| G08 | Drafts grounded in the prospect's real context (composes with C01) | P0 | helper |
| G09 | Create / advance a deal from a reply | P1 | proactive |
| G10 | Meeting-booked → CRM + sovereign visio | P1 | proactive |
| G11 | Autonomous triage rules tied to ICP / persona | P1 | agent |
| G12 | Voice-of-customer rollup across threads | P2 | proactive |
| G13 | MCP server + agent Skills (GTM-grounded inbox/CRM) | P1 | agent |

### T8 — Collaboration & shared inbox (6)
| ID | Title | Pri | Rung |
|---|---|---|---|
| X01 | Shared inbox + per-message assignment | P1 | helper |
| X02 | Team comments / @mentions (private) | P1 | helper |
| X03 | Shared threads (live presence) | P2 | helper |
| X04 | Shared labels / AI-searchable archive | P2 | helper |
| X05 | Shared snippets & AI prompts | P2 | helper |
| X06 | Handoff + internal notes | P1 | helper |

### T9 — Calendar & scheduling (5)
| ID | Title | Pri | Rung |
|---|---|---|---|
| CAL01 | Inline availability insertion (Share-Availability equivalent) | P0 | helper |
| CAL02 | One-click book / event-from-email | P0 | helper |
| CAL03 | AI meeting scheduler (end-to-end, sovereign) | P0 | proactive |
| CAL04 | RSVP / reschedule from the inbox | P1 | helper |
| CAL05 | Sovereign visio link injection | P1 | helper |

### T10 — Notifications, focus & digests (5)
| ID | Title | Pri | Rung |
|---|---|---|---|
| N01 | Smart notifications (only what's important) | P1 | helper |
| N02 | Morning brief + end-of-day wrap digest | P1 | proactive |
| N03 | Do-not-disturb / focus mode | P2 | helper |
| N04 | No-reply / SLA-breach alerts | P1 | proactive |
| N05 | Mobile parity (responsive inbox + Quick-Reply-from-notification) | P2 | helper |

### T11 — Privacy, security, sovereignty (6)
| ID | Title | Pri | Rung |
|---|---|---|---|
| P01 | Tracking-pixel & remote-content controls (the "Images" setting) | P0 | passive |
| P02 | Link-safety / phishing warnings | P0 | passive |
| P03 | AI data handling & opt-out (zero-retention) | P0 | passive |
| P04 | Data residency / sovereign hosting (Pilae) — self-hostable inbox + AI | P0 | passive |
| P05 | Per-user isolation & tenant-scoping audit (close the inbox read-scope gap) | P0 | passive |
| P06 | Citations & provenance everywhere ("via Elevay", never a vendor) | P0 | passive |

### T12 — Onboarding & personalization (6)
| ID | Title | Pri | Rung |
|---|---|---|---|
| O01 | Connect mailbox (Google / Microsoft / IMAP / Zimbra) | P0 | passive |
| O02 | AI memory / standing instructions | P1 | helper |
| O03 | Voice / tone calibration | P1 | helper |
| O04 | Interactive keyboard tutorial / onboarding | P1 | passive |
| O05 | Customizable layout / themes / density | P2 | passive |
| O06 | Per-feature autonomy settings hub | P1 | agent |
