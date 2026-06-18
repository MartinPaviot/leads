import { getAuthContext } from "@/lib/auth/auth-utils";
import { getVoicePrefs, saveVoicePrefs, VOICE_OPTIONS, type VoicePrefs } from "@/lib/inbox/voice-prefs";

/**
 * GET / PUT /api/inbox/voice  (INBOX-O03)
 *
 * The viewer's writing-voice calibration (tone preset + free-form guidance),
 * owner-scoped (user_preferences JSONB, no migration). Drafting endpoints prepend
 * buildVoicePrompt(prefs). Values are clamped on save.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const voice = await getVoicePrefs(authCtx.userId);
  return Response.json({ options: VOICE_OPTIONS, voice });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<VoicePrefs>;
  try {
    body = (await req.json()) as Partial<VoicePrefs>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const voice = await saveVoicePrefs(authCtx.userId, body);
  return Response.json({ options: VOICE_OPTIONS, voice });
}
