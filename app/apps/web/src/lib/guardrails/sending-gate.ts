/**
 * CLE-13 — the ONE shared pre-send gate every outbound chokepoint runs before
 * transport. It composes two guardrails behind a single async adapter so the
 * orphaned `enforceSendingIdentity` core (lib/guardrails/sending-identity.ts) and
 * the opt-out/suppression check live in exactly one place:
 *
 *   1. opt-out / hard-bounce suppression  (item 3 — `isSuppressed`)
 *   2. sending-identity policy            (item 1 — `enforceSendingIdentity`)
 *
 * Wired at all five send chokepoints (C1 campaign cron, C2 single-send,
 * C3 SMTP cron, C4 interactive, C5 meeting follow-up) so the policy is identical
 * everywhere and cannot drift. The pure sending-identity core (mode/cap/cold) and
 * the suppression lookup are kept here; transport routing and the WS-6 scaling
 * prompt are deliberately NOT adopted (design §2 — the gate is allow/deny + reason
 * only; each chokepoint keeps its own transport resolution).
 *
 * Doctrine: FAIL-CLOSED. Any thrown lookup resolves toward `{ send: false }` — a
 * guardrail outage degrades to "send less", never "send more" (design §7, §8).
 */

import { db } from "@/db";
import { activities, emailOptouts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  getTenantSettings,
  DEFAULTS,
  type TenantSettings,
} from "@/lib/config/tenant-settings";
import {
  enforceSendingIdentity,
  type SendingBlockReason,
} from "@/lib/guardrails/sending-identity";

/** Why the gate refused a send (or that it allows). */
export type SendingGateOutcome =
  | { send: true; reason: string }
  | {
      send: false;
      code: SendingBlockReason | "opted_out";
      reason: string;
    };

/**
 * Has this tenant ever exchanged email with this address? Drives `isCold`.
 * Any prior outbound OR inbound email activity to/from the address = warm.
 * Unknown / none / lookup error -> cold (EC-6: treat unknown as cold, the
 * safest rail — blocked on the default mode).
 */
export async function isColdRecipient(
  tenantId: string,
  email: string,
): Promise<boolean> {
  const e = email.toLowerCase().trim();
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.channel, "email"),
        sql`(metadata->>'to' = ${e} OR metadata->>'from' = ${e})`,
      ),
    )
    .limit(1);
  return !row; // no prior activity -> cold
}

/**
 * Opt-out + hard-bounce suppression. A single `email_optouts` lookup covers
 * BOTH unsubscribes and hard bounces (a hard bounce is persisted as an
 * `email_optouts` row with `reason: "bounce_hard"`, db/schema/outbound.ts:339),
 * so no bounce-specific query is needed (AC-3.3). Tenant-scoped.
 */
export async function isSuppressed(
  tenantId: string,
  email: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: emailOptouts.id })
    .from(emailOptouts)
    .where(
      and(
        eq(emailOptouts.tenantId, tenantId),
        eq(emailOptouts.emailAddress, email.toLowerCase().trim()),
      ),
    )
    .limit(1);
  return !!row;
}

export interface EvaluateSendArgs {
  tenantId: string;
  toAddress: string;
  /**
   * Pre-resolved coldness when the caller already knows it (a cron may compute
   * it in bulk). Omit to let the gate resolve it per call.
   */
  isCold?: boolean;
  /** Primary-mailbox sends already dispatched today; supplied by the caller
   *  from that tenant's own mailbox row (never queried globally — design §8). */
  sentTodayFromPrimary: number;
  /**
   * Pre-loaded settings for callers that already hold them (avoids a second
   * read). Optional — the gate reads them itself when omitted.
   */
  settings?: TenantSettings | null;
}

/**
 * THE pre-send gate. Opt-out first (cheap, absolute, beats every mode), then
 * the sending-identity policy with the tenant's merged settings.
 *
 * FAIL-CLOSED: any thrown lookup -> `{ send: false }`.
 *
 * NOTE on EC-1 / design §5.1: `getTenantSettings` ALWAYS returns the merged
 * `DEFAULTS` (it never returns null — lib/config/tenant-settings.ts:510-525), so
 * every real tenant gets `primary-with-caps` protection. A caller MAY still pass
 * `settings: null` explicitly; rather than fail OPEN (the original design's narrow
 * branch), the gate then evaluates against the protective `DEFAULTS`
 * (primary-with-caps, cold blocked, 20/day cap). A warm under-cap recipient still
 * sends under those defaults — the point (CLE-13 FOLLOWUPS #4) is that there is no
 * FAIL-OPEN path: an absent/unknown settings object can only make the gate send
 * LESS than the defaults would allow, never more.
 */
export async function evaluateSend(
  args: EvaluateSendArgs,
): Promise<SendingGateOutcome> {
  try {
    if (await isSuppressed(args.tenantId, args.toAddress)) {
      return {
        send: false,
        code: "opted_out",
        reason: "Recipient is on the opt-out list",
      };
    }

    const settings =
      args.settings !== undefined
        ? args.settings
        : await getTenantSettings(args.tenantId);

    // CLE-13 FOLLOWUPS #4: a genuinely-absent settings object (caller passed
    // null) cannot tell us the mode — so fall back to the protective DEFAULTS
    // (primary-with-caps, cold blocked) rather than failing open. `?.` makes the
    // null case use every DEFAULT, so the gate has no FAIL-OPEN path (warm
    // under-cap still sends, but never more than the defaults permit).
    const mode = settings?.sendingMailboxMode ?? DEFAULTS.sendingMailboxMode;
    const cap =
      settings?.sendingDailyCapPrimary ?? DEFAULTS.sendingDailyCapPrimary;
    const allowCold =
      settings?.sendingAllowColdOnPrimary ?? DEFAULTS.sendingAllowColdOnPrimary;
    const isCold =
      args.isCold ?? (await isColdRecipient(args.tenantId, args.toAddress));

    const decision = enforceSendingIdentity({
      mode,
      isCold,
      sentTodayFromPrimary: args.sentTodayFromPrimary,
      sendingDailyCapPrimary: cap,
      sendingAllowColdOnPrimary: allowCold,
    });

    return decision.allowed
      ? { send: true, reason: decision.reason }
      : {
          send: false,
          code: decision.blockReason ?? "no-provider-connected",
          reason: decision.reason,
        };
  } catch (err) {
    return {
      send: false,
      code: "no-provider-connected",
      reason: `sending-gate failed closed: ${err instanceof Error ? err.message : "error"}`,
    };
  }
}
