/**
 * GET  /api/calls/script?sector=  — the rep's editable call script for a sector
 *                                   (persisted, or sensible defaults).
 * PUT  /api/calls/script          — save edits { sector?, fields }.
 */
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { loadTenantScript, upsertTenantScript } from "@/lib/call-mode/tenant-script";
import { z } from "zod";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const params = new URL(req.url).searchParams;
    const sector = params.get("sector");
    // The account name disambiguates the sector for the DEFAULT script (a
    // "Haute école de santé" is a school, not an EMS — Apollo's industry lies).
    const name = params.get("name");
    const script = await loadTenantScript(authCtx.tenantId, sector, name);
    return Response.json({ script });
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
