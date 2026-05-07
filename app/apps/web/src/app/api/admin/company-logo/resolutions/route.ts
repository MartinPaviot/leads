import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { desc, isNotNull } from "drizzle-orm";

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
    .where(isNotNull(companies.logoResolvedAt))
    .orderBy(desc(companies.logoResolvedAt))
    .limit(200);

  return NextResponse.json({ resolutions: rows });
}
