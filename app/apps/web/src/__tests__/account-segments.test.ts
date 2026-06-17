import { describe, it, expect } from "vitest";
import {
  accountContactReachSql,
  accountRecencyBucketSql,
  accountReachLabel,
  ACCOUNT_REACH_BUCKETS,
} from "@/lib/accounts/account-segments";

describe("accountContactReachSql", () => {
  const sql = accountContactReachSql();

  it("emits the three reach buckets", () => {
    expect(sql).toContain("THEN 'none'");
    expect(sql).toContain("THEN 'reachable'");
    expect(sql).toContain("ELSE 'no_phone'");
  });

  it("keys off the account's own live contacts and a non-empty phone", () => {
    expect(sql).toContain('c.company_id = "companies"."id"');
    expect(sql).toContain("c.deleted_at IS NULL");
    expect(sql).toContain("c.phone IS NOT NULL");
  });

  it("tests existence-of-any before existence-of-dialable (order matters)", () => {
    // 'none' (no contact) must be decided before 'reachable' (has a number),
    // else an account with zero contacts could mis-bucket.
    expect(sql.indexOf("THEN 'none'")).toBeLessThan(sql.indexOf("THEN 'reachable'"));
  });
});

describe("accountReachLabel", () => {
  it("labels buckets in French", () => {
    expect(accountReachLabel("none")).toBe("Sans contact");
    expect(accountReachLabel("reachable")).toBe("Contact joignable");
    expect(accountReachLabel("no_phone")).toBe("Contact, sans numéro");
  });

  it("covers every bucket", () => {
    for (const b of ACCOUNT_REACH_BUCKETS) expect(accountReachLabel(b).length).toBeGreaterThan(0);
  });
});

describe("accountRecencyBucketSql", () => {
  const sql = accountRecencyBucketSql();

  it("unions the three interaction sources (contacts, company, deals)", () => {
    expect(sql).toContain("a.entity_type = 'contact'");
    expect(sql).toContain("a.entity_type = 'company'");
    expect(sql).toContain("a.entity_type = 'deal'");
  });

  it("uses the shared recency edges + never sentinel", () => {
    expect(sql).toContain("THEN 'never'");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("interval '90 days'");
  });

  it("counts only real interactions, never CRM bookkeeping", () => {
    expect(sql).toContain("'call_completed'");
    expect(sql).not.toContain("system_event");
  });
});
