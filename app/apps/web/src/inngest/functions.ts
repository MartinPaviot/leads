import { inngest } from "./client";

// Enrich a company after creation
export const enrichCompany = inngest.createFunction(
  {
    id: "enrich-company",
    name: "Enrich Company Data",
    triggers: [{ event: "company/created" }],
  },
  async ({ event, step }) => {
    const { companyId, tenantId } = event.data as {
      companyId: string;
      tenantId: string;
    };

    const enrichment = await step.run("enrich-from-providers", async () => {
      // TODO: Call Apollo, PDL, Hunter waterfall
      return { industry: null, headcount: null, revenue: null };
    });

    await step.run("update-company", async () => {
      // TODO: Update company with enrichment data
      return { updated: true };
    });

    return { companyId, tenantId, enriched: true };
  }
);

// Send sequence step email
export const sendSequenceStep = inngest.createFunction(
  {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    triggers: [{ event: "sequence/step-due" }],
  },
  async ({ event, step }) => {
    const { sequenceId, contactId, stepNumber } = event.data as {
      sequenceId: string;
      contactId: string;
      stepNumber: number;
    };

    const email = await step.run("generate-email", async () => {
      // TODO: Use LLM to generate personalized email
      return { subject: "placeholder", body: "placeholder" };
    });

    await step.run("send-email", async () => {
      // TODO: Send via email infrastructure
      return { sent: true };
    });

    return { sequenceId, contactId, stepNumber, sent: true };
  }
);
