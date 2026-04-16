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
  };
}
