import { getAuthContext } from "@/lib/auth/auth-utils";
import { ingestEpisode } from "@/lib/ai/context-graph";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { content, sourceType, sourceId } = await req.json();
  if (!content) return Response.json({ error: "content is required" }, { status: 400 });

  const result = await ingestEpisode(
    authCtx.tenantId,
    content,
    sourceType || "manual",
    sourceId,
  );

  return Response.json({ success: true, ...result });
}
