import { db } from "@/db";
import { proposalTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { detectComponents } from "@/lib/proposals/detect-components";
import type { SkillRunOptions } from "@/skills/types";
import type {
  ProposalTemplateDetectInput,
  ProposalTemplateDetectOutput,
} from "./schema";

/**
 * Detect the component structure of an already-ingested proposal template.
 * Pure read + LLM analysis: it does NOT write the result (the upload route
 * owns persistence + the degraded/abstain handling for the user). On no
 * model / empty text, detectComponents throws DetectionUnavailable, which
 * the runner surfaces as a failed skill result.
 */
export async function proposalTemplateDetectHandler(
  input: ProposalTemplateDetectInput,
  options: SkillRunOptions,
): Promise<ProposalTemplateDetectOutput> {
  const [tpl] = await db
    .select()
    .from(proposalTemplates)
    .where(
      and(
        eq(proposalTemplates.id, input.templateId),
        eq(proposalTemplates.tenantId, options.tenantId),
      ),
    )
    .limit(1);

  if (!tpl) {
    throw new Error(`Proposal template ${input.templateId} not found`);
  }

  const text = tpl.extractedText ?? "";
  const outline = (tpl.extractedOutline ?? []) as Array<{
    level: number;
    text: string;
    offset: number;
  }>;

  const { componentMap, meta } = await detectComponents(text, outline, {
    tenantId: options.tenantId,
  });

  return { templateId: tpl.id, componentMap, detectionMeta: meta };
}
