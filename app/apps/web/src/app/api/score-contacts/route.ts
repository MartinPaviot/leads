import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

// Rule-based contact scoring — no LLM, uses real data signals
function calculateContactFitScore(
  contact: Record<string, unknown>,
  props: Record<string, unknown>,
  company: Record<string, unknown> | null,
  companyProps: Record<string, unknown> | null
): { score: number; reasons: string[]; grade: string } {
  let score = 0;
  const reasons: string[] = [];

  // Seniority scoring (0-30)
  const seniority = (props?.seniority as string)?.toLowerCase() || "";
  if (seniority.includes("c-suite") || seniority.includes("founder") || seniority.includes("owner")) {
    score += 30;
    reasons.push(`Decision maker: ${seniority}`);
  } else if (seniority.includes("vp") || seniority.includes("vice president")) {
    score += 25;
    reasons.push(`Senior leader: ${seniority}`);
  } else if (seniority.includes("director")) {
    score += 20;
    reasons.push(`Director level: ${seniority}`);
  } else if (seniority.includes("manager") || seniority.includes("head")) {
    score += 15;
    reasons.push(`Manager level: ${seniority}`);
  } else if (seniority.includes("senior") || seniority.includes("lead")) {
    score += 10;
  } else if (seniority) {
    score += 5;
  }

  // Title keyword scoring (0-10)
  const title = ((contact.title as string) || "").toLowerCase();
  const highValueTitles = ["ceo", "cto", "cfo", "coo", "cro", "cmo", "founder", "president", "partner"];
  if (highValueTitles.some((t) => title.includes(t))) {
    score += 10;
    if (!reasons.some((r) => r.includes("Decision maker"))) {
      reasons.push(`High-value title: ${contact.title}`);
    }
  }

  // Department relevance (0-15) — scoring higher for buying departments
  const department = ((props?.department as string) || (props?.departments as string[])?.join(", ") || "").toLowerCase();
  const buyingDepartments = ["engineering", "product", "technology", "it", "operations"];
  const influencerDepartments = ["marketing", "sales", "business development", "growth"];
  if (buyingDepartments.some((d) => department.includes(d))) {
    score += 15;
    reasons.push(`Buying department: ${department}`);
  } else if (influencerDepartments.some((d) => department.includes(d))) {
    score += 10;
    reasons.push(`Influencer department: ${department}`);
  } else if (department) {
    score += 3;
  }

  // Email verification status (0-10)
  const emailStatus = props?.email_status as string;
  if (emailStatus === "verified") {
    score += 10;
    reasons.push("Email verified");
  } else if (emailStatus === "likely") {
    score += 5;
  }

  // Has LinkedIn profile (0-5)
  if (contact.linkedinUrl) {
    score += 5;
  }

  // Has phone (0-5)
  if (contact.phone) {
    score += 5;
  }

  // Enrichment source quality (0-5)
  if (props?.enrichment_source === "apollo") {
    score += 5;
    reasons.push("Verified by Apollo enrichment");
  }

  // Company score contribution (0-20)
  if (company) {
    const companyScore = company.score as number | null;
    if (companyScore && companyScore >= 60) {
      score += 20;
      reasons.push(`High-scoring company: ${company.name} (${companyScore})`);
    } else if (companyScore && companyScore >= 40) {
      score += 10;
    } else if (companyScore && companyScore >= 20) {
      score += 5;
    }
  }

  // Cap at 100
  score = Math.min(100, score);

  // Grade
  let grade: string;
  if (score >= 80) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 20) grade = "D";
  else grade = "F";

  return { score, reasons, grade };
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    let scored = 0;

    for (const id of contactIds.slice(0, 20)) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
          .limit(1);

        if (!contact) continue;

        const props = (contact.properties || {}) as Record<string, unknown>;

        // Get company info if available
        let company: Record<string, unknown> | null = null;
        let companyProps: Record<string, unknown> | null = null;
        if (contact.companyId) {
          const [c] = await db
            .select()
            .from(companies)
            .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, authCtx.tenantId)))
            .limit(1);
          if (c) {
            company = c as Record<string, unknown>;
            companyProps = (c.properties || {}) as Record<string, unknown>;
          }
        }

        // Calculate engagement boost from activities
        let engagementBoost = 0;
        const engagementReasons: string[] = [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [activityCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, authCtx.tenantId),
              eq(activities.entityType, "contact"),
              eq(activities.entityId, id),
              gte(activities.occurredAt, thirtyDaysAgo)
            )
          );

        const recentActivities = Number(activityCount?.count || 0);
        if (recentActivities > 5) {
          engagementBoost = 10;
          engagementReasons.push(`${recentActivities} recent interactions`);
        } else if (recentActivities > 0) {
          engagementBoost = 5;
        }

        const fit = calculateContactFitScore(
          contact as Record<string, unknown>,
          props,
          company,
          companyProps
        );

        const totalScore = Math.min(100, fit.score + engagementBoost);
        const allReasons = [...fit.reasons, ...engagementReasons];

        // Re-calculate grade with engagement
        let grade = fit.grade;
        if (totalScore >= 80) grade = "A";
        else if (totalScore >= 60) grade = "B";
        else if (totalScore >= 40) grade = "C";
        else if (totalScore >= 20) grade = "D";

        await db
          .update(contacts)
          .set({
            score: totalScore,
            scoreReasons: allReasons,
            properties: {
              ...props,
              score_grade: grade,
              scored_at: new Date().toISOString(),
              scoring_method: "rule_based",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)));

        scored++;
      } catch (err) {
        console.warn(`Failed to score contact ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Contact scoring failed:", error);
    return Response.json({ error: "Contact scoring failed" }, { status: 500 });
  }
}
