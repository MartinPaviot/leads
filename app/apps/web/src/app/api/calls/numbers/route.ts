/**
 * GET  /api/calls/numbers — list the tenant pool
 * POST /api/calls/numbers — provision a new number via Twilio and insert
 *                           into phone_number_pool. Body:
 *   { countryCode: "FR" | "US" | ..., areaCode?: "415", smsCapability?: bool }
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
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
      const purchased = await provider.buyNumber({
        countryCode: parsed.data.countryCode,
        areaCode: parsed.data.areaCode,
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
        code === "no_inventory" ? 409 : code === "not_configured" ? 503 : 502;
      return Response.json(
        {
          error:
            code === "no_inventory"
              ? "No Twilio inventory matches the requested area code"
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
