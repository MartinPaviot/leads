import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { connectedMailboxes, outboundEmails, warmupEmails, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { retryWithBackoff } from "@/lib/infra/retry";
import { checkPlanLimit } from "@/lib/billing/plan-limits";
import { verifyImap } from "@/lib/integrations/imap";
import { verifySmtp } from "@/lib/integrations/smtp-send";
import { discoverCalDavUrl } from "@/lib/integrations/caldav";
import { encryptSecret } from "@/lib/crypto/settings-encryption";
import { inngest } from "@/inngest/client";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Personal: a user only sees the mailboxes they own.
  const where = and(
    eq(connectedMailboxes.tenantId, authCtx.tenantId),
    eq(connectedMailboxes.userId, authCtx.userId),
  );
  // A worktree dev server can point at a prod DB that is BEHIND the Drizzle schema
  // (e.g. the `shared` column isn't deployed yet) — `select()` of every column then
  // 500s with `column "..." does not exist`, which emptied the inbox From-selector
  // and broke this page. Fall back to a core, always-present subset so it keeps
  // working instead of 500ing. (See reference_prod-schema-behind-drizzle.)
  let mailboxes;
  try {
    mailboxes = await db.select().from(connectedMailboxes).where(where).orderBy(connectedMailboxes.createdAt);
  } catch {
    mailboxes = await db
      .select({
        id: connectedMailboxes.id,
        tenantId: connectedMailboxes.tenantId,
        userId: connectedMailboxes.userId,
        emailAddress: connectedMailboxes.emailAddress,
        displayName: connectedMailboxes.displayName,
        provider: connectedMailboxes.provider,
        status: connectedMailboxes.status,
        domain: connectedMailboxes.domain,
        createdAt: connectedMailboxes.createdAt,
        updatedAt: connectedMailboxes.updatedAt,
      })
      .from(connectedMailboxes)
      .where(where)
      .orderBy(connectedMailboxes.createdAt);
  }

  return Response.json({ mailboxes });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Plan limit enforcement: mailboxes
  const planCheck = await checkPlanLimit(authCtx.tenantId, "mailboxes");
  if (!planCheck.allowed) {
    return Response.json(
      {
        error: `Mailbox limit reached (${planCheck.current}/${planCheck.limit}). Upgrade your plan to connect more mailboxes.`,
        code: "PLAN_LIMIT_EXCEEDED",
        current: planCheck.current,
        limit: planCheck.limit,
        plan: planCheck.plan,
      },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { email, displayName, provider, imapHost, imapPort, smtpHost, smtpPort, password, accessToken, refreshToken, caldavUrl } = body;

  if (!email || !provider) {
    return Response.json({ error: "email and provider required" }, { status: 400 });
  }

  const domain = email.split("@")[1];
  const eeAccountId = `${authCtx.tenantId}_${email.replace(/[^a-zA-Z0-9]/g, "-")}`;

  // ── Direct IMAP/SMTP ("Other provider") — no EmailEngine ──────────────
  // Verify the connection FOR REAL before saving, encrypt the password, store
  // the host/port details, and kick off the first sync. This replaces the old
  // behaviour that, whenever EmailEngine was unreachable, saved a dead mailbox
  // row while silently dropping the password — so the user believed they were
  // connected but nothing ever synced or sent.
  if (provider === "smtp_custom") {
    if (!imapHost || !smtpHost || !password) {
      return Response.json(
        { error: "IMAP server, SMTP server and password are required." },
        { status: 400 },
      );
    }
    const imapPortN = Number(imapPort) || 993;
    const smtpPortN = Number(smtpPort) || 465;
    try {
      await verifyImap({ imapHost, imapPort: imapPortN, emailAddress: email, password });
      await verifySmtp({ emailAddress: email, smtpHost, smtpPort: smtpPortN, password, displayName });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Could not connect the mailbox." },
        { status: 400 },
      );
    }

    let secretEncrypted: string;
    try {
      secretEncrypted = encryptSecret(password);
    } catch (err) {
      logger.error("mailboxes POST: secret encryption failed", { err, tenantId: authCtx.tenantId });
      return Response.json({ error: "Server misconfigured (encryption key missing)." }, { status: 500 });
    }

    // Calendar via CalDAV — the IMAP/SMTP path has no OAuth calendar, so we
    // discover the user's calendar with the SAME credentials. Non-fatal and
    // time-bounded: a provider without CalDAV (or a slow probe) must never
    // block connecting the mailbox for email. An explicit URL, if supplied,
    // is tried first.
    let resolvedCaldavUrl: string | null = null;
    try {
      resolvedCaldavUrl = await Promise.race([
        discoverCalDavUrl({ email, password, imapHost, explicitUrl: caldavUrl }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
    } catch {
      resolvedCaldavUrl = null; // calendar simply stays unavailable
    }

    // Idempotent on (tenant_id, email_address) (A1 R4): a re-connect updates the
    // existing row in place instead of throwing on the unique constraint (500).
    const [mailbox] = await db
      .insert(connectedMailboxes)
      .values({
        tenantId: authCtx.tenantId,
        userId: authCtx.userId,
        emailAddress: email,
        displayName: displayName || email.split("@")[0],
        provider: "smtp_custom",
        eeAccountId,
        imapHost,
        imapPort: imapPortN,
        smtpHost,
        smtpPort: smtpPortN,
        secretEncrypted,
        caldavUrl: resolvedCaldavUrl,
        domain,
        // The user's existing mailbox is already warm — no cold-start warmup.
        status: "active",
      })
      .onConflictDoUpdate({
        target: [connectedMailboxes.tenantId, connectedMailboxes.emailAddress],
        set: {
          userId: authCtx.userId,
          displayName: displayName || email.split("@")[0],
          provider: "smtp_custom",
          eeAccountId,
          imapHost,
          imapPort: imapPortN,
          smtpHost,
          smtpPort: smtpPortN,
          secretEncrypted,
          caldavUrl: resolvedCaldavUrl,
          domain,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning();

    // Kick off the first inbound sync now (don't wait for the 15-min cron).
    const [u] = await db
      .select({ id: users.id, clerkId: users.clerkId })
      .from(users)
      .where(eq(users.id, authCtx.appUserId))
      .limit(1);
    inngest
      .send({
        name: "email/sync-requested",
        data: {
          userId: u?.clerkId ?? authCtx.appUserId,
          tenantId: authCtx.tenantId,
          appUserId: authCtx.appUserId,
          daysBack: 30,
          provider: "smtp_custom",
          mailboxId: mailbox.id,
        },
      })
      .catch(() => {});

    return Response.json({ mailbox }, { status: 201 });
  }

  // Register with EmailEngine
  const eeBase = process.env.EMAILENGINE_URL || "http://localhost:3100";
  try {
    let eeBody: Record<string, unknown>;

    if (provider === "gmail" && accessToken) {
      // OAuth flow
      eeBody = {
        account: eeAccountId,
        name: displayName || email,
        oauth2: {
          provider: "gmail",
          auth: { user: email },
          accessToken,
          refreshToken,
        },
      };
    } else {
      // SMTP/IMAP credentials (Zimbra, Infomaniak, OVH, any IMAP/SMTP host).
      // `secure` is implicit-TLS (993/465); STARTTLS ports (143/587) connect
      // plaintext then upgrade, so secure must be false there or the TLS
      // handshake fails. Derive it from the port instead of hardcoding true.
      const imapP = imapPort || 993;
      const smtpP = smtpPort || 465;
      eeBody = {
        account: eeAccountId,
        name: displayName || email,
        imap: {
          host: imapHost || "imap.gmail.com",
          port: imapP,
          secure: imapP === 993,
          auth: { user: email, pass: password },
        },
        smtp: {
          host: smtpHost || "smtp.gmail.com",
          port: smtpP,
          secure: smtpP === 465,
          auth: { user: email, pass: password },
        },
      };
    }

    const eeRes = await fetch(`${eeBase}/v1/account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eeBody),
    });

    if (!eeRes.ok) {
      const text = await eeRes.text();
      return Response.json({ error: `EmailEngine registration failed: ${text}` }, { status: 502 });
    }
  } catch (err) {
    console.warn("EmailEngine not available, saving mailbox anyway:", err);
  }

  // Save to database — idempotent on (tenant_id, email_address) (A1 R4): a
  // re-link converges on one row instead of throwing on the unique constraint.
  const [mailbox] = await db
    .insert(connectedMailboxes)
    .values({
      tenantId: authCtx.tenantId,
      userId: authCtx.userId,
      emailAddress: email,
      displayName: displayName || email.split("@")[0],
      provider,
      eeAccountId,
      domain,
      status: "warming_up",
      warmupStartedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [connectedMailboxes.tenantId, connectedMailboxes.emailAddress],
      set: {
        userId: authCtx.userId,
        displayName: displayName || email.split("@")[0],
        provider,
        eeAccountId,
        domain,
        updatedAt: new Date(),
      },
    })
    .returning();

  return Response.json({ mailbox }, { status: 201 });
}

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  // Look up the mailbox first
  const [mailbox] = await db
    .select()
    .from(connectedMailboxes)
    .where(and(eq(connectedMailboxes.id, id), eq(connectedMailboxes.tenantId, authCtx.tenantId), eq(connectedMailboxes.userId, authCtx.userId)))
    .limit(1);

  if (!mailbox) {
    return Response.json({ error: "mailbox not found" }, { status: 404 });
  }

  // Delete from EmailEngine. Best-effort with bounded retries — if EE
  // stays unreachable we still want to free the local rows so the user
  // is unblocked, but we surface the orphan to Sentry via logger.error
  // so an operator can reconcile EE state on their side.
  const eeBase = process.env.EMAILENGINE_URL || "http://localhost:3100";
  let eeOrphaned = false;
  try {
    await retryWithBackoff(
      async () => {
        const res = await fetch(`${eeBase}/v1/account/${mailbox.eeAccountId}`, {
          method: "DELETE",
        });
        // 404 from EE = already gone, treat as success. Anything else
        // 4xx/5xx is retryable noise (EE rolling restart, transient
        // network blip, etc).
        if (!res.ok && res.status !== 404) {
          throw new Error(`EmailEngine responded ${res.status}`);
        }
      },
      { attempts: 3, baseDelayMs: 200, maxDelayMs: 1_500 }
    );
  } catch (err) {
    eeOrphaned = true;
    logger.error("mailboxes DELETE: EmailEngine remote delete failed after retries", {
      err,
      tenantId: authCtx.tenantId,
      mailboxId: id,
      eeAccountId: mailbox.eeAccountId,
      eeBase,
    });
  }

  // Delete dependent records first to avoid FK constraint violations.
  try {
    await db.delete(warmupEmails).where(
      or(
        eq(warmupEmails.mailboxId, id),
        eq(warmupEmails.targetMailboxId, id),
      )
    );
    await db.delete(outboundEmails).where(eq(outboundEmails.mailboxId, id));
  } catch (err) {
    logger.error("mailboxes DELETE: failed to clear dependent rows", {
      err,
      tenantId: authCtx.tenantId,
      mailboxId: id,
    });
    return Response.json(
      { error: "Failed to delete mailbox — could not clear dependent emails. Try again." },
      { status: 500 },
    );
  }

  // Delete the mailbox itself
  try {
    await db.delete(connectedMailboxes).where(
      and(eq(connectedMailboxes.id, id), eq(connectedMailboxes.tenantId, authCtx.tenantId), eq(connectedMailboxes.userId, authCtx.userId))
    );
  } catch (err) {
    logger.error("mailboxes DELETE: failed to delete mailbox row", {
      err,
      tenantId: authCtx.tenantId,
      mailboxId: id,
    });
    return Response.json({ error: "Failed to delete mailbox — it may have dependent records" }, { status: 500 });
  }

  return Response.json({ success: true, eeOrphaned });
}

export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  // Accept id from query params OR request body
  const id = searchParams.get("id") || body.id;
  const action = searchParams.get("action") || body.action;

  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const condition = and(
    eq(connectedMailboxes.id, id),
    eq(connectedMailboxes.tenantId, authCtx.tenantId),
    eq(connectedMailboxes.userId, authCtx.userId),
  );

  // Handle skip-warmup action (legacy query-param style)
  if (action === "skip-warmup") {
    await db
      .update(connectedMailboxes)
      .set({
        status: "active",
        warmupCompletedAt: new Date(),
        dailyLimit: 50,
        updatedAt: new Date(),
      })
      .where(condition);

    return Response.json({ success: true });
  }

  // Handle general field updates from body (status, displayName, dailyLimit, etc.)
  const allowedFields = [
    "status", "displayName", "dailyLimit",
    "sendWindowStart", "sendWindowEnd", "sendDays",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(connectedMailboxes)
    .set(updates)
    .where(condition)
    .returning();

  if (!updated) {
    return Response.json({ error: "mailbox not found" }, { status: 404 });
  }

  return Response.json({ mailbox: updated });
}
