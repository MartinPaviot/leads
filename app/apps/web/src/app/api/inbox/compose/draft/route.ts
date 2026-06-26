import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { draftFromBullets } from "@/lib/inbox/draft-from-bullets";
import { getInboxMemory, buildMemoryPrompt } from "@/lib/inbox/ai-memory";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";
import { getVoicePrefs, buildVoicePrompt } from "@/lib/inbox/voice-prefs";
import { getWritingStyle, buildWritingStylePrompt } from "@/lib/inbox/writing-style";

/**
 * POST /api/inbox/compose/draft  { bullets, context? }  (INBOX-C07)
 * Drafts an email (subject + body) from bullet points. Stateless + read-only;
 * the composer fills itself in client-side. Fail-closed: empty ⇒ no change.
 */
const bodySchema = z.object({
  bullets: z.string().min(1).max(8_000),
  context: z.string().max(2_000).optional(),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message || "Validation failed" }, { status: 422 });
    }
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!aiEnabled(await getAiProfile(authCtx.userId))) {
    return Response.json({ subject: "", text: "" });
  }

  try {
    // Symmetric with compose/reply: lead with the writing-style persona (which
    // owns the canonical sign-off), then tone, then standing memory. Single
    // sign-off — when writing-style provides one, omit memory.signOffName so the
    // prompt never carries two signatures (Settings IA de-dup).
    const style = await getWritingStyle(authCtx.userId);
    const { prompt: stylePrompt } = buildWritingStylePrompt(style);
    const voice = buildVoicePrompt(await getVoicePrefs(authCtx.userId));
    const { prompt: memory } = buildMemoryPrompt(await getInboxMemory(authCtx.userId), {
      omitSignOff: Boolean(style.signOff?.trim()),
    });
    const instructions = [stylePrompt, voice, memory].filter(Boolean).join("\n\n");
    const result = await draftFromBullets(parsed.bullets, parsed.context, undefined, instructions);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to draft from bullets:", error);
    return Response.json({ error: "Failed to draft email" }, { status: 500 });
  }
}
