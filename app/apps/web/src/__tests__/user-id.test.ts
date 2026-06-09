import { describe, it, expect, vi, beforeEach } from "vitest";

// Both helpers do a single users lookup; drive it from a queue.
let QUEUE: unknown[][] = [];
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => QUEUE.shift() ?? [] }) }) }) },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id", clerkId: "clerkId" } }));
vi.mock("drizzle-orm", () => ({ eq: (...a: unknown[]) => a }));

import { appToAuthUserId, authToAppUserId } from "@/lib/auth/user-id";

beforeEach(() => { QUEUE = []; });

describe("appToAuthUserId (app users.id -> auth user id)", () => {
  it("returns null for missing input without hitting the db", async () => {
    expect(await appToAuthUserId(null)).toBeNull();
    expect(await appToAuthUserId(undefined)).toBeNull();
    expect(await appToAuthUserId("")).toBeNull();
  });
  it("maps to the auth id (clerk_id)", async () => {
    QUEUE = [[{ authUserId: "auth-1" }]];
    expect(await appToAuthUserId("app-1")).toBe("auth-1");
  });
  it("returns null when the app user is unknown", async () => {
    QUEUE = [[]];
    expect(await appToAuthUserId("app-x")).toBeNull();
  });
});

describe("authToAppUserId (auth user id -> app users.id)", () => {
  it("returns null for missing input", async () => {
    expect(await authToAppUserId(null)).toBeNull();
  });
  it("maps to the app member row", async () => {
    QUEUE = [[{ id: "app-1" }]];
    expect(await authToAppUserId("auth-1")).toBe("app-1");
  });
  it("returns null when there is no member row", async () => {
    QUEUE = [[]];
    expect(await authToAppUserId("auth-x")).toBeNull();
  });
});
