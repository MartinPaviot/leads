import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, contacts, deals, activities } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { searchSimilar } from "@/lib/embeddings";

/**
 * Recall accuracy test for customer memory.
 * Generates test queries from actual CRM data, runs semantic search,
 * and scores how well the system retrieves the right records.
 *
 * Target: 90%+ recall on known data.
 */

interface TestResult {
  query: string;
  expectedEntityType: string;
  expectedEntityId: string;
  expectedName: string;
  found: boolean;
  topResults: Array<{
    entityType: string;
    entityId: string;
    similarity: number;
    contentPreview: string;
  }>;
  rank: number | null; // position in results (null if not found)
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY required for embedding search" }, { status: 400 });
  }

  try {
    const tenantId = authCtx.tenantId;

    // Fetch actual CRM data to generate test queries
    const allCompanies = await db.select().from(companies)
      .where(eq(companies.tenantId, tenantId)).limit(20);
    const allContacts = await db.select().from(contacts)
      .where(eq(contacts.tenantId, tenantId)).limit(20);
    const allDeals = await db.select().from(deals)
      .where(eq(deals.tenantId, tenantId)).limit(20);
    const recentActivities = await db.select().from(activities)
      .where(eq(activities.tenantId, tenantId))
      .orderBy(desc(activities.occurredAt)).limit(20);

    const tests: Array<{
      query: string;
      expectedEntityType: string;
      expectedEntityId: string;
      expectedName: string;
    }> = [];

    // Generate company recall tests
    for (const company of allCompanies.slice(0, 5)) {
      tests.push({
        query: `Tell me about ${company.name}`,
        expectedEntityType: "company",
        expectedEntityId: company.id,
        expectedName: company.name,
      });
      if (company.industry) {
        tests.push({
          query: `Which companies are in ${company.industry}?`,
          expectedEntityType: "company",
          expectedEntityId: company.id,
          expectedName: company.name,
        });
      }
    }

    // Generate contact recall tests
    for (const contact of allContacts.slice(0, 5)) {
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
      if (name) {
        tests.push({
          query: `Find ${name}`,
          expectedEntityType: "contact",
          expectedEntityId: contact.id,
          expectedName: name,
        });
      }
      if (contact.email) {
        tests.push({
          query: `Who is ${contact.email}?`,
          expectedEntityType: "contact",
          expectedEntityId: contact.id,
          expectedName: name || contact.email,
        });
      }
    }

    // Generate deal recall tests
    for (const deal of allDeals.slice(0, 3)) {
      tests.push({
        query: `What's the status of the ${deal.name} deal?`,
        expectedEntityType: "deal",
        expectedEntityId: deal.id,
        expectedName: deal.name,
      });
    }

    // Generate activity recall tests (cross-reference)
    for (const activity of recentActivities.slice(0, 3)) {
      if (activity.summary) {
        tests.push({
          query: activity.summary.slice(0, 100),
          expectedEntityType: "activity",
          expectedEntityId: activity.id,
          expectedName: activity.summary.slice(0, 50),
        });
      }
    }

    if (tests.length === 0) {
      return Response.json({
        error: "No CRM data to test against. Import data first.",
        totalTests: 0,
        passed: 0,
        recall: 0,
      });
    }

    // Run each test
    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const searchResults = await searchSimilar(test.query, 10, tenantId);

        const rank = searchResults.findIndex(
          (r) => r.entityType === test.expectedEntityType && r.entityId === test.expectedEntityId
        );

        results.push({
          query: test.query,
          expectedEntityType: test.expectedEntityType,
          expectedEntityId: test.expectedEntityId,
          expectedName: test.expectedName,
          found: rank >= 0,
          topResults: searchResults.slice(0, 5).map((r) => ({
            entityType: r.entityType,
            entityId: r.entityId,
            similarity: Math.round(r.similarity * 100) / 100,
            contentPreview: r.content.slice(0, 100),
          })),
          rank: rank >= 0 ? rank + 1 : null,
        });
      } catch (err) {
        results.push({
          query: test.query,
          expectedEntityType: test.expectedEntityType,
          expectedEntityId: test.expectedEntityId,
          expectedName: test.expectedName,
          found: false,
          topResults: [],
          rank: null,
        });
      }
    }

    const passed = results.filter((r) => r.found).length;
    const recall = Math.round((passed / results.length) * 100);

    // Top-3 recall (found in first 3 results)
    const top3Passed = results.filter((r) => r.rank !== null && r.rank <= 3).length;
    const top3Recall = Math.round((top3Passed / results.length) * 100);

    return Response.json({
      totalTests: results.length,
      passed,
      failed: results.length - passed,
      recall: `${recall}%`,
      top3Recall: `${top3Recall}%`,
      target: "90%",
      results,
      // Summary of failures
      failures: results.filter((r) => !r.found).map((r) => ({
        query: r.query,
        expected: `${r.expectedEntityType}:${r.expectedName}`,
        gotInstead: r.topResults.length > 0
          ? `${r.topResults[0].entityType}: ${r.topResults[0].contentPreview.slice(0, 50)}`
          : "no results",
      })),
    });
  } catch (error) {
    console.error("Recall test failed:", error);
    return Response.json({ error: "Recall test failed" }, { status: 500 });
  }
}
