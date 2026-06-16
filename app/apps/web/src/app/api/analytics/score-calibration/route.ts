/**
 * GET /api/analytics/score-calibration?outcome=meeting_booked
 *
 * Does a higher grade actually convert better? Buckets the tenant's contacts by
 * their grade band and counts how many reached an outcome, then runs the pure
 * calibration core (Fisher exact + Benjamini-Hochberg via the cohort engine).
 *
 * Outcomes (parameterized): "meeting_booked" (calls — the early outcome that
 * accumulates fastest), "reply_interested" (outbound emails), "won" (deals).
 *
 * v1 buckets by the contact's CURRENT score. That carries look-ahead bias (the
 * grade may have changed since the touch); _specs/propensity-scoring A1 adds
 * `score_snapshots` (grade live at funnel-entry) to remove it. The verdict is
 * honest about being underpowered, so a v1 read is directional, not a fake green.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { buildCalibration, type GradeOutcomeRow } from "@/lib/scoring/calibration";

export const maxDuration = 60;

const ALLOWED_OUTCOMES = new Set(["meeting_booked", "reply_interested", "won"]);

async function gradeOutcomeRows(tenantId: string, outcome: string): Promise<GradeOutcomeRow[]> {
  // Per-contact: the contact's score + whether it reached the outcome at least once.
  const perContact =
    outcome === "meeting_booked"
      ? sql`
          SELECT ct.id, ct.score, bool_or(ca.outcome = 'meeting_booked') AS converted
          FROM contacts ct
          JOIN calls ca ON ca.contact_id = ct.id AND ca.tenant_id = ${tenantId}
          WHERE ct.tenant_id = ${tenantId} AND ct.deleted_at IS NULL AND ct.score IS NOT NULL
          GROUP BY ct.id, ct.score`
      : outcome === "reply_interested"
        ? sql`
          SELECT ct.id, ct.score, bool_or(oe.reply_classification = 'interested') AS converted
          FROM contacts ct
          JOIN outbound_emails oe ON oe.contact_id = ct.id AND oe.tenant_id = ${tenantId}
          WHERE ct.tenant_id = ${tenantId} AND ct.deleted_at IS NULL AND ct.score IS NOT NULL
          GROUP BY ct.id, ct.score`
        : sql`
          SELECT ct.id, ct.score, bool_or(d.stage = 'won') AS converted
          FROM contacts ct
          JOIN deals d ON d.contact_id = ct.id AND d.tenant_id = ${tenantId} AND d.deleted_at IS NULL
          WHERE ct.tenant_id = ${tenantId} AND ct.deleted_at IS NULL AND ct.score IS NOT NULL
          GROUP BY ct.id, ct.score`;

  const rows = await db.execute(sql`
    SELECT
      CASE
        WHEN round(pc.score) >= 90 THEN 'A+'
        WHEN round(pc.score) >= 80 THEN 'A'
        WHEN round(pc.score) >= 60 THEN 'B'
        WHEN round(pc.score) >= 40 THEN 'C'
        WHEN round(pc.score) >= 20 THEN 'D'
        ELSE 'F'
      END AS grade,
      count(*)::int AS n,
      count(*) FILTER (WHERE pc.converted)::int AS converted
    FROM ( ${perContact} ) pc
    GROUP BY 1
  `);

  return (rows as unknown as Array<{ grade: string; n: number; converted: number }>).map((r) => ({
    grade: r.grade,
    n: Number(r.n),
    converted: Number(r.converted),
  }));
}

/** Look-ahead-free cells for meeting_booked: the contact's grade AT each call
 *  (score_snapshots) × whether THAT call booked. Empty until calls accrue. */
async function snapshotRowsMeetingBooked(tenantId: string): Promise<GradeOutcomeRow[]> {
  const rows = await db.execute(sql`
    SELECT s.grade AS grade,
      count(*)::int AS n,
      count(*) FILTER (WHERE c.outcome = 'meeting_booked')::int AS converted
    FROM score_snapshots s
    JOIN calls c ON c.id = s.event_ref AND c.tenant_id = ${tenantId}
    WHERE s.tenant_id = ${tenantId} AND s.event = 'call_attempt' AND s.entity_type = 'contact'
    GROUP BY s.grade
  `);
  return (rows as unknown as Array<{ grade: string; n: number; converted: number }>).map((r) => ({
    grade: r.grade,
    n: Number(r.n),
    converted: Number(r.converted),
  }));
}

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  const outcome = new URL(req.url).searchParams.get("outcome") ?? "meeting_booked";
  if (!ALLOWED_OUTCOMES.has(outcome)) {
    return apiError("VALIDATION_ERROR", `Unknown outcome '${outcome}'`);
  }

  try {
    // Prefer the look-ahead-free snapshot path for meeting_booked; fall back to
    // the v1 current-grade path when no snapshots exist yet (or other outcomes).
    let source: "snapshot" | "current" = "current";
    let rows: GradeOutcomeRow[] = [];
    if (outcome === "meeting_booked") {
      const snap = await snapshotRowsMeetingBooked(authCtx.tenantId);
      if (snap.reduce((sum, r) => sum + r.n, 0) > 0) {
        rows = snap;
        source = "snapshot";
      }
    }
    if (rows.length === 0) {
      rows = await gradeOutcomeRows(authCtx.tenantId, outcome);
      source = "current";
    }
    return Response.json({ ...buildCalibration(outcome, rows), source });
  } catch (error) {
    console.error("Score calibration failed:", error);
    return apiError("INTERNAL_ERROR", "Calibration failed");
  }
}
