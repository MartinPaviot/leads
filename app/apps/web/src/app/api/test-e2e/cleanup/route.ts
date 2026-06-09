import { NextResponse } from "next/server";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  authAccounts,
  authSessions,
  authUsers,
  companies,
  contacts,
  deals,
  outboundEmails,
  sequenceEnrollments,
  sequenceSteps,
  sequences,
  tasks,
  tenants,
  users,
} from "@/db/schema";

/**
 * E2E-only cleanup endpoint. Deletes every row owned by the given
 * tenantId in dependency order, then drops the tenant and any auth
 * users whose email starts with the given prefix.
 *
 * M5 — dual gate. ENABLE_E2E_SEED=1 is the canonical switch so the
 * route can only fire on the CI pipeline that owns it. NODE_ENV is
 * a secondary wall.
 *
 * POST body: { tenantId: string, emailPrefix?: string }
 */
export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_E2E_SEED !== "1"
  ) {
    return NextResponse.json({ error: "Cleanup endpoint disabled" }, { status: 404 });
  }

  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET || process.env.E2E_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    emailPrefix?: string;
  };
  const { tenantId, emailPrefix } = body;
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  // Hard guard: only ever wipe tenants THIS harness seeded — they're named
  // "E2E <slug> <ts>" (see ../seed). Without it, a stray REAL tenantId (e.g.
  // read from a logged-in session) gets hard-deleted: that's the 2026-06-09
  // near-miss. Belt to the ENABLE_E2E_SEED + Bearer braces.
  const [target] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!target || !/^E2E /.test(target.name ?? "")) {
    return NextResponse.json(
      { error: "Refused: target is not an E2E-seeded tenant (name must start with 'E2E ')" },
      { status: 403 },
    );
  }

  try {
    // Child tables first (tenant-scoped).
    // sequenceEnrollments doesn't have tenantId but joins via sequenceId.
    const seqIds = (
      await db.select({ id: sequences.id }).from(sequences).where(eq(sequences.tenantId, tenantId))
    ).map((r) => r.id);

    if (seqIds.length > 0) {
      await db.delete(sequenceEnrollments).where(inArray(sequenceEnrollments.sequenceId, seqIds));
      await db.delete(sequenceSteps).where(inArray(sequenceSteps.sequenceId, seqIds));
    }

    await db.delete(outboundEmails).where(eq(outboundEmails.tenantId, tenantId));
    await db.delete(sequences).where(eq(sequences.tenantId, tenantId));
    await db.delete(activities).where(eq(activities.tenantId, tenantId));
    await db.delete(tasks).where(eq(tasks.tenantId, tenantId));
    await db.delete(deals).where(eq(deals.tenantId, tenantId));
    await db.delete(contacts).where(eq(contacts.tenantId, tenantId));
    await db.delete(companies).where(eq(companies.tenantId, tenantId));

    // Collect the authUser ids for this tenant via the users table
    // before we drop the users rows.
    const authUserIds = (
      await db.select({ clerkId: users.clerkId }).from(users).where(eq(users.tenantId, tenantId))
    ).map((r) => r.clerkId);

    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));

    if (authUserIds.length > 0) {
      await db.delete(authSessions).where(inArray(authSessions.userId, authUserIds));
      await db.delete(authAccounts).where(inArray(authAccounts.userId, authUserIds));
      await db.delete(authUsers).where(inArray(authUsers.id, authUserIds));
    }

    // Belt-and-braces: wipe any leftover auth rows matching the prefix.
    if (emailPrefix) {
      const leftover = await db
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(like(authUsers.email, `${emailPrefix}%`));
      const ids = leftover.map((r) => r.id);
      if (ids.length > 0) {
        await db.delete(authSessions).where(inArray(authSessions.userId, ids));
        await db.delete(authAccounts).where(inArray(authAccounts.userId, ids));
        await db.delete(authUsers).where(inArray(authUsers.id, ids));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("_test/cleanup: failed", err);
    return NextResponse.json(
      { error: "Cleanup failed", detail: String(err) },
      { status: 500 }
    );
  }
}
