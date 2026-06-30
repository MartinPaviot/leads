import { db } from "@/db";
import { accountLists } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { listsWithCounts, insertMembers, listLiveCount, isUniqueViolation } from "@/lib/accounts/account-lists-db";
import { z } from "zod";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  try {
    return Response.json({ lists: await listsWithCounts(authCtx.tenantId) });
  } catch (error) {
    console.error("Failed to fetch account lists:", error);
    return apiError("INTERNAL_ERROR", "Failed to fetch lists");
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  companyIds: z.array(z.string()).max(50_000).optional().default([]),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid list", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, companyIds } = parsed.data;

    // Create the list and seed its members atomically — a failed seed must not
    // leave an empty list behind. The dup-name check is inside the tx; the
    // UNIQUE(tenant_id, name) index is the real guard against a concurrent
    // create racing past the check (caught below → 409, not a generic 500).
    let list: { id: string; name: string };
    try {
      list = await db.transaction(async (tx) => {
        const [dupe] = await tx
          .select({ id: accountLists.id })
          .from(accountLists)
          .where(and(eq(accountLists.tenantId, authCtx.tenantId), eq(accountLists.name, name)))
          .limit(1);
        if (dupe) throw new ListNameConflict(dupe.id);
        const [created] = await tx
          .insert(accountLists)
          .values({ tenantId: authCtx.tenantId, name, ownerId: authCtx.userId })
          .returning({ id: accountLists.id, name: accountLists.name });
        await insertMembers(tx, created.id, authCtx.tenantId, companyIds);
        return created;
      });
    } catch (e) {
      if (e instanceof ListNameConflict) {
        return apiError("CONFLICT", `A list named "${name}" already exists.`, { listId: e.listId });
      }
      if (isUniqueViolation(e)) {
        return apiError("CONFLICT", `A list named "${name}" already exists.`);
      }
      throw e;
    }

    const count = await listLiveCount(list.id, authCtx.tenantId);
    return Response.json({ list: { id: list.id, name: list.name, count } }, { status: 201 });
  } catch (error) {
    console.error("Failed to create account list:", error);
    return apiError("INTERNAL_ERROR", "Failed to create list");
  }
}

/** Sentinel for the in-transaction dup-name check (so the rollback carries the
 * existing list id back out for the 409 payload). */
class ListNameConflict extends Error {
  constructor(public listId: string) {
    super("list name conflict");
  }
}
