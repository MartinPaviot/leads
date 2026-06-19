import { describe, it, expect } from "vitest";
import {
  emailEntityPrefix,
  rankConversationsBySemantic,
  type RankableConversation,
} from "@/lib/inbox/semantic-search";

describe("emailEntityPrefix (INBOX-Q01)", () => {
  it("extracts the contact/company id from an email embedding id", () => {
    expect(emailEntityPrefix("contact123-email-<abc@x.io>")).toBe("contact123");
    expect(emailEntityPrefix("co-9-email-msg-1")).toBe("co-9");
  });
  it("returns null for a non-email embedding id", () => {
    expect(emailEntityPrefix("contact123")).toBeNull();
    expect(emailEntityPrefix("-email-leading")).toBeNull();
  });
});

const convs: RankableConversation[] = [
  { key: "k1", subject: "Pricing", contactId: "c1", snippet: "..." },
  { key: "k2", subject: "Demo", contactId: "c2", snippet: "..." },
  { key: "k3", subject: "Cold", contactId: null, snippet: "..." },
];

describe("rankConversationsBySemantic", () => {
  it("ranks conversations by their best matching email hit", () => {
    const hits = [
      { entityId: "c2-email-m1", score: 0.9 },
      { entityId: "c1-email-m2", score: 0.4 },
      { entityId: "c1-email-m3", score: 0.7 }, // c1's best
    ];
    const out = rankConversationsBySemantic(convs, hits);
    expect(out.map((r) => r.key)).toEqual(["k2", "k1"]);
    expect(out[1].score).toBe(0.7); // c1 kept its strongest hit
  });

  it("drops hits that don't map to a conversation contact + null-contact threads", () => {
    const out = rankConversationsBySemantic(convs, [{ entityId: "cX-email-m", score: 1 }]);
    expect(out).toEqual([]);
  });

  it("ignores non-email embedding hits", () => {
    expect(rankConversationsBySemantic(convs, [{ entityId: "c1", score: 1 }])).toEqual([]);
  });
});
