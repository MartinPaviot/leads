/**
 * GET  /api/calls/numbers — list the tenant pool
 * POST /api/calls/numbers — provision a new number via Twilio and insert
 *                           into phone_number_pool. Body:
 *   { countryCode: "FR" | "US" | ..., areaCode?: "415", smsCapability?: bool }
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { requirePermission, requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getVoiceProvider, VoiceProviderError } from "@/lib/voice";
import { logger } from "@/lib/observability/logger";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const rows = await db
      .select()
      .from(phoneNumberPool)
      .where(eq(phoneNumberPool.tenantId, authCtx.tenantId));
    return Response.json({ numbers: rows });
  });
}

const buySchema = z.object({
  countryCode: z.string().length(2).toUpperCase(),
  areaCode: z.string().regex(/^\d{2,4}$/).optional(),
  smsCapability: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    // Buying a number charges the Twilio account — admin-only money action.
    const denied = requirePermission(authCtx.role, "billing:manage");
    if (denied) return denied;
    // CLE-12 — belt-and-braces matrix gate (outbound:paid; admin) on the fresh
    // DB role, resolved from the same route map the middleware uses.
    const capDenied = requireCapabilityForRequest(authCtx, req);
    if (capDenied) return capDenied;

    const provider = getVoiceProvider();
    if (!provider) {
      return Response.json(
        { error: "Voice not configured", code: "voice_not_configured" },
        { status: 503 },
      );
    }
    const body = await req.json().catch(() => null);
    const parsed = buySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Bad request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    try {
      // Twilio's areaCode filter is NANP-only. For other countries, turn the
      // area code into an E.164 prefix so city numbers are findable (e.g.
      // CH + "21" -> contains "+4121" = Lausanne; the leading trunk 0 dropped).
      const NANP = parsed.data.countryCode === "US" || parsed.data.countryCode === "CA";
      const DIAL_PREFIX: Record<string, string> = {
        FR: "33", CH: "41", BE: "32", GB: "44", DE: "49",
        ES: "34", IT: "39", NL: "31", PT: "351", IE: "353",
      };
      const area = parsed.data.areaCode?.replace(/^0+/, "");
      const contains =
        !NANP && area && DIAL_PREFIX[parsed.data.countryCode]
          ? `+${DIAL_PREFIX[parsed.data.countryCode]}${area}`
          : undefined;
      const purchased = await provider.buyNumber({
        countryCode: parsed.data.countryCode,
        areaCode: parsed.data.areaCode,
        contains,
        smsCapability: parsed.data.smsCapability,
      });
      const [row] = await db
        .insert(phoneNumberPool)
        .values({
          tenantId: authCtx.tenantId,
          e164: purchased.e164,
          twilioSid: purchased.providerSid,
          countryCode: purchased.countryCode,
          areaCode: purchased.areaCode,
          voiceCapability: purchased.voiceCapability,
          smsCapability: purchased.smsCapability,
        })
        .returning();
      return Response.json({ ok: true, number: row });
    } catch (err) {
      const code =
        err instanceof VoiceProviderError ? err.code : "provider_error";
      logger.warn?.("numbers/buy failed", {
        code,
        countryCode: parsed.data.countryCode,
        areaCode: parsed.data.areaCode,
        message: err instanceof Error ? err.message : String(err),
      });
      const status =
        code === "no_inventory" || code === "address_required"
          ? 409
          : code === "not_configured"
            ? 503
            : 502;
      return Response.json(
        {
          error:
            code === "no_inventory"
              ? "No Twilio inventory matches the requested location"
              : code === "address_required"
                ? (err instanceof Error ? err.message : "A validated local address is required for this country.")
                : "Provider purchase failed",
          code,
        },
        { status },
      );
    }
  });
}

export async function DELETE(req: Request) {
  return withAuthRLS(async (authCtx) => {
    // Releasing a pool number changes what the whole team can dial from.
    const denied = requirePermission(authCtx.role, "billing:manage");
    if (denied) return denied;
    // CLE-12 — belt-and-braces matrix gate (outbound:paid; admin) on the fresh
    // DB role, resolved from the same route map the middleware uses.
    const capDenied = requireCapabilityForRequest(authCtx, req);
    if (capDenied) return capDenied;

    const url = new URL(req.url);
    const e164 = url.searchParams.get("e164");
    if (!e164) {
      return Response.json({ error: "Missing e164" }, { status: 400 });
    }
    // Phase 2 — soft delete via active=false. Twilio retention left to
    // a manual ops step until the Phase 4 admin teardown UI ships.
    await db
      .update(phoneNumberPool)
      .set({ active: false })
      .where(
        and(
          eq(phoneNumberPool.tenantId, authCtx.tenantId),
          eq(phoneNumberPool.e164, e164),
        ),
      );
    return Response.json({ ok: true });
  });
}
