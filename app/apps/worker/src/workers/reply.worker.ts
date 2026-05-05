import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import Anthropic from "@anthropic-ai/sdk";
import { db, outboundEmails, emailOptouts, sequenceEnrollments } from "../db.js";
import { eq } from "drizzle-orm";

export function createReplyWorker() {
  const worker = new Worker(
    "outbound:reply",
    async (job) => {
      const { outboundEmailId, replyText, replyFrom, replyMessageId } = job.data;

      let classification = "unknown";
      try {
        const client = new Anthropic();
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          messages: [
            {
              role: "user",
              content: `Classify this email reply into one category: interested, not_interested, ooo, unsubscribe, question

Reply from: ${replyFrom}
Reply text: ${replyText?.substring(0, 500)}

Respond with ONLY the category name.`,
            },
          ],
        });
        const text = response.content[0].type === "text" ? response.content[0].text : "";
        classification = text.trim().toLowerCase();
        if (!["interested", "not_interested", "ooo", "unsubscribe", "question"].includes(classification)) {
          classification = "question";
        }
      } catch (err) {
        console.warn("[reply] Classification failed, defaulting to 'question':", err);
        classification = "question";
      }

      await db
        .update(outboundEmails)
        .set({
          repliedAt: new Date(),
          replyClassification: classification,
          replySnippet: (replyText || "").substring(0, 200),
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, outboundEmailId));

      const [email] = await db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.id, outboundEmailId));
      if (!email) return;

      switch (classification) {
        case "unsubscribe":
          await db
            .insert(emailOptouts)
            .values({
              tenantId: email.tenantId,
              emailAddress: email.toAddress,
              reason: "unsubscribe",
            })
            .onConflictDoNothing();
          if (email.enrollmentId) {
            await db
              .update(sequenceEnrollments)
              .set({ status: "unsubscribed" as any })
              .where(eq(sequenceEnrollments.id, email.enrollmentId));
          }
          break;

        case "not_interested":
        case "interested":
        case "question":
          if (email.enrollmentId) {
            await db
              .update(sequenceEnrollments)
              .set({ status: "replied" as any })
              .where(eq(sequenceEnrollments.id, email.enrollmentId));
          }
          break;

        case "ooo":
          if (email.enrollmentId) {
            await db
              .update(sequenceEnrollments)
              .set({ status: "paused" as any })
              .where(eq(sequenceEnrollments.id, email.enrollmentId));
          }
          break;
      }

      console.log(`[reply] Classified reply to ${outboundEmailId}: ${classification}`);
    },
    { connection, concurrency: 4 }
  );

  worker.on("error", (err) => console.error("[reply-worker] Error:", err));
  return worker;
}
