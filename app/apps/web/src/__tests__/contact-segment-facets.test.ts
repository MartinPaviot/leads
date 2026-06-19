import { describe, it, expect } from "vitest";
import {
  seniorityLabel,
  compareSeniority,
  SENIORITY_ORDER,
  DECISION_MAKER_TIERS,
} from "@/lib/contacts/seniority";
import {
  recencyBucket,
  recencyLabel,
  recencyBucketSql,
  RECENCY_BUCKETS,
} from "@/lib/contacts/recency";

describe("seniority", () => {
  it("labels the known Apollo tiers in French", () => {
    expect(seniorityLabel("c_suite")).toBe("Direction (C-level)");
    expect(seniorityLabel("owner")).toBe("Propriétaire");
    expect(seniorityLabel("director")).toBe("Directeur");
  });

  it("tidies an unknown tier instead of dropping it", () => {
    expect(seniorityLabel("vice_chair")).toBe("vice chair");
  });

  it("orders most-senior first, unknown last", () => {
    const sorted = ["manager", "c_suite", "zzz", "owner"].sort(compareSeniority);
    expect(sorted).toEqual(["owner", "c_suite", "manager", "zzz"]);
  });

  it("treats the top tiers as decision-makers", () => {
    expect(DECISION_MAKER_TIERS).toContain("c_suite");
    expect(DECISION_MAKER_TIERS).toContain("director");
    expect(DECISION_MAKER_TIERS).not.toContain("manager");
    // Every decision-maker tier is a known seniority value.
    for (const t of DECISION_MAKER_TIERS) expect(SENIORITY_ORDER).toContain(t as never);
  });
});

describe("recencyBucket", () => {
  const now = new Date("2026-06-16T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("buckets a never-contacted contact", () => {
    expect(recencyBucket(null, now)).toBe("never");
    expect(recencyBucket(undefined, now)).toBe("never");
    expect(recencyBucket("not-a-date", now)).toBe("never");
  });

  it("buckets by age into non-overlapping bands", () => {
    expect(recencyBucket(daysAgo(2), now)).toBe("7");
    expect(recencyBucket(daysAgo(7), now)).toBe("7");
    expect(recencyBucket(daysAgo(20), now)).toBe("30");
    expect(recencyBucket(daysAgo(60), now)).toBe("90");
    expect(recencyBucket(daysAgo(200), now)).toBe("old");
  });

  it("accepts an ISO string (as the API returns)", () => {
    expect(recencyBucket(daysAgo(3).toISOString(), now)).toBe("7");
  });

  it("labels every bucket", () => {
    for (const b of RECENCY_BUCKETS) expect(recencyLabel(b).length).toBeGreaterThan(0);
    expect(recencyLabel("never")).toBe("Jamais contacté");
  });
});

describe("recencyBucketSql", () => {
  const sql = recencyBucketSql();

  it("emits the never sentinel + a bounded CASE over real interaction types", () => {
    expect(sql).toContain("THEN 'never'");
    expect(sql).toContain("ELSE 'old'");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("interval '90 days'");
    // Uses the shared interaction-type SSOT, not CRM bookkeeping.
    expect(sql).toContain("'call_completed'");
    expect(sql).toContain("a.entity_type = 'contact'");
  });

  it("orders the day boundaries ascending so the bands don't collapse", () => {
    expect(sql.indexOf("'7 days'")).toBeLessThan(sql.indexOf("'30 days'"));
    expect(sql.indexOf("'30 days'")).toBeLessThan(sql.indexOf("'90 days'"));
  });
});
