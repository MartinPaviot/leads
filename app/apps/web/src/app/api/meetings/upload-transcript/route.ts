import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import OpenAI from "openai";

function parseVTTorSRT(content: string): string {
  return content
    .replace(/WEBVTT\n/g, "")
    .replace(/\d+\n/g, "")
    .replace(/[\d:.,-]+\s*-->\s*[\d:.,-]+\n?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const pastedText = formData.get("text") as string | null;
    const meetingId = formData.get("meetingId") as string | null;
    const dealId = formData.get("dealId") as string | null;

    let transcript = "";

    if (pastedText && pastedText.trim().length >= 50) {
      transcript = pastedText.trim();
    } else if (file) {
      const fileName = file.name.toLowerCase();
      const isAudio = /\.(mp3|m4a|webm|wav|ogg|flac)$/.test(fileName);
      const isSubtitle = /\.(vtt|srt)$/.test(fileName);

      if (isAudio) {
        if (file.size > 25 * 1024 * 1024) {
          return Response.json({ error: "Audio file too large. Max 25MB." }, { status: 400 });
        }

        if (!process.env.OPENAI_API_KEY) {
          return Response.json({ error: "OpenAI API key required for audio transcription" }, { status: 500 });
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const transcription = await openai.audio.transcriptions.create({
          model: "gpt-4o-mini-transcribe",
          file: file,
          response_format: "verbose_json",
        });

        transcript = transcription.text;
      } else if (isSubtitle) {
        const text = await file.text();
        transcript = parseVTTorSRT(text);
      } else {
        // Plain text file
        if (file.size > 5 * 1024 * 1024) {
          return Response.json({ error: "Text file too large. Max 5MB." }, { status: 400 });
        }
        transcript = await file.text();
      }
    } else {
      return Response.json({ error: "Provide a file or pasted text" }, { status: 400 });
    }

    if (transcript.trim().length < 50) {
      return Response.json({ error: "Transcript too short (min 50 characters)" }, { status: 400 });
    }

    // Get meeting activity if meetingId provided
    let activityId: string | undefined;
    let existingDealId: string | undefined;

    if (meetingId) {
      const [meeting] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.id, meetingId),
            eq(activities.tenantId, authCtx.tenantId),
            isNull(activities.deletedAt)
          )
        )
        .limit(1);

      if (meeting) {
        activityId = meeting.id;
        const meta = meeting.metadata as any;
        if (meta?.structuredNotes) {
          // Notes already exist — check for overwrite flag
          const overwrite = formData.get("overwrite") === "true";
          if (!overwrite) {
            return Response.json({
              error: "Notes already exist for this meeting",
              code: "NOTES_EXIST",
              existingNotes: meta.structuredNotes,
            }, { status: 409 });
          }
        }
      }
    }

    // Call the existing process-transcript pipeline
    const processRes = await fetch(new URL("/api/meetings/process-transcript", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        transcript,
        meetingTitle: formData.get("title") || undefined,
        meetingDate: formData.get("date") || undefined,
        activityId,
        dealId: dealId || existingDealId,
      }),
    });

    if (!processRes.ok) {
      const err = await processRes.json();
      return Response.json({ error: err.error || "Processing failed" }, { status: 500 });
    }

    const result = await processRes.json();

    // Mark the activity with transcript source
    if (activityId) {
      const [existing] = await db.select().from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt))).limit(1);
      if (existing) {
        const meta = (existing.metadata || {}) as Record<string, unknown>;
        await db.update(activities).set({
          metadata: {
            ...meta,
            hasTranscript: true,
            transcriptSource: file && /\.(mp3|m4a|webm|wav|ogg|flac)$/.test(file.name.toLowerCase())
              ? "audio_whisper"
              : "file_upload",
          },
        }).where(and(eq(activities.id, activityId), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)));
      }
    }

    return Response.json({
      success: true,
      notes: result.notes,
      matchedContacts: result.matchedContacts,
      activityId,
    });
  } catch (error) {
    console.error("Transcript upload failed:", error);
    return Response.json({ error: "Transcript upload failed" }, { status: 500 });
  }
}
