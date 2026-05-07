import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Import schema from the web app — shared source of truth
import * as schema from "@web/db/schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle({ client, schema });

// Re-export schema for convenience
export { schema };
export {
  agentTraces,
  agentPromptVersions,
  agentFewShotExamples,
  agentFailurePatterns,
  evalDatasets,
  evalCases,
  evalRuns,
  evalResults,
  companies,
  contacts,
  deals,
  activities,
  sequences,
  sequenceEnrollments,
  outboundEmails,
  connectedMailboxes,
  contextGraphNodes,
  contextGraphEdges,
  notetakerExposures,
  tenantReferralCredits,
  referralCreditEvents,
  tenants,
  signalOutcomes,
  pipelineEvents,
} from "@web/db/schema";
