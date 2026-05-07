import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { chatThreads, chatMessages } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

/** POST: Create a new thread and save the first user message */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, contextType, contextId, firstMessage } = await req.json();

  const [thread] = await db.insert(chatThreads).values({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    title: title || null,
    contextType: contextType || "global",
    contextId: contextId || null,
  }).returning();

  // Save the first user message if provided
  if (firstMessage) {
    await db.insert(chatMessages).values({
      threadId: thread.id,
      role: "user",
      content: firstMessage,
    });
  }

  return Response.json({ thread });
}

/** GET: List recent threads */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      contextType: chatThreads.contextType,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.userId, authCtx.appUserId))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(20);

  return Response.json({ threads });
}
