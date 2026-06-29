import { db } from "@/db";
import { accountLists, accountListMembers } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq, inArray } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { addMembers, listLiveCount } from "@/lib/accounts/account-lists-db";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  addCompanyIds: z.array(z.string()).max(50_000).optional(),
  removeCompanyIds: z.array(z.string()).max(50_000).optional(),
});

/** Confirm the list exists in the caller's tenant before any mutation. */
async function ownedList(listId: string, tenantId: string) {
  const [list] = await db
    .select({ id: accountLists.id, name: accountLists.name })
    .from(accountLists)
    .where(and(eq(accountLists.id, listId), eq(accountLists.tenantId, tenantId)))
    .limit(1);
  return list ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  try {
    const { id } = await params;
    const list = await ownedList(id, authCtx.tenantId);
    if (!list) return apiError("NOT_FOUND", "List not found");

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid update", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { name, addCompanyIds, removeCompanyIds } = parsed.data;

    if (name && name !== list.name) {
      const [dupe] = await db
        .select({ id: accountLists.id })
        .from(accountLists)
        .where(and(eq(accountLists.tenantId, authCtx.tenantId), eq(accountLists.name, name)))
        .limit(1);
      if (dupe && dupe.id !== id) {
        return apiError("CONFLICT", `A list named "${name}" already exists.`);
      }
    }

    if (removeCompanyIds && removeCompanyIds.length > 0) {
      await db
        .delete(accountListMembers)
        .where(and(eq(accountListMembers.listId, id), inArray(accountListMembers.companyId, [...new Set(removeCompanyIds)])));
    }
    if (addCompanyIds && addCompanyIds.length > 0) {
      await addMembers(id, authCtx.tenantId, addCompanyIds);
    }
    if (name || addCompanyIds?.length || removeCompanyIds?.length) {
      await db.update(accountLists).set({ ...(name ? { name } : {}), updatedAt: new Date() }).where(eq(accountLists.id, id));
    }

    return Response.json({
      list: { id, name: name ?? list.name, count: await listLiveCount(id, authCtx.tenantId) },
    });
  } catch (error) {
    console.error("Failed to update account list:", error);
    return apiError("INTERNAL_ERROR", "Failed to update list");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");
  try {
    const { id } = await params;
    const list = await ownedList(id, authCtx.tenantId);
    if (!list) return apiError("NOT_FOUND", "List not found");
    // Membership rows cascade (FK ON DELETE CASCADE). The accounts themselves
    // are never touched — a list is only a grouping over existing companies.
    await db.delete(accountLists).where(eq(accountLists.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete account list:", error);
    return apiError("INTERNAL_ERROR", "Failed to delete list");
  }
}
