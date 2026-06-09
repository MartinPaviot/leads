import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies, contacts, deals, tasks, notes, chatThreads } from "@/db/schema";
import { and, eq, ilike, or, sql, isNull } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return Response.json({ results: [] });
  }

  const pattern = `%${q}%`;
  const tid = authCtx.tenantId;
  const limit = 5;

  try {
    const [accts, ctcts, opps, tks, nts, chats] = await Promise.all([
      db
        .select({ id: companies.id, name: companies.name, domain: companies.domain })
        .from(companies)
        .where(and(eq(companies.tenantId, tid), or(ilike(companies.name, pattern), ilike(companies.domain, pattern)), isNull(companies.deletedAt)))
        .limit(limit),
      db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.tenantId, tid),
            or(
              ilike(contacts.firstName, pattern),
              ilike(contacts.lastName, pattern),
              ilike(contacts.email, pattern)
            ),
            isNull(contacts.deletedAt),
          )
        )
        .limit(limit),
      db
        .select({ id: deals.id, name: deals.name, stage: deals.stage })
        .from(deals)
        .where(and(eq(deals.tenantId, tid), ilike(deals.name, pattern), isNull(deals.deletedAt)))
        .limit(limit),
      db
        .select({ id: tasks.id, title: tasks.title })
        .from(tasks)
        .where(and(eq(tasks.tenantId, tid), ilike(tasks.title, pattern), isNull(tasks.deletedAt)))
        .limit(limit),
      db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(and(eq(notes.tenantId, tid), ilike(notes.title, pattern), isNull(notes.deletedAt)))
        .limit(limit),
      db
        .select({ id: chatThreads.id, title: chatThreads.title })
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, authCtx.appUserId),
            chatThreads.title
              ? ilike(chatThreads.title, pattern)
              : sql`false`
          )
        )
        .limit(limit),
    ]);

    return Response.json({
      results: {
        accounts: accts.map((a) => ({
          id: a.id,
          name: a.name,
          domain: a.domain,
          type: "account" as const,
        })),
        contacts: ctcts.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
          type: "contact" as const,
        })),
        opportunities: opps.map((o) => ({
          id: o.id,
          name: o.name,
          meta: o.stage,
          type: "opportunity" as const,
        })),
        tasks: tks.map((t) => ({
          id: t.id,
          name: t.title,
          type: "task" as const,
        })),
        notes: nts.map((n) => ({
          id: n.id,
          name: n.title,
          type: "note" as const,
        })),
        chats: chats.map((c) => ({
          id: c.id,
          name: c.title,
          type: "chat" as const,
        })),
      },
    });
  } catch (error) {
    console.error("Quick search failed:", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
