/**
 * Source prospects for a tenant's ICP, off an event. Fired by campaign
 * creation when the callable pool is short of the daily quota, and reusable
 * for an on-demand "fill my list" action. Thin wrapper over the lib so the
 * logic stays testable on its own.
 */

import { inngest } from "./client";
import { sourceProspectsForTenant } from "@/lib/voice/source-prospects";

export const sourceProspectsFromIcp = inngest.createFunction(
  {
    id: "source-prospects-from-icp",
    name: "Source prospects from ICP",
    retries: 1,
    concurrency: [{ limit: 2 }],
    triggers: [{ event: "call-campaign/source" }],
  },
  async ({ event, step }) => {
    const { tenantId, maxCompanies, maxContactsPerCompany } = event.data as {
      tenantId: string;
      maxCompanies?: number;
      maxContactsPerCompany?: number;
    };
    if (!tenantId) return { ok: false, reason: "no_tenant" };
    return step.run("source", () =>
      sourceProspectsForTenant({ tenantId, maxCompanies, maxContactsPerCompany }),
    );
  },
);
