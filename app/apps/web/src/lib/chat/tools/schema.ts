import { z } from "zod";
import { getTenantSettings } from "@/lib/tenant-settings";
import { makeTool, type ToolContext } from "./context";

const STANDARD_ATTRIBUTES: Record<string, Array<{ name: string; type: string; description?: string }>> = {
  contact: [
    { name: "id", type: "text", description: "Primary key" },
    { name: "firstName", type: "text" },
    { name: "lastName", type: "text" },
    { name: "email", type: "email" },
    { name: "title", type: "text" },
    { name: "phone", type: "text" },
    { name: "companyId", type: "reference:company" },
    { name: "linkedinUrl", type: "url" },
    { name: "score", type: "number" },
    { name: "createdAt", type: "timestamp" },
    { name: "updatedAt", type: "timestamp" },
  ],
  company: [
    { name: "id", type: "text" },
    { name: "name", type: "text" },
    { name: "domain", type: "text" },
    { name: "industry", type: "text" },
    { name: "size", type: "text" },
    { name: "revenue", type: "text" },
    { name: "description", type: "text" },
    { name: "score", type: "number" },
    { name: "createdAt", type: "timestamp" },
  ],
  deal: [
    { name: "id", type: "text" },
    { name: "name", type: "text" },
    { name: "stage", type: "select", description: "lead|qualification|demo|trial|proposal|negotiation|won|lost" },
    { name: "value", type: "number" },
    { name: "summary", type: "text" },
    { name: "expectedCloseDate", type: "date" },
    { name: "companyId", type: "reference:company" },
    { name: "contactId", type: "reference:contact" },
    { name: "createdAt", type: "timestamp" },
  ],
  task: [
    { name: "id", type: "text" },
    { name: "title", type: "text" },
    { name: "description", type: "text" },
    { name: "status", type: "select", description: "pending|in_progress|completed|cancelled" },
    { name: "priority", type: "select", description: "low|medium|high" },
    { name: "dueDate", type: "timestamp" },
    { name: "entityType", type: "select", description: "contact|company|deal" },
    { name: "entityId", type: "text" },
  ],
  note: [
    { name: "id", type: "text" },
    { name: "title", type: "text" },
    { name: "content", type: "text" },
    { name: "entityType", type: "select" },
    { name: "entityId", type: "text" },
    { name: "createdAt", type: "timestamp" },
  ],
  activity: [
    { name: "id", type: "text" },
    { name: "activityType", type: "select" },
    { name: "channel", type: "select", description: "email|phone|meeting|linkedin|manual|system|other" },
    { name: "direction", type: "select", description: "inbound|outbound|internal" },
    { name: "summary", type: "text" },
    { name: "occurredAt", type: "timestamp" },
    { name: "entityType", type: "select" },
    { name: "entityId", type: "text" },
    { name: "metadata", type: "json" },
  ],
  sequence: [
    { name: "id", type: "text" },
    { name: "name", type: "text" },
    { name: "description", type: "text" },
    { name: "status", type: "select", description: "draft|active|paused|completed|archived" },
    { name: "createdAt", type: "timestamp" },
  ],
};

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

    listAttributeDefinitions: makeTool({
      description:
        "Get the list of attributes available on a specific object type — both standard fields (built-in) and custom fields (tenant-defined). Returns field name, type, and optional description. Use before reading/writing records when you need to know what fields exist.",
      inputSchema: z.object({
        objectType: z
          .string()
          .describe(
            "Object type: contact, company, deal, task, note, activity, sequence, or a custom object type id"
          ),
      }),
      execute: async (input) => {
        const settings = await getTenantSettings(tenantId);
        const standard = STANDARD_ATTRIBUTES[input.objectType];
        if (standard) {
          const customForType = (settings.customFields || []).filter(
            (f) => f.entityType === input.objectType
          );
          return {
            objectType: input.objectType,
            standardAttributes: standard,
            customAttributes: customForType.map((f) => ({
              name: f.name,
              type: f.type,
              options: f.options,
              aiFillMode: f.aiFillMode,
            })),
          };
        }
        // Check custom object types
        const customType = (settings.customObjectTypes || []).find(
          (t) => t.id === input.objectType
        );
        if (customType) {
          return {
            objectType: input.objectType,
            name: customType.name,
            nameSingular: customType.nameSingular,
            standardAttributes: [
              { name: "id", type: "text" },
              { name: "createdAt", type: "timestamp" },
              { name: "updatedAt", type: "timestamp" },
            ],
            customAttributes: customType.fields,
          };
        }
        return { error: `Unknown object type: ${input.objectType}` };
      },
    }),
  };
}
