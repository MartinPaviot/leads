import { db } from "@/db";
import { companies, activities, users } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq, sql, desc, isNull, isNotNull, or, ilike, inArray, gte, lte, type SQL } from "drizzle-orm";
import { matchIndustries } from "@/lib/search/industry-match";
import { parseExcludedMode, parseAccountListFilters, GRADE_RANGES } from "@/lib/accounts/list-filters";
import { EFFECTIVE_LIFECYCLE_STAGE_SQL } from "@/lib/accounts/lifecycle-stage";
import { lastInteractionUnionSql } from "@/lib/accounts/last-interaction";
import { accountContactReachSql, accountRecencyBucketSql } from "@/lib/accounts/account-segments";
import { classifyIndustryFamilies, familiesToIndustries } from "@/lib/search/industry-family";
import { inngest } from "@/inngest/client";
import { apiError } from "@/lib/infra/api-errors";
import { paginatedResponse } from "@/lib/infra/api-response";
import { z } from "zod";

const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(500),
  domain: z.string().max(253).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const patchAccountSchema = z.object({
  id: z.string().uuid(),
  customFields: z.record(z.string(), z.unknown()),
});

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;
    const search = url.searchParams.get("search")?.trim();

    // Excluded ("not a fit") accounts are hidden from the default list — the
    // row survives (it still feeds the TAM-build dedup set so it is never
    // re-sourced) but it is out of the active working set. `?excluded=true`
    // shows only the excluded ones; `?excluded=all` shows both.
    // Archive view: ?deleted=true lists soft-deleted (removed) accounts so they
    // can be reviewed and restored. Default shows the live working set.
    const showDeleted = url.searchParams.get("deleted") === "true";
    const deletedPredicate = showDeleted ? isNotNull(companies.deletedAt) : isNull(companies.deletedAt);

    const excludedMode = parseExcludedMode(url.searchParams.get("excluded"));
    const excludedPredicate = showDeleted
      ? undefined // in the archive, show every removed account regardless of exclusion
      : excludedMode === "all"
        ? undefined
        : excludedMode === "only"
          ? isNotNull(companies.excludedReason)
          : isNull(companies.excludedReason);

    // Base scope shared by the list, the tab counts and the facets: tenant +
    // the active deleted/excluded view. The tab, column, search and score
    // filters all narrow on top of this.
    const baseWhere = and(
      eq(companies.tenantId, authCtx.tenantId),
      deletedPredicate,
      excludedPredicate,
    )!;

    // Intelligent search: resolve the typed query to the matching industries in
    // THIS tenant's data via an LLM (matchIndustries) -- not a hardcoded synonym
    // list -- plus a name/domain/description match. Server-side, so a search like
    // "medical" returns every health-care / medical-device account, paginated,
    // not just whatever happened to be on the loaded page. Built once and reused
    // by both the list and the tab counts, so a search narrows the badges too.
    let searchCond: SQL | undefined;
    if (search) {
      const indRows = await db
        .selectDistinct({ industry: companies.industry })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), deletedPredicate));
      const industries = indRows.map((r) => r.industry).filter((x): x is string => !!x);
      const matched = await matchIndustries(search, industries, authCtx.tenantId);
      searchCond = or(
        ...(matched.length > 0 ? [inArray(companies.industry, matched)] : []),
        ilike(companies.name, `%${search}%`),
        ilike(companies.domain, `%${search}%`),
        sql`${companies.description} ILIKE ${"%" + search + "%"}`,
      )!;
    }

    // ── Per-column / smart-filter narrowing, applied server-side so the
    //    count(*) and the paginated list both reflect the active filters — the
    //    header then shows the *filtered* total, not the library size. Mirrors
    //    the Accounts table column filters and the NL smart-filter score
    //    threshold. The tab (all/tam/manual) is split out below so it scopes the
    //    list but not the per-tab counts. ──
    const f = parseAccountListFilters(url.searchParams);
    const refineConds: SQL[] = [];
    const anyArr = (vals: string[]) =>
      sql`ARRAY[${sql.join(vals.map((v) => sql`${v}`), sql`, `)}]::text[]`;
    if (f.industries.length) refineConds.push(sql`${companies.industry} = ANY(${anyArr(f.industries)})`);
    if (f.sizes.length) refineConds.push(sql`${companies.size} = ANY(${anyArr(f.sizes)})`);
    if (f.revenues.length) refineConds.push(sql`${companies.revenue} = ANY(${anyArr(f.revenues)})`);
    if (f.geographies.length) refineConds.push(sql`btrim(${companies.properties}->>'country') = ANY(${anyArr(f.geographies)})`);
    if (f.regions.length) refineConds.push(sql`btrim(${companies.properties}->>'state') = ANY(${anyArr(f.regions)})`);
    if (f.stages.length) refineConds.push(sql`${sql.raw(EFFECTIVE_LIFECYCLE_STAGE_SQL)} = ANY(${anyArr(f.stages)})`);
    if (f.grades.length) {
      // A grade only applies once the row is enriched (matches displayScore,
      // which returns "Not scored" otherwise), then it's a score band.
      const enriched = sql`(${companies.industry} IS NOT NULL AND ${companies.industry} <> '' AND ${companies.description} IS NOT NULL AND ${companies.description} <> '')`;
      const gradeConds = f.grades.map((g) => {
        const [lo, hi] = GRADE_RANGES[g];
        return hi == null
          ? sql`(${enriched} AND round(${companies.score}) >= ${lo})`
          : sql`(${enriched} AND round(${companies.score}) >= ${lo} AND round(${companies.score}) < ${hi})`;
      });
      refineConds.push(sql`(${sql.join(gradeConds, sql` OR `)})`);
    }
    if (f.contactReach.length) refineConds.push(sql`(${sql.raw(accountContactReachSql())}) = ANY(${anyArr(f.contactReach)})`);
    if (f.recency.length) refineConds.push(sql`(${sql.raw(accountRecencyBucketSql())}) = ANY(${anyArr(f.recency)})`);
    if (f.linkedin === "has")
      refineConds.push(sql`(COALESCE(${companies.properties}->>'linkedinUrl','') <> '' OR COALESCE(${companies.properties}->>'linkedin_url','') <> '')`);
    if (f.linkedin === "empty")
      refineConds.push(sql`(COALESCE(${companies.properties}->>'linkedinUrl','') = '' AND COALESCE(${companies.properties}->>'linkedin_url','') = '')`);
    if (f.name) refineConds.push(ilike(companies.name, `%${f.name}%`));
    if (f.domain) refineConds.push(ilike(companies.domain, `%${f.domain}%`));
    // Account-list membership (fList) — scope to one curated list. Narrows the
    // working set like a column filter (so the All/Sourced/Added + enrichment
    // badges reflect the list). Tenant-safe by construction: the subquery joins
    // back to THIS tenant's companies, so a foreign list id matches no rows.
    if (f.listId) {
      refineConds.push(
        sql`${companies.id} IN (SELECT company_id FROM account_list_members WHERE list_id = ${f.listId})`,
      );
    }
    if (f.scoreMin != null) refineConds.push(gte(companies.score, f.scoreMin));
    if (f.scoreMax != null) refineConds.push(lte(companies.score, f.scoreMax));
    // Sector family → resolve to the tenant's industries via the LLM classifier
    // (cached), then filter on those industries. Empty resolution = match none.
    if (f.families.length) {
      const indRows = await db
        .selectDistinct({ industry: companies.industry })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), deletedPredicate));
      const industries = indRows.map((r) => r.industry).filter((x): x is string => !!x);
      const famMap = await classifyIndustryFamilies(industries, authCtx.tenantId);
      const inds = familiesToIndustries(famMap, f.families);
      refineConds.push(inds.length ? sql`${companies.industry} = ANY(${anyArr(inds)})` : sql`false`);
    }

    // The tab (all/tam/manual) is the one filter held OUT of the tab counts:
    // each badge shows how the current refinement splits across sources, so it
    // must not depend on which tab is currently selected.
    const tabCond: SQL | undefined =
      f.tab === "tam"
        ? sql`${companies.properties}->>'source' = 'tam'`
        : f.tab === "manual"
          ? sql`(${companies.properties}->>'source' IS DISTINCT FROM 'tam')`
          : undefined;

    // Enrichment partition — same "enriched" definition as the unenriched count
    // and isEnriched() on the client: a row is enriched once it has its base
    // firmographics (industry + description). Held OUT of the counts (like the
    // tab) so the "À enrichir (N)" / "Enrichis (M)" segment shows stable totals
    // and doesn't zero out its own complement when selected; applied only to the
    // list so the user can isolate the not-yet-enriched and bulk-enrich just them.
    const enrichedExpr = sql`(${companies.industry} IS NOT NULL AND ${companies.industry} <> '' AND ${companies.description} IS NOT NULL AND ${companies.description} <> '')`;
    const enrichCond: SQL | undefined =
      f.enriched === "yes" ? enrichedExpr : f.enriched === "no" ? sql`NOT ${enrichedExpr}` : undefined;

    // Counts scope = base + search + column/score filters, WITHOUT the tab, so
    // All / Prospects / Manual each reflect the active filters and add up.
    // List scope = counts scope + the active tab + enrichment partitions.
    const countsWhere = and(
      baseWhere,
      ...(searchCond ? [searchCond] : []),
      ...refineConds,
    )!;
    const listConds = [tabCond, enrichCond].filter(Boolean) as SQL[];
    const whereClause = listConds.length > 0 ? and(countsWhere, ...listConds)! : countsWhere;

    // "Select all matching" support: `?idsOnly=true` returns just the ids of
    // EVERY account the current view + filters match (the exact whereClause
    // the list and its count use), so the header checkbox can select the full
    // filtered set instead of only the loaded page. The cap is a payload
    // guard far above any realistic tenant; `total` lets the client detect
    // (and say) when it was hit.
    if (url.searchParams.get("idsOnly") === "true") {
      const MAX_SELECT_ALL_IDS = 50_000;
      const [idRows, idCount] = await Promise.all([
        db
          .select({ id: companies.id })
          .from(companies)
          .where(whereClause)
          .orderBy(sql`${companies.score} DESC NULLS LAST`, companies.id)
          .limit(MAX_SELECT_ALL_IDS),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(companies)
          .where(whereClause),
      ]);
      return Response.json({
        ids: idRows.map((r) => r.id),
        total: idCount[0]?.count ?? idRows.length,
      });
    }

    // Filter dropdown options (facets): computed over the VIEW's base scope
    // (tenant + the same deleted/excluded mode), INDEPENDENT of every narrowing
    // filter, so the column menus stay complete even when only filtered rows
    // are loaded. Working-set counts: computed over base + search + column/score
    // filters but WITHOUT the tab (countsWhere), so the All / Prospects / Manual
    // badges reflect the active filters and add up. Both run once on page 1.
    let facets:
      | { industries: string[]; geographies: string[]; sizes: string[]; revenues: string[]; stages: string[] }
      | undefined;
    // Per-value row counts for each enum facet — keyed by the table's filterKey
    // (industry / geography / size / revenue / stage / score) so the header
    // dropdowns can show "(N)" next to every value. Same base scope as `facets`
    // (independent of the active narrowing filters), so the order-of-magnitude
    // numbers stay stable and complete while the user drills in.
    let facetCounts: Record<string, Record<string, number>> | undefined;
    let counts: { total: number; tam: number; manual: number; unenriched: number } | undefined;
    if (page === 1) {
      // Shared by the facets, facet-count and tab-count queries below.
      const deletedSql = showDeleted ? sql`deleted_at IS NOT NULL` : sql`deleted_at IS NULL`;
      const excludedSql =
        excludedMode === "all"
          ? sql`TRUE`
          : excludedMode === "only"
            ? sql`excluded_reason IS NOT NULL`
            : sql`excluded_reason IS NULL`;
      try {
        const fr = await db.execute(sql`
          SELECT
            COALESCE(array_agg(DISTINCT industry) FILTER (WHERE industry IS NOT NULL AND industry <> ''), '{}') AS industries,
            COALESCE(array_agg(DISTINCT btrim(properties->>'country')) FILTER (WHERE btrim(properties->>'country') IS NOT NULL AND btrim(properties->>'country') <> ''), '{}') AS geographies,
            COALESCE(array_agg(DISTINCT size) FILTER (WHERE size IS NOT NULL AND size <> ''), '{}') AS sizes,
            COALESCE(array_agg(DISTINCT revenue) FILTER (WHERE revenue IS NOT NULL AND revenue <> ''), '{}') AS revenues,
            COALESCE(array_agg(DISTINCT ${sql.raw(EFFECTIVE_LIFECYCLE_STAGE_SQL)}), '{}') AS stages
          FROM companies
          WHERE tenant_id = ${authCtx.tenantId} AND ${deletedSql} AND ${excludedSql}
        `);
        const row = (fr as unknown as Array<Record<string, unknown>>)[0];
        const srt = (xs: unknown) => [...(((xs as string[]) ?? []))].sort((a, b) => a.localeCompare(b));
        facets = {
          industries: srt(row?.industries),
          geographies: srt(row?.geographies),
          sizes: srt(row?.sizes),
          revenues: srt(row?.revenues),
          stages: srt(row?.stages),
        };
      } catch (e) {
        console.warn("accounts: facets query failed", e);
      }
      try {
        // One UNION-ALL pass over the base scope: (facet, value, count) tuples
        // for every enum column. GROUP BY 2 (the output column position) avoids
        // re-rendering the stage / grade expressions in a second clause, which
        // would otherwise duplicate their bound params and break the grouping.
        const baseFacetWhere = sql`tenant_id = ${authCtx.tenantId} AND ${deletedSql} AND ${excludedSql}`;
        const stageExpr = sql.raw(EFFECTIVE_LIFECYCLE_STAGE_SQL);
        // Grade band of round(score), mirroring GRADE_RANGES + getGrade(): only
        // enriched rows earn a grade (parity with the fGrade filter + displayScore).
        const gradeWhens = Object.entries(GRADE_RANGES).map(([g, [lo, hi]]) =>
          hi == null
            ? sql`WHEN round(score) >= ${lo} THEN ${g}`
            : sql`WHEN round(score) >= ${lo} AND round(score) < ${hi} THEN ${g}`,
        );
        const gradeExpr = sql`CASE ${sql.join(gradeWhens, sql` `)} ELSE NULL END`;
        const fc = await db.execute(sql`
          SELECT 'industry'::text AS facet, industry AS value, count(*)::int AS count
            FROM companies WHERE ${baseFacetWhere} AND industry IS NOT NULL AND industry <> '' GROUP BY 2
          UNION ALL
          SELECT 'geography'::text, btrim(properties->>'country'), count(*)::int
            FROM companies WHERE ${baseFacetWhere} AND btrim(properties->>'country') IS NOT NULL AND btrim(properties->>'country') <> '' GROUP BY 2
          UNION ALL
          SELECT 'size'::text, size, count(*)::int
            FROM companies WHERE ${baseFacetWhere} AND size IS NOT NULL AND size <> '' GROUP BY 2
          UNION ALL
          SELECT 'revenue'::text, revenue, count(*)::int
            FROM companies WHERE ${baseFacetWhere} AND revenue IS NOT NULL AND revenue <> '' GROUP BY 2
          UNION ALL
          SELECT 'stage'::text, ${stageExpr}, count(*)::int
            FROM companies WHERE ${baseFacetWhere} GROUP BY 2
          UNION ALL
          SELECT 'score'::text, ${gradeExpr}, count(*)::int
            FROM companies WHERE ${baseFacetWhere}
              AND (industry IS NOT NULL AND industry <> '' AND description IS NOT NULL AND description <> '')
              AND score IS NOT NULL GROUP BY 2
        `);
        const fcOut: Record<string, Record<string, number>> = {};
        for (const r of fc as unknown as Array<{ facet: string; value: string | null; count: number }>) {
          if (r.value == null || r.value === "") continue;
          (fcOut[r.facet] ??= {})[String(r.value)] = Number(r.count);
        }
        facetCounts = fcOut;
      } catch (e) {
        console.warn("accounts: facet counts query failed", e);
      }
      try {
        // Segment facets with no column: contact reach + engagement recency,
        // computed from the same SSOT the filters use. Separate pass so a bug
        // here can't take down the enum facet counts above.
        const segWhere = sql`tenant_id = ${authCtx.tenantId} AND ${deletedSql} AND ${excludedSql}`;
        const reachExpr = sql.raw(accountContactReachSql());
        const recencyExpr = sql.raw(accountRecencyBucketSql());
        const seg = await db.execute(sql`
          SELECT 'contactReach'::text AS facet, ${reachExpr} AS value, count(*)::int AS count
            FROM companies WHERE ${segWhere} GROUP BY 2
          UNION ALL
          SELECT 'recency'::text, ${recencyExpr}, count(*)::int
            FROM companies WHERE ${segWhere} GROUP BY 2
          UNION ALL
          SELECT 'region'::text, btrim(properties->>'state'), count(*)::int
            FROM companies WHERE ${segWhere} AND btrim(coalesce(properties->>'state','')) <> '' GROUP BY 2
        `);
        facetCounts = facetCounts ?? {};
        for (const r of seg as unknown as Array<{ facet: string; value: string | null; count: number }>) {
          if (r.value == null) continue;
          (facetCounts[r.facet] ??= {})[String(r.value)] = Number(r.count);
        }
      } catch (e) {
        console.warn("accounts: segment facet counts query failed", e);
      }
      try {
        // Reuses the `enrichedExpr` defined above (same definition the
        // enrichment filter + the client's isEnriched() use).
        const cr = await db
          .select({
            total: sql<number>`count(*)::int`,
            tam: sql<number>`(count(*) FILTER (WHERE ${companies.properties}->>'source' = 'tam'))::int`,
            unenriched: sql<number>`(count(*) FILTER (WHERE NOT ${enrichedExpr}))::int`,
          })
          .from(companies)
          .where(countsWhere);
        const total = Number(cr[0]?.total ?? 0);
        const tam = Number(cr[0]?.tam ?? 0);
        counts = { total, tam, manual: Math.max(0, total - tam), unenriched: Number(cr[0]?.unenriched ?? 0) };
      } catch (e) {
        console.warn("accounts: counts query failed", e);
      }
    }

    const [accounts, countResult] = await Promise.all([
      db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          revenue: companies.revenue,
          description: companies.description,
          score: companies.score,
          scoreReasons: companies.scoreReasons,
          ownerId: companies.ownerId,
          properties: companies.properties,
          // Effective stage (manual override > deal-derived > 'new'), computed
          // by the same expression the fStage filter and the facets use.
          lifecycleStage: sql<string>`${sql.raw(EFFECTIVE_LIFECYCLE_STAGE_SQL)}`.as("lifecycle_stage"),
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
          tenantId: companies.tenantId,
          ownerFirstName: users.firstName,
          ownerLastName: users.lastName,
        })
        .from(companies)
        .leftJoin(users, eq(companies.ownerId, users.id))
        .where(whereClause)
        // Stable order is REQUIRED for offset pagination — without it Postgres
        // returns rows in an arbitrary order and successive pages overlap, so
        // the list "shows the same accounts again" while scrolling/paging.
        // Best-fit first (score DESC, unscored last), id as the unique tiebreak.
        .orderBy(sql`${companies.score} DESC NULLS LAST`, companies.id)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    // Fetch last interaction per account — real exchanges only (email, call,
    // meeting), across the account's contacts, the company itself and its
    // deals. The shape lives in lib/accounts/last-interaction.ts so the type
    // filter and deleted_at guards are testable and can't silently regress
    // into surfacing logAudit bookkeeping as an "interaction".
    const lastInteractions: Record<string, { date: Date; summary: string | null }> = {};

    try {
      if (accounts.length > 0) {
        const accountIds = accounts.map((a) => a.id);
        const idsArr = sql`ARRAY[${sql.join(accountIds.map(id => sql`${id}`), sql`, `)}]::text[]`;
        const tpl = lastInteractionUnionSql({ idsParam: "__IDS__", tenantParam: "__TENANT__" });
        const query = sql.join(
          tpl.split(/(__IDS__|__TENANT__)/).map((part) =>
            part === "__IDS__" ? idsArr : part === "__TENANT__" ? sql`${authCtx.tenantId}` : sql.raw(part),
          ),
          sql``,
        );
        const interactions = await db.execute(query);
        for (const row of interactions as unknown as Array<{ company_id: string; occurred_at: Date; summary: string | null }>) {
          lastInteractions[row.company_id] = { date: row.occurred_at, summary: row.summary };
        }
      }
    } catch (e) {
      // Non-critical: accounts still load without last interaction
      console.warn("Failed to fetch last interactions:", e);
    }

    const enrichedAccounts = accounts.map((a) => ({
      ...a,
      lastInteraction: lastInteractions[a.id] || null,
    }));

    // A1 — canonical paginated response via shared helper.
    // Legacy key `accounts` preserved for existing consumers.
    return paginatedResponse(
      enrichedAccounts,
      { page, pageSize, total },
      "accounts",
      facets || facetCounts || counts
        ? {
            ...(facets ? { facets } : {}),
            ...(facetCounts ? { facetCounts } : {}),
            ...(counts ? { counts } : {}),
          }
        : undefined,
    );
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid account data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, domain, properties: customProperties } = parsed.data;

    const [account] = await db
      .insert(companies)
      .values({
        name: name.trim(),
        domain: domain?.trim() || null,
        tenantId: authCtx.tenantId,
        sourceSystem: "manual",
        properties: customProperties || {},
      })
      .returning();

    // Fire enrichment event for background processing
    await inngest.send({
      name: "company/created",
      data: { companyId: account.id, tenantId: authCtx.tenantId },
    }).catch(console.warn);

    return Response.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Failed to create account:", error);
    return apiError("INTERNAL_ERROR", "Failed to create account");
  }
}

/** Update custom field values on an account */
export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = patchAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "id and customFields required", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { id, customFields } = parsed.data;

    // Get current properties
    const [existing] = await db.select().from(companies)
      .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
      .limit(1);

    if (!existing) {
      return apiError("NOT_FOUND", "Account not found");
    }

    const currentProps = (existing.properties || {}) as Record<string, unknown>;
    const currentCustom = (currentProps.customFields || {}) as Record<string, unknown>;

    const [updated] = await db.update(companies).set({
      properties: {
        ...currentProps,
        customFields: { ...currentCustom, ...customFields },
      },
      updatedAt: new Date(),
    }).where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
      .returning();

    return Response.json({ account: updated });
  } catch (error) {
    console.error("Failed to update custom fields:", error);
    return apiError("INTERNAL_ERROR", "Failed to update");
  }
}
