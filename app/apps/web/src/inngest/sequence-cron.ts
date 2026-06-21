import { inngest } from "./client";
import { db } from "@/db";
import { sequenceEnrollments, sequences } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";

/**
 * Cron: check for sequence enrollments whose next step is due.
 * Runs every 15 minutes (sequence cadence is day-scale — 2-minute
 * resolution was pure waste). For each due enrollment, fires a
 * "sequence/step-due" event so the sendSequenceStep function picks it up.
 */
export const cronTriggerSequenceSteps = inngest.createFunction(
  {
    id: "cron-trigger-sequence-steps",
    name: "Cron: Trigger Due Sequence Steps",
    retries: 1,
    onFailure: async ({ error }) => {
      console.error("[DEAD LETTER] cron-trigger-sequence-steps failed:", error.message);
    },
    triggers: [{ cron: "*/15 * * * *" }],
    concurrency: [{ limit: 1 }],
  },
  async ({ step }) => {
    const dueEnrollments = await step.run("fetch-due-enrollments", async () => {
      // Gate on the PARENT sequence being 'active' too. The "Start"
      // button flips sequences.status draft→active; nothing used to read
      // it, so a campaign's enrollments sent while it was still a draft
      // (and pausing/archiving the campaign didn't stop sends). Joining
      // here makes Start/Pause/Archive actually control delivery.
      return db
        .select({ id: sequenceEnrollments.id })
        .from(sequenceEnrollments)
        .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
        .where(
          and(
            eq(sequenceEnrollments.status, "active"),
            eq(sequences.status, "active"),
            lte(sequenceEnrollments.nextStepAt, new Date())
          )
        )
        .limit(200);
    });

    if (dueEnrollments.length === 0) {
      return { triggered: 0 };
    }

    await step.run("fire-events", async () => {
      const events = dueEnrollments.map((e) => ({
        name: "sequence/step-due" as const,
        data: { enrollmentId: e.id },
      }));
      await inngest.send(events);
    });

    return { triggered: dueEnrollments.length };
  }
);
