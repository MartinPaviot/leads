import { auth } from "@/auth";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const suggestReplySchema = z.object({
  replies: z.array(
    z.object({
      tone: z.string().describe("The tone of the reply: 'brief', 'detailed', or 'decline'"),
      subject: z.string().describe("Reply email subject line"),
      body: z.string().describe("Reply email body"),
    })
  ).describe("2-3 reply options with different tones"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { emailContent, senderName, senderEmail } = body;

    if (!emailContent || typeof emailContent !== "string") {
      return Response.json({ error: "emailContent required" }, { status: 400 });
    }

    const prompt = `Generate 3 reply options for this incoming email. Each reply should have a different tone.

FROM: ${senderName || "Unknown"} <${senderEmail || "unknown"}>

EMAIL CONTENT:
${emailContent}

Generate exactly 3 replies:
1. "brief" — A short, friendly acknowledgment (2-3 sentences max)
2. "detailed" — A thorough, comprehensive response addressing all points raised
3. "decline" — A polite decline or deferral, suggesting an alternative if appropriate

RULES:
- Each reply should be professional and appropriate for a B2B sales context
- Reference specific points from the original email
- The "brief" reply should be actionable despite being short
- The "detailed" reply should address every question or topic raised
- The "decline" reply should be gracious and leave the door open
- Use the sender's name naturally in the replies`;

    const { object } = await generateObject({
      model,
      schema: suggestReplySchema,
      prompt,
    });

    return Response.json({ replies: object.replies });
  } catch (error) {
    console.error("Reply suggestion failed:", error);
    return Response.json({ error: "Reply suggestion failed" }, { status: 500 });
  }
}
