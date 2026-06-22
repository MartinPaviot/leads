/**
 * Per-(accountId, field) enrichment cache (spec 08, AC1). In-memory impl for
 * tests; the production cache is backed by spec-00 account_field_source
 * (injected at the composition root). A get only returns within-TTL entries.
 */
import type { FieldCache, FieldCacheEntry } from "./types";

export class InMemoryFieldCache implements FieldCache {
  private store = new Map<string, FieldCacheEntry>();
  constructor(private now: () => number = () => Date.now()) {}

  async get(accountId: string, field: string): Promise<FieldCacheEntry | null> {
    const e = this.store.get(`${accountId}|${field}`);
    if (!e) return null;
    if (e.ttlExpiresAt.getTime() <= this.now()) return null; // expired
    return e;
  }

  async set(accountId: string, field: string, entry: FieldCacheEntry): Promise<void> {
    this.store.set(`${accountId}|${field}`, entry);
  }
}
