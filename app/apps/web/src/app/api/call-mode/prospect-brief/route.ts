/**
 * GET /api/call-mode/prospect-brief?contactId=X
 *
 * Returns the pre-call prospect brief (person background + company web
 * summary), building and caching it when stale — same read-semantics
 * precedent as GET /api/research/dossier (a viewer opening the fiche is a
 * read, even though a cache write may happen server-side). Tenant scope is
 * enforced inside the builder via the auth context.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { getProspectBrief } from "@/lib/call-mode/prospect-brief";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const { searchParams } = new URL(req.url, "http://localhost");
    const contactId = searchParams.get("contactId");
    if (!contactId) {
      return Response.json(
        { error: "Missing 'contactId' query parameter" },
        { status: 400 },
      );
    }

    try {
      const brief = await getProspectBrief(contactId, authCtx.tenantId);
      if (!brief) {
        return Response.json({ error: "Contact not found" }, { status: 404 });
      }
      return Response.json(brief);
    } catch (err) {
      console.error("[GET /api/call-mode/prospect-brief]", err);
      return Response.json(
        { error: "Failed to build prospect brief" },
        { status: 500 },
      );
    }
  });
}
