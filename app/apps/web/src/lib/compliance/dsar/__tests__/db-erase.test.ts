import { describe, it, expect, afterEach } from "vitest";
import { isDsarEraseEnabled, eraseSubjectLive } from "../db-erase";
import { contacts, outboundEmails, activities, suppression } from "@/db/schema";

const ORIG = process.env.DSAR_ERASE_ENABLED;
afterEach(() => {
  if (ORIG === undefined) delete process.env.DSAR_ERASE_ENABLED;
  else process.env.DSAR_ERASE_ENABLED = ORIG;
});

// Stateful stub: resolve returns the contact; eraseCanonical flips delete flags;
// addSuppression records the do-not-resurrect marker; findResidual then sees the
// rows gone. Table identity drives which branch a select/delete hits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { contact?: any } = {}) {
  const deleted = { outbound: false, activities: false, contact: false };
  const suppressions: any[] = [];
  const contact = "contact" in opts ? opts.contact : { id: "c1", email: "x@Y.com", tenantId: "t1" };
  const db: any = {
    _deleted: deleted,
    _suppressions: suppressions,
    select: () => {
      let table: any;
      const chain: any = {
        from: (t: any) => { table = t; return chain; },
        where: () => chain,
        limit: async () => {
          if (table === contacts) return !deleted.contact && contact ? [contact] : [];
          if (table === outboundEmails) return !deleted.outbound ? [{ id: "o1" }] : [];
          if (table === suppression) return suppressions.length ? [{ id: contact?.email }] : [];
          return [];
        },
      };
      return chain;
    },
    delete: (table: any) => ({
      where: async () => {
        if (table === outboundEmails) deleted.outbound = true;
        if (table === activities) deleted.activities = true;
        if (table === contacts) deleted.contact = true;
      },
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => { suppressions.push({}); } }) }),
  };
  return db;
}

describe("isDsarEraseEnabled", () => {
  it("off by default, on for 1/true", () => {
    delete process.env.DSAR_ERASE_ENABLED;
    expect(isDsarEraseEnabled()).toBe(false);
    process.env.DSAR_ERASE_ENABLED = "1";
    expect(isDsarEraseEnabled()).toBe(true);
    process.env.DSAR_ERASE_ENABLED = "true";
    expect(isDsarEraseEnabled()).toBe(true);
    process.env.DSAR_ERASE_ENABLED = "no";
    expect(isDsarEraseEnabled()).toBe(false);
  });
});

describe("eraseSubjectLive", () => {
  it("is a no-op when the flag is off (never touches the DB)", async () => {
    delete process.env.DSAR_ERASE_ENABLED;
    const res = await eraseSubjectLive("t1", "c1", { database: stubDb() });
    expect(res).toEqual({ ran: false, reason: "dsar_erase_disabled" });
  });

  it("reports contact_not_found when the contact is absent (tenant-scoped)", async () => {
    process.env.DSAR_ERASE_ENABLED = "1";
    const res = await eraseSubjectLive("t1", "missing", { database: stubDb({ contact: null }) });
    expect(res).toEqual({ ran: false, reason: "contact_not_found" });
  });

  it("erases the subject, adds a permanent suppression, and verifies clean", async () => {
    process.env.DSAR_ERASE_ENABLED = "1";
    const db = stubDb();
    const res = await eraseSubjectLive("t1", "c1", { database: db, requestedById: "u1" });
    expect(res.ran).toBe(true);
    expect(res.report?.verified).toBe(true); // residual empty after delete
    expect(res.report?.residual).toEqual([]);
    expect(res.report?.suppressed).toBe(true);
    expect(res.report?.doNotResurrect).toBe(true);
    expect(res.report?.idempotentNoop).toBe(false); // no prior marker at start
    // contact + outbound + activities all deleted; suppression written.
    expect(db._deleted).toEqual({ outbound: true, activities: true, contact: true });
    expect(db._suppressions.length).toBeGreaterThan(0);
  });
});
