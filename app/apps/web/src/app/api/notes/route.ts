import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { ingestEpisode } from "@/lib/context-graph";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allNotes = await db
      .select()
      .from(notes)
      .where(eq(notes.tenantId, authCtx.tenantId))
      .orderBy(desc(notes.createdAt))
      .limit(100);

    return Response.json({ notes: allNotes });
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return Response.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, content, entityType, entityId } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return Response.json({ error: "Content is required" }, { status: 400 });
    }

    const [note] = await db
      .insert(notes)
      .values({
        tenantId: authCtx.tenantId,
        authorId: authCtx.appUserId,
        title: title?.trim() || null,
        content: content.trim(),
        entityType: entityType || null,
        entityId: entityId || null,
      })
      .returning();

    // Ingest into context graph (async, non-blocking)
    if (content.trim().length > 20) {
      const graphContent = `Note: ${title || "Untitled"}\n\n${content.trim().slice(0, 3000)}`;
      ingestEpisode(authCtx.tenantId, graphContent, "note", note.id).catch(() => {});
    }

    return Response.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Failed to create note:", error);
    return Response.json({ error: "Failed to create note" }, { status: 500 });
  }
}
