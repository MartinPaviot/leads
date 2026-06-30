/**
 * Chat/agent tools for LinkedIn / Sales-Navigator sourcing — so the agent can
 * size and source a segment from ANYWHERE (chat, Slack), not only the settings
 * form. The resolve→preview/source core lives in lib/linkedin/source-runner.ts
 * (shared with the recurring search-monitor cron); these tools are the thin chat
 * layer over it + the seat resolution + friendly messages.
 *
 * sourceFromLinkedIn POPULATES the CRM only — it does NOT contact anyone.
 * Contacting stays a separate, HITL-gated step (sequence enrollment). So no
 * approval gate here, like account-list creation.
 */
import { makeTool, type ToolContext } from "./context";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { resolveConnectedSeat } from "@/lib/linkedin/seat";
import { sourcingInputSchema, previewSourcing, runSourcing } from "@/lib/linkedin/source-runner";

export function buildLinkedInSourcingTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  async function seatAndCfg() {
    const cfg = readUnipileConfig();
    if (!cfg) return { error: "LinkedIn isn't configured for this workspace." as const };
    const seat = await resolveConnectedSeat(tenantId, userId);
    if (!seat) return { error: "No connected LinkedIn / Sales Navigator seat — connect one in Settings → Sending infrastructure." as const };
    return { cfg, seat };
  }

  return {
    previewLinkedInSearch: makeTool({
      description:
        "Estimate how many prospects / companies / jobs / posts a LinkedIn (Sales Navigator) search would return, WITHOUT sourcing. Use to size a segment before committing — e.g. 'how many VPs of Sales in France at 51-200 person software companies', 'how many companies are hiring a Head of RevOps'. Returns the total + how each free-text filter resolved.",
      inputSchema: sourcingInputSchema,
      execute: async (input) => {
        const sc = await seatAndCfg();
        if ("error" in sc) return { error: sc.error };
        const r = await previewSourcing(sc.cfg, sc.seat, input);
        if ("error" in r) return r;
        return {
          ok: true,
          category: input.category,
          total: r.total,
          note: typeof r.total === "number" && r.total >= 2500 ? "LinkedIn caps a single search at 2,500 results." : undefined,
          resolution: r.resolution,
          dropped: r.dropped,
        };
      },
    }),

    sourceFromLinkedIn: makeTool({
      description:
        "Source a LinkedIn (Sales Navigator) segment INTO the CRM, deduped against existing rows. people/companies → Accounts & Contacts; jobs → hiring companies as Accounts with a hiring signal (lifts their priority score); posts → post authors as warm-lead Contacts. This POPULATES the CRM only — it does NOT contact anyone (use a sequence enrollment for that). Use when the user says 'source/pull/import X from LinkedIn', 'find companies hiring a CRO and add them', 'bring in people posting about cold outbound'. Preview first if the segment size is unknown.",
      inputSchema: sourcingInputSchema,
      execute: async (input) => {
        const sc = await seatAndCfg();
        if ("error" in sc) return { error: sc.error };
        const r = await runSourcing(sc.cfg, sc.seat, tenantId, input);
        if ("error" in r) return r;
        if (r.category === "jobs") {
          return {
            ok: true,
            category: "jobs",
            hiringCompanies: r.accounts,
            openRoles: r.openRoles ?? 0,
            message: `Sourced ${r.accounts} hiring ${r.accounts === 1 ? "company" : "companies"} (${r.openRoles ?? 0} open roles). They now rank higher for the autopilot via a hiring signal.`,
            resolution: r.resolution,
          };
        }
        if (r.category === "posts") {
          return { ok: true, category: "posts", contacts: r.contacts, message: `Sourced ${r.contacts} warm ${r.contacts === 1 ? "lead" : "leads"} from posts.` };
        }
        return {
          ok: true,
          category: r.category,
          accounts: r.accounts,
          contacts: r.contacts,
          message: `Sourced ${r.accounts} ${r.accounts === 1 ? "account" : "accounts"} and ${r.contacts} ${r.contacts === 1 ? "contact" : "contacts"} from LinkedIn.`,
          resolution: r.resolution,
          dropped: r.dropped,
        };
      },
    }),
  };
}
