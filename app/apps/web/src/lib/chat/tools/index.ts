import type { ToolContext } from "./context";
import { buildSchemaTools } from "./schema";
import { buildQueryTools } from "./query";
import { buildCreateTools } from "./create";
import { buildUpdateTools } from "./update";
import { buildActionTools } from "./action";
import { buildMemoryTools } from "./memory";
import { buildIntelligenceTools } from "./intelligence";
import { buildSkillsTools } from "./skills";
import { buildUndoTools } from "./undo";
import { buildBriefingTools } from "./briefing";
import { buildCoachingTools } from "./coaching";
import { buildResearchTools } from "./research";
import { buildForecastTools } from "./forecast";
import { buildStakeholderTools } from "./stakeholder";
import { buildWorkflowTools } from "./workflow";
import { buildImportTools } from "./import";
import { buildCodeExecutionTools } from "./code-execution";
import { buildBrainTools } from "./brain";
import { buildEnrichmentTools } from "./enrichment";
import { buildCallTools } from "./calls";
import { buildNavigationTools } from "./navigation";
import { buildReadGapTools } from "./read-gaps";
import { buildKnowledgeTools } from "./knowledge";
import { buildCustomSkillTools } from "./custom-skills";
import { buildPageActionTools } from "./page-actions";

export type { ToolContext } from "./context";
export { makeTool } from "./context";

export function buildAllChatTools(ctx: ToolContext) {
  return {
    ...buildSchemaTools(ctx),
    ...buildQueryTools(ctx),
    ...buildCreateTools(ctx),
    ...buildUpdateTools(ctx),
    ...buildActionTools(ctx),
    ...buildMemoryTools(ctx),
    ...buildIntelligenceTools(ctx),
    ...buildSkillsTools(ctx),
    ...buildUndoTools(ctx),
    ...buildBriefingTools(ctx),
    ...buildCoachingTools(ctx),
    ...buildResearchTools(ctx),
    ...buildForecastTools(ctx),
    ...buildStakeholderTools(ctx),
    ...buildWorkflowTools(ctx),
    ...buildImportTools(ctx),
    ...buildCodeExecutionTools(ctx),
    ...buildBrainTools(ctx),
    ...buildEnrichmentTools(ctx),
    ...buildCallTools(ctx),
    ...buildNavigationTools(ctx),
    ...buildReadGapTools(ctx),
    ...buildKnowledgeTools(ctx),
    ...buildCustomSkillTools(ctx),
    ...buildPageActionTools(ctx),
  };
}
