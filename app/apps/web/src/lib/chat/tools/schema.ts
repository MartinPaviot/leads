import { z } from "zod";
import { getTenantSettings } from "@/lib/tenant-settings";
import { makeTool, type ToolContext } from "./context";

export function buildSchemaTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    listSchema: makeTool({
      description:
        "Introspect the workspace's full schema: standard entity types (contact, company, deal, task, note, activity, sequence), custom fields, pipeline stages, custom object types, and custom signal definitions. Use this as the FIRST call when you're unsure what fields or objects a tenant has defined, or before creating/updating records with custom schemas. Lightweight — always safe to call.",
      inputSchema: z.object({}).describe("No parameters"),
      execute: async () => {
        const settings = await getTenantSettings(tenantId);
        // Loose-typed projection: some fields (customSignals, workflows,
        // knowledge entry id) aren't in the strict TenantSettings type but
        // are set at runtime by their respective endpoints.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loose = settings as any;

        return {
          standardEntities: [
            "contact",
            "company",
            "deal",
            "task",
            "note",
            "activity",
            "sequence",
          ],
          customFields: settings.customFields || [],
          pipelineStages: settings.pipelineStages || [
            { id: "lead", name: "Lead", category: "in_progress" },
            { id: "qualification", name: "Qualification", category: "in_progress" },
            { id: "demo", name: "Demo", category: "in_progress" },
            { id: "trial", name: "Trial", category: "in_progress" },
            { id: "proposal", name: "Proposal", category: "in_progress" },
            { id: "negotiation", name: "Negotiation", category: "in_progress" },
            { id: "won", name: "Won", category: "done" },
            { id: "lost", name: "Lost", category: "done" },
          ],
          customObjectTypes: settings.customObjectTypes || [],
          customSignals: loose.customSignals || [],
          knowledgeTopics: (
            (settings.knowledge as Array<{ id?: string; topic: string }>) || []
          ).map((k) => ({ id: k.id || "", topic: k.topic })),
          workflowCount: (loose.workflows || []).length,
          icp: {
            productDescription: settings.productDescription,
            salesMotion: settings.salesMotion,
            targetIndustries: settings.targetIndustries,
            targetCompanySizes: settings.targetCompanySizes,
            targetRoles: settings.targetRoles,
            targetGeographies: settings.targetGeographies,
          },
        };
      },
    }),
  };
}
