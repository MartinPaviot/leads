import { getAuthContext } from "@/lib/auth/auth-utils";
import { assetStoreFor } from "@/lib/copy/assets/db-store";
import { saveVoiceGuideVersion } from "@/lib/copy/assets/store";
import type { Lang, VoiceTopic } from "@/lib/copy/assets/resolve";

/**
 * Spec 18 — POST /api/copy/voice-guide { lang, favoredPhrasings[], formats[],
 * topics[{topic,pov}], bannedWords[], frFormality? } — save a new voice-guide
 * version for (tenant, lang). Append-only; supersedes the prior current row.
 * Grounds the brand voice the copy engine (19/20) enforces.
 */

const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function asTopics(v: unknown): VoiceTopic[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is { topic: string; pov: string } => !!t && typeof t.topic === "string" && typeof t.pov === "string")
    .map((t) => ({ topic: t.topic, pov: t.pov }));
}

export async function POST(request: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lang: Lang | null = body.lang === "en" || body.lang === "fr" ? body.lang : null;
  if (!lang) return Response.json({ error: "lang must be 'en' or 'fr'" }, { status: 400 });
  const frFormality = body.frFormality === "tutoiement" ? "tutoiement" : "vouvoiement";

  try {
    const guide = await saveVoiceGuideVersion(
      assetStoreFor(),
      {
        tenantId: authCtx.tenantId,
        lang,
        favoredPhrasings: asStringArray(body.favoredPhrasings),
        formats: asStringArray(body.formats),
        topics: asTopics(body.topics),
        bannedWords: asStringArray(body.bannedWords),
        frFormality,
      },
      () => crypto.randomUUID(),
    );
    return Response.json({ saved: guide });
  } catch (error) {
    console.error("Failed to save voice guide:", error);
    return Response.json({ error: "Failed to save voice guide" }, { status: 500 });
  }
}
