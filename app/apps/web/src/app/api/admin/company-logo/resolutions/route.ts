import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, desc, isNotNull, isNull } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = requireAdmin(authCtx);
  if (denied) return denied;

  const rows = await db
    .select({
      domain: companies.domain,
      name: companies.name,
      resolvedLogoUrl: companies.resolvedLogoUrl,
      resolvedLogoTier: companies.resolvedLogoTier,
      logoResolvedAt: companies.logoResolvedAt,
    })
    .from(companies)
    .where(and(isNotNull(companies.logoResolvedAt), isNull(companies.deletedAt)))
    .orderBy(desc(companies.logoResolvedAt))
    .limit(200);

  return NextResponse.json({ resolutions: rows });
}
