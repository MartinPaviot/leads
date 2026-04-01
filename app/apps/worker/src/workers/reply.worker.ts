import { Worker } from "bullmq";
import { connection } from "../queues/index.js";
import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export function createReplyWorker() {
  const worker = new Worker(
    "outbound:reply",
    async (job) => {
      const { outboundEmailId, replyText, replyFrom, replyMessageId } = job.data;

      // Classify the reply using Claude
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

      // Update outbound email
      await sql`
        UPDATE outbound_emails SET
          replied_at = NOW(),
          reply_classification = ${classification},
          reply_snippet = ${(replyText || "").substring(0, 200)},
          updated_at = NOW()
        WHERE id = ${outboundEmailId}
      `;

      // Take action based on classification
      const [email] = await sql`SELECT * FROM outbound_emails WHERE id = ${outboundEmailId}`;
      if (!email) return;

      switch (classification) {
        case "unsubscribe":
          // Opt-out + stop enrollment
          await sql`
            INSERT INTO email_optouts (id, tenant_id, email_address, reason)
            VALUES (gen_random_uuid(), ${email.tenant_id}, ${email.to_address}, 'unsubscribe')
            ON CONFLICT (tenant_id, email_address) DO NOTHING
          `;
          if (email.enrollment_id) {
            await sql`UPDATE sequence_enrollments SET status = 'unsubscribed' WHERE id = ${email.enrollment_id}`;
          }
          break;

        case "not_interested":
          // Stop enrollment
          if (email.enrollment_id) {
            await sql`UPDATE sequence_enrollments SET status = 'replied' WHERE id = ${email.enrollment_id}`;
          }
          break;

        case "interested":
        case "question":
          // Mark enrollment as replied (pause further steps)
          if (email.enrollment_id) {
            await sql`UPDATE sequence_enrollments SET status = 'replied' WHERE id = ${email.enrollment_id}`;
          }
          break;

        case "ooo":
          // Reschedule: pause enrollment, will resume later
          if (email.enrollment_id) {
            await sql`UPDATE sequence_enrollments SET status = 'paused' WHERE id = ${email.enrollment_id}`;
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
