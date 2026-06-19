# CLE-13 — Send-guardrail hardening — Design

> Constitution: `_specs/chat-live-executor/README.md`. Consumes CLE-10's frozen authority
> (`decideAction` / `enforceAgentApprovalMode`, README §3.5bis, CLE-10 design §2.1/§6.1) without
> redefining it. No frozen contract is changed; no new contract is introduced. No schema migration.

---

## 1. System fit — the five send chokepoints (file:line) and what each enforces today

| # | Chokepoint | File:line | Test-mode (`isRecipientAllowed`) | Opt-out (`email_optouts`) | Send window | `enforceSendingIdentity` |
|---|---|---|---|---|---|---|
| C1 | Campaign cron `processOutboundEmails` | `inngest/email-send-worker.ts:101-505` | yes `:259` | yes (batch `:131-164` + none per-row) | yes but **UTC** `:303-318` | **no (orphan)** |
| C2 | Event single-send `sendSingleEmail` | `inngest/email-send-worker.ts:510-703` | yes `:568` | yes `:546-565` | n/a (immediate) | **no** |
| C3 | SMTP cron `dispatchOutboundSmtp` | `inngest/outbound-smtp-send.ts:26-139` | yes `:51` | **no** | **no** | **no** |
| C4 | Interactive `deliverInteractiveEmail` | `lib/emails/deliver-interactive.ts:114-251` | yes `:124` | yes `:128-136` | n/a (human-initiated) | **no** |
| C5 | Meeting follow-up route POST | `app/api/meetings/[id]/notes/send-follow-up/route.ts:27-197` | yes `:107` | **no** `:93-102` | n/a | **no** |

The orphan column is the headline finding (audit §6.2): `enforceSendingIdentity`
(`lib/guardrails/sending-identity.ts:61-180`) is imported by **none** of C1-C5. The opt-out gap is C3+C5;
the TZ bug is C1.

### 1.1 The four items mapped onto the chokepoints

- **Item (1)** touches **C1-C5** (wire the sending-identity gate everywhere).
- **Item (2)** touches `inngest/signal-to-sequence.ts:34-298` (the enrollment loop — not a "send"
  chokepoint, an *enroll+deal-create* loop; routed through the same authority).
- **Item (3)** touches **C3** (`outbound-smtp-send.ts`) and **C5** (the route).
- **Item (4)** touches **C1** (`email-send-worker.ts:303-308`), with the helper reused by any future
  window-honoring path.

---

## 2. The orphan engine: what is sound vs unfit

`enforceSendingIdentity(input): SendingEnforcementDecision` (`sending-identity.ts:61`). Inputs:
`{ mode, isCold, sentTodayFromPrimary, sendingDailyCapPrimary, sendingAllowColdOnPrimary }` (`:19-36`).
Output: `{ allowed, provider, blockReason, scalingPath, reason }` (`:45-59`).

**Sound and wired as-is:**
- The **pure decision core** (`:61-180`). It is a total function over `SendingMailboxMode`, side-effect-free,
  exhaustively switched (`:166-178` `never` guard), and its policy is exactly the product promise in
  `tenant-settings.ts:225-252`: cold-on-primary block (`:77-87`), primary daily cap (`:92-100`), pass-through
  for `external-connected` (`:111-121`) and `elevay-managed-active` (`:124-132`), and the
  `elevay-managed-requested` bridge (`:134-164`). This is reusable verbatim — it just needs callers.
- The **`SendingBlockReason` taxonomy** (`:39-43`) — directly usable as the `errorMessage`/return reason at
  each chokepoint.

**Unfit / cannot be wired without a decision (called out, not silently adopted):**
- `provider: "primary" | "external" | "managed"` (`:48-49`) implies the gate *picks the transport*. The real
  chokepoints already resolve transport their own way: C1 round-robins `connected_mailboxes`
  (`email-send-worker.ts:221-242`), C3 is hard-bound to the `smtp_custom` mailbox
  (`outbound-smtp-send.ts:66-77`), C4 uses `shouldUseOwnerSmtp` (`deliver-interactive.ts:155`). **We do not
  adopt `provider` as a routing instruction.** CLE-13 uses `enforceSendingIdentity` strictly as an
  **allow/deny + reason** gate and ignores `provider` for routing. (Documented tension §7.)
- `scalingPath` + the `<ScalingPathPrompt>` (WS-6) is a UI concern with no surface on a cron/route. CLE-13
  **logs** the reason and stores it on the failed/queued row; surfacing the scaling prompt in chat/UI is out
  of scope (no UI in these paths). The boolean is preserved in the return but not acted on server-side.
- The cap counter (`sentTodayFromPrimary`) has no single authoritative source for a *tenant-local* day (see
  §5.3 / EC-7). We feed it the primary mailbox `sentToday` and document the UTC-reset coarseness rather than
  invent a precise per-tenant-day counter (that would be its own lake).

**Verdict:** the engine's *core policy* is sound and is wired at all five chokepoints behind one shared
adapter; its *transport-routing* and *UI-prompt* affordances are unfit for the cron/route context and are
deliberately not used. This is the "wire what is sound" path the scope allows.

---

## 3. Shared pre-send gate — `lib/guardrails/sending-gate.ts` (new)

A single async adapter so the orphan's pure core runs identically at every chokepoint and item (3)'s opt-out
check lives in one place. Pure-ish: one settings read + one opt-out read + (for cold) one activity read; no
transport.

```ts
// lib/guardrails/sending-gate.ts  (NEW — the one seam items 1 & 3 share)
import { db } from "@/db";
import { activities, emailOptouts, connectedMailboxes } from "@/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { getTenantSettings, DEFAULTS } from "@/lib/config/tenant-settings"; // sending defaults at DEFAULTS :437,456-458
import { enforceSendingIdentity } from "@/lib/guardrails/sending-identity";

export type SendingGateOutcome =
  | { send: true; reason: string }
  | { send: false; code: "opted_out" | "cold-on-primary-blocked" | "primary-cap-hit"
        | "managed-setup-pending" | "no-provider-connected"; reason: string };

/** Has this tenant ever exchanged email with this address? Drives `isCold`. */
export async function isColdRecipient(tenantId: string, email: string): Promise<boolean> {
  const e = email.toLowerCase().trim();
  // Any prior outbound or inbound activity to/from this address = warm.
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(activities)
    .where(and(eq(activities.tenantId, tenantId), eq(activities.channel, "email"),
               sql`(metadata->>'to' = ${e} OR metadata->>'from' = ${e})`))
    .limit(1);
  return !row; // unknown/none → cold (EC-6 safest)
}

/** Opt-out + hard-bounce suppression (single email_optouts lookup; reason covers bounce_hard). */
export async function isSuppressed(tenantId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailOptouts.id })
    .from(emailOptouts)
    .where(and(eq(emailOptouts.tenantId, tenantId),
               eq(emailOptouts.emailAddress, email.toLowerCase().trim())))
    .limit(1);
  return !!row;
}

/**
 * THE pre-send gate. Opt-out first (cheap, absolute), then the sending-identity
 * policy. Fail-closed: any thrown lookup → { send:false }.
 */
export async function evaluateSend(args: {
  tenantId: string;
  toAddress: string;
  /** Pre-resolved when the caller already knows (cron may compute in bulk). */
  isCold?: boolean;
  /** Primary-mailbox sends already dispatched today; caller supplies. */
  sentTodayFromPrimary: number;
}): Promise<SendingGateOutcome> {
  try {
    if (await isSuppressed(args.tenantId, args.toAddress)) {
      return { send: false, code: "opted_out", reason: "Recipient is on the opt-out list" };
    }
    const s = await getTenantSettings(args.tenantId); // merges DEFAULTS (:437,456-458)
    const mode = s?.sendingMailboxMode ?? DEFAULTS.sendingMailboxMode;
    const cap = s?.sendingDailyCapPrimary ?? DEFAULTS.sendingDailyCapPrimary;
    const allowCold = s?.sendingAllowColdOnPrimary ?? DEFAULTS.sendingAllowColdOnPrimary;
    const isCold = args.isCold ?? (await isColdRecipient(args.tenantId, args.toAddress));
    const d = enforceSendingIdentity({
      mode, isCold, sentTodayFromPrimary: args.sentTodayFromPrimary,
      sendingDailyCapPrimary: cap, sendingAllowColdOnPrimary: allowCold,
    });
    return d.allowed
      ? { send: true, reason: d.reason }
      : { send: false, code: d.blockReason ?? "no-provider-connected", reason: d.reason };
  } catch (err) {
    return { send: false, code: "no-provider-connected",
             reason: `sending-gate failed closed: ${err instanceof Error ? err.message : "error"}` };
  }
}
```

Design choices:
- **Opt-out is folded into the same gate** so item (3) is satisfied for C3/C5 by calling `evaluateSend`
  (which calls `isSuppressed`). C1/C2/C4 already have their own opt-out query; they call `evaluateSend` too,
  but their existing opt-out branch is harmless (idempotent double-check) — or is removed in favor of the
  shared `isSuppressed` to converge on one helper (tasks T8). Either way one helper is the SSOT (AC-3.4).
- **`isCold` is a parameter with a default resolver** so the campaign cron (which loops 20 rows) can resolve
  coldness in bulk if it wants, while the route/interactive path lets the gate resolve it per call.
- **Fail-closed** (`catch → send:false`) is the load-bearing security property (req EC-3/EC-6, §6).

> `DEFAULTS` export: the sending defaults live in `const DEFAULTS` at `tenant-settings.ts:437` (values at
> `:456-458`), which is **not currently exported**. T1 adds `export` (additive, no behavior change) so the
> gate and `getTenantSettings` agree on the same defaults. The keys are typed `Required<Pick<…>>`, so the
> reads above need no `!`.

---

## 4. Item (1) — wiring the gate into C1-C5

Each chokepoint calls `evaluateSend(...)` immediately **after** its existing `isRecipientAllowed`
(test-mode) check and **before** transport. On `send:false`, it takes that path's existing "do not send"
action:

- **C1 `processOutboundEmails`** — inside `step.run(\`send-${email.id}\`)`, after the test-mode block
  (`email-send-worker.ts:259-271`) and after mailbox resolution (so `mailboxId`/primary identity is known).
  Compute `sentTodayFromPrimary` from the resolved mailbox's `sentToday` (already loaded in `mailboxMap`,
  `:208-218`). On `cold-on-primary-blocked` / `managed-setup-pending` → set `failed` with the reason
  (`:404-415` shape). On `primary-cap-hit` → set back to `queued` with the reason (mirrors the existing
  "daily limit reached, will retry" branch `:321-331`) so capacity frees next day. On `opted_out` → `failed`
  (mirrors `:153-162`).
- **C2 `sendSingleEmail`** — after the test-mode block (`:567-579`), before `resolve-sender`. Single row →
  `sentTodayFromPrimary` read from the tenant's active mailbox `sentToday`. Map outcomes to the existing
  `failed` updates + `return { sent:false, reason }`.
- **C3 `dispatchOutboundSmtp`** — inside `step.run(\`send-${o.id}\`)`, after the test-mode block
  (`outbound-smtp-send.ts:51-62`) and after the `smtp_custom` mailbox resolve (`:66-77`). This single
  insertion delivers **both** item (1) and item (3) for C3. `sentTodayFromPrimary = mb.sentToday`. On
  `send:false` → existing `failed` update (`:119-127` shape) for opt-out/cold/managed, or leave `queued` for
  cap. (For an `smtp_custom`/external setup, mode is typically `external-connected` → gate allows; the
  opt-out branch is the one that bites here, which is the point.)
- **C4 `deliverInteractiveEmail`** — after the test-mode block (`:124-126`) and the existing opt-out block
  (`:128-136`), before plan-limit. Map `send:false` to the typed result union already defined
  (`:59-65`): `opted_out` → `{ ok:false, code:"opted_out" }` (existing), cold/cap → add a new
  `code:"blocked"` arm with the reason. `sentTodayFromPrimary` from the resolved owner mailbox.
- **C5 meeting route** — after recipients are resolved (`route.ts:93-102`) and the test-mode filter
  (`:107-113`). Filter recipients through `evaluateSend` (opt-out + identity); drop blocked; if all blocked
  → 403 with the reason. Because the route sends "as the meeting follow-up" (often warm — attendees you just
  met), most pass; the opt-out filter is the load-bearing part here (item 3 for C5).

A small **per-chokepoint helper signature** keeps the call uniform; the differences are only in how each
path records "not sent" (row update vs typed return vs HTTP status), which is intrinsic to the path.

---

## 5. Item-specific designs

### 5.1 Item (1) — DEFAULTS vs "today's behavior" (EC-1, the one normative call)

The audit says "no sending-identity config = today's behavior". Today, with the orphan unwired, *every* send
goes out regardless of mode. Literally preserving that for a configured-but-default tenant would defeat the
feature (Pilae and every tenant get DEFAULTS = `primary-with-caps`/cold-blocked via `getTenantSettings`
merge). **Chosen rule:** the gate applies the **merged DEFAULTS** whenever settings resolve (the common
case), because the product *promises* that protection (`tenant-settings.ts:225`). "Today's behavior" is
preserved only for the genuinely-degenerate case where `getTenantSettings` returns **null** (no tenant
settings row at all) — there the gate cannot know the mode and **fails open to send** (so a misconfigured
infra row never silently halts a legitimate tenant). This is the inverse of the usual fail-closed and is
therefore: (a) narrow (only a missing settings row), (b) explicitly tested (EC-1 test asserts null-settings
→ send), (c) documented here. Every tenant with a settings row (all real ones) gets the protection.

### 5.2 Item (2) — `signalAutoEnroll` → `enforceAgentApprovalMode` (CLE-10)

`sequence-enrollment` is already a first-class `GuardedAction` with metadata
`{ mutating:true, outbound:true, reversible:false, cost:"free", confirm:"always" }` (CLE-10 design §2.2/§6.1
table). So item (2) is a **call**, not new policy: load the tenant's effective mode (the reactor's exact
pattern, `agent-reactor.ts:160-189`) and gate before the first write.

Insertion point: a new `step.run("approval-gate", …)` placed **after** `find-sequence`/`check-enrolled`
(`signal-to-sequence.ts:129-209`) and **before** `enroll-contacts` (`:213`):

```ts
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { enforceAgentApprovalMode, readApprovalMode } from "@/lib/guardrails/approval-mode";
import { recordAgentAction } from "@/lib/agents/agent-actions"; // same lane the reactor defers into
// …
const gate = await step.run("approval-gate", async () => {
  const settings = await getTenantSettings(tenantId);
  const mode = readApprovalMode(settings ?? { agentApprovalMode: "review-each" });
  // High confidence (a fresh buying signal) but enrollment is outbound+confirm:always,
  // so decideAction returns confirm/queue under every non-review mode — never execute inline.
  return enforceAgentApprovalMode({ mode, action: "sequence-enrollment", confidence: 0.9 });
});

if (!gate.allowed) {
  // Defer instead of executing: record a pending agent action the human approves,
  // mirroring agent-reactor's deferred path. No enroll, no deal, no notify.
  await step.run("defer-enroll", async () => {
    // recordAgentAction signature: { tenantId, actionType, payload, awaitingApproval } —
    // agent-actions.ts:30-49. awaitingApproval:true records it as `scheduled` with no
    // scheduledExecutionAt, so the dispatcher won't run it until the founder approves it
    // from the "Needs you" lane (agent-actions.ts:42-48). queueAs only affects the lane label.
    await recordAgentAction({
      tenantId,
      actionType: "sequence-enrollment",
      awaitingApproval: true,
      payload: { companyId, companyName, signalType, signalTitle,
                 sequenceId: activeSequence.id, contactIds: toEnroll.map((c) => c.id),
                 queueAs: gate.queueAs, reason: gate.reason },
    });
  });
  return { skipped: true, reason: `enrollment gated: ${gate.reason}`, deferred: true };
}
// gate.allowed === true → fall through to the existing enroll + deal + notify steps unchanged.
```

- **Why `enforceAgentApprovalMode`, not `decideAction` directly:** the reactor and autonomous-pipeline use
  `enforceAgentApprovalMode` (CLE-10 §6.1/§6.2), which delegates to `decideAction` and returns the
  `{ allowed, queueAs }` shape this loop needs. Using it keeps `signalAutoEnroll` on the **same** core as the
  rest of the background (README doctrine 4: one decision authority) and gives the deferred-lane mapping for
  free.
- **`recordAgentAction` shape:** the reactor imports `recordAgentAction, DEFAULT_EMAIL_GRACE_MS` from
  `lib/agents/agent-actions`. Its input is `{ tenantId, actionType, payload, graceMs?, reversibleForMs?,
  awaitingApproval? }` (`agent-actions.ts:30-49`); `awaitingApproval:true` is the documented "agent DECIDED
  but waits for founder approval" path that lands in the "Needs you" lane (`:42-48`). The deferred
  enrollment uses exactly that. If the approval UI cannot yet render an `actionType:"sequence-enrollment"`
  row, the fallback (in tasks T6) is skip-and-notify (return `skipped`, emit the existing notification
  telling the user enrollment is pending) — still **no autonomous enroll**, which is the requirement.
- **Confidence = 0.9:** a buying signal is high-confidence, but because enrollment is `outbound` +
  `confirm:"always"`, CLE-10 returns `confirm` (→ `allowed:false`) in `auto-high-confidence` and `queue` in
  `batch-daily` and `confirm` in `review-each`. So the value only affects the *reason* text, never flips to
  inline execute — exactly AC-2.3.

### 5.3 Item (3) — one opt-out helper at C3 + C5

Already folded into `evaluateSend` (§3) via `isSuppressed`. C3 gets it inside its `send-${o.id}` step; C5
filters its recipient array through it (`route.ts:107` is the natural seam — extend that `.filter` to also
drop suppressed, or map through `evaluateSend`). Hard-bounce coverage is automatic: a hard bounce is written
as an `email_optouts` row `reason:"bounce_hard"` (`db/schema/outbound.ts:339`), so the same lookup suppresses
it (AC-3.3) — no bounce-specific query.

### 5.4 Item (4) — tenant-TZ send window — `lib/emails/send-window.ts` (new)

The existing UTC computation (`email-send-worker.ts:303-308`):
```ts
const currentDay = dayNames[now.getUTCDay()];
const currentTime = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes())…}`;
```
is replaced by a pure helper that mirrors the **proven** `Intl.DateTimeFormat` approach already in
`lib/voice/quiet-hours.ts:64-92` (no tz library, ICU always present), reusing its `resolveTimezone`:

```ts
// lib/emails/send-window.ts  (NEW)
import { resolveTimezone } from "@/lib/voice/quiet-hours";

export function localClock(now: Date, timezone: string | null | undefined):
  { day: "sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat"; time: string } {
  const tz = resolveTimezone(timezone);                       // → Europe/Paris default (EC-2)
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const map: Record<string, …> = { Sun:"sun",Mon:"mon",Tue:"tue",Wed:"wed",Thu:"thu",Fri:"fri",Sat:"sat" };
    return { day: map[g("weekday")] ?? "mon", time: `${g("hour")}:${g("minute")}` };
  } catch {
    // Malformed IANA → default TZ, never throw out of the cron (EC-3).
    return localClock(now, "Europe/Paris");
  }
}

export function isWithinSendWindow(now: Date, timezone: string | null | undefined,
  win: { sendDays: string[]; sendWindowStart: string; sendWindowEnd: string }): boolean {
  const { day, time } = localClock(now, timezone);
  return win.sendDays.includes(day) && time >= win.sendWindowStart && time <= win.sendWindowEnd;
}
```

C1 reads `tenant_settings.timezone` once per tenant (it already builds a per-tenant `mailboxMap` at
`:185-246` — add `timezone` to that map from a `getTenantSettings`/tenants lookup) and calls
`isWithinSendWindow(now, tz, mailbox)` in place of the inline UTC compare (`:308`). The re-queue branch
(`:309-318`) is unchanged. Caching the timezone in the per-tenant map keeps it one settings read per tenant
per cron tick, not per row.

> **`HH:MM` string compare correctness:** `"08:00" <= "09:30" <= "18:00"` is lexicographically correct
> because the format is zero-padded fixed-width — the same assumption the original UTC code (`:306`) and the
> stored `sendWindowStart/End` defaults (`outbound.ts:259-260`) already rely on. Helper preserves it.

---

## 6. Data flow

```
                    ┌──────────────────────────── item (4): TZ-correct window ───────────────┐
                    │                                                                          │
  queued row ──► C1 processOutboundEmails ─ test-mode ─ isWithinSendWindow(tenantTZ) ─ evaluateSend ─ cap/plan ─ resend.send
            ├──► C2 sendSingleEmail ─────── test-mode ─ (immediate) ───────────────── evaluateSend ─ plan ────── resend.send
            ├──► C3 dispatchOutboundSmtp ── test-mode ─ resolve smtp_custom ───────── evaluateSend ─────────────  sendViaSmtp
            └──► C4 deliverInteractiveEmail test-mode ─ (opt-out) ──────────────────  evaluateSend ─ plan ─ smtp|resend
  HTTP POST ──► C5 meeting follow-up ────── test-mode ─ resolve recipients ── filter(evaluateSend) ───────────── resend.send
                                                                  │
                                                evaluateSend = isSuppressed (item 3) + enforceSendingIdentity (item 1)
                                                                  │  fail-closed (do not send) on throw

  signals/auto-enroll ─► signalAutoEnroll ─ eligibility(open-deal, anti-ICP, contacts, sequence) ─
        step "approval-gate": enforceAgentApprovalMode("sequence-enrollment") ─► decideAction (CLE-10)
            allowed? ── yes ─► enroll + trackPipeline + create deal + notify   (unchanged steps)
                    └─ no ──► recordAgentAction(deferred) ; return { skipped, deferred }    (item 2)
```

One gate (`evaluateSend`) for the five sends, one authority (`enforceAgentApprovalMode`→`decideAction`) for
the enroll loop, one window helper for the only path with a window.

---

## 7. Failure handling

| Failure | Where caught | Outcome |
|---|---|---|
| Opt-out / settings / activity lookup throws in `evaluateSend` | `evaluateSend` try/catch (§3) | `{ send:false, code:"no-provider-connected" }` → chokepoint does **not** send (fail-closed). |
| `getTenantSettings` returns **null** (no settings row) | §5.1 normative rule | gate **fails open to send** (only this narrow case) — preserves "today's behavior" for a tenant with no settings; tested (EC-1). |
| `enforceSendingIdentity` unknown mode | its own `never`/default arm (`sending-identity.ts:166-178`) | `allowed:false, no-provider-connected` → not sent. |
| Malformed/empty `timezone` | `localClock` `resolveTimezone` + try/catch (§5.4) | default `Europe/Paris`; window evaluated, never throws (EC-2/EC-3). |
| `enforceAgentApprovalMode` / `decideAction` import absent (CLE-10 not on base) | build-time | §6.2 fallback: a local `sequenceEnrollmentAllowed(mode)` that returns `false` for every mode except an explicit allow, still single-authority-shaped; replaced by the real import when CLE-10 lands. |
| `recordAgentAction` cannot represent enrollment kind | T6 fallback | skip-and-notify (no enroll, no deal) — still satisfies AC-2.1/2.4. |
| Cap counter coarse (UTC-day reset vs tenant-day) | §2 / EC-7 | documented; cap still protects (boundary ≤ 1 UTC-day off); precise tenant-day count out of scope. |

**Doctrine:** every guardrail path resolves toward **not sending / not enrolling** on uncertainty, except
the single explicitly-tested null-settings open-fail (§5.1). This is the load-bearing security property
(req §3 EC-3/EC-6, audit §0).

### 6.2 CLE-10 dependency posture

CLE-13 imports `enforceAgentApprovalMode` + `readApprovalMode` from `lib/guardrails/approval-mode.ts`
(present pre-CLE-10) and relies on CLE-10 having made `enforceAgentApprovalMode` delegate to `decideAction`
(CLE-10 §6.1). If the branch base predates CLE-10, the function still exists with its legacy body — and for
`sequence-enrollment` the legacy body *also* never auto-executes outbound under the default modes, so the
gating behavior (AC-2.1-2.4) holds either way. The only difference CLE-10 makes is *which* core computed it;
the disposition for `sequence-enrollment` is the same. No CLE-10 internal is modified.

---

## 8. Security

- **`evaluateSend`** is tenant-scoped on every query (`eq(.tenantId, …)` on `email_optouts`, `activities`,
  and `getTenantSettings(tenantId)`), so the gate cannot leak cross-tenant suppression/identity state.
- **No new secrets / no new external calls.** The gate adds only DB reads against existing tables.
- **Fail-closed default** (§7) means a guardrail outage degrades to "send less", never "send more".
- **`signalAutoEnroll` gate** removes the audit's "enroll + deal-create with no approval" hole (§6.4): with
  the gate, an attacker who can fire a `signals/auto-enroll` event (e.g. via the unauth visit-ingestion path
  the tenant-isolation audit flags) still cannot cause an autonomous enroll/deal unless the tenant's mode is
  set to permit it (and even then enrollment is outbound→confirm, so it defers). Defense in depth over the
  ingestion gap.
- **`OUTBOUND_TEST_MODE`** stays the outermost stop on C1-C5; CLE-13 layers *under* it (the gate runs after
  the test-mode check), so test mode can never be weakened by these changes.
- The new gate **must not** become a cross-tenant cap oracle: `sentTodayFromPrimary` is supplied by the
  caller from that tenant's own mailbox row, never queried globally.

---

## 9. Test strategy (a test per enforcement point)

All pure/unit where possible; DB-touching paths use the repo's existing inngest/route test patterns with
`db` spies (cf. `__tests__/visitor-id-fanout.test.ts`, the email-worker suites).

1. **`sending-gate.test.ts` (the core adapter).** Table-drive `evaluateSend` over
   `{ mode × isCold × sentToday vs cap × suppressed }`: assert `send` and `code` for cold-on-primary-blocked,
   primary-cap-hit, external/managed pass-through, managed-requested bridge, opted_out precedence
   (suppressed beats everything), and the **fail-closed** arm (mock a throwing `getTenantSettings`/optout →
   `send:false`). Plus EC-1 null-settings → `send:true`. 100% branch coverage of the new file.
2. **Per-chokepoint invocation tests (AC-1.6) — one each:**
   - `email-send-worker.sending-gate.test.ts`: a queued cold row on `primary-with-caps` → row left unsent
     (`failed`/`queued` with the reason), `resend.emails.send` spy **not** called; remove the `evaluateSend`
     call → test fails.
   - `send-single-email.sending-gate.test.ts`: same for C2.
   - `outbound-smtp.sending-gate.test.ts`: cold/opt-out row → `failed`, `sendViaSmtp` spy not called.
   - `deliver-interactive.sending-gate.test.ts`: blocked → typed `{ ok:false }`, no transport call.
   - `meeting-follow-up.sending-gate.test.ts`: opt-out recipient dropped; all-suppressed → 403, no
     `resend.emails.send`.
   Each test imports the module and asserts the gate is on the path (the "actually invoked" guarantee).
3. **Opt-out / hard-bounce (item 3, AC-3.1-3.3).** Seed `email_optouts` (`unsubscribe` and `bounce_hard`);
   assert C3 marks `failed` and C5 drops + 4xx for both reasons; assert the campaign cron (C1) still
   suppresses (regression that the shared helper didn't break the existing batch filter).
4. **`signalAutoEnroll` respects `decideAction` (item 2, AC-2.1-2.5).** Mock `getTenantSettings` to return
   each mode; spy `db.insert`:
   - `review-each` → **no** `sequenceEnrollments` insert, **no** `deals` insert, `recordAgentAction` called,
     result `{ skipped:true, deferred:true }`.
   - `auto-high-confidence` → same (outbound→confirm), asserting the AC-2.3 posture explicitly with a comment
     citing CLE-10 §6.1.
   - a mode/role yielding `execute` → exactly one enroll loop + one deal insert + notify (parity with
     today's behavior); assert the gate `step.run("approval-gate")` ran before `enroll-contacts`.
   - Assert the gate is **after** eligibility: an ineligible signal (open deal) short-circuits before the
     gate (no `getTenantSettings` call) — proves §5.2 ordering.
5. **TZ send window (item 4, AC-4.1-4.4).** `send-window.test.ts` pure: freeze `now` at a UTC instant inside
   the UTC window but outside `Europe/Zurich`'s, assert `isWithinSendWindow(...Zurich) === false`; the
   reverse instant → `true`; `sendDays` exclusion; EC-2 (undefined tz → Europe/Paris) and EC-3 (malformed tz
   → default, no throw). Integration: `email-send-worker` with a tenant `timezone` set re-queues vs sends per
   tenant-local clock, not UTC.
6. **Regression / hygiene.** `regression.sh` green; existing email-worker, single-send, deliver-interactive,
   and `visitor-id-fanout` suites pass unchanged; `tsc --noEmit` 0 errors; `grep` that
   `enforceSendingIdentity` is imported by the shared gate and that the gate is imported by all five
   chokepoint modules + a `grep` that `now.getUTCDay()/getUTCHours()` is gone from the send-window path;
   `OUTBOUND_TEST_MODE` behavior unchanged.
