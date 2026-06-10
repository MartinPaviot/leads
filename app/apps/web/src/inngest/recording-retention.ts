/**
 * SOC2 T11 — call-recording retention.
 *
 * Recordings are the heaviest PII artifact we hold (prospect voice).
 * Policy (07-data-retention-classification-policy.md): keep 90 days,
 * then delete the audio at Twilio AND null the pointer on `calls`.
 * Tenants can override via settings.recordingRetentionDays (min 7).
 * Transcripts are kept (life of contract) — they power post-call CRM,
 * coaching and search; only the audio is purged.
 *
 * Runs daily 04:00 UTC, after the 03:00 data-retention purge so a
 * canceled tenant's rows are already gone before we look at them.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { calls, tenants } from "@/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";

const DEFAULT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 7;

function retentionDaysFor(settings: unknown): number {
  const raw = (settings as { recordingRetentionDays?: unknown } | null)
    ?.recordingRetentionDays;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Math.floor(n));
}

function extractRecordingSid(url: string): string | null {
  const m = url.match(/RE[0-9a-f]{32}/);
  return m ? m[0] : null;
}

export const recordingRetentionPurge = inngest.createFunction(
  {
    id: "recording-retention-purge",
    name: "Call Recording Retention Purge (SOC2 T11)",
    retries: 2,
    triggers: [{ cron: "TZ=UTC 0 4 * * *" }], // daily, after the 03:00 data purge
  },
  async ({ step }) => {
    const tenantRows = await step.run("list-tenants-with-old-recordings", async () => {
      const rows = await db
        .select({ id: tenants.id, settings: tenants.settings })
        .from(tenants);
      return rows.map((t) => ({
        id: t.id,
        retentionDays: retentionDaysFor(t.settings),
      }));
    });

    const twilioConfigured =
      !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;

    let totalPurged = 0;
    for (const tenant of tenantRows) {
      const purged = await step.run(`purge-${tenant.id}`, async () => {
        const cutoff = new Date(
          Date.now() - tenant.retentionDays * 24 * 60 * 60 * 1000,
        );
        const oldCalls = await db
          .select({ id: calls.id, recordingUrl: calls.recordingUrl })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenant.id),
              isNotNull(calls.recordingUrl),
              lt(calls.startedAt, cutoff),
            ),
          )
          .limit(200); // daily cap; backlog drains over following runs

        if (oldCalls.length === 0) return 0;

        // Without Twilio credentials we cannot delete the remote audio —
        // leave the rows alone so a later configured run still finds them
        // (nulling the URL now would orphan the recording at Twilio).
        if (!twilioConfigured) {
          console.warn(
            `recording-retention: ${oldCalls.length} recordings past retention for tenant ${tenant.id} but Twilio env missing — skipped`,
          );
          return 0;
        }

        const twilio = (await import("twilio")).default;
        const client = twilio(
          process.env.TWILIO_ACCOUNT_SID!,
          process.env.TWILIO_AUTH_TOKEN!,
          process.env.TWILIO_REGION ? { region: process.env.TWILIO_REGION } : undefined,
        );

        let purgedCount = 0;
        for (const call of oldCalls) {
          const sid = call.recordingUrl
            ? extractRecordingSid(call.recordingUrl)
            : null;
          try {
            if (sid) {
              await client.recordings(sid).remove();
            }
          } catch (err) {
            const status = (err as { status?: number }).status;
            // 404 = already gone at Twilio; anything else: keep the row
            // for the next run rather than orphaning the audio.
            if (status !== 404) {
              console.warn(
                `recording-retention: Twilio delete failed for call ${call.id} (sid ${sid})`,
                err,
              );
              continue;
            }
          }
          await db
            .update(calls)
            .set({ recordingUrl: null })
            .where(eq(calls.id, call.id));
          purgedCount++;
        }

        if (purgedCount > 0) {
          const { logAudit } = await import("@/lib/infra/audit-log");
          await logAudit({
            tenantId: tenant.id,
            userId: "system",
            action: "delete",
            entityType: "call_recording",
            entityId: "retention-batch",
            metadata: {
              event: "recording_retention_purge",
              purgedCount,
              retentionDays: tenant.retentionDays,
            },
          });
        }
        return purgedCount;
      });
      totalPurged += purged;
    }

    return { tenants: tenantRows.length, totalPurged };
  },
);
