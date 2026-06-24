# PROGRESS — autonomous spec backlog (00 → 34)

Control channel: **CLI (option A)**. SAFE_MODE: **ON** (no real sends; all routed to test inboxes). Spend cap: 20 EUR-equiv/provider before approval.

## Spend
| Provider | Spent | Notes |
|---|---|---|
| Apollo | 0 | 1839 unified + 4000 lead + 800k AI credits available |
| (all others) | 0 | — |

## Specs
| # | Spec | Status |
|---|---|---|
| 00 | canonical-data-model | **built + verified; PR open (CI/preview pending)** |
| 01 | provider-adapter-framework | next |
| 02–34 | … | queued |

## Decisions (reversible, decided autonomously)
- **spec-00**: authored the missing `data-contract.md`; alias-in-place (`companies`=Account, `contacts`=Contact, `tenant_id`=workspace_id); AC5 via a `requireWorkspace` guard, not a global RLS flip; OutreachLead deferred to specs 03/04.

## Provider access (from preflight)
- OK: GitHub, Vercel, Supabase (dev), Playwright, Apollo, Inngest keys, Pappers key.
- Alternatives in use (no paid account needed yet): Zefix public API + datagouv MCP (registry), MX+SMTP self-verify + Apollo confidence (email verification), adapter+stub under SAFE_MODE (Instantly/HeyReach), free token at-spec (HubSpot/Slack).
- Email send: non-functional (Resend 401, Gmail MCP read/draft only) → control channel is the CLI.

## Blocked on approval (email-gated)
- SAFE_MODE → LIVE (first real sends) — at spec 21.
- Prod destructive/data migrations — prod `0083` apply before merging spec 00 to a prod-deployed state.
- Spend over per-provider cap.
- Go-live paid accounts: Instantly (warmed domains), HeyReach/LinkedIn, paid email verifier.
