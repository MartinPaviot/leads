# B4 — inbox-noise-classifier · Tasks

**Total estimate: ~5.5 dev-days (11 half-day units).** 12 tasks.
Branch: feat/inbox-noise-classifier. Deps: C1 (eval gate, shipped), B3 (splits —
consumes the noise flag + count; B4 ships them so B3 is unblocked).

Each task: ID · tag · action · verify step · test to write · requirement refs.
Order is executable: pure core first (testable with zero wiring), then store,
then read-model wire-in, then route, then optional Gmail shim, then the gate,
then UI.

Tags: [NEW] real gap · [LOCKED] stack decision · [HORS SCOPE] tracked elsewhere.

---

## B1.1 — classifyNoise pure resolver  · [NEW] · 1 unit (0.5d)

Action: add src/lib/inbox/noise.ts exporting classifyNoise(input): { noise,
reasons } with the decision order in design section 2 (KEEP guards first:
overridden, replyWorthy-and-human, hasPriorHumanReply; then machine, no-reply
intent (four families), bulk-and-not-replyWorthy, tier-4-cold; default KEEP).
Pure: no DB/network/LLM/clock. Import GeneralIntent from ./general-intent.

Verify: open a node REPL / vitest and assert a machine-sent input returns
noise:true and a replyWorthy human input returns noise:false.

Test (src/lib/inbox/__tests__/noise.test.ts): table-driven over every branch —
(a) replyWorthy+human -> keep; (b) hasPriorHumanReply -> keep even when bulk;
(c) machine-sent -> noise; (d) each of the four no-reply intents -> noise;
(e) invoice_billing / security_account -> KEEP (the deliberate divergence);
(f) bulk+!replyWorthy -> noise; (g) tier-4+cold+!replyWorthy -> noise;
(h) overridden -> keep over every signal; (i) ambiguous default -> keep.

Refs: R1.1–R1.10.

---

## B1.2 — classifyNoise edge-case + cardinal-sin tests  · [NEW] · 1 unit (0.5d)

Action: extend the unit suite with the recall-bias edge cases: bulk-flagged but
replyWorthy stays kept (R1.2 > R1.6); tier-4 but replyWorthy stays kept; null
generalIntent + not bulk + not machine stays kept; reasons array is populated and
human-readable for every branch.

Verify: run pnpm test src/lib/inbox/__tests__/noise.test.ts — all green; print
the reasons for a couple of cases to confirm they are product-language.

Test: assertions on result.reasons content + the precedence edge cases above.

Refs: R1.2, R1.6, R1.7, R1.8, R1.9.

---

## B2.1 — not-noise override store  · [NEW] · 1 unit (0.5d)

Action: add src/lib/inbox/noise-override-store.ts with getNoiseOverrides(userId)
and saveNoiseOverrides(userId, overrides) over user_preferences (resource
"inbox", key "noiseOverrides"), modeled on filter-store.ts. Add a pure
addOverride(existing, entry) (dedupe by sender, latest wins, cap 1000, oldest
evicted) and noiseOverrideMatches(overrides, sender, threadKey). Corrupt/non-array
value degrades to [].

Verify: in a scratch script, save an override for a userId, read it back, confirm
owner-scoping (a different userId reads []).

Test (src/lib/inbox/__tests__/noise-override-store.test.ts): pure addOverride +
noiseOverrideMatches — dedupe, cap+evict, sender match (case-insensitive),
thread-only match, corrupt-value -> []. (Store I/O covered by the route test.)

Refs: R3.1, R3.4, R3.5, R3.7; edge: corrupt value.

---

## B3.1 — wire noise into buildConversations  · [NEW] · 1 unit (0.5d)

Action: in src/lib/inbox/conversations.ts, after replyWorthy (:455): derive
hasPriorHumanReply (g.outbound.length > 0 AND not inboundIsAutomated, design
section 5); accept an optional overrides param on buildConversations (default []);
call classifyNoise(...); add noise: boolean to the Conversation interface and the
pushed object; when noise AND lane === "attention", set importanceTier=4 /
importanceScore=0 and exclude it from the attention lane.

Verify: build a fixture with one bulk-human conversation + one replyWorthy human;
assert the bulk one has noise:true and is not in the attention lane, the human one
has noise:false and stays in attention.

Test (extend src/lib/inbox/__tests__/conversations.*.test.ts): the noise flag +
attention exclusion + importance floor; a noisy thread that gains a replyWorthy
inbound re-promotes on rebuild (recompute-every-read).

Refs: R2.1, R2.2, R2.3, R2.6; R2 edge cases.

---

## B3.2 — noise count + laneCounts  · [NEW] · 1 unit (0.5d)

Action: expose a noise count. Compute it in conversations/route.ts over the
visible set (visible.filter(({c}) => c.noise).length) and add it to the counts
object returned at route.ts:209; optionally extend laneCounts to carry it for
callers that use the pure builder directly.

Verify: hit GET /api/inbox/conversations in dev (or a route unit test) and confirm
counts.noise reflects the demoted set.

Test (extend the route/laneCounts test): counts.noise equals the number of
noise:true visible conversations; selecting a mailbox narrows it.

Refs: R2.4.

---

## B4.1 — POST /api/inbox/noise route (not-noise + undo)  · [NEW] · 1 unit (0.5d)

Action: add src/app/api/inbox/noise/route.ts. POST body { conversationKey,
sender, action: "not_noise" | "undo", persistGmail?: boolean } (zod-validated,
422 on bad body, 401 on no auth) — getAuthContext, owner-scoped. "not_noise" adds
an override (addOverride) + saves; "undo" removes the sender override + saves.
DELETE ?sender= as an alias for undo. Mirror the auth + validation shape of
api/inbox/triage/route.ts and api/inbox/filters/route.ts.

Verify: curl/Playwright POST not_noise for a sender, GET conversations, confirm
that sender now reads noise:false and is back in attention; POST undo, confirm it
demotes again.

Test (src/app/api/inbox/__tests__/noise-route.test.ts or an integration test):
401 without auth; 422 on bad body; not_noise then undo round-trips the override;
override is owner-scoped (another user unaffected).

Refs: R3.1, R3.2, R3.3, R3.6, R3.4.

---

## B4.2 — override applied in the read route  · [NEW] · 1 unit (0.5d)

Action: in conversations/route.ts, load getNoiseOverrides(authCtx.userId) and
pass them into buildConversations; add noise to each serialized row (route.ts
:184-208). Confirm an overridden sender resolves noise:false (override wins,
R3.2) and is restored to attention with real importance (R3.3).

Verify: with an override stored, GET conversations and assert the row.noise is
false and the conversation is in the attention lane with a non-floored
importanceTier.

Test (extend the route test): overridden sender -> noise:false in the serialized
payload AND in the attention lane; removing the override re-demotes.

Refs: R3.2, R3.3; serialization of the noise field.

---

## B5.1 — Gmail-filter persistence shim (scope-gated, best-effort)  · [NEW] · 1 unit (0.5d)

Action: add src/lib/integrations/gmail-filters.ts exporting persistNoiseFilter
(userId, sender): Promise<PersistResult> and removeNoiseFilter(userId, filterId).
Capability check: provider must be "gmail" (connected_mailboxes.provider) AND the
account must carry a filter-write scope; otherwise return the typed no-op
({ scope_not_granted | provider_unsupported | not_connected }). Never throw. On
capability, create a skip-INBOX + apply-label filter via
gmail.users.settings.filters.create and return { persisted:true, filterId }. Wire
persistGmail===true in the POST handler to call it best-effort and store
gmailFilterId on the override (undo deletes it).

Verify: with the current readonly scope, call the shim and confirm it returns
{ persisted:false, reason:"scope_not_granted" } and does NOT throw; the in-app
demotion override still works.

Test (src/lib/integrations/__tests__/gmail-filters.test.ts): injected
client/provider fixtures — readonly scope -> scope_not_granted; non-gmail provider
-> provider_unsupported; no mailbox -> not_connected; (mocked) capable client ->
persisted:true with the create call asserted; thrown provider error -> { error }.

Refs: R4.1, R4.2, R4.3, R4.4, R4.5. (Note: live persistence is [HORS SCOPE] until
the gmail.settings.basic scope is granted — src/auth.ts:247 is readonly today.)

---

## B6.1 — falseDemoteRate + noisePrecision metric helpers  · [NEW] · 1 unit (0.5d)

Action: add to src/lib/evals/inbox-metrics.ts two pure helpers beside
replyWorthyPR: falseDemoteRate(cases) = (keep-worthy items predicted noise) /
(all keep-worthy items), and noisePrecision via the positive-class=noise
confusion (reuse the replyWorthyPR pattern with noise as the positive label, or a
thin noisePR). Empty denominator scores the safe value (0 for false_demote_rate,
1 for precision) and support is asserted by the gate so it cannot mask a gap.

Verify: unit-call both with hand cases; a single demoted keep-worthy item yields
false_demote_rate > 0.

Test (extend src/lib/evals/__tests__/inbox-metrics.test.ts): falseDemoteRate is 0
on perfect agreement, rises with each false demote; noisePrecision drops with a
false positive; empty-denominator behavior; support reflects count.

Refs: R5.2; mirrors inbox-metrics.ts:41-55.

---

## B6.2 — inbox-noise golden fixture + gate test, wired to eval:run  · [NEW] · 1 unit (0.5d)

Action: add src/lib/evals/fixtures/inbox/inbox-noise.golden.jsonl (>=40
hand-labeled cases: machine, four no-reply intents, bulk-not-replyWorthy,
tier-4-cold, AND the keep cases — replyWorthy human, prior-human, OTP/invoice,
ambiguous-default — balanced >=8 of each label, unique ids, taxonomy-valid). Add
src/__tests__/inbox-noise-gate.test.ts mirroring inbox-reply-worthy-gate.test.ts:
fixture-integrity block + gate block asserting false_demote_rate <= 0.02 AND
noise.precision >= 0.90, a report-card line (support/precision/false_demote_rate/
misses), and a hard-fail naming any false-demoted keep-worthy case. Append the
test path to package.json eval:run.

Verify: run pnpm eval:run — the new gate is listed, runs with NO ANTHROPIC_API_KEY,
prints the report card, and is green at the thresholds.

Test: the gate test IS the test (it runs classifyNoise over the golden set).
Add an integrity assertion: any golden line whose expected=keep is hard-checked
against a false demote.

Refs: R5.1, R5.3, R5.4, R5.5, R5.6; thresholds [LOCKED] from
_specs/inbox-quality-evals/design.md:57-58,116.

---

## B7.1 — Noise lane chip + Not-noise affordance (G-design)  · [NEW] · 1 unit (0.5d)

Action: render the Noise chip using LaneChip + CountBadge (F1 _lane-chip.tsx) fed
by counts.noise, and a one-click "Not noise" quick-action on demoted rows using
the shared Button / existing quick-action affordance, posting to /api/inbox/noise.
Show a "why" tooltip from classifyNoise reasons (honest-badge pattern,
reasonTooltip in _types.ts:98-113). The Noise lane VIEW route itself is B3 (NG-1);
B4 supplies the chip count + the row affordance + the tooltip. Optimistic update
+ undo toast.

Verify: in the live app, demote a bulk sender appears under Noise count; click
"Not noise" -> it returns to attention; hover -> the why tooltip shows the reason.
Run the F1 12-item G-design checklist and record one PASS/FAIL line per item here.

Test (component test): the row renders the Not-noise action only when noise:true;
clicking calls the POST with the right body; the tooltip text equals the first
reason. Plus the F1 tokens.contract.test.ts passes for any new markup.

Refs: R6.1, R6.2, R6.3, R6.4.

G-design checklist (record result, design-system section 8):
1 tokens-only · 2 one-gradient · 3 one-button-system · 4 type-scale ·
5 density · 6 radius-family · 7 elevation-tokens · 8 contrast ·
9 dark-mode · 10 no-emoji/lucide · 11 focus+motion · 12 state-coverage.

---

## Acceptance (Definition of Done, software — separate from the OKR)

- classifyNoise unit suite green incl. cardinal-sin + divergence cases (B1.1–B1.2).
- Bulk-human mail demoted out of attention; reply-worthy/human/prior never demoted (B3.1).
- Not-noise override round-trips owner-scoped + wins over every signal (B4.1–B4.2).
- Gmail shim returns scope_not_granted today without throwing; capable path tested (B5.1).
- pnpm eval:run GREEN: false_demote_rate <= 0.02 AND noise.precision >= 0.90 (B6.2). [G-eval]
- Noise chip + Not-noise affordance pass the F1 12-item checklist (B7.1). [G-design]
- No migration, no new dependency, no new LLM call (verified at PR).
