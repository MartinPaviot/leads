/**
 * ProposalStorage — where template (and later filled-proposal) bytes live.
 *
 * v1 default is a DB-blob store (proposal_assets) so PROPOSAL-001 ships
 * without provisioning a bucket. The interface lets us swap to Supabase
 * Storage (EU) or S3 by config later without touching callers. Every
 * method is tenant-scoped; get/delete reject a ref from another tenant.
 */

import { db } from "@/db";
import { proposalAssets } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface StoredAsset {
  bytes: Buffer;
  contentType: string;
}

export interface ProposalStorage {
  put(tenantId: string, bytes: Buffer, contentType: string): Promise<string>;
  get(tenantId: string, ref: string): Promise<StoredAsset | null>;
  delete(tenantId: string, ref: string): Promise<void>;
}

class DbBlobStorage implements ProposalStorage {
  async put(tenantId: string, bytes: Buffer, contentType: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(proposalAssets).values({
      id,
      tenantId,
      contentType,
      byteSize: bytes.length,
      bytes,
    });
    return id;
  }

  async get(tenantId: string, ref: string): Promise<StoredAsset | null> {
    const [row] = await db
      .select({
        bytes: proposalAssets.bytes,
        contentType: proposalAssets.contentType,
      })
      .from(proposalAssets)
      .where(and(eq(proposalAssets.id, ref), eq(proposalAssets.tenantId, tenantId)))
      .limit(1);
    if (!row) return null;
    const bytes = Buffer.isBuffer(row.bytes)
      ? row.bytes
      : Buffer.from(row.bytes as Uint8Array);
    return { bytes, contentType: row.contentType };
  }

  async delete(tenantId: string, ref: string): Promise<void> {
    await db
      .delete(proposalAssets)
      .where(and(eq(proposalAssets.id, ref), eq(proposalAssets.tenantId, tenantId)));
  }
}

let _storage: ProposalStorage | null = null;

/** Resolve the active storage backend (DB-blob default). */
export function getProposalStorage(): ProposalStorage {
  if (!_storage) _storage = new DbBlobStorage();
  return _storage;
}

/** @internal — swap the backend in tests. */
export function _setProposalStorageForTesting(s: ProposalStorage | null): void {
  _storage = s;
}
