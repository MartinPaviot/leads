import { withAuthRLS } from "@/lib/auth-utils";
import { buildDossier } from "@/lib/research/dossier-builder";
import { inngest } from "@/inngest/client";

/**
 * GET /api/research/dossier?company=stripe.com
 *
 * Returns a cached dossier if available, otherwise builds one synchronously.
 * For long-running builds, prefer triggering the Inngest function via POST.
 */
export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const { tenantId } = authCtx;
    const { searchParams } = new URL(req.url, "http://localhost");
    const company = searchParams.get("company");

    if (!company) {
      return Response.json(
        { error: "Missing 'company' query parameter (domain or company name)" },
        { status: 400 },
      );
    }

    try {
      const dossier = await buildDossier(company, tenantId);
      return Response.json(dossier);
    } catch (err) {
      return Response.json(
        { error: "Failed to build dossier", detail: String(err) },
        { status: 500 },
      );
    }
  });
}

/**
 * POST /api/research/dossier
 * Body: { company: "stripe.com" }
 *
 * Triggers asynchronous dossier generation via Inngest.
 * Returns immediately with a status indicating the job was queued.
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const { tenantId } = authCtx;

    let body: { company?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const company = body.company;
    if (!company) {
      return Response.json(
        { error: "Missing 'company' in request body (domain or company name)" },
        { status: 400 },
      );
    }

    // Fire Inngest event for background generation
    await inngest.send({
      name: "research/build-dossier",
      data: {
        companyNameOrDomain: company,
        tenantId,
      },
    });

    return Response.json({
      status: "queued",
      company,
      message: "Dossier generation started. It will be available via GET once complete.",
    });
  });
}
