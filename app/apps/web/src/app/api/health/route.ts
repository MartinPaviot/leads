import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Read version once at module load (avoids repeated fs reads)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require("../../../../package.json") as { version: string };

export const dynamic = "force-dynamic";

/**
 * SOC2 T9 — deep health check. Verifies the database answers (3s budget),
 * and reports the deployed commit so an incident responder can tell WHAT
 * is live without opening Vercel. Returns 503 on a failed dependency so
 * the external uptime probe (.github/workflows/uptime.yml) alerts.
 * Public endpoint: keep the payload to status facts only.
 */
export async function GET() {
  let dbOk = false;
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db health timeout")), 3000),
      ),
    ]);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
      version,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7),
    },
    {
      status: dbOk ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
