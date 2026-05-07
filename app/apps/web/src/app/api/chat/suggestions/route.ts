import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getTenantSettings(authCtx.tenantId);

  const suggestions: string[] = [];
  const role = settings.onboardingRole || "Founder";
  const challenge = settings.primaryChallenge || "";
  const firstName = settings.onboardingFullName?.split(" ")[0] || "";

  // Challenge-driven suggestions (highest priority)
  if (challenge === "Finding the right leads") {
    suggestions.push("Show me my top-scored prospects");
    suggestions.push("Find companies similar to my best accounts");
    suggestions.push("Who in my TAM hasn't been contacted yet?");
  } else if (challenge === "Getting responses") {
    suggestions.push("Which emails got the best open rates?");
    suggestions.push("Draft a follow-up for contacts who haven't replied");
    suggestions.push("What subject lines work best in my industry?");
  } else if (challenge === "Closing deals") {
    suggestions.push("Which deals are at risk of stalling?");
    suggestions.push("Prep me for my next meeting");
    suggestions.push("What objections am I hearing most?");
  } else if (challenge === "Expanding accounts") {
    suggestions.push("Which accounts have expansion potential?");
    suggestions.push("Find more contacts at my active accounts");
    suggestions.push("Who are my champions across accounts?");
  }

  // Role-driven suggestions
  if (role === "Founder") {
    suggestions.push("Give me a pipeline summary");
    suggestions.push("What should I focus on today?");
  } else if (role === "Sales / Growth") {
    suggestions.push("Who should I call next?");
    suggestions.push("Show me my overdue follow-ups");
  } else if (role === "Marketing") {
    suggestions.push("Which industries respond best to our outreach?");
    suggestions.push("Analyze our email performance this week");
  } else if (role === "RevOps") {
    suggestions.push("Show me conversion rates by stage");
    suggestions.push("Which sequences have the best engagement?");
  }

  // Universal fallbacks
  if (suggestions.length < 4) {
    suggestions.push("Research my accounts to determine my ICP");
    suggestions.push("Summarize my active opportunities");
  }

  return Response.json({
    suggestions: suggestions.slice(0, 6),
    firstName,
    role,
  });
}
