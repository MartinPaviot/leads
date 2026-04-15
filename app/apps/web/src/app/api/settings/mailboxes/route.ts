import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { connectedMailboxes, outboundEmails, warmupEmails } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { retryWithBackoff } from "@/lib/retry";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, authCtx.tenantId))
    .orderBy(connectedMailboxes.createdAt);

  return Response.json({ mailboxes });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { email, displayName, provider, imapHost, imapPort, smtpHost, smtpPort, password, accessToken, refreshToken } = body;

  if (!email || !provider) {
    return Response.json({ error: "email and provider required" }, { status: 400 });
  }

  const domain = email.split("@")[1];
  const eeAccountId = `${authCtx.tenantId}_${email.replace(/[^a-zA-Z0-9]/g, "-")}`;

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
      // SMTP/IMAP credentials
      eeBody = {
        account: eeAccountId,
        name: displayName || email,
        imap: {
          host: imapHost || "imap.gmail.com",
          port: imapPort || 993,
          secure: true,
          auth: { user: email, pass: password },
        },
        smtp: {
          host: smtpHost || "smtp.gmail.com",
          port: smtpPort || 465,
          secure: true,
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

  // Save to database
  const [mailbox] = await db
    .insert(connectedMailboxes)
    .values({
      tenantId: authCtx.tenantId,
      emailAddress: email,
      displayName: displayName || email.split("@")[0],
      provider,
      eeAccountId,
      domain,
      status: "warming_up",
      warmupStartedAt: new Date(),
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
    .where(and(eq(connectedMailboxes.id, id), eq(connectedMailboxes.tenantId, authCtx.tenantId)))
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
      and(eq(connectedMailboxes.id, id), eq(connectedMailboxes.tenantId, authCtx.tenantId))
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
