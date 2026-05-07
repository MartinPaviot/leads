import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  connectedMailboxes,
  outboundEmails,
  emailOptouts,
  sequenceEnrollments,
  warmupEmails,
  pipelineEvents,
} from "@web/db/schema";

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, {
  schema: {
    connectedMailboxes,
    outboundEmails,
    emailOptouts,
    sequenceEnrollments,
    warmupEmails,
    pipelineEvents,
  },
});

export {
  connectedMailboxes,
  outboundEmails,
  emailOptouts,
  sequenceEnrollments,
  warmupEmails,
  pipelineEvents,
};
