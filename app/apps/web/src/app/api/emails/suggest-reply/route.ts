import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/traced-ai";
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
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
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

    const prompt = `Generate 3 reply options for this incoming email. Each reply should have a different tone and serve a different purpose.

FROM: ${senderName || "Unknown"} <${senderEmail || "unknown"}>

EMAIL CONTENT:
${emailContent}

Generate exactly 3 replies:
1. "brief" — A short, friendly reply that moves things forward (2-3 sentences max). Must include a concrete next step.
2. "detailed" — A thorough response addressing every question or topic raised. Shows you read carefully.
3. "decline" — A gracious decline or deferral. Suggests an alternative path or timeline. Zero guilt, door stays open.

<examples>
<example>
INCOMING: "Hi, can you send me your pricing? We're evaluating tools this quarter."
BRIEF: "Hi Sarah, our Pro plan starts at $299/mo for teams up to 20. I'll send the full breakdown with a comparison sheet — should land in your inbox within the hour."
DETAILED: "Hi Sarah, happy to share pricing details. We have three tiers: Starter ($99/mo, up to 5 users), Pro ($299/mo, up to 20 users, includes API access and priority support), and Enterprise (custom pricing for 20+ users with SSO, dedicated CSM, and SLA guarantees). Since you mentioned you're evaluating this quarter, I can also set up a sandbox environment so your team can test it hands-on. Would a 20-minute walkthrough be helpful? I have availability Thursday or Friday afternoon."
DECLINE: "Hi Sarah, thanks for reaching out. We're actually at capacity for new onboardings this month — I want to make sure every customer gets proper attention during setup. Can I circle back the first week of next month? In the meantime, here's a self-serve demo that might answer some of your initial questions: [link]"
</example>
</examples>

RULES:
- Reference specific points from the original email — never give a generic reply
- Use ${senderName || "the sender"}'s name naturally (once, not repeatedly)
- Match formality to the incoming email's tone
- No "I hope this finds you well" or "Thanks for reaching out" openers
- Every reply must have a clear call-to-action or next step
- Keep the brief reply under 40 words, the detailed reply under 150 words`;

    const { object } = await tracedGenerateObject({
      model,
      schema: suggestReplySchema,
      prompt,
      _trace: { agentId: "suggest-reply", tenantId: authCtx.tenantId },
    });
    const result = object as any;

    return Response.json({ replies: result.replies });
  } catch (error) {
    console.error("Reply suggestion failed:", error);
    return Response.json({ error: "Reply suggestion failed" }, { status: 500 });
  }
}
