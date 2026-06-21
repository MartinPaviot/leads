# B4 — inbox-noise-classifier · Design

Anchored on REAL files (verified 2026-06-19, worktree agent-a64e5014ce08a19ab).
Every signal noise composes is ALREADY computed in the read model; B4 adds a pure
resolver, an override store, a thin wire-in, and one eval surface. No migration,
no new LLM, no new dependency.

## 1. Architecture diff vs existing

ALREADY THERE (reuse verbatim — do NOT rebuild):

- buildConversations computes per conversation, in one pass:
  - inboundIsAutomated = classifyInboundSender({fromHeader}).isMachineSent
    (conversations.ts:300-302), surfaced as isBulk (:479).
  - replyWorthy via isReplyWorthy({isMachineSent, generalIntent, isBulk})
    (conversations.ts:447-455), recall-biased (reply-worthy.ts:97-127).
  - generalIntent via resolveGeneralIntent(...) (conversations.ts:449-453),
    taxonomy in general-intent.ts:13-18.
  - importance.{score,tier,factors} via scoreImportance(...)
    (conversations.ts:430-442); automated -> {score:0,tier:4} (importance.ts:52-54).
- Machine-sent senders already route to the handled lane
  (conversations.ts:306-312) — so pure-machine mail is OUT of attention TODAY.
  The GAP B4 closes: **bulk/promo/newsletter mail that is NOT machine-sent**
  (a human-addressed marketing blast, a cold sequence) still lands in attention
  (conversations.ts:317-318) because inboundIsAutomated is false for it.
- The per-user JSONB preference store: user_preferences (auth.ts:141-164),
  accessed owner-scoped by getUserLanes/saveUserLanes (lane-store.ts) and
  getUserFilters/saveUserFilters (filter-store.ts) under resource="inbox". The
  not-noise override is a THIRD key here.
- The read route conversations/route.ts already: scopes per user (:33), builds
  the model (:59), computes laneCounts (:90), filters by lane (:113-129), bundles
  bulk senders (:146-163), and serializes the list (:184-220). B4 adds a noise
  field to the serialized row + a noise count.
- The eval gate: replyWorthyPR (inbox-metrics.ts:41-55), the gate test pattern
  (inbox-reply-worthy-gate.test.ts), and eval:run (package.json).

ADDED (all [NEW]):

1. src/lib/inbox/noise.ts — the pure classifyNoise resolver (R1). Sibling to
   reply-worthy.ts; same shape { noise, reasons }, same purity contract.
2. src/lib/inbox/noise-override-store.ts — owner-scoped read/write of the
   not-noise override list in user_preferences (resource "inbox", key
   "noiseOverrides"), modeled on filter-store.ts (R3).
3. src/app/api/inbox/noise/route.ts — POST { conversationKey, sender, action:
   "not_noise" | "undo", persistGmail? }; DELETE to undo (R3, R6). Calls the
   override store + the optional Gmail shim.
4. src/lib/integrations/gmail-filters.ts — persistNoiseFilter(userId, sender)
   best-effort shim (R4): capability check -> create skip-inbox filter or typed
   no-op. Sits beside gmail.ts.
5. src/lib/evals/fixtures/inbox/inbox-noise.golden.jsonl (>=40) + a
   falseDemoteRate + noisePrecision helper in inbox-metrics.ts + the gate test
   src/__tests__/inbox-noise-gate.test.ts, wired into eval:run (R5).

CHANGED (surgical):

- src/lib/inbox/conversations.ts — after replyWorthy is computed (:447-455),
  call classifyNoise(...); set noise on the Conversation and, when noise &&
  lane === "attention", floor importance + move it out of attention into the
  noise cohort. ~12 lines, one new interface field.
- src/lib/inbox/conversations.ts laneCounts (:508-512) — add a noise tally (or
  compute it in the route; see section 7).
- src/app/api/inbox/conversations/route.ts — pass the user noise-overrides into
  the build, add noise to each serialized row (:184-208) and a noise count
  (:209). ~6 lines.
- app/apps/web/package.json eval:run — append the noise gate test path.

## 2. The classifyNoise contract (R1)

    // src/lib/inbox/noise.ts
    export interface NoiseInput {
      isMachineSent: boolean;        // conversations.ts inboundIsAutomated
      isBulk: boolean;               // conversations.ts isBulk
      generalIntent: GeneralIntent | null;   // resolveGeneralIntent result
      replyWorthy: boolean;          // isReplyWorthy result
      importanceTier: 1 | 2 | 3 | 4; // scoreImportance result
      hasPriorHumanReply: boolean;   // see section 5
      overridden: boolean;           // a stored not-noise override matches
    }
    export interface NoiseResult { noise: boolean; reasons: string[] }
    export function classifyNoise(input: NoiseInput): NoiseResult

Decision order (first match wins) — the KEEP guards come FIRST, mirroring the
recall bias in reply-worthy.ts:

    0. overridden              -> KEEP  (reason "user marked not-noise")        [R3.2]
    1. replyWorthy and not machine -> KEEP (reason "reply-worthy human mail")   [R1.2]
    2. hasPriorHumanReply      -> KEEP  (reason "prior 1:1 relationship")       [R1.3]
    3. isMachineSent           -> NOISE (reason "machine-sent sender")          [R1.4]
    4. generalIntent in {promotion_newsletter, notification,
       automated_no_reply, receipt_confirmation} -> NOISE                       [R1.5]
    5. isBulk and not replyWorthy -> NOISE (reason "bulk/marketing mail")       [R1.6]
    6. importanceTier==4 and not replyWorthy and not hasPriorHumanReply
                               -> NOISE (reason "low importance + cold")         [R1.7]
    7. default                 -> KEEP  (reason "default human mail (recall bias)") [R1.8]

The no-reply set in step 4 is the FOUR families named in the brief — DELIBERATELY
NARROWER than the six in reply-worthy.ts:62-69 (it EXCLUDES invoice_billing and
security_account), because a time-sensitive OTP/invoice must never be demoted out
of sight (QUALITY-BENCH section 2: time-sensitive codes/verifications are KEPT).
This is the one intentional divergence from reply-worthy and is unit-tested.

## 3. Data model diff

NONE. No Drizzle CREATE/ALTER, no file under src/db/schema/. Verified:

- The not-noise override is a row in the EXISTING user_preferences
  (auth.ts:141-164): { userId, resource:"inbox", key:"noiseOverrides",
  value: NoiseOverride[] }, upserted on the existing unique index
  user_preferences_user_resource_key_idx (auth.ts:157-162) — same
  onConflictDoUpdate shape as lane-store.ts:38-44.

    interface NoiseOverride {
      sender: string;          // lowercased counterparty address (match key)
      threadKey?: string;      // optional conversation key for a thread-only override
      gmailFilterId?: string;  // R4.4 provider filter id, for undo
      at: string;              // ISO, for audit + cap-eviction (oldest first)
    }

- The noise flag on Conversation is a computed read-model field (like replyWorthy,
  isBulk) — NOT persisted. Recomputed every read, so a new inbound that flips
  reply-worthiness re-promotes automatically (R2 edge case), exactly like
  reopen-on-new-inbound (conversations.ts:280-294).

## 4. Orchestration (Inngest)

NONE required. Noise demotion is computed at read time inside buildConversations
(pure, synchronous). No background fan-out, no cron. The OPTIONAL Gmail-filter
write (R4) happens inline in the POST handler (best-effort, awaited, never
blocking the override write). If provider writes later need retry/throttle, an
Inngest fn gmail-filter-sync is the natural home — flagged, not built (avoids an
ocean for a P1 enhancement that is currently scope-gated off anyway).

## 5. hasPriorHumanReply — how it is derived (no new query)

hasPriorHumanReply reuses data the group already holds in buildConversations: a
conversation has a prior 1:1 human relationship when the group has at least one
OUTBOUND email from us to this counterparty (g.outbound.length > 0,
conversations.ts:340) AND the counterparty is not machine-sent — i.e. we have
emailed this human before, so it is a real relationship, not a cold blast. This
is already available at the call site (g.outbound), so no extra DB read. It is
passed into classifyNoise as a boolean; the resolver stays pure/testable.

(A richer "prior reply" signal — the counterparty replied to OUR thread — is also
derivable from replyClassification on outbound rows the group carries
(conversations.ts:224-233); B4 uses the conservative hasOutbound-to-human form
first because it is strictly safer for the cardinal sin, and notes the refinement
as a follow-up rather than gating the ship on it.)

## 6. Optional Gmail-filter persistence (R4) — verified scope gap

- src/lib/integrations/gmail-filters.ts:

    export type PersistResult =
      | { persisted: true; filterId: string }
      | { persisted: false; reason: "scope_not_granted" | "provider_unsupported" | "not_connected" | "error" };
    export async function persistNoiseFilter(userId: string, sender: string): Promise<PersistResult>

  Reuses getGmailClient(userId) (gmail.ts:11-60) for the authed client and token
  refresh. On capability, calls gmail.users.settings.filters.create with
  criteria:{from:sender} + action:{removeLabelIds:["INBOX"], addLabelIds:[<Noise label>]}.

- **VERIFIED CONSTRAINT.** The granted Google scope is
  "openid email profile https://www.googleapis.com/auth/gmail.readonly
  https://www.googleapis.com/auth/calendar.readonly
  https://www.googleapis.com/auth/calendar.events" (src/auth.ts:246-247).
  settings.filters.create requires gmail.settings.basic (or gmail.modify).
  NEITHER is granted. So persistNoiseFilter ALWAYS returns
  { persisted:false, reason:"scope_not_granted" } until an incremental-auth
  re-consent adds the scope. The scope upgrade + re-consent UX is [HORS SCOPE]
  for B4 (belongs to the A-track mailbox-connect re-auth flow). B4 ships the
  capability-gated shim so the feature lights up the moment the scope lands — and
  the offered affordance reads "connect with manage-filters permission" rather
  than silently doing nothing (R4.2). The in-app demotion (R2/R3) is the source
  of truth and is fully functional with zero provider involvement (R4.5).

- For provider=="outlook"|"smtp_custom" (connected_mailboxes.provider,
  outbound.ts:242) the shim returns provider_unsupported (R4.3); EmailEngine /
  IMAP boxes have no equivalent one-call server filter we control here.

## 7. Read-model wire-in + counts (R2)

- In buildConversations, after replyWorthy (conversations.ts:455):

    const overridden = noiseOverrideMatches(overrides, fromAddress, key);
    const noiseV = classifyNoise({
      isMachineSent: inboundIsAutomated, isBulk: inboundIsAutomated,
      generalIntent, replyWorthy, importanceTier: importance.tier,
      hasPriorHumanReply, overridden });
    const noise = noiseV.noise;

  Set noise on the pushed conversation; when noise and lane === "attention", set
  importanceTier=4, importanceScore=0 (R2.1) and exclude from attention. To keep
  buildConversations pure, the overrides are passed in as a param (default []) —
  the route loads them via getNoiseOverrides(userId) and injects, exactly the way
  the route injects triage today (a pure-builder input, conversations.ts:239-244).

- The noise count: the route computes it over the visible set
  (conversations/route.ts:86-90) as visible.filter(({c}) => c.noise).length,
  added to the counts object (:209). B3 reads this count for its "Noise (N)" chip;
  B4 does not own the chip route (NG-1).

## 8. Integrations — vs the locked stack

- Drizzle + user_preferences JSONB — [LOCKED], reused (no migration).
- googleapis Gmail client — [LOCKED], reused (gmail.ts); only a NEW method call
  (settings.filters.create), no new dependency.
- Vitest eval gate + replyWorthyPR pattern — [LOCKED], reused.
- No new LLM call, no new provider, no new package (falseDemoteRate is a ~10-line
  pure fn beside replyWorthyPR).

## 9. Guardrails (one line each)

- Cardinal-sin first: KEEP guards (override, reply-worthy, prior-human) evaluate
  BEFORE any demotion signal; a reply-worthy human thread can never be demoted.
- Pure + deterministic: classifyNoise has no DB/network/LLM/clock — fully unit-testable.
- No-reply set for noise is the four named families only (excludes OTP/invoice) so a
  time-sensitive code is never demoted (QUALITY-BENCH section 2).
- Reversible by construction: demotion is read-time + the override un-demotes; no row deleted.
- Owner-scoped: every override read/write keyed by userId; never tenant-wide.
- Override wins absolutely: a stored not-noise beats every signal, including machine-sent.
- Provider write is best-effort + scope-gated: never throws, never blocks the in-app demotion.
- No migration, no new dep, no new LLM call: composes existing signals + the JSONB store.
- G-eval: false_demote_rate <= 0.02 AND noise.precision >= 0.90 green in eval:run or the suite fails.
- G-design: every noise surface passes the F1 12-item checklist (design-system section 8).
