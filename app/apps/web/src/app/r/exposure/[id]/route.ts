/**
 * WS-1: tracked CTA redirect for the meeting-summary email footer.
 *
 * When a prospect clicks the "Voir comment ça marche" link, we:
 *   1. Mark the exposure as clicked (idempotent)
 *   2. Detect if the click likely comes from the EU; if so, render a light
 *      opt-in page rather than redirecting directly, so we don't drop a
 *      tracking param without consent.
 *   3. Otherwise 302 to the marketing landing page with a ref parameter.
 */

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notetakerExposures } from "@/db/schema";
import { isLikelyEu } from "@/lib/geo-detect";

const LANDING_URL = process.env.WS1_LANDING_URL || "/";

function getAppBaseUrl(req: Request): string {
  const envBase = process.env.APP_BASE_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [exposure] = await db
    .select()
    .from(notetakerExposures)
    .where(eq(notetakerExposures.id, id))
    .limit(1);

  if (!exposure) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Idempotent click recording
  if (!exposure.ctaClickedAt) {
    await db
      .update(notetakerExposures)
      .set({ ctaClickedAt: new Date() })
      .where(
        and(
          eq(notetakerExposures.id, id),
          isNull(notetakerExposures.ctaClickedAt)
        )
      );
  }

  const base = getAppBaseUrl(req);
  const landingAbs = LANDING_URL.startsWith("http")
    ? LANDING_URL
    : `${base}${LANDING_URL}`;
  const landingWithRef = `${landingAbs}${landingAbs.includes("?") ? "&" : "?"}ref=exposure_${id}`;

  if (isLikelyEu(req, exposure.participantEmail)) {
    const u = new URL(req.url);
    if (u.searchParams.get("consent") !== "1") {
      return new NextResponse(renderConsentHtml(id, landingWithRef), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  return NextResponse.redirect(landingWithRef, 302);
}

function renderConsentHtml(exposureId: string, continueUrl: string): string {
  const continueWithConsent = `/r/exposure/${exposureId}?consent=1`;
  const declineUrl = continueUrl.replace(/[?&]ref=[^&]+/, "");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Elevay — consentement</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 10vh auto; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { line-height: 1.5; color: #444; }
    .actions { margin-top: 20px; display: flex; gap: 12px; }
    a.btn { padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; }
    a.primary { background: #111; color: #fff; }
    a.secondary { background: #eee; color: #111; }
  </style>
</head>
<body>
  <h1>Un instant avant de continuer</h1>
  <p>Elevay enregistre votre clic sur ce lien pour mesurer l'efficacité de notre produit. Ce tracking est strictement utilisé à des fins statistiques internes.</p>
  <p>Souhaitez-vous continuer ?</p>
  <div class="actions">
    <a class="btn primary" href="${continueWithConsent}">Oui, continuer</a>
    <a class="btn secondary" href="${declineUrl}">Non merci</a>
  </div>
</body>
</html>`;
}
