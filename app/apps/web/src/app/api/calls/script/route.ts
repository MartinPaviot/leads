/**
 * GET  /api/calls/script?sector=  — the rep's editable call script for a sector
 *                                   (persisted, or sensible defaults).
 * PUT  /api/calls/script          — save edits { sector?, fields }.
 */
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { loadTenantScript, upsertTenantScript } from "@/lib/call-mode/tenant-script";
import { classifyScriptSector } from "@/lib/call-mode/sector-classify";
import { matchSectorKey } from "@/lib/call-mode/call-scripts";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const params = new URL(req.url).searchParams;
    const sector = params.get("sector");
    const name = params.get("name");
    const companyId = params.get("companyId");
    const domain = params.get("domain");

    // Cross the company's signals (NAICS, name, our classif, industry) to
    // resolve the sector reliably — Apollo's free-text industry alone misleads
    // (a "Haute école de santé" is tagged "hospital & health care").
    let resolvedKey: string | null = null;
    let via: string[] = [];
    if (companyId || domain) {
      const [company] = await db
        .select({ name: companies.name, industry: companies.industry, properties: companies.properties })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), companyId ? eq(companies.id, companyId) : eq(companies.domain, domain!)))
        .limit(1);
      if (company) {
        const p = (company.properties ?? {}) as Record<string, unknown>;
        const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : null);
        const cls = classifyScriptSector({
          name: company.name,
          industry: company.industry,
          naics: arr(p.naics_codes),
          sic: arr(p.sic_codes),
          icpSector: typeof p.icp_sector === "string" ? p.icp_sector : null,
          keywords: arr(p.keywords),
        });
        resolvedKey = cls.key;
        via = cls.via;
      }
    }
    // No company row → best-effort substring on name + typed sector.
    if (!resolvedKey) resolvedKey = matchSectorKey([name, sector].filter(Boolean).join(" "));

    const script = await loadTenantScript(authCtx.tenantId, sector, resolvedKey);
    return Response.json({ script, resolvedSector: resolvedKey, via });
  });
}

const putSchema = z.object({
  sector: z.string().trim().max(120).optional(),
  fields: z.object({
    opener: z.string().trim().min(1).max(2000),
    // Récit-pair enjeux are long (quote + two-door validation in one string).
    problems: z.array(z.string().trim().min(1).max(800)).max(5),
    // May be empty — the validation now travels inside each enjeu.
    permissionCheck: z.string().trim().max(1000),
    bookingAsk: z.string().trim().min(1).max(2000),
    guidance: z.array(z.string().trim().min(1).max(500)).max(8).optional(),
  }),
});

export async function PUT(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const raw = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid script", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const { sector, fields } = parsed.data;
    await upsertTenantScript({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      sector,
      fields: { ...fields, guidance: fields.guidance ?? [] },
      origin: "edited",
    });
    const script = await loadTenantScript(authCtx.tenantId, sector);
    return Response.json({ script });
  });
}
