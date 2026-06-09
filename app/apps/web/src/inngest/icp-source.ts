import { inngest } from "./client";
import { db } from "@/db";
import { icps, icpCriteria, companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { Criterion } from "@/lib/icp/criteria-engine";
import { listAvailableDiscoverySources } from "@/lib/discovery/registry";
import { candidateToAddPayload } from "@/lib/discovery/types";
import { proposeTamChange } from "@/lib/tam/proposals";

/**
 * ICP → net-new add-proposals (living-TAM loop). Fired when an ICP is
 * activated (api/icps). Fans out across every AVAILABLE discovery source
 * (Apollo always; Pappers when keyed + the ICP is French; SIRENE/Zefix as
 * they land), dedups candidates by domain against the existing TAM, and
 * QUEUES `add` proposals. Never inserts or enriches directly — approval in
 * /tam/review authorises the spend (approval-queue posture).
 */
const MAX_PROPOSALS = 50;

export const sourceIcpToProposals = inngest.createFunction(
  {
    id: "icp-source-to-proposals",
    name: "ICP → net-new add-proposals",
    retries: 1,
    triggers: [{ event: "icp/source-tenant" }],
  },
  async ({ event, step }: { event: { data: { tenantId: string; icpId: string } }; step: any }) => {
    const { tenantId, icpId } = event.data;

    const ctx = await step.run("load-icp", async () => {
      const [icp] = await db
        .select({ id: icps.id, name: icps.name })
        .from(icps)
        .where(and(eq(icps.id, icpId), eq(icps.tenantId, tenantId), isNull(icps.deletedAt)))
        .limit(1);
      if (!icp) return null;
      const crit = await db
        .select()
        .from(icpCriteria)
        .where(eq(icpCriteria.icpId, icp.id));
      const criteria: Criterion[] = crit.map((r) => ({
        id: r.id,
        fieldKey: r.fieldKey,
        operator: r.operator as Criterion["operator"],
        value: r.value,
        weight: r.weight,
        isRequired: r.isRequired,
      }));
      return { name: icp.name, criteria };
    });
    if (!ctx) return { proposed: 0, reason: "icp not found" };

    const sources = listAvailableDiscoverySources();
    if (sources.length === 0) {
      return { proposed: 0, reason: "no discovery source available" };
    }

    return await step.run("source-and-propose", async () => {
      // Dedup against the whole TAM, including excluded rows (they stay so
      // we never re-propose what was rejected).
      const existing = await db
        .select({ domain: companies.domain })
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
      const known = new Set(
        existing
          .map((c) => c.domain?.toLowerCase())
          .filter((d): d is string => Boolean(d)),
      );

      const knownSiren = new Set<string>();
      let proposed = 0;
      const bySource: Record<string, number> = {};

      for (const source of sources) {
        if (proposed >= MAX_PROPOSALS) break;
        let candidates;
        try {
          candidates = await source.search({
            tenantId,
            icpName: ctx.name,
            criteria: ctx.criteria,
            limit: MAX_PROPOSALS,
          });
        } catch (e) {
          console.warn(`[icp-source] ${source.name} failed:`, (e as Error)?.message);
          continue;
        }

        for (const c of candidates) {
          if (proposed >= MAX_PROPOSALS) break;
          // Domain candidates dedup by domain; domainless registry
          // candidates (SIRENE) dedup by SIREN — the domain-resolution
          // bridge runs at approval time, not here.
          let dedupKey: string;
          if (c.domain) {
            if (known.has(c.domain)) continue;
            known.add(c.domain);
            dedupKey = c.domain;
          } else if (c.nativeIdType === "siren" && c.nativeId) {
            if (knownSiren.has(c.nativeId)) continue;
            knownSiren.add(c.nativeId);
            dedupKey = `siren:${c.nativeId}`;
          } else {
            continue;
          }
          const r = await proposeTamChange({
            tenantId,
            kind: "add",
            dedupKey,
            payload: candidateToAddPayload(c),
            summary: `${c.name ?? c.domain ?? dedupKey}${c.industry ? ` — ${c.industry}` : ""}`,
            reason: `ICP: ${ctx.name}`,
            source: `icp_source:${c.sourceName}`,
          });
          if (r.created) {
            proposed++;
            bySource[c.sourceName] = (bySource[c.sourceName] ?? 0) + 1;
          }
        }
      }

      return { proposed, bySource };
    });
  },
);
