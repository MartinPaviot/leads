import { db } from "@/db";
import { pendingInvites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashInviteToken } from "./invite-token";

/**
 * Server-side validation of a raw invite token.
 *
 * Single source of truth for "is this a real, still-open invitation?", shared
 * by the public invite endpoint (`/api/auth/invite/[token]`) AND the sign-up
 * gate (account creation is invitation-only — there is no public self-serve
 * sign-up). Hashes the raw token (the column stores a SHA-256 hash, see
 * invite-token.ts), looks up the pending invite, and confirms it is still
 * `pending` and unexpired. A found-but-expired invite is marked `expired` as a
 * side effect, so the invites list stops showing it.
 */
export type InviteValidation =
  | {
      valid: true;
      invite: { id: string; tenantId: string; email: string; role: string; expiresAt: Date };
    }
  | {
      valid: false;
      /** "missing_token" | "not_found" | "expired" | the non-pending status (cancelled/accepted/…) */
      reason: string;
    };

export async function validateInviteToken(
  rawToken: string | null | undefined,
): Promise<InviteValidation> {
  const token = (rawToken ?? "").trim();
  if (!token) return { valid: false, reason: "missing_token" };

  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .select({
      id: pendingInvites.id,
      tenantId: pendingInvites.tenantId,
      email: pendingInvites.email,
      role: pendingInvites.role,
      status: pendingInvites.status,
      expiresAt: pendingInvites.expiresAt,
    })
    .from(pendingInvites)
    .where(eq(pendingInvites.token, tokenHash))
    .limit(1);

  if (!invite) return { valid: false, reason: "not_found" };
  if (invite.status !== "pending") return { valid: false, reason: invite.status };
  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(pendingInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(pendingInvites.id, invite.id));
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    invite: {
      id: invite.id,
      tenantId: invite.tenantId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    },
  };
}
