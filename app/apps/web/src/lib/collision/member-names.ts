import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Map of tenant member app-id (`users.id`) → display name, for attributing
 * activity lines and collision warnings.
 *
 * Includes DEACTIVATED members on purpose: a rep who has since been removed must
 * still be NAMED on the history they created (R1.9) — so, unlike the members
 * list route, this does NOT filter `deactivatedAt`. One query; build it once per
 * request and pass it to the pure helpers (no per-row lookup).
 */
export async function getTenantMemberNames(tenantId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId));

  const map = new Map<string, string>();
  for (const m of rows) {
    if (!m.id) continue;
    const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "";
    map.set(m.id, name);
  }
  return map;
}
