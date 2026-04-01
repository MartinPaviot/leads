import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { id: "id", companyId: "company_id" },
  companies: { id: "id" },
  deals: { id: "id" },
  activities: { entityId: "entity_id", entityType: "entity_type" },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-openai-model"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";

const followUpModule = await import("@/app/api/emails/follow-up/route");
const suggestReplyModule = await import("@/app/api/emails/suggest-reply/route");

// Import detectLanguage directly (no mocking needed for the utility)
const { detectLanguage, getSystemPrompt } = await import("@/lib/language");

describe("POST /api/emails/follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/emails/follow-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "c1", context: "We discussed pricing" }),
    });

    const res = await followUpModule.POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });
});

describe("POST /api/emails/suggest-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/emails/suggest-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailContent: "Hi, I wanted to follow up on our call.",
        senderName: "Jane Doe",
        senderEmail: "jane@example.com",
      }),
    });

    const res = await suggestReplyModule.POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });
});

describe("detectLanguage", () => {
  it('returns "fr" for French text', () => {
    expect(detectLanguage("Bonjour")).toBe("fr");
  });

  it('returns "es" for Spanish text', () => {
    expect(detectLanguage("Hola buenos dias")).toBe("es");
  });

  it('returns "de" for German text', () => {
    expect(detectLanguage("Guten Morgen")).toBe("de");
  });

  it('returns "en" for English text (default)', () => {
    expect(detectLanguage("Hello how are you")).toBe("en");
  });
});

describe("getSystemPrompt", () => {
  it("returns French system prompt for fr", () => {
    const prompt = getSystemPrompt("fr");
    expect(prompt).toContain("French");
  });

  it("returns English system prompt for en", () => {
    const prompt = getSystemPrompt("en");
    expect(prompt).toContain("English");
  });

  it("returns fallback prompt for unknown language code", () => {
    const prompt = getSystemPrompt("xx");
    expect(prompt).toContain("xx");
  });
});
