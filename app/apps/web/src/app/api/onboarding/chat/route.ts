/**
 * F009 — Conversational Onboarding API
 *
 * Takes conversation messages, generates agent response, and extracts
 * onboarding data. When the agent has enough info and the user confirms,
 * it saves the configuration and triggers TAM build.
 */

import { generateObject, generateText } from "ai";
import { anthropic } from "@/lib/ai-provider";
import { buildOnboardingSystemPrompt } from "@/lib/prompts/onboarding-system-prompt";
import { getAuthContext } from "@/lib/auth-utils";
import { updateTenantSettings } from "@/lib/tenant-settings";
import { inngest } from "@/inngest/client";
import { z } from "zod";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { messages, userName, companyDomain, hasEmailConnected } = body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "No LLM configured" }, { status: 500 });
  }
  const model = anthropic("claude-sonnet-4-6");

  const systemPrompt = buildOnboardingSystemPrompt({
    userName,
    companyDomain,
    hasEmailConnected: !!hasEmailConnected,
  });

  const conversationMessages = (messages || []).map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // If the user has sent at least 1 message, try to extract structured data
  const userMessages = conversationMessages.filter((m: { role: string }) => m.role === "user");
  let extractedData = null;
  let isComplete = false;

  if (userMessages.length >= 1) {
    try {
      const classificationModel = anthropic("claude-haiku-4-5-20251001");
      {
        const extraction = await generateObject({
          model: classificationModel,
          system: "Extract onboarding data from the conversation. Return null for fields you can't infer.",
          messages: conversationMessages,
          schema: z.object({
            productDescription: z.string().nullable(),
            salesMotion: z.enum(["outbound", "inbound", "plg", "channel", "mixed"]).nullable(),
            aiTone: z.enum(["formal", "casual", "direct", "consultative"]).nullable(),
            targetIndustries: z.array(z.string()).nullable(),
            targetCompanySizes: z.array(z.string()).nullable(),
            targetRoles: z.string().nullable(),
            targetGeographies: z.array(z.string()).nullable(),
            hasEnoughInfo: z.boolean(),
            userConfirmed: z.boolean(),
          }),
          temperature: 0.1,
        });
        extractedData = extraction.object;
      }
    } catch {
      // Extraction failed — continue conversation
    }
  }

  // If user confirmed and we have enough data, save everything
  if (extractedData?.userConfirmed && extractedData?.hasEnoughInfo) {
    try {
      const settingsUpdate: Record<string, unknown> = {
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
      };

      if (extractedData.productDescription) settingsUpdate.productDescription = extractedData.productDescription;
      if (extractedData.salesMotion) settingsUpdate.salesMotion = extractedData.salesMotion;
      if (extractedData.aiTone) settingsUpdate.aiTone = extractedData.aiTone;
      if (extractedData.targetIndustries) settingsUpdate.targetIndustries = extractedData.targetIndustries;
      if (extractedData.targetCompanySizes) settingsUpdate.targetCompanySizes = extractedData.targetCompanySizes;
      if (extractedData.targetRoles) settingsUpdate.targetRoles = extractedData.targetRoles;
      if (extractedData.targetGeographies) settingsUpdate.targetGeographies = extractedData.targetGeographies;

      await updateTenantSettings(authCtx.tenantId, settingsUpdate as any);

      // Trigger TAM build
      await inngest.send({
        name: "company/created",
        data: {
          tenantId: authCtx.tenantId,
          source: "onboarding-chat",
        },
      }).catch(() => {});

      isComplete = true;
    } catch {
      // Save failed — continue conversation
    }
  }

  // Generate agent response
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [
      ...conversationMessages,
      ...(isComplete
        ? [{ role: "system" as const, content: "The configuration has been saved successfully. Let the user know their workspace is ready and you're building their target accounts." }]
        : []),
    ],
    temperature: 0.4,
    maxOutputTokens: 500,
  });

  return Response.json({
    message: result.text,
    showEmailConnect: !hasEmailConnected && (extractedData?.hasEnoughInfo || conversationMessages.length >= 4),
    isComplete,
    extractedData: isComplete ? extractedData : undefined,
  });
}
