/**
 * Company Brain — Phase 1 read aggregation.
 *
 * `getCompanyBrain(opts, deps?)` returns the unified, cited,
 * freshness-tagged view of every artifact and derived property
 * the system has accumulated for a single company. Phase 1 is
 * pure read aggregation over the existing schema — no new tables,
 * no new workers, no schema changes.
 *
 * Why this exists : the chat panel, meeting prep, deal page, and
 * founder briefing each compose 3-8 ad-hoc queries to assemble
 * "what we know about this company". The brain is the unifying
 * read API that lets every consumer ask once and receive the
 * fully-shaped answer.
 *
 * Multi-tenant safety : every join filters by `opts.tenantId` ;
 * the function refuses to run when tenantId is falsy. The route
 * handler resolves tenantId from `getAuthContext()` and never
 * accepts a caller-provided value.
 *
 * Phase fences :
 *   Phase 2 = optional `entity_brain_snapshots` cache table when
 *             read latency justifies materialisation.
 *   Phase 3 = `/accounts/[id]/brain` UI surface + chat tool wiring.
 *   Neither is in this commit.
 */

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  companies,
  contacts as contactsTable,
  deals as dealsTable,
  activities as activitiesTable,
  knowledgeEntries,
  contextGraphEdges,
  contextGraphNodes,
  chatMemories,
  transcriptChunks,
} from "@/db/schema";
import {
  predictStalls,
  type StallPrediction,
} from "@/lib/analysis/stall-predictor";
import {
  scoreBuyerIntent,
  type BuyerIntentScore,
} from "@/lib/scoring/buyer-intent";
import type {
  CompanyBrain,
  CompanyBrainContact,
  CompanyBrainDeal,
  DealPropertyMetadata,
  GetCompanyBrainOpts,
} from "./types";
import { deriveFreshness } from "./freshness";

const DEFAULT_RECENT_ACTIVITY_CAP = 50;
const DEFAULT_CONTACT_CAP = 50;
const DEFAULT_MEMORY_CAP = 25;

const MEETING_ACTIVITY_TYPES = [
  "meeting_completed",
  "meeting_scheduled",
] as const;

export interface GetCompanyBrainDeps {
  db?: typeof defaultDb;
  predictStallsFn?: typeof predictStalls;
  scoreBuyerIntentFn?: typeof scoreBuyerIntent;
}

/**
 * Returns the full Brain for one company, or `null` when the
 * company doesn't exist or doesn't belong to the caller's tenant.
 */
export async function getCompanyBrain(
  companyId: string,
  opts: GetCompanyBrainOpts,
  deps: GetCompanyBrainDeps = {},
): Promise<CompanyBrain | null> {
  if (!opts.tenantId) {
    throw new Error(
      "getCompanyBrain: opts.tenantId is required (multi-tenant guard)",
    );
  }
  if (!companyId) {
    throw new Error("getCompanyBrain: companyId is required");
  }

  // Latency instrumentation : every successful brain assembly emits
  // a single structured log line so prod logs reveal p95 without a
  // dedicated tracer dep. The Phase 2 `entity_brain_snapshots` cache
  // gate ("read latency p95 > 200ms") becomes data-driven instead of
  // vapor.
  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const dbi = deps.db ?? defaultDb;
  const predict = deps.predictStallsFn ?? predictStalls;
  const intent = deps.scoreBuyerIntentFn ?? scoreBuyerIntent;

  const recentActivityCap =
    opts.recentActivityCap ?? DEFAULT_RECENT_ACTIVITY_CAP;
  const contactCap = opts.contactCap ?? DEFAULT_CONTACT_CAP;
  const memoryCap = opts.memoryCap ?? DEFAULT_MEMORY_CAP;

  // ── 1. Base company row ─────────────────────────────────
  const [company] = await dbi
    .select({
      id: companies.id,
      tenantId: companies.tenantId,
      name: companies.name,
      domain: companies.domain,
      industry: companies.industry,
      sizeBand: companies.size,
      score: companies.score,
      properties: companies.properties,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1);

  if (!company) return null;
  if (company.tenantId !== opts.tenantId) {
    // Cross-tenant access attempt — refuse silently.
    return null;
  }

  // Resolve THIS company's context-graph node so the Graph-facts section and the
  // contact champion badge can be scoped to edges that actually touch this
  // company — previously they read every edge in the tenant (same list on every
  // account's brain). Knowledge + chat-memories have no company link in the
  // schema (tenant-wide by design), so they stay tenant-scoped; see
  // _reports/hydration-audit/06-account-brain.md.
  const [companyNode] = await dbi
    .select({ id: contextGraphNodes.id })
    .from(contextGraphNodes)
    .where(
      and(
        eq(contextGraphNodes.tenantId, opts.tenantId),
        eq(contextGraphNodes.entityType, "company"),
        eq(contextGraphNodes.entityId, companyId),
      ),
    )
    .limit(1);

  // ── 2. All other layers in parallel ─────────────────────
  const [
    contactRows,
    dealRows,
    activityRows,
    knowledgeRows,
    edgeRows,
    memoryRows,
  ] = await Promise.all([
    dbi
      .select({
        id: contactsTable.id,
        firstName: contactsTable.firstName,
        lastName: contactsTable.lastName,
        email: contactsTable.email,
        title: contactsTable.title,
        updatedAt: contactsTable.updatedAt,
      })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.companyId, companyId),
          eq(contactsTable.tenantId, opts.tenantId),
          isNull(contactsTable.deletedAt),
        ),
      )
      .limit(contactCap + 1),
    dbi
      .select({
        id: dealsTable.id,
        name: dealsTable.name,
        stage: dealsTable.stage,
        value: dealsTable.value,
        expectedCloseDate: dealsTable.expectedCloseDate,
        properties: dealsTable.properties,
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.companyId, companyId),
          eq(dealsTable.tenantId, opts.tenantId),
          isNull(dealsTable.deletedAt),
        ),
      ),
    dbi
      .select({
        id: activitiesTable.id,
        type: activitiesTable.activityType,
        direction: activitiesTable.direction,
        occurredAt: activitiesTable.occurredAt,
        summary: activitiesTable.summary,
        entityType: activitiesTable.entityType,
        entityId: activitiesTable.entityId,
      })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.tenantId, opts.tenantId),
          eq(activitiesTable.entityType, "company"),
          eq(activitiesTable.entityId, companyId),
          isNull(activitiesTable.deletedAt),
        ),
      )
      .orderBy(desc(activitiesTable.occurredAt))
      .limit(recentActivityCap + 1),
    dbi
      .select({
        id: knowledgeEntries.id,
        title: knowledgeEntries.title,
        body: knowledgeEntries.content,
        scope: knowledgeEntries.scope,
      })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.tenantId, opts.tenantId))
      .limit(20),
    dbi
      .select({
        sourceId: contextGraphEdges.sourceNodeId,
        targetId: contextGraphEdges.targetNodeId,
        relationType: contextGraphEdges.relationType,
        fact: contextGraphEdges.fact,
        confidence: contextGraphEdges.confidence,
      })
      .from(contextGraphEdges)
      .where(
        and(
          eq(contextGraphEdges.tenantId, opts.tenantId),
          // Only edges touching this company's node. No node yet → no
          // company-specific facts (sql`false` matches nothing), rather than
          // the whole tenant's graph.
          companyNode
            ? or(
                eq(contextGraphEdges.sourceNodeId, companyNode.id),
                eq(contextGraphEdges.targetNodeId, companyNode.id),
              )
            : sql`false`,
        ),
      ),
    dbi
      .select({
        id: chatMemories.id,
        scope: chatMemories.scope,
        content: chatMemories.content,
        createdAt: chatMemories.createdAt,
      })
      .from(chatMemories)
      .where(eq(chatMemories.tenantId, opts.tenantId))
      .orderBy(desc(chatMemories.createdAt))
      .limit(memoryCap + 1),
  ]);

  // ── 3. Truncation flags ─────────────────────────────────
  const truncated = {
    activities: activityRows.length > recentActivityCap,
    contacts: contactRows.length > contactCap,
    memories: memoryRows.length > memoryCap,
  };
  const activitiesTrimmed = activityRows.slice(0, recentActivityCap);
  const contactsTrimmed = contactRows.slice(0, contactCap);
  const memoriesTrimmed = memoryRows.slice(0, memoryCap);

  // ── 4. Filter meetings out of activities ────────────────
  const meetings = activitiesTrimmed
    .filter(
      (a) =>
        a.type !== null &&
        (MEETING_ACTIVITY_TYPES as readonly string[]).includes(a.type),
    )
    .map((a) => ({
      id: a.id,
      title: a.summary ?? "(untitled meeting)",
      occurredAt: a.occurredAt ?? new Date(0),
    }));

  // ── 5. Transcript chunk count per meeting ───────────────
  const meetingIds = meetings.map((m) => m.id);
  const chunkCountByMeeting = new Map<string, number>();
  if (meetingIds.length > 0) {
    const chunks = await dbi
      .select({
        meetingId: transcriptChunks.meetingId,
      })
      .from(transcriptChunks)
      .where(inArray(transcriptChunks.meetingId, meetingIds));
    for (const c of chunks) {
      chunkCountByMeeting.set(
        c.meetingId,
        (chunkCountByMeeting.get(c.meetingId) ?? 0) + 1,
      );
    }
  }
  const meetingsHydrated = meetings.map((m) => ({
    ...m,
    transcriptChunkCount: chunkCountByMeeting.get(m.id) ?? 0,
  }));

  // ── 6. Stall predictions for THIS company's deals ──────
  // predictStalls runs across all open deals for the tenant. We
  // call once and zip-merge by dealId.
  const predictionByDeal = new Map<string, StallPrediction>();
  try {
    const all = await predict(opts.tenantId);
    for (const p of all) predictionByDeal.set(p.dealId, p);
  } catch {
    // Stall prediction failure is non-fatal — deals come back without
    // stallProbability rather than refuse the whole brain.
  }

  // ── 7. Buyer intent per contact (in parallel, capped) ──
  const intentResults: Array<{
    contactId: string;
    score: BuyerIntentScore | null;
  }> = await Promise.all(
    contactsTrimmed.map(async (c) => {
      try {
        const r = await intent(c.id, opts.tenantId);
        return { contactId: c.id, score: r };
      } catch {
        return { contactId: c.id, score: null };
      }
    }),
  );
  const intentByContact = new Map(
    intentResults.map((r) => [r.contactId, r.score] as const),
  );

  // ── 8. Champion contacts via context graph edges ────────
  const championContactIds = new Set(
    edgeRows
      .filter((e) => e.relationType === "champion")
      .map((e) => e.targetId),
  );

  // ── 9. Assemble contacts ────────────────────────────────
  const contactsBrain: CompanyBrainContact[] = contactsTrimmed.map((c) => {
    const intentScore = intentByContact.get(c.id);
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      title: c.title,
      isChampion: championContactIds.has(c.id),
      intentScore: intentScore?.score ?? null,
      intentTrend: (intentScore?.trend as
        | "heating"
        | "stable"
        | "cooling"
        | undefined) ?? null,
      lastTouchAt: c.updatedAt ?? null,
    };
  });

  // ── 10. Assemble deals ──────────────────────────────────
  const dealsBrain: CompanyBrainDeal[] = dealRows.map((d) => {
    const props = (d.properties as Record<string, unknown> | null) ?? {};
    // Coerce property cells into the citation shape — accept both
    // the new `{value, source, date, manual, confidence}` shape and
    // the legacy bare-value shape.
    const properties: Record<string, DealPropertyMetadata> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v && typeof v === "object" && "value" in v) {
        const m = v as Record<string, unknown>;
        properties[k] = {
          value: m.value,
          source: typeof m.source === "string" ? m.source : "unknown",
          date:
            m.date instanceof Date
              ? m.date
              : typeof m.date === "string"
                ? new Date(m.date)
                : null,
          manual: m.manual === true,
          confidence:
            typeof m.confidence === "number" ? m.confidence : null,
        };
      } else {
        properties[k] = {
          value: v,
          source: "legacy",
          date: null,
          manual: false,
          confidence: null,
        };
      }
    }

    const riskLevel =
      (props.riskLevel as CompanyBrainDeal["riskLevel"]) ?? "none";
    const riskReasonsRaw = (props.riskReasons ?? props.risks) as unknown;
    const riskReasons = Array.isArray(riskReasonsRaw)
      ? (riskReasonsRaw.filter(
          (x): x is string => typeof x === "string",
        ) as string[])
      : [];

    const prediction = predictionByDeal.get(d.id);
    return {
      id: d.id,
      name: d.name,
      stage: d.stage ?? "lead",
      value: d.value,
      expectedCloseDate: d.expectedCloseDate,
      properties,
      riskLevel,
      riskReasons,
      stallProbability: prediction?.stallProbability ?? null,
      stallIndicators: prediction?.indicators ?? [],
    };
  });

  // ── 11. Assemble + return ───────────────────────────────
  // Precise location from the enrichment waterfall (companies.properties.city/
  // state/country), deduped case-insensitively (CH: city + canton often match).
  const cprops = (company.properties ?? {}) as Record<string, unknown>;
  const pickStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const locSeen = new Set<string>();
  const companyLocation =
    [pickStr(cprops.city), pickStr(cprops.state), pickStr(cprops.country)]
      .filter((v): v is string => !!v)
      .filter((v) => {
        const k = v.toLowerCase();
        if (locSeen.has(k)) return false;
        locSeen.add(k);
        return true;
      })
      .join(", ") || null;

  const baseBrain = {
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      sizeBand: company.sizeBand,
      score: company.score,
      location: companyLocation,
      createdAt: company.createdAt ?? new Date(0),
    },
    contacts: contactsBrain,
    deals: dealsBrain,
    activities: activitiesTrimmed.map((a) => ({
      id: a.id,
      type: a.type ?? "unknown",
      direction: a.direction,
      occurredAt: a.occurredAt ?? new Date(0),
      summary: a.summary,
      entityType: a.entityType,
      entityId: a.entityId,
    })),
    meetings: meetingsHydrated,
    knowledgeEntries: knowledgeRows.map((k) => ({
      id: k.id,
      title: k.title,
      body: k.body,
      scope: k.scope,
    })),
    contextGraphEdges: edgeRows.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationType: e.relationType,
      fact: e.fact,
      confidence: e.confidence,
    })),
    memories: memoriesTrimmed.map((m) => ({
      id: m.id,
      scope: m.scope,
      content: m.content,
      createdAt: m.createdAt ?? new Date(0),
    })),
    dossier: null, // Phase 1 doesn't synth a fresh dossier here ;
    //                          chat / dossier-builder consumers fetch
    //                          on demand via the existing route.
  };

  const freshness = deriveFreshness(baseBrain);

  const result = {
    ...baseBrain,
    freshness,
    truncated,
  };

  const durationMs = Math.round(
    (typeof performance !== "undefined" &&
    typeof performance.now === "function"
      ? performance.now()
      : Date.now()) - startedAt,
  );
  // Single structured line — JSON so log aggregators can compute
  // p95 (`select percentile_cont(0.95) from logs where _brain='company'`).
  // Payload counts only ; never the brain content itself.
  console.log(
    JSON.stringify({
      _brain: "company",
      companyId,
      tenantId: opts.tenantId,
      durationMs,
      contacts: result.contacts.length,
      deals: result.deals.length,
      activities: result.activities.length,
      meetings: result.meetings.length,
      truncated: result.truncated,
    }),
  );

  return result;
}
