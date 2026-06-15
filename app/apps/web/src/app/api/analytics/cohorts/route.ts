import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { deals, companies, contacts } from "@/db/schema";
import { sql, eq, and, inArray } from "drizzle-orm";
import { classifyCohorts, type CohortCell, type ClassifiedCohort } from "@/lib/insights/cohort-engine";

/**
 * GET /api/analytics/cohorts
 *
 * The honest cohort read (The Method, step 17): cut closed deals by the
 * dimensions we can trust (industry, buyer persona) and return only what the
 * statistics support — insights when the sample carries them, hypotheses to
 * test when it does not, and a plain "not enough data" when that is the truth.
 * Read-only, tenant-scoped.
 *
 * Each dimension is classified on its own so the leave-one-out baseline is
 * valid (finance vs other personas, not vs other industries). The engine does
 * the Fisher's-exact + Benjamini-Hochberg work; this route only shapes data.
 */
const MAX_DEALS = 4000;

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = authCtx.tenantId;

  try {
    // Closed deals (won or lost) joined to the dimensions we can cut on:
    // company industry, and buyer persona (contact seniority, in properties).
    const rows = await db
      .select({
        stage: deals.stage,
        industry: companies.industry,
        persona: sql<string | null>`${contacts.properties}->>'seniority'`,
      })
      .from(deals)
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .where(and(eq(deals.tenantId, tenantId), inArray(deals.stage, ["won", "lost"])))
      .limit(MAX_DEALS);

    // Build cells per dimension. Skip rows with an unknown dimension value —
    // we never cohort on "unknown" (it is not a segment you can act on).
    const build = (dimension: string, pick: (r: (typeof rows)[number]) => string | null): CohortCell[] => {
      const agg = new Map<string, { n: number; won: number }>();
      for (const r of rows) {
        const raw = pick(r);
        const value = (raw ?? "").trim();
        if (!value) continue;
        const cur = agg.get(value) ?? { n: 0, won: 0 };
        cur.n += 1;
        if (r.stage === "won") cur.won += 1;
        agg.set(value, cur);
      }
      return [...agg.entries()].map(([value, { n, won }]) => ({ dimension, value, n, won }));
    };

    const dimensions = [
      { dimension: "industry", cells: build("industry", (r) => r.industry) },
      { dimension: "persona", cells: build("persona", (r) => r.persona) },
    ].filter((d) => d.cells.length >= 2); // need at least 2 values to compare

    const analyses = dimensions.map((d) => ({ dimension: d.dimension, ...classifyCohorts(d.cells) }));
    const insights: ClassifiedCohort[] = analyses.flatMap((a) => a.insights);
    const hypotheses: ClassifiedCohort[] = analyses.flatMap((a) => a.hypotheses);

    const totalClosed = rows.length;
    const summary =
      totalClosed < 20
        ? `Only ${totalClosed} closed deals — too few to read cohorts. Keep closing; patterns become trustworthy past ~20 to 30.`
        : insights.length > 0
          ? `${insights.length} segment(s) close significantly better than the rest.`
          : hypotheses.length > 0
            ? `No segment clears the bar yet, but ${hypotheses.length} are worth testing.`
            : `No segment stands out beyond chance — a real answer, not a gap.`;

    return Response.json({ totalClosed, dimensions: analyses, insights, hypotheses, summary });
  } catch (err) {
    console.error("[analytics/cohorts] failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to compute cohorts" }, { status: 500 });
  }
}
