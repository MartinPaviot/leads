/**
 * GET /api/calls/config
 *
 * Lightweight bootstrap call for the /call-mode page: tells the client
 * whether Voice is configured for this workspace, current usage, and
 * how many pool numbers are provisioned. Avoids surfacing raw env vars.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { phoneNumberPool } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isVoiceConfigured } from "@/lib/voice";
import { getTenantUsage } from "@/lib/voice/usage-cap";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const configured = isVoiceConfigured();
    const pool = await db
      .select({
        e164: phoneNumberPool.e164,
        countryCode: phoneNumberPool.countryCode,
        areaCode: phoneNumberPool.areaCode,
      })
      .from(phoneNumberPool)
      .where(
        and(
          eq(phoneNumberPool.tenantId, authCtx.tenantId),
          eq(phoneNumberPool.active, true),
        ),
      );
    const usage = configured ? await getTenantUsage(authCtx.tenantId) : null;
    return Response.json({
      configured,
      ready: configured && pool.length > 0,
      pool,
      usage,
    });
  });
}
