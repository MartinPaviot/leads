/**
 * Data-retention enforcement cron.
 *
 * The privacy page promises "Deleted within 30 days of account closure."
 * This function runs daily at 3am UTC and enforces that promise by
 * cascading-deleting all tenant data for canceled accounts whose
 * updatedAt is older than 30 days.
 *
 * The tenant row itself is NOT deleted — Stripe reconciliation and
 * audit logging need it. Only the data inside the tenant is purged.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";

/** 30 days in milliseconds */
const RETENTION_DAYS = 30;

/**
 * Delete all rows from a table matching a tenant_id and return the count.
 * Uses parameterized SQL to avoid injection. The count comes from a
 * preceding SELECT COUNT(*) so we never pull full rows into Node memory.
 */
async function purgeTable(tableName: string, tenantId: string, fkColumn = "tenant_id"): Promise<number> {
  const countResult = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(fkColumn)} = ${tenantId}`
  );
  const count = (countResult as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  if (count > 0) {
    await db.execute(
      sql`DELETE FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(fkColumn)} = ${tenantId}`
    );
  }
  return count;
}

/**
 * Delete rows from a table that references another table's tenant_id
 * via a foreign key (e.g. chat_messages -> chat_threads.tenant_id).
 */
async function purgeTableVia(
  tableName: string,
  fkColumn: string,
  parentTable: string,
  tenantId: string,
): Promise<number> {
  const countResult = await db.execute(
    sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(fkColumn)} IN (SELECT id FROM ${sql.identifier(parentTable)} WHERE tenant_id = ${tenantId})`
  );
  const count = (countResult as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  if (count > 0) {
    await db.execute(
      sql`DELETE FROM ${sql.identifier(tableName)} WHERE ${sql.identifier(fkColumn)} IN (SELECT id FROM ${sql.identifier(parentTable)} WHERE tenant_id = ${tenantId})`
    );
  }
  return count;
}

export const dataRetentionPurge = inngest.createFunction(
  {
    id: "data-retention-purge",
    name: "Data Retention Purge (GDPR)",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 3 * * *" }], // Daily at 3am UTC
  },
  async ({ step }) => {
    // Find tenants that have been canceled for more than 30 days
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const canceledTenants = await step.run("find-canceled-tenants", async () => {
      const rows = await db
        .select({ id: tenants.id, name: tenants.name, updatedAt: tenants.updatedAt })
        .from(tenants)
        .where(
          and(
            eq(tenants.plan, "canceled"),
            lte(tenants.updatedAt, cutoffDate)
          )
        );
      return rows;
    });

    if (canceledTenants.length === 0) {
      return { purged: 0, message: "No canceled tenants past retention window" };
    }

    const results: Array<{ tenantId: string; tenantName: string | null; totalRows: number }> = [];

    for (const tenant of canceledTenants) {
      const result = await step.run(`purge-${tenant.id}`, async () => {
        let totalRows = 0;

        // Order: child tables before parent tables to avoid FK violations.
        // Tables with ON DELETE CASCADE on their parent FK are deleted
        // explicitly anyway so we get an accurate audit count.

        // ── Chat & memory ───────────────────────────────────
        // chat_messages has no tenant_id — delete via thread FK
        totalRows += await purgeTableVia("chat_messages", "thread_id", "chat_threads", tenant.id);
        totalRows += await purgeTable("chat_threads", tenant.id);
        totalRows += await purgeTable("chat_memories", tenant.id);
        totalRows += await purgeTable("shared_prompts", tenant.id);

        // ── Sequences & enrollments ─────────────────────────
        // enrollments and steps FK to sequences (cascade), delete explicitly
        totalRows += await purgeTableVia("sequence_enrollments", "sequence_id", "sequences", tenant.id);
        totalRows += await purgeTableVia("sequence_steps", "sequence_id", "sequences", tenant.id);
        totalRows += await purgeTable("sequences", tenant.id);

        // ── Email infrastructure ────────────────────────────
        totalRows += await purgeTable("outbound_emails", tenant.id);
        // warmup_emails has no tenant_id — delete via mailbox FK
        totalRows += await purgeTableVia("warmup_emails", "mailbox_id", "connected_mailboxes", tenant.id);
        totalRows += await purgeTable("connected_mailboxes", tenant.id);
        totalRows += await purgeTable("email_optouts", tenant.id);

        // ── Activities, notes, tasks, comments ──────────────
        totalRows += await purgeTable("comments", tenant.id);
        totalRows += await purgeTable("activities", tenant.id);
        totalRows += await purgeTable("notes", tenant.id);
        totalRows += await purgeTable("tasks", tenant.id);

        // ── Deals ───────────────────────────────────────────
        totalRows += await purgeTable("deals", tenant.id);

        // ── Contacts & companies ────────────────────────────
        totalRows += await purgeTable("contacts", tenant.id);
        totalRows += await purgeTable("companies", tenant.id);

        // ── Notifications ───────────────────────────────────
        totalRows += await purgeTable("notification_preferences", tenant.id);
        totalRows += await purgeTable("notifications", tenant.id);

        // ── Tool call events & agent traces ─────────────────
        totalRows += await purgeTable("tool_call_events", tenant.id);
        totalRows += await purgeTable("agent_traces", tenant.id);

        // ── Context graph ───────────────────────────────────
        totalRows += await purgeTable("context_graph_edges", tenant.id);
        totalRows += await purgeTable("context_graph_communities", tenant.id);
        totalRows += await purgeTable("context_graph_nodes", tenant.id);

        // ── Inbound tracking ────────────────────────────────
        totalRows += await purgeTable("inbound_visitors", tenant.id);
        totalRows += await purgeTable("inbound_write_keys", tenant.id);

        // ── Signals ─────────────────────────────────────────
        totalRows += await purgeTable("signal_outcomes", tenant.id);
        totalRows += await purgeTable("custom_signals", tenant.id);

        // ── Eval system ─────────────────────────────────────
        // eval_results cascade from eval_runs; eval_cases cascade from eval_datasets
        totalRows += await purgeTableVia("eval_results", "run_id", "eval_runs", tenant.id);
        totalRows += await purgeTable("eval_runs", tenant.id);
        totalRows += await purgeTableVia("eval_cases", "dataset_id", "eval_datasets", tenant.id);
        totalRows += await purgeTable("eval_datasets", tenant.id);

        // ── Import history ──────────────────────────────────
        totalRows += await purgeTable("import_history", tenant.id);

        // ── Referral & exposure ─────────────────────────────
        totalRows += await purgeTable("referral_credit_events", tenant.id);
        totalRows += await purgeTable("tenant_referral_credits", tenant.id);
        totalRows += await purgeTable("notetaker_exposures", tenant.id, "referring_tenant_id");

        // ── Coaching & performance ──────────────────────────
        totalRows += await purgeTable("coaching_insights", tenant.id);
        totalRows += await purgeTable("ae_performance_snapshots", tenant.id);

        // ── Custom skills ───────────────────────────────────
        totalRows += await purgeTable("custom_skill_templates", tenant.id);

        // ── Invites & infra requests ────────────────────────
        totalRows += await purgeTable("pending_invites", tenant.id);
        totalRows += await purgeTable("sending_infra_requests", tenant.id);

        // ── Agent actions & trust ───────────────────────────
        totalRows += await purgeTable("agent_actions", tenant.id);
        totalRows += await purgeTable("trust_events", tenant.id);

        // ── Users (last — many tables FK to users) ──────────
        totalRows += await purgeTable("users", tenant.id);

        // NOTE: We do NOT delete the tenant row itself.
        // Stripe reconciliation and audit logging require it.

        // Mark the tenant as purged so we skip it on future runs
        await db.update(tenants)
          .set({
            settings: { purgedAt: new Date().toISOString(), purgedReason: "data-retention-30d" },
            plan: "purged",
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenant.id));

        console.log(
          `[data-retention] Purged tenant ${tenant.id} (${tenant.name}): ${totalRows} rows deleted`
        );

        return { tenantId: tenant.id, tenantName: tenant.name, totalRows };
      });

      results.push(result as unknown as { tenantId: string; tenantName: string | null; totalRows: number });
    }

    const summary = {
      purgedCount: results.length,
      tenants: results.map((r) => ({
        id: r.tenantId,
        name: r.tenantName,
        rowsDeleted: r.totalRows,
      })),
      executedAt: new Date().toISOString(),
    };

    console.log("[data-retention] Purge complete:", JSON.stringify(summary));

    return summary;
  },
);
