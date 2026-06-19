/**
 * CLE-11 FOLLOWUPS #2 — `isValidReversibleSnapshot` locks the write-time
 * structural validation of a client-asserted Mode-A snapshot: discriminant +
 * required fields + entity allowlist. A forged/malformed snapshot must be
 * rejected (so it is never persisted), a well-formed one accepted unchanged.
 *
 * tool-call-log.ts pulls in db/schema/outbound-hold at module load, so we stub
 * those — the validator itself is pure.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  toolCallEvents: {}, contacts: {}, companies: {}, deals: {}, notes: {},
  tasks: {}, activities: {}, sequences: {}, sequenceSteps: {}, comments: {},
  sharedPrompts: {}, sequenceEnrollments: {}, outboundEmails: {},
}));
vi.mock("@/lib/chat/ui-directives", () => ({ invokeActionDirective: vi.fn() }));
vi.mock("@/lib/emails/outbound-hold", () => ({ cancelHeldOutbound: vi.fn() }));

import { isValidReversibleSnapshot } from "@/lib/chat/tool-call-log";

describe("isValidReversibleSnapshot — accepts well-formed snapshots", () => {
  it.each([
    { type: "create", entity: "deal", id: "d1" },
    { type: "update", entity: "contact", id: "c1", before: { name: "X" } },
    { type: "delete", entity: "task", before: { id: "t1", title: "x" } },
    {
      type: "bulk_update",
      entity: "company",
      rows: [{ id: "co1", before: { x: 1 } }, { id: "co2", before: {} }],
    },
    {
      type: "merge_contacts",
      survivorId: "c1",
      mergedRows: [{ id: "c2" }],
      repoints: { activities: [], deals: [], sequenceEnrollments: [], tasks: [] },
    },
    { type: "delete_sequence_step", sequenceId: "s1", stepsBefore: [] },
    { type: "page_action", actionId: "a.b", inverse: { actionId: "a.c", params: {} } },
    { type: "outbound_send", outboundEmailId: "oe1", holdUntil: "2026-06-18T00:00:00Z", channel: "email" },
  ])("accepts %o", (snap) => {
    expect(isValidReversibleSnapshot(snap)).toBe(true);
  });
});

describe("isValidReversibleSnapshot — rejects malformed / forged snapshots", () => {
  it.each([
    [null, "null"],
    [undefined, "undefined"],
    ["string", "non-object"],
    [{}, "no type"],
    [{ type: "wat", entity: "deal", id: "d1" }, "unknown type"],
    [{ type: "create", entity: "secrets", id: "d1" }, "entity off the allowlist"],
    [{ type: "create", entity: "deal" }, "missing id"],
    [{ type: "create", entity: "deal", id: "" }, "empty id"],
    [{ type: "update", entity: "deal", id: "d1" }, "missing before"],
    [{ type: "update", entity: "deal", id: "d1", before: "nope" }, "before not an object"],
    [{ type: "delete", entity: "deal" }, "delete missing before"],
    [{ type: "bulk_update", entity: "deal", rows: [{ id: "x" }] }, "bulk row missing before"],
    [{ type: "bulk_update", entity: "deal", rows: "nope" }, "bulk rows not an array"],
    [{ type: "merge_contacts", survivorId: "c1", mergedRows: [], repoints: {} }, "repoints missing arrays"],
    [
      { type: "merge_contacts", survivorId: "c1", mergedRows: [], repoints: { activities: [], deals: [], sequenceEnrollments: [] } },
      "repoints missing exactly one array (tasks)",
    ],
    [{ type: "delete_sequence_step", sequenceId: "s1", stepsBefore: "x" }, "stepsBefore not an array"],
    [{ type: "page_action", actionId: "a", inverse: { params: {} } }, "inverse missing actionId"],
    [{ type: "page_action", actionId: "a", inverse: { actionId: "b", params: "x" } }, "inverse.params not an object"],
    [{ type: "outbound_send", outboundEmailId: "oe1", holdUntil: "x", channel: "sms" }, "bad channel"],
    [{ type: "outbound_send", outboundEmailId: "oe1", channel: "email" }, "outbound_send missing holdUntil"],
  ])("rejects %o (%s)", (snap, _label) => {
    expect(isValidReversibleSnapshot(snap)).toBe(false);
  });
});
