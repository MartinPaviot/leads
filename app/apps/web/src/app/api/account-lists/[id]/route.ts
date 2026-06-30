import { db } from "@/db";
import { accountLists, accountListMembers } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq, inArray } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { insertMembers, listLiveCount, isUniqueViolation } from "@/lib/accounts/account-lists-db";
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
    const { name } = parsed.data;
    // De-dupe + drop empties up front so the "did anything change?" guard below
    // (which gates the updatedAt bump) reflects REAL changes, not raw input length.
    const addIds = [...new Set((parsed.data.addCompanyIds ?? []).filter(Boolean))];
    const removeIds = [...new Set((parsed.data.removeCompanyIds ?? []).filter(Boolean))];

    // All mutations atomic — a partial PATCH must not leave the list half-updated.
    // A name collision (checked here + enforced by the UNIQUE index) rolls the
    // whole thing back and maps to 409, never a generic 500.
    try {
      await db.transaction(async (tx) => {
        if (name && name !== list.name) {
          const [dupe] = await tx
            .select({ id: accountLists.id })
            .from(accountLists)
            .where(and(eq(accountLists.tenantId, authCtx.tenantId), eq(accountLists.name, name)))
            .limit(1);
          if (dupe && dupe.id !== id) throw new ListNameConflict();
        }
        if (removeIds.length > 0) {
          await tx
            .delete(accountListMembers)
            .where(and(eq(accountListMembers.listId, id), inArray(accountListMembers.companyId, removeIds)));
        }
        if (addIds.length > 0) {
          await insertMembers(tx, id, authCtx.tenantId, addIds);
        }
        if (name || addIds.length > 0 || removeIds.length > 0) {
          await tx.update(accountLists).set({ ...(name ? { name } : {}), updatedAt: new Date() }).where(eq(accountLists.id, id));
        }
      });
    } catch (e) {
      if (e instanceof ListNameConflict || isUniqueViolation(e)) {
        return apiError("CONFLICT", `A list named "${name}" already exists.`);
      }
      throw e;
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

/** Sentinel for the in-transaction dup-name check → mapped to 409. */
class ListNameConflict extends Error {
  constructor() {
    super("list name conflict");
  }
}
