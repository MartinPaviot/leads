import { describe, it, expect } from "vitest";
import { TAM_PROPOSALS_ENTRY_ENABLED } from "../entry-visibility";

describe("TAM_PROPOSALS_ENTRY_ENABLED", () => {
  // The entry is enabled everywhere; the real guard against empty-state
  // noise is the call site, which only renders the button when
  // proposalCount > 0. Production parity makes the approval queue a real
  // consumer of the proposal cron (The Method, steps 5/18) instead of
  // letting proposals accumulate unreviewed and invisible.
  it("is enabled so the approval queue surfaces wherever proposals exist", () => {
    expect(TAM_PROPOSALS_ENTRY_ENABLED).toBe(true);
  });
});
