/**
 * GET /api/brain/contact/[contactId] — Phase 4 endpoint.
 *
 * Returns the focal contact's brain : focalContact + direct
 * activities + owned deals + surrounding company brain. Tenant
 * scope is enforced server-side via getAuthContext.
 *
 * Query params (all optional) :
 *   ?directActivities=N    cap on direct activities (default 50)
 *   ?recentActivities=N    forwarded to companyBrain (default 50)
 *   ?contacts=N            forwarded to companyBrain (default 50)
 *   ?memories=N            forwarded to companyBrain (default 25)
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getContactBrain } from "@/lib/company-brain/get-contact-brain";

function parseIntCap(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) return fallback;
  return n;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await params;
  if (!contactId) {
    return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const directActivityCap = parseIntCap(
    url.searchParams.get("directActivities"),
    50,
  );
  const recentActivityCap = parseIntCap(
    url.searchParams.get("recentActivities"),
    50,
  );
  const contactCap = parseIntCap(url.searchParams.get("contacts"), 50);
  const memoryCap = parseIntCap(url.searchParams.get("memories"), 25);

  try {
    const brain = await getContactBrain(contactId, {
      tenantId: authCtx.tenantId,
      directActivityCap,
      recentActivityCap,
      contactCap,
      memoryCap,
    });
    if (!brain) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Attach the company's cached research dossier when one exists. We
    // only read the cache (companies.properties.dossier) — never trigger
    // a fresh build here, which is expensive (Apollo + LLM synth). This
    // is additive; consumers that don't need it ignore the field.
    let cachedDossier: unknown = null;
    // Enrichment-detected technologies (companies.properties.technologies —
    // filled by the Tech-stack criterion / tech-detect). A DIFFERENT field from
    // the research dossier's techStack; Call Mode needs the union, so we expose
    // both and let the client merge (mergeTechStacks).
    let enrichedTechnologies: string[] = [];
    try {
      const companyId = brain.companyBrain.company.id;
      const [co] = await db
        .select({ properties: companies.properties })
        .from(companies)
        .where(
          and(eq(companies.id, companyId), eq(companies.tenantId, authCtx.tenantId)),
        )
        .limit(1);
      const props = (co?.properties ?? {}) as Record<string, unknown>;
      if (props.dossier) cachedDossier = props.dossier;
      if (Array.isArray(props.technologies)) {
        enrichedTechnologies = props.technologies.filter(
          (t): t is string => typeof t === "string" && t.trim().length > 0,
        );
      }
    } catch {
      // Dossier is a nice-to-have — never fail the brain over it.
    }

    return NextResponse.json({ ...brain, cachedDossier, enrichedTechnologies });
  } catch (err) {
    console.error("[GET /api/brain/contact]", err);
    return NextResponse.json(
      { error: "Failed to assemble contact brain" },
      { status: 500 },
    );
  }
}
