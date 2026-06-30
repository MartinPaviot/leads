/**
 * Chat/agent tools for SEARCH MONITORS — saved LinkedIn ICP queries that the
 * daily cron re-runs to source net-new matches (Layer 3). Create / list / pause /
 * delete from chat: "monitor companies hiring a Head of Sales in France every
 * day", "pause my RevOps monitor", "what monitors do I have".
 *
 * A monitor only SOURCES (populates the CRM); it never contacts — so creating one
 * needs no approval gate (like an account list). The criteria reuse the exact
 * sourcing input shape; the cron re-resolves them to LinkedIn ids each run.
 */
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { sourcingInputSchema } from "@/lib/linkedin/source-runner";
import { upsertMonitor, listMonitors, resolveMonitorRef, setMonitorStatus, deleteMonitor } from "@/lib/linkedin/search-monitors-db";

const monitorRef = {
  monitorId: z.string().optional().describe("The monitor's id (preferred when known)"),
  label: z.string().optional().describe("The monitor's exact label (case-insensitive) — use when the id is unknown"),
};

export function buildSearchMonitorTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  return {
    createSearchMonitor: makeTool({
      description:
        "Save a recurring LinkedIn (Sales Navigator) search that re-runs DAILY and sources the net-new matches into the CRM (deduped). Source-only — it never contacts anyone. Same filters as a one-off search, plus a label. Use when the user says 'keep an eye on / monitor / track companies hiring X', 'every day pull new people posting about Y', 'set up a recurring search for my ICP'. Re-using a label updates that monitor.",
      inputSchema: sourcingInputSchema.extend({
        label: z.string().min(1).max(120).describe("A short name for the monitor (unique per workspace)"),
        maxPerRun: z.number().int().positive().max(500).optional().describe("Cap each daily run (default 100)"),
      }),
      execute: async (input) => {
        const { label, maxPerRun, ...criteria } = input;
        const row = await upsertMonitor(tenantId, userId, { label, category: criteria.category, criteria, maxPerRun });
        return { ok: true, id: row.id, label: row.label, category: row.category, status: row.status, maxPerRun: row.maxPerRun, note: "Runs daily — sources net-new matches into the CRM (it won't contact anyone)." };
      },
    }),

    listSearchMonitors: makeTool({
      description: "List the workspace's recurring LinkedIn search monitors with their status + last run. Use when the user asks 'what monitors / recurring searches do I have', or before pausing / deleting one.",
      inputSchema: z.object({}),
      execute: async () => {
        const monitors = await listMonitors(tenantId);
        return { monitors: monitors.map((m) => ({ id: m.id, label: m.label, category: m.category, status: m.status, maxPerRun: m.maxPerRun, lastRunAt: m.lastRunAt, lastRun: m.lastRunSummary })) };
      },
    }),

    setSearchMonitorStatus: makeTool({
      description: "Pause or resume a recurring LinkedIn search monitor (a paused monitor stops running until resumed). Resolve it by id or label.",
      inputSchema: z.object({ ...monitorRef, status: z.enum(["active", "paused"]).describe("'paused' to stop, 'active' to resume") }),
      execute: async (input) => {
        const m = await resolveMonitorRef(tenantId, { id: input.monitorId, label: input.label });
        if (!m) return { error: "Monitor not found." };
        await setMonitorStatus(tenantId, m.id, input.status);
        return { ok: true, id: m.id, label: m.label, status: input.status };
      },
    }),

    deleteSearchMonitor: makeTool({
      description: "Delete a recurring LinkedIn search monitor (it stops running; already-sourced rows stay in the CRM). Resolve it by id or label.",
      inputSchema: z.object({ ...monitorRef }),
      execute: async (input) => {
        const m = await resolveMonitorRef(tenantId, { id: input.monitorId, label: input.label });
        if (!m) return { error: "Monitor not found." };
        await deleteMonitor(tenantId, m.id);
        return { ok: true, deleted: m.label };
      },
    }),
  };
}
