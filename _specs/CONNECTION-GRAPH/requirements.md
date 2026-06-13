# CONNECTION-GRAPH — warm-path from the founder's LinkedIn network × ICP

**Status**: DORMANT INFRA — built, tested, NOT in production. No Unipile call, no migration applied, branch unmerged.
**Source**: session research on Unipile + the warm-path thread; audit `_research/monaco-sam-blond-comparaison-expert-2026-06-12.md` (founder-sender doctrine §17, the durable-asset bucket).

## Problem
The strongest outreach is a warm intro, not a cold touch. The founder's own LinkedIn network is a warm-path goldmine that nothing in the product uses today: we have an investor-overlap warm path (`investor_overlap` signal) and the messaging angle (`common_investor`, PR #203), but no graph of the founder's actual connections mapped to ICP accounts.

## User story
As a founder, the system reads my LinkedIn connections (via a connected account), maps them to the accounts in my ICP, and tells me (a) which ICP-fit accounts I already have an insider at, and (b) for a cold target, who in my network can introduce me — so I reach warm whenever possible.

## Acceptance criteria (EARS)
1. WHILE `LINKEDIN_GRAPH_ENABLED` is not "true", THE SYSTEM SHALL expose no provider and run no ingestion — the production posture (verified by gating tests).
2. WHEN a provider returns a relation, THE SYSTEM SHALL normalise its network distance to {first, second, third, out_of_network}, failing safe to out_of_network on unknown values.
3. WHEN a relation's employer is given, THE SYSTEM SHALL resolve it to a CRM company by domain (then exact normalised name), and SHALL leave it unresolved (null) rather than fuzzy-guess.
4. WHEN the founder's first-degree, company-resolved edges include companies with primary-ICP fit ≥ threshold, THE SYSTEM SHALL surface them as ranked warm assets ("you're connected to N people at ICP accounts").
5. WHEN the founder has a first-degree connection working at a target account, THE SYSTEM SHALL classify the account warm path as `insider` with a strength ≥ all intro paths.
6. WHEN shared-connection data is available for a cold target, THE SYSTEM SHALL classify an `intro_path`, naming only connectors that are also the founder's own first-degree connections (degrading to a count-based strength when the plan exposes only a count).
7. WHEN ingesting relations, THE SYSTEM SHALL drip across pages, stop at a page budget OR when the provider signals a rate limit, and persist a resume cursor — never a one-shot pull.
8. THE SYSTEM SHALL keep the graph PERSONAL (per LinkedIn-account owner), never a shared tenant resource.
9. IF the Unipile provider is selected without its env config, THE SYSTEM SHALL throw — never silently no-op into a live call.

## Out of scope (this PR)
UI/API surfaces, feeding warm strength into `priorityScore`, the connect-account OAuth flow, the daily drip cron, the per-target shared-connection fetch loop, DB-backed Inngest wiring. All are unblocked by this infra; none ship until Unipile is integrated.

## Prerequisites the USER must hold (documented, not enforced here)
A connected LinkedIn account. Free/Premium → 1st-degree overlay only (throttled). **Sales Navigator (~€80-100/mo)** → intro paths + ICP search at throughput. Unipile is OUR infra cost (~€5/account), never the user's.

## Open question for the integration spike
Does the provider's relations list return employer+title per connection (cheap 1st-degree) or require a per-profile call (rate-limit bound)? This determines ingestion cost — measure against a real account before enabling.
