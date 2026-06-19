import { describe, it, expect } from "vitest";
import { composeDigest, digestTitle, type DigestItem } from "@/lib/inbox/digest";

const item = (key: string, kind: DigestItem["kind"], at: string | null): DigestItem => ({
  key,
  subject: `Subject ${key}`,
  from: `${key}@acme.ch`,
  kind,
  at,
});

describe("digest (INBOX-N02)", () => {
  it("groups items into ordered sections, dropping empty ones", () => {
    const d = composeDigest([
      item("a", "awaiting_reply", "2026-06-18T09:00:00Z"),
      item("b", "overdue", "2026-06-18T08:00:00Z"),
      item("c", "other", "2026-06-18T07:00:00Z"),
    ]);
    expect(d.sections.map((s) => s.id)).toEqual(["overdue", "awaiting_reply", "other"]); // meeting/important dropped
    expect(d.total).toBe(3);
  });

  it("sorts newest first within a section and caps at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item(`k${i}`, "awaiting_reply", `2026-06-18T${String(i).padStart(2, "0")}:00:00Z`),
    );
    const d = composeDigest(many);
    const sec = d.sections.find((s) => s.id === "awaiting_reply")!;
    expect(sec.items.length).toBe(8); // capped
    expect(sec.items[0].key).toBe("k11"); // newest first
    expect(d.total).toBe(12); // total counts all, not just shown
  });

  it("sorts items with a null timestamp last without crashing", () => {
    const d = composeDigest([
      item("dated", "awaiting_reply", "2026-06-18T09:00:00Z"),
      item("undated", "awaiting_reply", null),
    ]);
    const sec = d.sections.find((s) => s.id === "awaiting_reply")!;
    expect(sec.items.map((i) => i.key)).toEqual(["dated", "undated"]);
  });

  it("returns no sections for an empty inbox", () => {
    expect(composeDigest([])).toEqual({ title: "Your inbox digest", total: 0, sections: [] });
  });

  it("digestTitle picks morning vs end-of-day framing", () => {
    expect(digestTitle(false)).toBe("Morning digest");
    expect(digestTitle(true)).toBe("End-of-day digest");
  });
});
