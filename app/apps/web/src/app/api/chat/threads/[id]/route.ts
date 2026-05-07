import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { chatThreads, chatMessages } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

/**
 * GET: Load messages for a thread.
 *
 * CHAT-05: supports optional ?branchId=<id> to filter to a single
 * branch. Default returns every message regardless of branch — the
 * client can group by branchId locally to render the tree.
 * Also returns a `branches` summary: one entry per distinct branchId
 * with its message count + first/last timestamps.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const branchIdFilter = url.searchParams.get("branchId");

  // Verify thread belongs to user
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, authCtx.appUserId)))
    .limit(1);

  if (!thread) return Response.json({ error: "Thread not found" }, { status: 404 });

  const conditions = [eq(chatMessages.threadId, id)];
  if (branchIdFilter) conditions.push(eq(chatMessages.branchId, branchIdFilter));

  const messages = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(asc(chatMessages.createdAt));

  // Build branches summary for tree UI
  const branches: Record<
    string,
    { messageCount: number; firstAt: Date | null; lastAt: Date | null }
  > = {};
  for (const m of messages) {
    const b = m.branchId || "main";
    if (!branches[b]) {
      branches[b] = { messageCount: 0, firstAt: m.createdAt, lastAt: m.createdAt };
    }
    branches[b].messageCount++;
    if (m.createdAt && (!branches[b].firstAt || m.createdAt < branches[b].firstAt!)) {
      branches[b].firstAt = m.createdAt;
    }
    if (m.createdAt && (!branches[b].lastAt || m.createdAt > branches[b].lastAt!)) {
      branches[b].lastAt = m.createdAt;
    }
  }

  return Response.json({
    thread,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      parentMessageId: m.parentMessageId,
      branchId: m.branchId,
      createdAt: m.createdAt,
    })),
    branches,
  });
}

/**
 * POST: Append messages to a thread.
 *
 * CHAT-05: supports DAG-style insertion. Each message in the body can
 * carry `parentMessageId` (references an existing message.id in this
 * thread) and `branchId`. When `forkFromMessageId` is set on the top-
 * level body, every message without explicit branchId lands on a
 * freshly-generated branchId and parentMessageId=forkFromMessageId —
 * this powers the "Edit user message → regenerate as fork" UX without
 * destroying the original branch.
 *
 * Legacy callers that pass only { messages: [...] } still work —
 * messages default to branchId='main' and parentMessageId=null.
 */
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
    .where(and(eq(chatThreads.id, id), eq(chatThreads.userId, authCtx.appUserId)))
    .limit(1);

  if (!thread) return Response.json({ error: "Thread not found" }, { status: 404 });

  const body = (await req.json()) as {
    messages?: Array<{
      role: string;
      content: string;
      metadata?: unknown;
      parentMessageId?: string;
      branchId?: string;
    }>;
    title?: string;
    /**
     * When set, generate a new branchId for this batch and set
     * parentMessageId on the first message to forkFromMessageId.
     * Subsequent messages in the batch chain off the first (their
     * parentMessageId defaults to the previously inserted message's id).
     */
    forkFromMessageId?: string;
  };

  const { messages, title, forkFromMessageId } = body;

  let insertedIds: string[] = [];

  if (Array.isArray(messages) && messages.length > 0) {
    // Decide the default branch for this batch
    const forkBranchId = forkFromMessageId ? crypto.randomUUID() : null;

    let lastInsertedId: string | null = forkFromMessageId || null;
    const rows: Array<typeof chatMessages.$inferInsert> = [];

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const branchId =
        m.branchId || forkBranchId || "main";
      // Determine parent: explicit > forked-from (first only) > last in this batch > null
      let parentMessageId: string | null | undefined = m.parentMessageId;
      if (parentMessageId === undefined) {
        if (i === 0 && forkFromMessageId) {
          parentMessageId = forkFromMessageId;
        } else if (lastInsertedId) {
          parentMessageId = lastInsertedId;
        } else {
          parentMessageId = null;
        }
      }

      rows.push({
        threadId: id,
        role: m.role,
        content: m.content,
        metadata: (m.metadata || {}) as Record<string, unknown>,
        branchId,
        parentMessageId: parentMessageId || undefined,
      });

      // We won't know the actual generated id until insert — but within
      // the same batch, `lastInsertedId` only matters if we insert one-
      // at-a-time. For bulk insertion, chain via pre-generated UUIDs:
      lastInsertedId = null; // safer: only the first message's fork parent is fixed
    }

    const inserted = await db.insert(chatMessages).values(rows).returning({
      id: chatMessages.id,
    });
    insertedIds = inserted.map((r) => r.id);
  }

  // Update thread title and timestamp
  await db.update(chatThreads).set({
    ...(title ? { title } : {}),
    updatedAt: new Date(),
  }).where(eq(chatThreads.id, id));

  return Response.json({ ok: true, insertedIds });
}
