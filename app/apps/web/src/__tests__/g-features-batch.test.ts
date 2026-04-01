import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be before any imports that use them) ---

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
  contacts: { companyId: "company_id" },
  companies: { id: "id" },
  tenants: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getMomentum } from "@/lib/momentum";

const contactsModule = await import(
  "@/app/api/accounts/[id]/contacts/route"
);

describe("G-Features Batch Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================
  // G3: Contact auto-suggestion
  // =============================================
  describe("POST /api/accounts/[id]/contacts", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const req = new Request("http://localhost/api/accounts/abc/contacts", {
        method: "POST",
      });

      const res = await contactsModule.POST(req, {
        params: Promise.resolve({ id: "abc" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns contacts for authenticated user", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

      const mockContacts = [
        { id: "c1", firstName: "Alice", companyId: "abc" },
        { id: "c2", firstName: "Bob", companyId: "abc" },
      ];

      const whereFn = vi.fn().mockResolvedValue(mockContacts);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

      const req = new Request("http://localhost/api/accounts/abc/contacts", {
        method: "POST",
      });

      const res = await contactsModule.POST(req, {
        params: Promise.resolve({ id: "abc" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.contacts).toHaveLength(2);
      expect(data.contacts[0].firstName).toBe("Alice");
    });
  });

  // =============================================
  // G17: Momentum indicator
  // =============================================
  describe("getMomentum", () => {
    it("returns 'none' for 0 activities", () => {
      expect(getMomentum(0, 0)).toBe("none");
      expect(getMomentum(0, 30)).toBe("none");
    });

    it("returns 'high' for 5+ activities within 7 days", () => {
      expect(getMomentum(5, 1)).toBe("high");
      expect(getMomentum(10, 3)).toBe("high");
      expect(getMomentum(5, 7)).toBe("high");
    });

    it("returns 'medium' for 2-4 activities within 7 days", () => {
      expect(getMomentum(2, 1)).toBe("medium");
      expect(getMomentum(3, 5)).toBe("medium");
      expect(getMomentum(4, 7)).toBe("medium");
    });

    it("returns 'low' for 1 activity", () => {
      expect(getMomentum(1, 1)).toBe("low");
      expect(getMomentum(1, 30)).toBe("low");
    });

    it("returns 'low' for activities older than 7 days", () => {
      expect(getMomentum(5, 8)).toBe("low");
      expect(getMomentum(10, 30)).toBe("low");
      expect(getMomentum(3, 14)).toBe("low");
    });
  });
});
