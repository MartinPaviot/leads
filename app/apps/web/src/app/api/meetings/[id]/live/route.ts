import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { z } from "zod";

const liveExtractionSchema = z.object({
  budget: z.string().nullable(),
  teamSize: z.string().nullable(),
  currentTools: z.array(z.string()),
  competitors: z.array(z.string()),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

// In-memory cache to avoid re-extracting on every poll
const extractionCache = new Map<string, { data: unknown; extractedAt: number; transcriptLength: number }>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!activity) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const meta = (activity.metadata || {}) as Record<string, unknown>;
  const partialTranscript = (meta.partialTranscript as string) || "";
  const recordingStatus = (meta.recordingStatus as string) || "unknown";
  const isLive = recordingStatus === "recording" || recordingStatus === "in_call";

  if (!partialTranscript || partialTranscript.length < 50) {
    return Response.json({
      isLive,
      status: recordingStatus,
      extraction: null,
      message: isLive ? "Waiting for transcript data..." : "No transcript available",
    });
  }

  // Check cache — only re-extract if transcript grew significantly
  const cached = extractionCache.get(id);
  if (cached && Math.abs(cached.transcriptLength - partialTranscript.length) < 200) {
    return Response.json({
      isLive,
      status: recordingStatus,
      extraction: cached.data,
      cachedAt: cached.extractedAt,
    });
  }

  // Extract fields from partial transcript
  try {
    const result = await tracedGenerateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: liveExtractionSchema,
      prompt: `Extract deal intelligence from this PARTIAL meeting transcript. Only extract what is clearly mentioned — return null for fields not discussed yet.

Transcript (may be incomplete):
${partialTranscript.slice(-5000)}

Extract: budget, team size, current tools/CRM, competitors, overall sentiment.`,
      maxTokens: 150,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
      _meta: { tenantId: authCtx.tenantId, feature: "live-meeting-extraction" },
    });

    const data = result.object;
    extractionCache.set(id, { data, extractedAt: Date.now(), transcriptLength: partialTranscript.length });

    return Response.json({
      isLive,
      status: recordingStatus,
      extraction: data,
      transcriptLength: partialTranscript.length,
    });
  } catch {
    return Response.json({
      isLive,
      status: recordingStatus,
      extraction: null,
      message: "Extraction in progress...",
    });
  }
}
