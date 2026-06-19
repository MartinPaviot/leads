import { describe, it, expect, vi } from "vitest";

// outbound-hold.ts imports @/db and @/db/schema at module load; mock them so the
// pure config reader can be imported without a real DB.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ outboundEmails: {} }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));

import {
  readOutboundUndoWindowSeconds,
  OUTBOUND_UNDO_WINDOW_MAX_SECONDS,
} from "@/lib/emails/outbound-hold";

describe("CLE-11 readOutboundUndoWindowSeconds (AC-13 fail-safe)", () => {
  it("defaults to 0 when the setting is absent", () => {
    expect(readOutboundUndoWindowSeconds(undefined)).toBe(0);
    expect(readOutboundUndoWindowSeconds(null)).toBe(0);
    expect(readOutboundUndoWindowSeconds({})).toBe(0);
  });

  it("returns a valid positive window unchanged", () => {
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: 60 })).toBe(60);
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: 30 })).toBe(30);
  });

  it("floors a fractional window to whole seconds", () => {
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: 45.9 })).toBe(45);
  });

  it("coerces negative / zero / non-finite values to 0", () => {
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: -5 })).toBe(0);
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: 0 })).toBe(0);
    expect(readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: NaN })).toBe(0);
    expect(
      readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: Infinity }),
    ).toBe(0);
  });

  it("coerces a non-number value to 0", () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: "60" as any }),
    ).toBe(0);
  });

  it("coerces an over-cap value to 0", () => {
    expect(
      readOutboundUndoWindowSeconds({
        outboundUndoWindowSeconds: OUTBOUND_UNDO_WINDOW_MAX_SECONDS + 1,
      }),
    ).toBe(0);
    expect(
      readOutboundUndoWindowSeconds({ outboundUndoWindowSeconds: 100000 }),
    ).toBe(0);
  });

  it("accepts the exact cap", () => {
    expect(
      readOutboundUndoWindowSeconds({
        outboundUndoWindowSeconds: OUTBOUND_UNDO_WINDOW_MAX_SECONDS,
      }),
    ).toBe(OUTBOUND_UNDO_WINDOW_MAX_SECONDS);
  });
});
