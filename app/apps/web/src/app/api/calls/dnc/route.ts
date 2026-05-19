/**
 * GET  /api/calls/dnc — list the tenant's DNC entries
 * POST /api/calls/dnc — add a number to the tenant DNC list
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { doNotCallList } from "@/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { addToDnc } from "@/lib/voice/dnc";

export async function GET() {
  return withAuthRLS(async (authCtx) => {
    const rows = await db
      .select()
      .from(doNotCallList)
      .where(
        or(
          eq(doNotCallList.tenantId, authCtx.tenantId),
          isNull(doNotCallList.tenantId),
        ),
      )
      .orderBy(desc(doNotCallList.addedAt))
      .limit(500);
    return Response.json({ entries: rows });
  });
}

const addSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{6,15}$/),
  reason: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = await req.json().catch(() => null);
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Bad request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await addToDnc(
      authCtx.tenantId,
      parsed.data.phoneNumber,
      parsed.data.reason,
      "manual",
    );
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const url = new URL(req.url);
    const phoneNumber = url.searchParams.get("phoneNumber");
    if (!phoneNumber) {
      return Response.json({ error: "Missing phoneNumber" }, { status: 400 });
    }
    await db
      .delete(doNotCallList)
      .where(
        and(
          eq(doNotCallList.tenantId, authCtx.tenantId),
          eq(doNotCallList.phoneNumber, phoneNumber),
        ),
      );
    return Response.json({ ok: true });
  });
}
