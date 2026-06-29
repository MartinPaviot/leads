import { db } from "@/db";
import { accountLists } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { listsWithCounts, addMembers } from "@/lib/accounts/account-lists-db";
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

    // One list name per tenant — surface the collision so the UI can offer to
    // add into the existing list instead of silently creating a duplicate.
    const [dupe] = await db
      .select({ id: accountLists.id })
      .from(accountLists)
      .where(and(eq(accountLists.tenantId, authCtx.tenantId), eq(accountLists.name, name)))
      .limit(1);
    if (dupe) {
      return apiError("CONFLICT", `A list named "${name}" already exists.`, { listId: dupe.id });
    }

    const [list] = await db
      .insert(accountLists)
      .values({ tenantId: authCtx.tenantId, name, ownerId: authCtx.userId })
      .returning();

    const added = await addMembers(list.id, authCtx.tenantId, companyIds);

    return Response.json({ list: { id: list.id, name: list.name, count: added } }, { status: 201 });
  } catch (error) {
    console.error("Failed to create account list:", error);
    return apiError("INTERNAL_ERROR", "Failed to create list");
  }
}
