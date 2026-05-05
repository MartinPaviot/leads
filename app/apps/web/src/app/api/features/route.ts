import { getAuthContext } from "@/lib/auth/auth-utils";

/** Returns available features based on configured environment variables */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    google: !!process.env.GOOGLE_CLIENT_ID,
    microsoft: !!process.env.MICROSOFT_CLIENT_ID,
    slack: !!process.env.SLACK_BOT_TOKEN,
    apollo: !!process.env.APOLLO_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    posthog: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    inngest: !!process.env.INNGEST_EVENT_KEY || !!process.env.INNGEST_SIGNING_KEY,
    recallai: !!process.env.RECALL_API_KEY,
  });
}
