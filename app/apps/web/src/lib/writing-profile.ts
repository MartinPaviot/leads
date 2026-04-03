import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Fetch recent sent emails to use as few-shot writing style examples.
 * Returns the actual email bodies the user has written — the LLM mimics
 * their style naturally without needing a classification label.
 */
export async function getWritingSamples(
  tenantId: string,
  limit = 5
): Promise<string[]> {
  const sent = await db
    .select({ metadata: activities.metadata })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.activityType, "email_sent"),
      )
    )
    .orderBy(desc(activities.occurredAt))
    .limit(limit * 2); // Fetch extra in case some have empty bodies

  return sent
    .map((e) => {
      const meta = e.metadata as Record<string, unknown> | null;
      const body = (meta?.body as string) || "";
      // Trim to a reasonable size — we want style, not full content
      return body.slice(0, 600).trim();
    })
    .filter((b) => b.length > 50) // Skip tiny auto-replies
    .slice(0, limit);
}

/** Build the writing style section for email generation prompts. */
export function buildWritingStylePrompt(samples: string[]): string {
  if (samples.length === 0) return "";

  return `
WRITING STYLE (match this style exactly):
The following are real emails written by the sender. Reproduce their writing patterns — sentence length, vocabulary, greeting style, sign-off style, use of questions, punctuation, paragraph length, level of formality. Do NOT override with a generic business style.

${samples.map((s, i) => `--- Example ${i + 1} ---\n${s}`).join("\n\n")}
--- End of examples ---

Write the new email as if the sender wrote it themselves. Same voice, same rhythm, same mannerisms.`;
}
