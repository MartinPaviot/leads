/**
 * Resolve the connected LinkedIn / Sales-Navigator seat that acts as the SEARCH
 * VIEWER for a tenant (LinkedIn filter ids are viewer-scoped). Shared by the
 * sourcing route, the collections route, and the chat/agent sourcing tools so
 * they all pick the same seat the same way.
 */
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { LinkedInSearchApi } from "@/lib/providers/unipile/http";

export interface ConnectedSeat {
  /** Our linkedin_account.id. */
  id: string;
  /** The Unipile account_id — the API target / search viewer. */
  unipileAccountId: string;
  /** "sales_navigator" | "recruiter" | "classic" | null. */
  seatType: string | null;
}

/**
 * The tenant's active search seat: prefer THIS user's connected seat, else any
 * connected seat in the tenant (a shared SDR seat). Returns null when none is
 * connected (the caller surfaces "connect a seat first").
 */
export async function resolveConnectedSeat(tenantId: string, userId?: string): Promise<ConnectedSeat | null> {
  const rows = await db
    .select({
      id: linkedinAccount.id,
      status: linkedinAccount.status,
      unipileAccountId: linkedinAccount.unipileAccountId,
      seatType: linkedinAccount.seatType,
      userId: linkedinAccount.userId,
    })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));

  const seat =
    (userId ? rows.find((r) => r.status === "connected" && r.unipileAccountId && r.userId === userId) : undefined) ??
    rows.find((r) => r.status === "connected" && r.unipileAccountId) ??
    null;

  if (!seat?.unipileAccountId) return null;
  return { id: seat.id, unipileAccountId: seat.unipileAccountId, seatType: seat.seatType };
}

/** The search api tier a seat can use. A classic seat can't use the sales_navigator
 * endpoint, so never force it. Pure. */
export function apiForSeat(seatType: string | null | undefined): LinkedInSearchApi {
  return seatType === "sales_navigator" ? "sales_navigator" : seatType === "recruiter" ? "recruiter" : "classic";
}
