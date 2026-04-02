import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { chatThreads, chatMessages } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

/** GET: Load all messages for a thread */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify thread belongs to user
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, authCtx.userId)))
    .limit(1);

  if (!thread) return Response.json({ error: "Thread not found" }, { status: 404 });

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, id))
    .orderBy(asc(chatMessages.createdAt));

  return Response.json({
    thread,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      createdAt: m.createdAt,
    })),
  });
}

/** POST: Append messages to a thread */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify thread belongs to user
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, authCtx.userId)))
    .limit(1);

  if (!thread) return Response.json({ error: "Thread not found" }, { status: 404 });

  const { messages, title } = await req.json();

  // Save messages
  if (Array.isArray(messages) && messages.length > 0) {
    await db.insert(chatMessages).values(
      messages.map((m: { role: string; content: string; metadata?: unknown }) => ({
        threadId: id,
        role: m.role,
        content: m.content,
        metadata: m.metadata || {},
      }))
    );
  }

  // Update thread title and timestamp
  await db.update(chatThreads).set({
    ...(title ? { title } : {}),
    updatedAt: new Date(),
  }).where(eq(chatThreads.id, id));

  return Response.json({ ok: true });
}
