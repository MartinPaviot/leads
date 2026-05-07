import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { evalDatasets, evalCases, chatThreads, chatMessages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Seed eval dataset from chat history.
 * Extracts real user queries and agent responses as eval cases.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const { datasetId, limit } = await req.json();

  // Create or use existing dataset
  let targetDatasetId = datasetId;
  if (!targetDatasetId) {
    const [dataset] = await db.insert(evalDatasets).values({
      tenantId: authCtx.tenantId,
      name: `Auto-seeded ${new Date().toISOString().split("T")[0]}`,
      description: "Seeded from chat history",
    }).returning();
    targetDatasetId = dataset.id;
  }

  // Get recent chat threads
  const threads = await db.select().from(chatThreads)
    .where(eq(chatThreads.tenantId, authCtx.tenantId))
    .orderBy(desc(chatThreads.createdAt))
    .limit(limit || 25);

  let casesCreated = 0;

  for (const thread of threads) {
    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.threadId, thread.id))
      .orderBy(chatMessages.createdAt);

    // Extract user→assistant pairs
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      const next = messages[i + 1];
      if (msg.role === "user" && next.role === "assistant") {
        const input = msg.content || "";
        const expectedOutput = next.content || "";

        if (input.length > 10 && expectedOutput.length > 10) {
          await db.insert(evalCases).values({
            datasetId: targetDatasetId,
            input,
            expectedOutput,
            tags: ["seeded", "chat_history"],
            metadata: { threadId: thread.id, sourceDate: msg.createdAt },
          });
          casesCreated++;
        }
      }
    }
  }

  return Response.json({
    success: true,
    datasetId: targetDatasetId,
    casesCreated,
    threadsScanned: threads.length,
  });
}
