# INBOX-O06 — Per-feature autonomy settings hub
> Theme: T12 · Autonomy rung: agent (governs all rungs) · Priority: P1
> Pillar: cross (trust) / P4 triage

## User story
As a user, I want one place that lists every AI inbox feature and rule with its current autonomy
setting — Off / Suggest / Auto — plus its recent track record, so I can see at a glance what the
inbox is allowed to do on its own, dial each capability up or down as trust grows, and audit what
it has done.

## Why (audit anchor)
The audit's central thesis is the **autonomy spectrum** (passive filter → helper → proactive →
autonomous agent), and its design rule is: **ship every AI feature with an explicit autonomy dial
+ a visible "why" + an audit trail**, so the user can escalate trust — the Lightfield human-in-the-
loop spine (`ai-native-mailbox-audit.md` §1). Superhuman scatters these as individual on/off
toggles across Settings (Auto Drafts, Auto Archive, Auto Labels, Autocomplete, Reminders…) with
no unified trust ladder (`teardown-superhuman/feature-inventory.md` "Superhuman AI"). INBOX-T11
defines the **per-rule dial mechanism**; O06 is the **single hub** that surfaces every dial in one
audited, promotion-aware dashboard — the place a cautious founder (or a sovereign buyer) goes to
understand and control exactly how autonomous their inbox is.

## Requirements (EARS)
- The system SHALL present a single "Autonomy" hub listing every AI inbox capability and rule with
  its current rung: **Off / Suggest / Auto** (reusing the T11 `autonomy` field per rule).
- The hub SHALL group capabilities by area (Reading, Writing, Triage & rules, GTM) and show, per
  item, a one-line description, the current rung control, and a recent track record (actions taken,
  acceptance/undo rate) where the capability acts.
- WHEN the user changes a capability's rung in the hub, the system SHALL persist it to the same
  store that capability reads at runtime (T11 per-rule `autonomy`; per-user prefs for the rest), so
  the change takes effect on the next action — the hub is a *view over* the real settings, never a
  parallel copy.
- The hub SHALL default conservatively: AI-prompt / generative capabilities default to **Suggest**
  (or Off), deterministic ones MAY default to Auto, mirroring T11.
- The hub SHALL surface T11's **promotion offers** ("this rule has 20 accepted suggestions, 0
  dismissals — promote to Auto?") inline, and demotion is always available.
- The hub SHALL link to the **audit trail** (`inbox_rule_actions`) so the user can review what any
  Auto capability did, with the "why" and an undo where still reversible.
- The hub SHALL enforce the hard invariant that **no capability can auto-send email** from a triage
  rung (sending stays a separate, explicit decision) — Auto never means "send on its own".
- The hub SHALL be per-user + tenant-scoped: it shows and edits only the viewer's own dials and
  audit, and a "what changes the whole workspace vs. just me" distinction must be legible.
- The hub SHALL expose a single, prominent **"pause all autonomy"** control (drop everything to
  Suggest/Off) for when the user wants the inbox to stop acting — and a way to restore.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the Autonomy hub WHEN it loads THEN it lists every AI capability/rule grouped by area, each
  with an Off/Suggest/Auto control reflecting its real current rung.
- GIVEN an AI label rule shown as Suggest WHEN the user sets it to Auto in the hub THEN the rule's
  `autonomy` flips to `auto` and the next matching message is labeled automatically + audited.
- GIVEN a rule with 20 accepted / 0 dismissed WHEN viewed in the hub THEN a "Promote to Auto" offer
  appears (T11 acceptance-rate logic), and accepting promotes it.
- GIVEN an Auto capability that has acted WHEN the user opens its track record THEN they see the
  actions, each with a "why", and can undo those still reversible.
- GIVEN any capability WHEN the user inspects it THEN none offers an "auto-send" rung.
- GIVEN the user clicks "Pause all autonomy" WHEN confirmed THEN every Auto capability drops to
  Suggest/Off and the inbox stops acting until restored.
- GIVEN user A's dials WHEN user B opens the hub THEN B sees their own dials + audit, not A's.
- GIVEN a brand-new user WHEN they open the hub THEN generative capabilities are at Suggest/Off by
  default (conservative).

## Edge cases & failure handling
- A capability not yet built (spec exists, feature pending) → either hidden or shown disabled with
  "not available yet" — never a dead control that silently does nothing (mirror the settings-sidebar
  `ready:false` convention).
- The hub's value and the runtime value drift (e.g. a rule edited elsewhere) → the hub reads the
  live store on open and reflects external changes; it is not a cached snapshot.
- "Pause all" then add a new rule → the new rule still respects the conservative default; "restore"
  only re-raises capabilities the user had explicitly set, not everything.
- Partial save (one dial saves, another fails) → per-item optimistic save with per-item revert +
  notice; the hub never leaves the user unsure which dials actually changed.
- Large audit history → paginated, retained per the data-handling policy (INBOX-P03).
- Workspace-level vs. user-level settings mixed in one hub → label each clearly; writes go to the
  correct scope (some rules are per-user, some workspace; never silently change scope).
- Multi-tenant/per-user: hard scope on read, write, and audit.

## Best-in-class bar
- **One audited dashboard for the whole autonomy ladder**, with per-capability **track records and
  evidence-based promotion** — Superhuman's autonomy is a scatter of on/off toggles with no unified
  trust ladder and no acceptance-rate-driven promotion.
- A first-class **"pause all autonomy"** and a hard **never-auto-send** guarantee make the inbox
  safe to trust incrementally — the exact reassurance a founder-led / sovereign (Pilae) buyer needs
  before letting AI act on their mail.
- It is a **view over the real settings + audit** (no parallel state), so what the hub shows is
  precisely what the inbox will do — provenance and control in one place (the moat's trust layer).

## Design sketch
- **Data:** reuses T11's per-rule `autonomy` field (`inbox_filters.autonomy`, archive rules, nudge
  config) + the shared `inbox_rule_actions` audit table (per-user: `rule_id, conversation_key,
  action, rationale, confidence, taken_at, outcome`). Non-rule capability rungs (e.g. Auto-Draft on/
  off) live in `user_preferences` (resource `inbox`, key `autonomy`). No new store of record — the
  hub aggregates these.
- **API:** a read aggregator `GET /api/inbox/autonomy` returning every capability + its rung +
  recent track record (joins the per-rule `autonomy` + `user_preferences:inbox.autonomy` + audit
  summary from `inbox_rule_actions`); writes go through the existing per-rule update endpoints +
  `PUT /api/user-preferences`. Promotion offers via `lib/inbox/autonomy-promote.ts` (T11). "Pause
  all" = a batch write that sets every Auto rung to Suggest/Off (and remembers prior state to
  restore). Shared `lib/inbox/autonomy.ts` (T11) remains the single seam capabilities call at
  runtime; the hub never bypasses it.
- **UI:** a new `/settings/inbox-autonomy` page (register in the settings sidebar "Workspace"
  section, lucide `SlidersHorizontal`; consider `ready` gating until T11 ships). Surface =
  `SettingsHeader` + grouped `Card`s; each capability row = name + one-line description + a
  segmented **Off / Suggest / Auto** control (`--color-accent` active, same idiom as DisplayPanel/
  T11) + a small track-record stat (acceptance rate via `components/ai-ui/confidence-state` tones)
  + a "View activity" link to the audit. A prominent "Pause all autonomy" `Button` (variant
  outline/destructive) at the top. Tokens throughout (`--color-bg-card`, `--color-text-secondary`,
  `--color-accent-soft`). lucide: `SlidersHorizontal` (page), `ShieldCheck` (never-auto-send note),
  `History` (audit link), `Pause` (pause-all). No keyboard shortcut (settings). Light + dark via
  tokens, no emoji, no provider name, every Auto action cited + undoable.
- **AI:** no new model — O06 *governs* the autonomy of the AI features (T02/T06/T10/G11 + reading/
  writing); it inherits T11's never-auto-send + zero-retention (INBOX-P03) guarantees.
- **Security/perf:** per-user + tenant scope on read/write/audit; aggregator reads live values (no
  stale snapshot); per-item optimistic save + revert; audit paginated + retention-bounded.

## Tasks (ordered, each with a verify step + test to write)
1. `GET /api/inbox/autonomy` aggregator: list every capability + rung + track-record summary
   (per-rule `autonomy` + `user_preferences:inbox.autonomy` + `inbox_rule_actions` rollup).
   (verify: returns the full grouped list with current rungs) (test: `autonomy-hub.test.ts` —
   aggregation + scope)
2. `/settings/inbox-autonomy` page: grouped capability rows with Off/Suggest/Auto controls writing
   to the real per-rule / per-user stores (no parallel state). (verify: flip a rule to Auto here →
   runtime applies) (test: render + write routes to the correct store)
3. Inline promotion offers (T11 `autonomy-promote.ts`) + demotion. (verify: 20-accepted rule offers
   Promote in the hub) (test: promotion-offer surfaced)
4. "View activity" → audit trail with "why" + undo where reversible. (verify: browser — an Auto
   action shows its rationale + undoes) (test: audit link + undo)
5. "Pause all autonomy" batch + restore; conservative default for new capabilities. (verify: pause
   drops all Auto→Suggest; new rule still conservative) (test: pause/restore + default)
6. Enforce/display the never-auto-send invariant + per-user/tenant scope across the hub. (verify:
   no auto-send rung anywhere; B can't see A's dials) (test: guard + scope test)

## Current-state notes (VERIFY before building — code moves)
- **INBOX-T11 is the dependency and the mechanism**: it defines the per-rule `autonomy` field
  (`inbox_filters.autonomy` etc.), the shared `lib/inbox/autonomy.ts` `applyOrSuggest` seam, the
  `inbox_rule_actions` audit table, the approve/dismiss/undo endpoints, and `autonomy-promote.ts`.
  O06 is the **hub that surfaces all of it** — build/confirm T11 first. (`_specs/ai-native-inbox/
  INBOX-T11.md`.)
- **No autonomy/rule/audit infra exists yet** (grep `inbox_rule|autonomy` → none); O06 cannot ship
  before T11's tables/seam exist.
- Precedent to mirror: the **capture-approval mode** already implements suggest-vs-auto
  (`recordCapturedActivity` auto-insert vs queue-for-review; the live `/settings/capture-approvals`
  page in the settings sidebar) — the same human-in-the-loop pattern; the hub should feel
  consistent with it (and may surface capture autonomy too).
- Settings sidebar registration: add under the "Workspace" section of
  `app/(dashboard)/settings/settings-sidebar.tsx` (the `settingsNav` array, `ready` flag available
  to hide until T11 lands). The page uses `SettingsHeader` (`components/ui/settings-header.tsx`).
- Per-user non-rule rungs use `user_preferences` (`db/schema/auth.ts`, resource `inbox`, key
  `autonomy`) + `/api/user-preferences` — no migration for those.
- Confidence UI primitive exists: `components/ai-ui/confidence-state` (Verified/Likely/Inferred) for
  the track-record stat. The never-auto-send guarantee + zero-retention come from T11 + INBOX-P03.
