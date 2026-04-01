import { auth } from "@/auth";
import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mailboxes = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, "default"))
    .orderBy(connectedMailboxes.createdAt);

  return Response.json({ mailboxes });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { email, displayName, provider, imapHost, imapPort, smtpHost, smtpPort, password, accessToken, refreshToken } = body;

  if (!email || !provider) {
    return Response.json({ error: "email and provider required" }, { status: 400 });
  }

  const domain = email.split("@")[1];
  const eeAccountId = `default_${email.replace(/[^a-zA-Z0-9]/g, "-")}`;

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
      tenantId: "default",
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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  // Delete from EmailEngine
  const [mailbox] = await db
    .select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.id, id))
    .limit(1);

  if (mailbox) {
    const eeBase = process.env.EMAILENGINE_URL || "http://localhost:3100";
    try {
      await fetch(`${eeBase}/v1/account/${mailbox.eeAccountId}`, { method: "DELETE" });
    } catch {}

    await db.delete(connectedMailboxes).where(eq(connectedMailboxes.id, id));
  }

  return Response.json({ success: true });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");

  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  if (action === "skip-warmup") {
    await db
      .update(connectedMailboxes)
      .set({
        status: "active",
        warmupCompletedAt: new Date(),
        dailyLimit: 50,
        updatedAt: new Date(),
      })
      .where(eq(connectedMailboxes.id, id));

    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
