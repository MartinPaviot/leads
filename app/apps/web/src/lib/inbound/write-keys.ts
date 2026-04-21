/**
 * Inbound pixel write keys (primitive ⑥).
 *
 * The pixel snippet on a customer's marketing site carries a write
 * key rather than the tenant ID — keys can be rotated, revoked, and
 * scoped without touching the tenant. We generate a 32-char secret,
 * show it to the user once (reveal at creation), and persist only the
 * SHA-256 hash so a DB leak can't replay the pixel traffic.
 *
 * Key format: `lk_` + 32 hex chars (128 bits). The prefix is stored
 * unhashed for display ("lk_ab12…") so the settings UI can show
 * "delete key lk_ab12…" without asking the user to re-enter it.
 */

import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { inboundWriteKeys } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const KEY_PREFIX = "lk_";
const SECRET_BYTES = 16; // 16 bytes → 32 hex chars

export interface ResolvedWriteKey {
  id: string;
  tenantId: string;
}

export function hashWriteKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Only the caller of `issueWriteKey` ever sees `raw`; callers MUST NOT log it. */
export interface IssuedWriteKey {
  id: string;
  tenantId: string;
  raw: string;
  prefix: string;
}

export async function issueWriteKey(params: {
  tenantId: string;
  label?: string;
}): Promise<IssuedWriteKey> {
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  const raw = `${KEY_PREFIX}${secret}`;
  const keyHash = hashWriteKey(raw);
  const keyPrefix = raw.slice(0, 7); // "lk_ab12"

  const [row] = await db
    .insert(inboundWriteKeys)
    .values({
      tenantId: params.tenantId,
      keyHash,
      keyPrefix,
      label: params.label ?? null,
    })
    .returning({ id: inboundWriteKeys.id, tenantId: inboundWriteKeys.tenantId });

  return { id: row.id, tenantId: row.tenantId, raw, prefix: keyPrefix };
}

/**
 * Resolve a raw pixel key to its tenant. Returns null for unknown or
 * revoked keys so the public endpoint can drop the request without
 * leaking which keys are valid vs invalid.
 */
export async function resolveWriteKey(raw: string | null | undefined): Promise<ResolvedWriteKey | null> {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith(KEY_PREFIX)) return null;

  const keyHash = hashWriteKey(raw);
  const [row] = await db
    .select({
      id: inboundWriteKeys.id,
      tenantId: inboundWriteKeys.tenantId,
    })
    .from(inboundWriteKeys)
    .where(and(eq(inboundWriteKeys.keyHash, keyHash), isNull(inboundWriteKeys.revokedAt)))
    .limit(1);

  if (!row) return null;

  // Touch last-used-at so revoke tooling can spot stale keys. Fire-
  // and-forget — a failed update must never block ingestion.
  db.update(inboundWriteKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(inboundWriteKeys.id, row.id))
    .catch(() => {});

  return { id: row.id, tenantId: row.tenantId };
}

export async function revokeWriteKey(params: { tenantId: string; id: string }): Promise<boolean> {
  const res = await db
    .update(inboundWriteKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(inboundWriteKeys.id, params.id), eq(inboundWriteKeys.tenantId, params.tenantId)))
    .returning({ id: inboundWriteKeys.id });
  return res.length > 0;
}
